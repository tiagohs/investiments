/**
 * Agenda.gs — agenda diária ENCADEADA das sincronizações automáticas.
 *
 * 02/10/2026 (Tiago: "Sync: Horário fixo de execução: ativos, renda fixa e
 * índices às 10:01 sempre. As outras, depois, só se ativos/RF/índices
 * deram certo, com retry 2-3x.").
 *
 * POR QUE: os gatilhos diários antigos usavam .everyDays(1).atHour(h)
 * .nearMinute(m) — o Apps Script NÃO garante o minuto (janela de ±15 min,
 * às vezes a hora inteira), e cada job tinha o seu horário solto (ativos
 * ~10h, Renda Fixa/Índices ~11h, proventos FNet ~12h01, informes FNet
 * ~12h20), sem nenhuma dependência entre eles: proventos/informes rodavam
 * mesmo num dia em que a sincronização de preços tinha falhado.
 *
 * COMO FUNCIONA AGORA:
 *  1) Gatilho diário "despertador" (despertadorAgendaDiaria, ~8h-9h — a
 *     imprecisão do atHour não importa aqui, ele só prepara o dia) cria um
 *     gatilho de UMA VEZ SÓ (one-shot, .at(...)) pra HOJE 10:01:00 no fuso
 *     America/Sao_Paulo — esse tipo de gatilho respeita o horário pedido.
 *     Domingo: não agenda nada (igual aos gatilhos antigos).
 *  2) Cada one-shot chama etapaAgendaDiaria(), que roda UMA etapa por
 *     execução (cada uma com os seus próprios 6 min do Apps Script), na
 *     ordem:
 *       PRINCIPAL:   1. Ativos (ações/FIIs/EUA)  — Sync.gs!atualizarHistorico
 *                    2. Renda Fixa + Índices     — BackfillIndices.gs!atualizarRendaFixaEIndicesDiario_
 *       SECUNDÁRIAS: 3. Snapshot do resumo diário — SnapshotResumoDiario.gs!gravarSnapshotResumoHoje_
 *                    4. Proventos FNet           — FnetProventos.gs!atualizarProventosAnunciadosFii_
 *                    5. Informes FNet            — FnetInformesFii.gs!atualizarInformesFiiFnet_
 *                    6. Fundamentos              — Fundamentos.gs!atualizarFundamentos_
 *                       (03/10/2026: Fundamentus/Yahoo 1x/dia, SEC 1x/semana, CVM
 *                       1x/mês; para em ~4,5 min e a nova tentativa continua de
 *                       onde parou - o que já está fresco é pulado)
 *                    7. Portfólio dos FIIs       — PortfolioFii.gs!atualizarPortfolioFii_
 *                       (05/10/2026: só reprocessa o FII com informe novo da CVM ou
 *                       fato relevante novo; mapa: cache permanente, ~1 req/s)
 *     Deu certo -> agenda a próxima etapa pra daqui a 1 min. Falhou ->
 *     agenda NOVA TENTATIVA da mesma etapa pra daqui a 10 min (até 3
 *     tentativas por etapa — reagendar em vez de esperar dentro da
 *     execução, pra nunca encostar no limite de 6 min).
 *  3) Se uma etapa PRINCIPAL falhar 3x, as secundárias NÃO rodam nesse dia
 *     (o estado diz o motivo, e vai 1 linha "Erro" pro Registro de
 *     Controle + e-mail). Uma secundária que falhar 3x não impede as
 *     outras secundárias.
 *  4) Antes de rodar cada etapa fica agendado um one-shot "vigia" pra +8
 *     min: se a execução for morta no meio (limite de 6 min), o vigia
 *     dispara, conta aquela tentativa como falha e segue a fila — a agenda
 *     nunca morre em silêncio. Terminando normal, o vigia é apagado.
 *  5) Todo one-shot já usado é apagado (ScriptApp.deleteTrigger) no começo
 *     da execução seguinte — nunca fica acumulando (limite de 20 gatilhos
 *     por projeto). No máximo existem: o despertador + 1 one-shot pendente.
 *
 * ESTADO (diagnóstico): Propriedades do script, chave AGENDA_DIARIA_ESTADO
 * (dia, situação, motivo, próxima execução, por etapa: status, tentativas,
 * último erro, início/fim) + AGENDA_DIARIA_ESTADO_ANTERIOR (o dia anterior).
 * Rode estadoAgendaDiaria() no editor pra ver o resumo no log.
 *
 * SETUP (rodar 1x no editor depois de colar este arquivo):
 *   instalarAgendaDiaria() — remove os gatilhos diários antigos
 *   (gatilhoDiario, gatilhoDiarioRendaFixaEIndices, gatilhoDiarioProventosFnet,
 *   gatilhoDiarioInformesFnet), instala o despertador e, se ainda for antes
 *   das 10:01 (e não for domingo), já agenda o dia de hoje. Os gatilhos
 *   periódicos de vídeos (gatilhoVideos, 6/6h) e de pré-aquecimento da tela
 *   do ativo (gatilhoPreAquecerAtivos, 2/2h) continuam como estão.
 *
 * Funções antigas continuam existindo e funcionando quando chamadas na mão
 * (gatilhoDiario, rodarRendaFixaEIndicesDiretoDireto, rodarProventosFnetDireto,
 * rodarInformesFnetDireto e os botões do site). NÃO rode mais
 * instalarGatilhoDiarioRendaFixaEIndices/instalarGatilhoDiarioProventosFnet/
 * instalarGatilhoDiarioInformesFnet — recriariam os gatilhos soltos e cada
 * job rodaria 2x por dia (instalarGatilhoDiario, em Sync.gs, agora só chama
 * instalarAgendaDiaria).
 *
 * Outras funções pro editor:
 *   rodarAgendaDiariaAgora() — começa a fila de hoje AGORA (etapa 1 roda
 *     na hora, as seguintes vão sendo agendadas normalmente).
 *   estadoAgendaDiaria() — resumo do dia (e do anterior) + gatilhos atuais.
 *
 * Datas/horas: tudo calculado no fuso America/Sao_Paulo via Utilities
 * (formatDate/parseDate) — nunca getHours/getDay "locais", pra não depender
 * do fuso de quem roda (ver tests/harness/agenda-diaria.test.js).
 */

var AGENDA_FUSO_ = 'America/Sao_Paulo';
var AGENDA_HANDLER_DESPERTADOR_ = 'despertadorAgendaDiaria';
var AGENDA_HANDLER_ETAPA_ = 'etapaAgendaDiaria';
var AGENDA_HORA_DESPERTADOR_ = 8;          // ~8h-9h (atHour não é preciso, e nem precisa ser)
var AGENDA_HORARIO_PRINCIPAL_ = '10:01:00'; // horário fixo da etapa principal (fuso de SP)
var AGENDA_MAX_TENTATIVAS_ = 3;
var AGENDA_ESPERA_RETRY_MIN_ = 10;          // falhou -> tenta de novo daqui a 10 min
var AGENDA_ESPERA_PROXIMA_MIN_ = 1;         // deu certo -> próxima etapa daqui a 1 min
var AGENDA_VIGIA_MIN_ = 8;                  // > 6 min do limite do Apps Script
var AGENDA_PROP_ESTADO_ = 'AGENDA_DIARIA_ESTADO';
var AGENDA_PROP_ESTADO_ANTERIOR_ = 'AGENDA_DIARIA_ESTADO_ANTERIOR';
var AGENDA_MAX_LOG_ = 20;
// handlers dos gatilhos diários antigos, substituídos por esta agenda
var AGENDA_GATILHOS_ANTIGOS_ = ['gatilhoDiario', 'gatilhoDiarioRendaFixaEIndices', 'gatilhoDiarioProventosFnet', 'gatilhoDiarioInformesFnet'];

var AGENDA_ETAPAS_ = [
  { id: 'ativos', nome: 'Ativos (ações/FIIs/EUA)', principal: true },
  { id: 'rendaFixaIndices', nome: 'Renda Fixa + Índices', principal: true },
  { id: 'snapshotResumo', nome: 'Snapshot do resumo diário', principal: false },
  { id: 'proventosFnet', nome: 'Proventos FNet', principal: false },
  { id: 'informesFnet', nome: 'Informes FNet', principal: false },
  { id: 'fundamentos', nome: 'Fundamentos', principal: false }, // 03/10/2026 (Fundamentos.gs)
  { id: 'portfolioFii', nome: 'Portfólio dos FIIs', principal: false } // 05/10/2026 (PortfolioFii.gs): depois dos informes do FNet (lê os fatos relevantes de lá)
];

// ---------------------------------------------------------------------------
// Instalação / execução manual / diagnóstico
// ---------------------------------------------------------------------------

/** Rodar 1x no editor: troca os gatilhos diários antigos pela agenda encadeada. */
function instalarAgendaDiaria() {
  var removidos = [];
  var mantidos = [];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (AGENDA_GATILHOS_ANTIGOS_.indexOf(h) !== -1 || h === AGENDA_HANDLER_DESPERTADOR_ || h === AGENDA_HANDLER_ETAPA_) {
      ScriptApp.deleteTrigger(t);
      removidos.push(h);
    } else {
      mantidos.push(h);
    }
  });
  ScriptApp.newTrigger(AGENDA_HANDLER_DESPERTADOR_)
    .timeBased()
    .everyDays(1)
    .atHour(AGENDA_HORA_DESPERTADOR_)
    .nearMinute(30)
    .create();

  var agora = agendaAgora_();
  var hoje = agendaChaveDia_(agora);
  var alvo = agendaHorarioPrincipal_(hoje);
  var msgHoje;
  if (!agendaEhDomingo_(hoje) && agora.getTime() < alvo.getTime() - 2 * 60 * 1000) {
    agendaPrepararDia_(agora, { forcar: true });
    msgHoje = 'hoje (' + hoje + ') já ficou agendado pras ' + AGENDA_HORARIO_PRINCIPAL_.slice(0, 5) + '.';
  } else {
    msgHoje = 'hoje não foi agendado (domingo ou já passou das ' + AGENDA_HORARIO_PRINCIPAL_.slice(0, 5) +
      ') — a 1ª execução automática é no próximo dia útil; pra rodar hoje mesmo, use rodarAgendaDiariaAgora().';
  }
  var resumo = 'Agenda diária instalada. Removidos: ' + (removidos.length ? removidos.join(', ') : 'nenhum') +
    '. Mantidos: ' + (mantidos.length ? mantidos.join(', ') : 'nenhum') + '. ' + msgHoje;
  Logger.log(resumo);
  return { removidos: removidos, mantidos: mantidos, hoje: msgHoje };
}

/** Começa a fila de hoje AGORA (etapa 1 roda nesta execução; as outras vão sendo agendadas). */
function rodarAgendaDiariaAgora() {
  agendaPrepararDia_(agendaAgora_(), { forcar: true, imediato: true });
  etapaAgendaDiaria();
  return estadoAgendaDiaria();
}

/** Loga (e devolve) o resumo do dia, do dia anterior e os gatilhos atuais do projeto. */
function estadoAgendaDiaria() {
  var estado = agendaLerEstado_(AGENDA_PROP_ESTADO_);
  var anterior = agendaLerEstado_(AGENDA_PROP_ESTADO_ANTERIOR_);
  var gatilhos = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  var linhas = [];
  linhas.push(agendaResumoTexto_(estado, 'Hoje'));
  if (anterior) linhas.push(agendaResumoTexto_(anterior, 'Anterior'));
  linhas.push('Gatilhos do projeto (' + gatilhos.length + '): ' + (gatilhos.join(', ') || 'nenhum'));
  var texto = linhas.join('\n\n');
  Logger.log(texto);
  return { estado: estado, anterior: anterior, gatilhos: gatilhos, texto: texto };
}

// ---------------------------------------------------------------------------
// Handlers dos gatilhos
// ---------------------------------------------------------------------------

/** Gatilho diário (~8h): prepara o dia e agenda o one-shot das 10:01. */
function despertadorAgendaDiaria() {
  agendaPrepararDia_(agendaAgora_(), {});
}

/** One-shot: roda a etapa atual da fila de hoje e agenda a seguinte (ou a nova tentativa). */
function etapaAgendaDiaria() {
  var agora = agendaAgora_();
  var hoje = agendaChaveDia_(agora);
  agendaApagarOneShots_(); // inclusive o que acabou de disparar

  var estado = agendaLerEstado_(AGENDA_PROP_ESTADO_);
  if (!estado || estado.dia !== hoje) {
    Logger.log('etapaAgendaDiaria: não há agenda de hoje (' + hoje + ') — one-shot ignorado. Pra forçar, rode rodarAgendaDiariaAgora().');
    return;
  }
  if (estado.situacao !== 'agendada' && estado.situacao !== 'rodando') {
    Logger.log('etapaAgendaDiaria: agenda de hoje já está "' + estado.situacao + '" — nada a fazer.');
    return;
  }

  var idx = agendaIndiceEtapa_(estado.etapaAtual);
  var def = AGENDA_ETAPAS_[idx];
  // 03/10/2026: estado gravado por uma versão sem esta etapa (ex.: "fundamentos")
  if (!estado.etapas[def.id]) estado.etapas[def.id] = { status: 'pendente', tentativas: 0, ultimoErro: '', inicio: '', fim: '', detalhe: '' };
  var est = estado.etapas[def.id];

  // execução anterior desta etapa morreu no meio (quem disparou foi o vigia)
  if (est.status === 'rodando') {
    est.status = 'erro';
    est.ultimoErro = 'execução anterior interrompida sem terminar (provável limite de 6 min do Apps Script)';
    est.fim = agendaFormatar_(agora);
    agendaLog_(estado, agora, def.nome + ': tentativa ' + est.tentativas + ' interrompida');
    if (est.tentativas >= AGENDA_MAX_TENTATIVAS_) {
      agendaFalhaFinal_(estado, idx, agora);
      agendaSalvarEstado_(estado);
      return;
    }
  }

  est.tentativas++;
  est.status = 'rodando';
  est.inicio = agendaFormatar_(agora);
  est.fim = '';
  estado.situacao = 'rodando';
  estado.proximaExecucao = '';
  agendaLog_(estado, agora, def.nome + ': tentativa ' + est.tentativas + '/' + AGENDA_MAX_TENTATIVAS_);
  agendaSalvarEstado_(estado);
  agendaCriarOneShot_(new Date(agora.getTime() + AGENDA_VIGIA_MIN_ * 60 * 1000)); // vigia

  var resultado;
  try {
    resultado = agendaRodarJob_(def.id, est);
  } catch (erro) {
    resultado = { ok: false, detalhe: String(erro) };
  }

  var fim = agendaAgora_();
  agendaApagarOneShots_(); // apaga o vigia
  est.fim = agendaFormatar_(fim);
  if (resultado.ok) {
    est.status = 'ok';
    est.ultimoErro = '';
    est.detalhe = agendaCortar_(resultado.detalhe);
    agendaLog_(estado, fim, def.nome + ': ok');
    agendaAvancar_(estado, idx, fim);
  } else {
    est.ultimoErro = agendaCortar_(resultado.detalhe);
    agendaLog_(estado, fim, def.nome + ': falhou (' + agendaCortar_(resultado.detalhe, 80) + ')');
    if (est.tentativas < AGENDA_MAX_TENTATIVAS_) {
      est.status = 'aguardando nova tentativa';
      estado.situacao = 'agendada';
      var quando = new Date(fim.getTime() + AGENDA_ESPERA_RETRY_MIN_ * 60 * 1000);
      agendaCriarOneShot_(quando);
      estado.proximaExecucao = agendaFormatar_(quando);
    } else {
      agendaFalhaFinal_(estado, idx, fim);
    }
  }
  agendaSalvarEstado_(estado);
}

// ---------------------------------------------------------------------------
// Etapas: "rodar e devolver ok/erro" em cima das rotinas que já existem
// ---------------------------------------------------------------------------

/**
 * Roda a rotina de verdade de cada etapa e traduz o retorno em
 * { ok, detalhe }. Cada rotina já grava a própria linha no Registro de
 * Controle (e manda e-mail no "Erro" automático), como sempre fez.
 */
function agendaRodarJob_(id, est) {
  if (id === 'ativos') {
    // nova tentativa: só os tickers que ficaram faltando (falharam ou sem
    // tempo) — a rotina é incremental, então nada se perde
    var pendentes = (est.pendentes && est.pendentes.length) ? est.pendentes : null;
    var r = atualizarHistorico('Automático', pendentes); // Sync.gs
    var restantes = (r.falharam || []).map(function (f) { return f.ticker; }).concat(r.naoProcessados || []);
    if (restantes.length) est.pendentes = restantes;
    var ok = r.status === 'Sucesso' && !restantes.length;
    if (ok) est.pendentes = [];
    var txt = r.status + ' — ' + (r.ok || []).length + ' ativo(s) ok' +
      (restantes.length ? '; faltam: ' + restantes.join(', ') : '') + (r.detalhe ? ' — ' + r.detalhe : '');
    return { ok: ok, detalhe: txt };
  }
  if (id === 'rendaFixaIndices') {
    var rf = atualizarRendaFixaEIndicesDiario_('Automático'); // BackfillIndices.gs
    // essenciaisOk = Renda Fixa, Índices e Taxas BCB deram certo (um
    // "Atenção" só da Carteira Renda Fixa não segura o resto do dia)
    var okRf = rf.essenciaisOk === true || rf.status === 'Sucesso';
    return { ok: okRf, detalhe: rf.status + ' — ' + rf.detalhe };
  }
  if (id === 'snapshotResumo') {
    var s = gravarSnapshotResumoHoje_(); // SnapshotResumoDiario.gs (lança erro se falhar)
    return { ok: true, detalhe: (s && s.mudou) ? 'salvo' : 'sem mudança' };
  }
  if (id === 'proventosFnet' || id === 'informesFnet') {
    // "Atenção" do FNet (um FII sem CNPJ, um que não respondeu) não é
    // repetido: a rotina já tenta 2x por FII e o que faltar fica pro dia
    // seguinte. Só "Erro" (nenhum FII respondeu) ou exceção contam como falha.
    var f = id === 'proventosFnet'
      ? atualizarProventosAnunciadosFii_('Automático') // FnetProventos.gs
      : atualizarInformesFiiFnet_('Automático');        // FnetInformesFii.gs
    return { ok: f.status !== 'Erro', detalhe: f.status + ' — ' + f.detalhe };
  }
  if (id === 'fundamentos') {
    // 03/10/2026: secundária. Acabou o tempo (sobrou ticker) -> conta como
    // falha pra agenda tentar de novo em 10 min (continua de onde parou).
    // Uma fonte fora do ar ("Atenção") não repete: amanhã tem de novo.
    var fu = atualizarFundamentos_('Automático'); // Fundamentos.gs
    return { ok: fu.status !== 'Erro' && !fu.porTempo, detalhe: fu.status + ' — ' + fu.detalhe };
  }
  if (id === 'portfolioFii') {
    // 05/10/2026: secundária. Faltou tempo/limite de consultas do mapa -> conta como
    // falha pra agenda tentar de novo em 10 min (continua de onde parou; as coordenadas
    // já achadas ficam no cache). "Atenção" (CVM/Nominatim fora do ar) não repete.
    var pf = atualizarPortfolioFii_('Automático'); // PortfolioFii.gs
    return { ok: pf.status !== 'Erro' && !pf.porTempo, detalhe: pf.status + ' — ' + pf.detalhe };
  }
  throw new Error('etapa desconhecida: ' + id);
}

// ---------------------------------------------------------------------------
// Fila
// ---------------------------------------------------------------------------

/**
 * Começa o estado do dia e agenda o one-shot das 10:01.
 * opcoes.forcar: recomeça mesmo se hoje já rodou/está rodando.
 * opcoes.imediato: não agenda one-shot (quem chamou roda a etapa na hora).
 */
function agendaPrepararDia_(agora, opcoes) {
  opcoes = opcoes || {};
  var hoje = agendaChaveDia_(agora);
  var atual = agendaLerEstado_(AGENDA_PROP_ESTADO_);
  var jaComecou = atual && (atual.situacao !== 'agendada' || AGENDA_ETAPAS_.some(function (d) {
    return atual.etapas && atual.etapas[d.id] && atual.etapas[d.id].tentativas > 0;
  }));
  if (atual && atual.dia === hoje && !opcoes.forcar && jaComecou) {
    Logger.log('Agenda de hoje já está "' + atual.situacao + '" — despertador não recomeça.');
    return atual;
  }
  agendaApagarOneShots_();
  if (atual && atual.dia !== hoje) {
    PropertiesService.getScriptProperties().setProperty(AGENDA_PROP_ESTADO_ANTERIOR_, JSON.stringify(atual));
  }

  var estado = agendaNovoEstado_(hoje);
  if (agendaEhDomingo_(hoje) && !opcoes.imediato) {
    estado.situacao = 'domingo';
    estado.motivo = 'Domingo — nada roda (como nos gatilhos antigos).';
    agendaLog_(estado, agora, 'domingo, nada agendado');
    agendaSalvarEstado_(estado);
    return estado;
  }

  if (opcoes.imediato) {
    agendaLog_(estado, agora, 'iniciada manualmente (rodarAgendaDiariaAgora)');
  } else {
    var quando = agendaHorarioPrincipal_(hoje);
    if (quando.getTime() <= agora.getTime() + 30 * 1000) {
      // despertador atrasou além das 10:01: começa já (daqui a 1 min)
      quando = new Date(agora.getTime() + 60 * 1000);
      agendaLog_(estado, agora, 'despertador depois das ' + AGENDA_HORARIO_PRINCIPAL_.slice(0, 5) + ' — começa em 1 min');
    } else {
      agendaLog_(estado, agora, 'agendada pras ' + agendaFormatar_(quando, 'HH:mm:ss'));
    }
    agendaCriarOneShot_(quando);
    estado.proximaExecucao = agendaFormatar_(quando);
  }
  agendaSalvarEstado_(estado);
  return estado;
}

function agendaNovoEstado_(dia) {
  var etapas = {};
  AGENDA_ETAPAS_.forEach(function (d) {
    etapas[d.id] = { status: 'pendente', tentativas: 0, ultimoErro: '', inicio: '', fim: '', detalhe: '' };
  });
  return {
    dia: dia, situacao: 'agendada', motivo: '', etapaAtual: AGENDA_ETAPAS_[0].id,
    proximaExecucao: '', etapas: etapas, log: [], atualizadoEm: ''
  };
}

/** Etapa idx deu certo (ou secundária desistiu): agenda a próxima, ou encerra o dia. */
function agendaAvancar_(estado, idx, agora) {
  var prox = idx + 1;
  if (prox >= AGENDA_ETAPAS_.length) {
    var falhas = AGENDA_ETAPAS_.filter(function (d) { return estado.etapas[d.id] && estado.etapas[d.id].status === 'falhou'; })
      .map(function (d) { return d.nome; });
    estado.situacao = 'concluida';
    estado.proximaExecucao = '';
    estado.motivo = falhas.length
      ? 'Concluída, mas falharam 3x: ' + falhas.join(', ') + ' (ver último erro de cada uma).'
      : 'Tudo certo.';
    agendaLog_(estado, agora, 'dia concluído' + (falhas.length ? ' com falhas' : ''));
    return;
  }
  estado.etapaAtual = AGENDA_ETAPAS_[prox].id;
  estado.situacao = 'agendada';
  var quando = new Date(agora.getTime() + AGENDA_ESPERA_PROXIMA_MIN_ * 60 * 1000);
  agendaCriarOneShot_(quando);
  estado.proximaExecucao = agendaFormatar_(quando);
}

/** Etapa idx esgotou as tentativas. Principal: encerra o dia sem as secundárias. */
function agendaFalhaFinal_(estado, idx, agora) {
  var def = AGENDA_ETAPAS_[idx];
  var est = estado.etapas[def.id];
  est.status = 'falhou';
  if (!def.principal) {
    agendaLog_(estado, agora, def.nome + ': desistiu após ' + est.tentativas + ' tentativas');
    agendaAvancar_(estado, idx, agora);
    return;
  }
  var puladas = [];
  for (var i = idx + 1; i < AGENDA_ETAPAS_.length; i++) {
    if (!estado.etapas[AGENDA_ETAPAS_[i].id]) estado.etapas[AGENDA_ETAPAS_[i].id] = { status: '', tentativas: 0, ultimoErro: '', inicio: '', fim: '', detalhe: '' };
    estado.etapas[AGENDA_ETAPAS_[i].id].status = 'pulada';
    puladas.push(AGENDA_ETAPAS_[i].nome);
  }
  estado.situacao = 'falhou';
  estado.proximaExecucao = '';
  estado.motivo = 'Etapa principal "' + def.nome + '" falhou ' + est.tentativas + 'x (último erro: ' +
    agendaCortar_(est.ultimoErro, 150) + ') — não rodaram hoje: ' + puladas.join(', ') + '.';
  agendaLog_(estado, agora, 'etapa principal falhou, secundárias puladas');
  try {
    if (typeof gravarRegistroControle_ === 'function') gravarRegistroControle_('Erro', 'Automático', 'Agenda diária: ' + estado.motivo);
    if (typeof notificarFalhaSincronizacao_ === 'function') notificarFalhaSincronizacao_('Automático', 'Agenda diária: ' + estado.motivo);
  } catch (e) {
    Logger.log('agendaFalhaFinal_: não registrou/notificou - ' + e);
  }
}

// ---------------------------------------------------------------------------
// Gatilhos one-shot
// ---------------------------------------------------------------------------

function agendaCriarOneShot_(quando) {
  ScriptApp.newTrigger(AGENDA_HANDLER_ETAPA_).timeBased().at(quando).create();
}

/** Apaga TODOS os one-shots da agenda (os já disparados também continuam contando no limite de 20). */
function agendaApagarOneShots_() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === AGENDA_HANDLER_ETAPA_) {
      ScriptApp.deleteTrigger(t);
      n++;
    }
  });
  return n;
}

// ---------------------------------------------------------------------------
// Datas (fuso de SP, nunca o fuso "local" de quem roda)
// ---------------------------------------------------------------------------

function agendaAgora_() { return new Date(); }

function agendaFormatar_(data, formato) {
  return Utilities.formatDate(data, AGENDA_FUSO_, formato || 'yyyy-MM-dd HH:mm:ss');
}

/** 'yyyy-MM-dd' do dia em São Paulo. */
function agendaChaveDia_(data) { return agendaFormatar_(data, 'yyyy-MM-dd'); }

/** Domingo a partir da chave do dia (calendário puro, sem fuso). */
function agendaEhDomingo_(chaveDia) {
  var p = chaveDia.split('-');
  return new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]))).getUTCDay() === 0;
}

/** Instante de "chaveDia 10:01:00" em São Paulo. */
function agendaHorarioPrincipal_(chaveDia) {
  return Utilities.parseDate(chaveDia + ' ' + AGENDA_HORARIO_PRINCIPAL_, AGENDA_FUSO_, 'yyyy-MM-dd HH:mm:ss');
}

// ---------------------------------------------------------------------------
// Estado (Propriedades do script)
// ---------------------------------------------------------------------------

function agendaLerEstado_(chave) {
  var bruto = PropertiesService.getScriptProperties().getProperty(chave || AGENDA_PROP_ESTADO_);
  if (!bruto) return null;
  try { return JSON.parse(bruto); } catch (e) { return null; }
}

function agendaSalvarEstado_(estado) {
  estado.atualizadoEm = agendaFormatar_(agendaAgora_());
  var json = JSON.stringify(estado);
  // valor de propriedade tem limite de ~9 KB: corta o log se precisar
  while (json.length > 8500 && estado.log.length > 1) {
    estado.log.shift();
    json = JSON.stringify(estado);
  }
  PropertiesService.getScriptProperties().setProperty(AGENDA_PROP_ESTADO_, json);
}

function agendaLog_(estado, quando, texto) {
  estado.log.push(agendaFormatar_(quando, 'HH:mm:ss') + ' ' + agendaCortar_(texto, 160));
  if (estado.log.length > AGENDA_MAX_LOG_) estado.log = estado.log.slice(-AGENDA_MAX_LOG_);
}

function agendaIndiceEtapa_(id) {
  for (var i = 0; i < AGENDA_ETAPAS_.length; i++) if (AGENDA_ETAPAS_[i].id === id) return i;
  return 0;
}

function agendaCortar_(texto, max) {
  var s = String(texto == null ? '' : texto);
  max = max || 200;
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function agendaResumoTexto_(estado, rotulo) {
  if (!estado) return rotulo + ': nenhuma agenda registrada ainda (rode instalarAgendaDiaria()).';
  var l = [];
  l.push(rotulo + ' — ' + estado.dia + ': ' + estado.situacao +
    (estado.proximaExecucao ? ' (próxima execução: ' + estado.proximaExecucao + ')' : '') +
    (estado.motivo ? ' — ' + estado.motivo : ''));
  AGENDA_ETAPAS_.forEach(function (d) {
    var e = estado.etapas[d.id];
    if (!e) return;
    l.push('  • ' + d.nome + (d.principal ? ' [principal]' : '') + ': ' + e.status +
      ' — ' + e.tentativas + '/' + AGENDA_MAX_TENTATIVAS_ + ' tentativa(s)' +
      (e.inicio ? ', início ' + e.inicio : '') + (e.fim ? ', fim ' + e.fim : '') +
      (e.ultimoErro ? ' — último erro: ' + e.ultimoErro : '') +
      (e.detalhe ? ' — ' + e.detalhe : ''));
  });
  if (estado.log && estado.log.length) l.push('  Log: ' + estado.log.join(' | '));
  return l.join('\n');
}
