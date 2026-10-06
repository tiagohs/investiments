/**
 * Agenda.gs — agenda diária ENCADEADA das sincronizações automáticas.
 *
 * 02/10/2026 (Tiago: "Sync: Horário fixo de execução: ativos, renda fixa e
 * índices às 10:01 sempre. As outras, depois, só se ativos/RF/índices
 * deram certo, com retry 2-3x.").
 *
 * POR QUE: os gatilhos diários antigos usavam .everyDays(1).atHour(h)
 * .nearMinute(m) — o Apps Script NÃO garante o minuto (janela de ±15 min,
 * às vezes a hora inteira), e cada job tinha o seu horário solto, sem
 * nenhuma dependência entre eles.
 *
 * COMO FUNCIONA AGORA:
 *  1) Gatilho diário "despertador" (despertadorAgendaDiaria, ~8h-9h — a
 *     imprecisão do atHour não importa aqui, ele só prepara o dia) cria um
 *     gatilho de UMA VEZ SÓ (one-shot, .at(...)) pra HOJE 10:01:00 no fuso
 *     America/Sao_Paulo — esse tipo de gatilho respeita o horário pedido.
 *     05/10/2026 (A-55): domingo, sábado e feriado da B3 não agendam nada
 *     (o GOOGLEFINANCE responde #N/A pros 30 ativos e a cota é gasta à toa) —
 *     SALVO pra fechar lacuna: se o último dia de pregão deixou etapa
 *     recuperável pra trás, sábado/feriado roda só essas etapas (1x). Feriados:
 *     constante AGENDA_FERIADOS_B3_ + aba "aux_feriados-b3" (coluna A = data),
 *     que o Tiago pode ajustar sem mexer em código (criarAbaFeriadosB3()).
 *  2) Cada one-shot chama etapaAgendaDiaria(), que roda UMA etapa por
 *     execução (cada uma com os seus próprios 6 min do Apps Script):
 *       PRINCIPAL:   ativos (Sync.gs) e rendaFixaIndices (BackfillIndices.gs)
 *       SECUNDÁRIAS: snapshotResumo, proventosFnet, informesFnet, fundamentos,
 *                    portfolioFii e preAquecer (05/10/2026, A-53: o pré-aquecimento
 *                    do cache das telas de ativo era um gatilho a cada 2 h, 12
 *                    execuções/dia reconferindo cache já quente; agora é 1 etapa
 *                    depois da sync e dos informes).
 *  3) 05/10/2026 (A-47): ESTÁGIOS INDEPENDENTES. Cada etapa declara de quem
 *     depende (AGENDA_ETAPAS_[].depende) e o que é erro transitório
 *     (agendaErroTransitorio_). A falha de uma etapa só atrasa/pula quem
 *     depende DELA (ex.: o snapshot do resumo depende dos preços — "ativos" —,
 *     não do BCB; o portfólio dos FIIs depende dos informes). Em 03/10 o DNS do
 *     BCB derrubou 3x a Renda Fixa e, pela regra antiga ("principal falhou ->
 *     secundárias não rodam"), o snapshot, os proventos e os informes nem
 *     rodaram. Etapa que falha vai pra "aguardando nova tentativa" (+10 min) e
 *     as OUTRAS etapas seguem na frente; só erro TRANSITÓRIO (timeout, 5xx,
 *     lock ocupado, tempo esgotado) usa as 3 tentativas — DNS/403/404 (fonte
 *     fora do ar ou bloqueada) tem 1 retry só (2 tentativas).
 *  4) RECUPERAÇÃO: terminada a fila, se sobrou etapa recuperável com falha
 *     transitória, a agenda marca UMA rodada de recuperação (1 tentativa a
 *     mais) pra daqui a 60 min (só antes das 18h). Falha na etapa PRINCIPAL
 *     continua gravando 1 linha "Erro" no Registro de Controle + e-mail (1x).
 *     reprocessarAgendaDiaria() (editor) refaz na mão o que falhou/foi pulado.
 *  5) Antes de rodar cada etapa fica agendado um one-shot "vigia" pra +8
 *     min: se a execução for morta no meio (limite de 6 min), o vigia
 *     dispara, conta aquela tentativa como falha e segue a fila.
 *  6) Todo one-shot já usado é apagado (ScriptApp.deleteTrigger) no começo
 *     da execução seguinte (limite de 20 gatilhos por projeto). No máximo
 *     existem: despertador + heartbeat + vídeos + 1 one-shot pendente.
 *  7) HEARTBEAT (A-54): gatilho diário ~12:00 (heartbeatRegistroControle, em
 *     Sync.gs): se hoje é dia de pregão e não há linha de Ativos no Registro de
 *     Controle, grava "Erro" e manda e-mail — dias sem execução não ficam mais
 *     semanas despercebidos.
 *
 * ESTADO (diagnóstico): Propriedades do script, chave AGENDA_DIARIA_ESTADO
 * (dia, situação, motivo, próxima execução, por etapa: status, tentativas,
 * último erro, início/fim, se o erro é transitório) +
 * AGENDA_DIARIA_ESTADO_ANTERIOR (o dia anterior). estadoAgendaDiaria() no
 * editor mostra o resumo no log.
 *
 * SETUP (rodar 1x no editor depois de colar este arquivo):
 *   instalarAgendaDiaria() — remove os gatilhos diários antigos
 *   (gatilhoDiario, gatilhoDiarioRendaFixaEIndices, gatilhoDiarioProventosFnet,
 *   gatilhoDiarioInformesFnet, E o de pré-aquecimento a cada 2 h
 *   gatilhoPreAquecerAtivos), instala o despertador e o heartbeat das 12h e, se
 *   ainda for antes das 10:01 de um dia de pregão, já agenda o dia de hoje.
 *   O gatilho periódico de vídeos (gatilhoVideos) continua como está.
 *
 * Funções antigas continuam existindo e funcionando quando chamadas na mão
 * (gatilhoDiario, rodarRendaFixaEIndicesDiretoDireto, rodarProventosFnetDireto,
 * rodarInformesFnetDireto, rodarPreAquecerAtivosDireto e os botões do site).
 * NÃO rode mais instalarGatilhoDiarioRendaFixaEIndices/
 * instalarGatilhoDiarioProventosFnet/instalarGatilhoDiarioInformesFnet/
 * instalarGatilhoPreAquecerAtivos — recriariam os gatilhos soltos.
 *
 * Outras funções pro editor:
 *   rodarAgendaDiariaAgora() — começa a fila de hoje AGORA (etapa 1 roda
 *     na hora, as seguintes vão sendo agendadas normalmente).
 *   reprocessarAgendaDiaria(ids?) — refaz o que falhou/foi pulado hoje.
 *   estadoAgendaDiaria() — resumo do dia (e do anterior) + gatilhos atuais.
 *   criarAbaFeriadosB3() — cria/atualiza a aba "aux_feriados-b3".
 *
 * Datas/horas: tudo calculado no fuso America/Sao_Paulo via Utilities
 * (formatDate/parseDate) — nunca getHours/getDay "locais", pra não depender
 * do fuso de quem roda (ver tests/harness/agenda-diaria.test.js).
 */

var AGENDA_FUSO_ = 'America/Sao_Paulo';
var AGENDA_HANDLER_DESPERTADOR_ = 'despertadorAgendaDiaria';
var AGENDA_HANDLER_ETAPA_ = 'etapaAgendaDiaria';
var AGENDA_HANDLER_HEARTBEAT_ = 'heartbeatRegistroControle'; // Sync.gs (A-54)
var AGENDA_HORA_DESPERTADOR_ = 8;          // ~8h-9h (atHour não é preciso, e nem precisa ser)
var AGENDA_HORA_HEARTBEAT_ = 12;           // ~12h: confere se a sync de ativos deixou linha no Registro
var AGENDA_HORARIO_PRINCIPAL_ = '10:01:00'; // horário fixo da etapa principal (fuso de SP)
var AGENDA_MAX_TENTATIVAS_ = 3;             // erro transitório: 3 tentativas
var AGENDA_MAX_TENTATIVAS_PERMANENTE_ = 2;  // DNS/403/404: 1 retry só (2 tentativas)
var AGENDA_MAX_RECUPERACOES_ = 1;           // rodadas de recuperação por dia (0 desliga)
var AGENDA_ESPERA_RECUPERACAO_MIN_ = 60;    // fila acabou com falha transitória -> 1 tentativa extra daqui a 1 h
var AGENDA_HORA_LIMITE_RECUPERACAO_ = 18;   // não agenda recuperação depois das 18h (SP)
var AGENDA_ESPERA_RETRY_MIN_ = 10;          // falhou -> tenta de novo daqui a 10 min
var AGENDA_ESPERA_PROXIMA_MIN_ = 1;         // deu certo -> próxima etapa daqui a 1 min
var AGENDA_VIGIA_MIN_ = 8;                  // > 6 min do limite do Apps Script
var AGENDA_PROP_ESTADO_ = 'AGENDA_DIARIA_ESTADO';
var AGENDA_PROP_ESTADO_ANTERIOR_ = 'AGENDA_DIARIA_ESTADO_ANTERIOR';
var AGENDA_MAX_LOG_ = 20;
// handlers dos gatilhos antigos, substituídos por esta agenda (gatilhoPreAquecerAtivos: 05/10/2026, A-53)
var AGENDA_GATILHOS_ANTIGOS_ = ['gatilhoDiario', 'gatilhoDiarioRendaFixaEIndices', 'gatilhoDiarioProventosFnet', 'gatilhoDiarioInformesFnet', 'gatilhoPreAquecerAtivos'];

// 05/10/2026 (A-55): feriados em que a B3 não opera (além de sábado e domingo). A aba "aux_feriados-b3"
// (coluna A = data, aaaa-mm-dd ou dd/mm/aaaa) soma datas a esta lista sem mexer em código. Só entram as datas
// de que há certeza; 12/10 e 02/11, por exemplo, ficam de fora (se a B3 fechar, é só incluir na aba).
var AGENDA_FERIADOS_B3_ = [
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-04-03', '2026-04-21', '2026-05-01', '2026-06-04', '2026-09-07', '2026-11-20', '2026-12-24', '2026-12-25', '2026-12-31',
  '2027-01-01', '2027-02-08', '2027-02-09', '2027-03-26', '2027-04-21', '2027-05-27', '2027-09-07', '2027-11-20', '2027-12-24', '2027-12-31'
];
var AGENDA_ABA_FERIADOS_ = 'aux_feriados-b3';

/**
 * Etapas do dia, na ordem de preferência de execução.
 *  - depende: ids das etapas cuja falha (ou "pulada") faz ESTA ser pulada; enquanto a dependência ainda não
 *    terminou (em nova tentativa) a etapa espera. Sem dependência = independente de tudo.
 *  - principal: falha final grava "Erro" no Registro + e-mail.
 *  - recuperavel: entra na rodada de recuperação (e no fechamento de lacuna de sábado/feriado).
 *  - transitorio(texto): opcional; sobrescreve agendaErroTransitorio_ pra essa etapa.
 */
var AGENDA_ETAPAS_ = [
  { id: 'ativos', nome: 'Ativos (ações/FIIs/EUA)', principal: true, depende: [], recuperavel: true },
  { id: 'rendaFixaIndices', nome: 'Renda Fixa + Índices', principal: true, depende: [], recuperavel: true },
  // snapshot do resumo: precisa dos preços do dia (ativos); o BCB (Renda Fixa/Índices) não trava mais o snapshot
  { id: 'snapshotResumo', nome: 'Snapshot do resumo diário', principal: false, depende: ['ativos'], recuperavel: true },
  { id: 'proventosFnet', nome: 'Proventos FNet', principal: false, depende: [], recuperavel: true },
  { id: 'informesFnet', nome: 'Informes FNet', principal: false, depende: [], recuperavel: true },
  { id: 'fundamentos', nome: 'Fundamentos', principal: false, depende: [], recuperavel: false }, // 03/10/2026 (Fundamentos.gs)
  { id: 'portfolioFii', nome: 'Portfólio dos FIIs', principal: false, depende: ['informesFnet'], recuperavel: false }, // 05/10/2026 (PortfolioFii.gs): lê os fatos relevantes dos informes
  { id: 'preAquecer', nome: 'Pré-aquecimento das telas de ativo', principal: false, depende: ['ativos'], recuperavel: false } // 05/10/2026 (A-53, Ativo.gs)
];

// ---------------------------------------------------------------------------
// Instalação / execução manual / diagnóstico
// ---------------------------------------------------------------------------

/** Rodar 1x no editor: troca os gatilhos diários antigos pela agenda encadeada (+ heartbeat das 12h). */
function instalarAgendaDiaria() {
  var removidos = [];
  var mantidos = [];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (AGENDA_GATILHOS_ANTIGOS_.indexOf(h) !== -1 || h === AGENDA_HANDLER_DESPERTADOR_ || h === AGENDA_HANDLER_ETAPA_ || h === AGENDA_HANDLER_HEARTBEAT_) {
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
  ScriptApp.newTrigger(AGENDA_HANDLER_HEARTBEAT_)
    .timeBased()
    .everyDays(1)
    .atHour(AGENDA_HORA_HEARTBEAT_)
    .nearMinute(0)
    .create();

  var agora = agendaAgora_();
  var hoje = agendaChaveDia_(agora);
  var alvo = agendaHorarioPrincipal_(hoje);
  var msgHoje;
  if (agendaClassificarDia_(hoje).util && agora.getTime() < alvo.getTime() - 2 * 60 * 1000) {
    agendaPrepararDia_(agora, { forcar: true });
    msgHoje = 'hoje (' + hoje + ') já ficou agendado pras ' + AGENDA_HORARIO_PRINCIPAL_.slice(0, 5) + '.';
  } else {
    msgHoje = 'hoje não foi agendado (fim de semana, feriado da B3 ou já passou das ' + AGENDA_HORARIO_PRINCIPAL_.slice(0, 5) +
      ') — a 1ª execução automática é no próximo dia de pregão; pra rodar hoje mesmo, use rodarAgendaDiariaAgora().';
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

/**
 * 05/10/2026 (A-47, "reprocessar"): refaz hoje o que falhou ou foi pulado (ou só os `ids` pedidos, ex.:
 * ['rendaFixaIndices']), com tentativas zeradas, a partir de 1 min. Não mexe no que já deu certo.
 */
function reprocessarAgendaDiaria(ids) {
  var agora = agendaAgora_();
  var hoje = agendaChaveDia_(agora);
  var estado = agendaLerEstado_(AGENDA_PROP_ESTADO_);
  if (!estado || estado.dia !== hoje) throw new Error('Não há agenda de hoje (' + hoje + ') — use rodarAgendaDiariaAgora().');
  var pedidos = (ids && ids.length) ? ids : null;
  var refeitas = [];
  AGENDA_ETAPAS_.forEach(function (d) {
    var est = agendaEstadoEtapa_(estado, d.id);
    var pediu = pedidos ? pedidos.indexOf(d.id) !== -1 : (est.status === 'falhou');
    if (pediu || est.status === 'pulada' || (est.status === 'dispensada' && pediu)) {
      est.status = 'pendente'; est.tentativas = 0; est.ultimoErro = ''; est.transitorio = null; est.quandoMs = 0; est.avisou = false;
      refeitas.push(d.id);
    }
  });
  if (!refeitas.length) { Logger.log('reprocessarAgendaDiaria: nada a refazer hoje.'); return estado; }
  agendaApagarOneShots_();
  estado.situacao = 'agendada';
  estado.motivo = '';
  agendaLog_(estado, agora, 'reprocessar manual: ' + refeitas.join(', '));
  var quando = new Date(agora.getTime() + AGENDA_ESPERA_PROXIMA_MIN_ * 60 * 1000);
  agendaCriarOneShot_(quando);
  estado.proximaExecucao = agendaFormatar_(quando);
  agendaSalvarEstado_(estado);
  return estado;
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

/** Rodar 1x no editor: cria (ou completa) a aba "aux_feriados-b3" com os feriados da constante. */
function criarAbaFeriadosB3() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(AGENDA_ABA_FERIADOS_) || ss.insertSheet(AGENDA_ABA_FERIADOS_);
  var existentes = {};
  if (aba.getLastRow() >= 2) aba.getRange(2, 1, aba.getLastRow() - 1, 1).getValues().forEach(function (l) { var c = agendaNormalizarData_(l[0]); if (c) existentes[c] = true; });
  if (aba.getLastRow() < 1) aba.getRange(1, 1, 1, 2).setValues([['Data', 'Feriado (a B3 não opera) — pode acrescentar linhas']]);
  var novos = AGENDA_FERIADOS_B3_.filter(function (c) { return !existentes[c]; }).map(function (c) { return [c, '']; });
  if (novos.length) aba.getRange(Math.max(aba.getLastRow(), 1) + 1, 1, novos.length, 2).setValues(novos);
  Logger.log('aux_feriados-b3: ' + novos.length + ' data(s) acrescentada(s).');
  return novos.length;
}

// ---------------------------------------------------------------------------
// Handlers dos gatilhos
// ---------------------------------------------------------------------------

/** Gatilho diário (~8h): prepara o dia e agenda o one-shot das 10:01. */
function despertadorAgendaDiaria() {
  agendaPrepararDia_(agendaAgora_(), {});
}

/** One-shot: roda a próxima etapa possível da fila de hoje e agenda a seguinte (ou a nova tentativa). */
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

  // execução anterior de alguma etapa morreu no meio (quem disparou foi o vigia)
  AGENDA_ETAPAS_.forEach(function (d) {
    var e = estado.etapas[d.id];
    if (!e || e.status !== 'rodando') return;
    e.status = 'erro';
    e.ultimoErro = 'execução anterior interrompida sem terminar (provável limite de 6 min do Apps Script)';
    e.transitorio = true;
    e.fim = agendaFormatar_(agora);
    agendaLog_(estado, agora, d.nome + ': tentativa ' + e.tentativas + ' interrompida');
    if (e.tentativas >= agendaMaxTentativas_(e)) {
      agendaFalhaFinal_(estado, d, agora);
    } else {
      e.status = 'aguardando nova tentativa';
      e.quandoMs = agora.getTime(); // roda de novo já
    }
  });

  var passo = agendaProximoPasso_(estado, agora);
  if (!passo) {
    agendaFinalizarDia_(estado, agora);
    agendaSalvarEstado_(estado);
    return;
  }
  if (!passo.def) { // só sobraram esperas (nova tentativa mais pra frente)
    agendaAgendarProximo_(estado, agora);
    agendaSalvarEstado_(estado);
    return;
  }

  var def = passo.def;
  var est = agendaEstadoEtapa_(estado, def.id);
  est.tentativas++;
  est.status = 'rodando';
  est.inicio = agendaFormatar_(agora);
  est.fim = '';
  est.quandoMs = 0;
  estado.etapaAtual = def.id;
  estado.situacao = 'rodando';
  estado.proximaExecucao = '';
  agendaLog_(estado, agora, def.nome + ': tentativa ' + est.tentativas + '/' + agendaMaxTentativas_(est));
  agendaSalvarEstado_(estado);
  agendaCriarOneShot_(new Date(agora.getTime() + AGENDA_VIGIA_MIN_ * 60 * 1000)); // vigia

  var resultado;
  // 05/10/2026 (A-54): as linhas que a rotina gravar no Registro de Controle saem com Etapa/Tentativa/Duração
  try { if (typeof definirContextoRegistro_ === 'function') definirContextoRegistro_({ etapa: def.id, tentativa: est.tentativas }); } catch (eCtx) { /* só rotulagem */ }
  try {
    resultado = agendaRodarJob_(def.id, est);
  } catch (erro) {
    resultado = { ok: false, detalhe: String(erro) };
  }
  try { if (typeof definirContextoRegistro_ === 'function') definirContextoRegistro_(null); } catch (eCtx2) { /* ok */ }

  var fim = agendaAgora_();
  agendaApagarOneShots_(); // apaga o vigia
  est.fim = agendaFormatar_(fim);
  if (resultado.ok) {
    est.status = 'ok';
    est.ultimoErro = '';
    est.transitorio = null;
    est.detalhe = agendaCortar_(resultado.detalhe);
    agendaLog_(estado, fim, def.nome + ': ok');
  } else {
    est.ultimoErro = agendaCortar_(resultado.detalhe);
    est.transitorio = agendaClassificarErro_(def, resultado.detalhe);
    agendaLog_(estado, fim, def.nome + ': falhou' + (est.transitorio ? '' : ' (fonte fora/bloqueada: DNS/403/404)') + ' (' + agendaCortar_(resultado.detalhe, 80) + ')');
    if (est.tentativas < agendaMaxTentativas_(est)) {
      est.status = 'aguardando nova tentativa';
      est.quandoMs = fim.getTime() + AGENDA_ESPERA_RETRY_MIN_ * 60 * 1000;
    } else {
      agendaFalhaFinal_(estado, def, fim);
    }
  }
  agendaAgendarProximo_(estado, fim);
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
  if (id === 'preAquecer') {
    // 05/10/2026 (A-53): pré-aquece o cache das telas de ativo 1x, DEPOIS da sync (ativos já em dia) —
    // antes era um gatilho a cada 2 h. Faltou tempo -> nova tentativa continua de onde parou (cache já feito é pulado).
    // 05/10/2026 (A-36/A-37): antes dos ativos (que usam o tempo que sobrar), pré-aquece `macro` e as peças lentas de `metas` e mede
    // a capacidade do cache/JSON em célula (CacheRespostas.gs). Só otimização: nunca falha a etapa (o problema vai no detalhe).
    var extra = null;
    try { extra = typeof preAquecerMetasEMacro_ === 'function' ? preAquecerMetasEMacro_() : null; } catch (eExtra) { extra = { detalhe: 'metas/macro: ' + String(eExtra).slice(0, 80) }; }
    var pa = preAquecerCacheAtivos_(); // Ativo.gs
    var faltaram = pa.faltaramPorTempo || 0;
    return {
      ok: !faltaram,
      detalhe: pa.calculados + ' calculado(s), ' + pa.jaEmCache + ' já em cache' + (faltaram ? ', ' + faltaram + ' ficaram pra próxima (tempo)' : '') +
        ((pa.falhas && pa.falhas.length) ? ', ' + pa.falhas.length + ' falha(s): ' + pa.falhas.slice(0, 3).join('; ') : '') +
        (extra ? ' | ' + extra.detalhe : '')
    };
  }
  throw new Error('etapa desconhecida: ' + id);
}

// ---------------------------------------------------------------------------
// Erro transitório x permanente
// ---------------------------------------------------------------------------

/**
 * true = vale repetir (timeout, 5xx, 429, lock ocupado, tempo esgotado, erro não reconhecido);
 * false = fonte fora do ar do nosso lado ou bloqueada (DNS, 401/403/404/410) — repetir 3x no mesmo dia não resolve,
 * 1 retry basta (A-47).
 */
function agendaErroTransitorio_(texto) {
  var t = String(texto == null ? '' : texto);
  if (/\bDNS\b|getaddrinfo|ENOTFOUND|unable to resolve|could not resolve|n[aã]o foi poss[ií]vel resolver|address unavailable|nome do host/i.test(t)) return false;
  if (/(HTTP|c[oó]digo|code|status)\s*[:=]?\s*(401|403|404|410)\b/i.test(t)) return false;
  if (/\b(403 Forbidden|404 Not Found|401 Unauthorized)\b/i.test(t)) return false;
  return true;
}

function agendaClassificarErro_(def, texto) {
  var fn = (def && typeof def.transitorio === 'function') ? def.transitorio : agendaErroTransitorio_;
  try { return !!fn(texto); } catch (e) { return true; }
}

function agendaMaxTentativas_(est) {
  return (est && est.transitorio === false) ? AGENDA_MAX_TENTATIVAS_PERMANENTE_ : AGENDA_MAX_TENTATIVAS_;
}

// ---------------------------------------------------------------------------
// Fila (estágios independentes)
// ---------------------------------------------------------------------------

function agendaNovaEtapa_() {
  return { status: 'pendente', tentativas: 0, ultimoErro: '', inicio: '', fim: '', detalhe: '', transitorio: null, quandoMs: 0 };
}

/** Estado da etapa; cria se faltar (estado gravado por uma versão sem esta etapa). */
function agendaEstadoEtapa_(estado, id) {
  if (!estado.etapas) estado.etapas = {};
  if (!estado.etapas[id]) estado.etapas[id] = agendaNovaEtapa_();
  return estado.etapas[id];
}

function agendaDef_(id) {
  for (var i = 0; i < AGENDA_ETAPAS_.length; i++) if (AGENDA_ETAPAS_[i].id === id) return AGENDA_ETAPAS_[i];
  return null;
}

/**
 * Próxima etapa a rodar: { def } (pode rodar já), { def: null, esperarAte: ms } (só há esperas de nova
 * tentativa) ou null (nada mais a fazer hoje). Marca como "pulada" quem depende de etapa que falhou.
 */
function agendaProximoPasso_(estado, agora) {
  for (var volta = 0; volta < 20; volta++) {
    var mudou = false;
    var esperas = [];
    for (var i = 0; i < AGENDA_ETAPAS_.length; i++) {
      var d = AGENDA_ETAPAS_[i];
      var est = agendaEstadoEtapa_(estado, d.id);
      if (est.status !== 'pendente' && est.status !== 'aguardando nova tentativa') continue;
      var bloqueada = false;
      var motivoPulo = '';
      (d.depende || []).forEach(function (dep) {
        var s = agendaEstadoEtapa_(estado, dep).status;
        if (s === 'falhou' || s === 'pulada') motivoPulo = 'depende de "' + (agendaDef_(dep) ? agendaDef_(dep).nome : dep) + '", que ' + (s === 'falhou' ? 'falhou' : 'foi pulada');
        else if (s !== 'ok' && s !== 'dispensada') bloqueada = true;
      });
      if (motivoPulo) {
        est.status = 'pulada';
        est.ultimoErro = motivoPulo;
        agendaLog_(estado, agora, d.nome + ': pulada (' + motivoPulo + ')');
        mudou = true;
        break;
      }
      if (bloqueada) continue;
      if (est.status === 'aguardando nova tentativa' && est.quandoMs > agora.getTime()) { esperas.push(est.quandoMs); continue; }
      return { def: d };
    }
    if (!mudou) return esperas.length ? { def: null, esperarAte: Math.min.apply(null, esperas) } : null;
  }
  return null;
}

/** Agenda o one-shot da próxima etapa (ou da nova tentativa mais próxima), ou encerra o dia. */
function agendaAgendarProximo_(estado, agora) {
  var passo = agendaProximoPasso_(estado, agora);
  if (!passo) { agendaFinalizarDia_(estado, agora); return; }
  var minimo = agora.getTime() + AGENDA_ESPERA_PROXIMA_MIN_ * 60 * 1000;
  var alvo = passo.def ? minimo : Math.max(passo.esperarAte, minimo);
  var quando = new Date(alvo);
  estado.situacao = 'agendada';
  agendaCriarOneShot_(quando);
  estado.proximaExecucao = agendaFormatar_(quando);
}

/** Etapa esgotou as tentativas. Principal: 1 linha "Erro" no Registro + e-mail (1x). As outras etapas seguem. */
function agendaFalhaFinal_(estado, def, agora) {
  var est = agendaEstadoEtapa_(estado, def.id);
  est.status = 'falhou';
  est.quandoMs = 0;
  agendaLog_(estado, agora, def.nome + ': desistiu após ' + est.tentativas + ' tentativa(s)');
  if (!def.principal || est.avisou) return;
  est.avisou = true;
  var msg = 'Etapa principal "' + def.nome + '" falhou ' + est.tentativas + 'x' + (est.transitorio === false ? ' (fonte fora do ar/bloqueada)' : '') +
    ' (último erro: ' + agendaCortar_(est.ultimoErro, 150) + ') — as etapas independentes seguiram.';
  try {
    if (typeof gravarRegistroControle_ === 'function') gravarRegistroControle_('Erro', 'Automático', 'Agenda diária: ' + msg, { etapa: def.id, tentativa: est.tentativas });
    if (typeof notificarFalhaSincronizacao_ === 'function') notificarFalhaSincronizacao_('Automático', 'Agenda diária: ' + msg);
  } catch (e) {
    Logger.log('agendaFalhaFinal_: não registrou/notificou - ' + e);
  }
}

/** Fila vazia: tenta 1 rodada de recuperação; senão fecha o dia com o resumo. */
function agendaFinalizarDia_(estado, agora) {
  if (agendaPrepararRecuperacao_(estado, agora)) return;
  var falhas = [], puladas = [], principais = [];
  AGENDA_ETAPAS_.forEach(function (d) {
    var e = estado.etapas[d.id];
    if (!e) return;
    if (e.status === 'falhou') { falhas.push(d.nome + ' (' + e.tentativas + 'x)'); if (d.principal) principais.push(d); }
    if (e.status === 'pulada') puladas.push(d.nome);
  });
  estado.proximaExecucao = '';
  if (principais.length) {
    var p = principais[0];
    var ep = estado.etapas[p.id];
    estado.situacao = 'falhou';
    estado.motivo = 'Etapa principal "' + p.nome + '" falhou ' + ep.tentativas + 'x (último erro: ' + agendaCortar_(ep.ultimoErro, 150) + ')' +
      (principais.length > 1 ? '; também falhou: ' + principais.slice(1).map(function (d) { return d.nome; }).join(', ') : '') +
      (puladas.length ? ' — puladas por dependência: ' + puladas.join(', ') : '') + '.';
    agendaLog_(estado, agora, 'dia encerrado com falha em etapa principal');
  } else {
    estado.situacao = 'concluida';
    estado.motivo = (falhas.length || puladas.length)
      ? 'Concluída, mas falharam: ' + (falhas.join(', ') || 'nenhuma') + (puladas.length ? '; puladas por dependência: ' + puladas.join(', ') : '') + ' (ver último erro de cada uma).'
      : 'Tudo certo.';
    agendaLog_(estado, agora, 'dia concluído' + ((falhas.length || puladas.length) ? ' com falhas' : ''));
  }
}

/**
 * 05/10/2026 (A-47, "recuperação do que ficou pra trás"): terminada a fila, etapas recuperáveis que falharam por
 * motivo transitório ganham UMA tentativa a mais daqui a 60 min (e as puladas por causa delas voltam pra fila).
 * 1 rodada por dia (AGENDA_MAX_RECUPERACOES_) e só antes das 18h. Devolve true se agendou.
 */
function agendaPrepararRecuperacao_(estado, agora) {
  if ((estado.recuperacoes || 0) >= AGENDA_MAX_RECUPERACOES_) return false;
  if (parseInt(agendaFormatar_(agora, 'HH'), 10) >= AGENDA_HORA_LIMITE_RECUPERACAO_) return false;
  var alvo = {};
  var nomes = [];
  AGENDA_ETAPAS_.forEach(function (d) {
    var e = estado.etapas[d.id];
    if (e && e.status === 'falhou' && d.recuperavel !== false && e.transitorio !== false) { alvo[d.id] = true; nomes.push(d.nome); }
  });
  if (!nomes.length) return false;
  AGENDA_ETAPAS_.forEach(function (d) { // etapas puladas só por causa de uma que vai ser refeita
    var e = estado.etapas[d.id];
    if (!e || e.status !== 'pulada') return;
    var dependeDeAlvo = (d.depende || []).some(function (dep) { return alvo[dep]; });
    if (dependeDeAlvo) alvo[d.id] = 'pulada';
  });
  AGENDA_ETAPAS_.forEach(function (d) {
    var e = estado.etapas[d.id];
    if (!alvo[d.id]) return;
    if (alvo[d.id] === 'pulada') { e.status = 'pendente'; e.tentativas = 0; e.ultimoErro = ''; }
    else { e.status = 'pendente'; e.tentativas = Math.max(0, AGENDA_MAX_TENTATIVAS_ - 1); } // 1 tentativa só
    e.quandoMs = 0;
  });
  estado.recuperacoes = (estado.recuperacoes || 0) + 1;
  var quando = new Date(agora.getTime() + AGENDA_ESPERA_RECUPERACAO_MIN_ * 60 * 1000);
  estado.situacao = 'agendada';
  estado.motivo = '';
  estado.proximaExecucao = agendaFormatar_(quando);
  agendaLog_(estado, agora, 'recuperação em ' + AGENDA_ESPERA_RECUPERACAO_MIN_ + ' min: ' + nomes.join(', '));
  agendaCriarOneShot_(quando);
  return true;
}

/**
 * Começa o estado do dia e agenda o one-shot das 10:01.
 * opcoes.forcar: recomeça mesmo se hoje já rodou/está rodando.
 * opcoes.imediato: não agenda one-shot (quem chamou roda a etapa na hora; ignora fim de semana/feriado).
 */
function agendaPrepararDia_(agora, opcoes) {
  opcoes = opcoes || {};
  var hoje = agendaChaveDia_(agora);
  var atual = agendaLerEstado_(AGENDA_PROP_ESTADO_);
  var jaComecou = atual && (atual.situacao !== 'agendada' || atual.modo === 'recuperacao' || AGENDA_ETAPAS_.some(function (d) {
    return atual.etapas && atual.etapas[d.id] && atual.etapas[d.id].tentativas > 0;
  }));
  if (atual && atual.dia === hoje && !opcoes.forcar && jaComecou) {
    Logger.log('Agenda de hoje já está "' + atual.situacao + '" — despertador não recomeça.');
    return atual;
  }
  agendaApagarOneShots_();
  var anterior = (atual && atual.dia !== hoje) ? atual : null;
  if (anterior) {
    PropertiesService.getScriptProperties().setProperty(AGENDA_PROP_ESTADO_ANTERIOR_, JSON.stringify(anterior));
  }

  var estado = agendaNovoEstado_(hoje);
  var tipoDia = agendaClassificarDia_(hoje);
  if (!tipoDia.util && !opcoes.imediato) {
    // 05/10/2026 (A-55): sem pregão não agenda — salvo pra fechar lacuna do último dia de pregão (1x, nunca no domingo)
    var pendentes = tipoDia.tipo === 'domingo' ? [] : agendaPendenciasDe_(anterior, hoje);
    if (!pendentes.length) {
      estado.situacao = tipoDia.tipo === 'domingo' ? 'domingo' : 'sem pregao';
      estado.motivo = tipoDia.motivo + ' — nada roda (sem pregão o GOOGLEFINANCE não traz dado novo).';
      agendaLog_(estado, agora, tipoDia.motivo.toLowerCase() + ', nada agendado');
      agendaSalvarEstado_(estado);
      return estado;
    }
    estado.modo = 'recuperacao';
    // lacuna de sábado/feriado: 1 tentativa por etapa e nenhuma rodada de recuperação extra (não é dia de pregão)
    AGENDA_ETAPAS_.forEach(function (d) {
      if (pendentes.indexOf(d.id) === -1) estado.etapas[d.id].status = 'dispensada';
      else estado.etapas[d.id].tentativas = Math.max(0, AGENDA_MAX_TENTATIVAS_ - 1);
    });
    estado.recuperacoes = AGENDA_MAX_RECUPERACOES_;
    agendaLog_(estado, agora, tipoDia.motivo.toLowerCase() + ': roda só pra fechar lacuna de ' + anterior.dia + ' (' + pendentes.join(', ') + ')');
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

/** Etapas recuperáveis que o dia `anterior` deixou pra trás (falha transitória, pulada, nunca rodou). */
function agendaPendenciasDe_(anterior, hoje) {
  if (!anterior || anterior.dia === hoje || anterior.modo === 'recuperacao') return [];
  if (anterior.situacao === 'domingo' || anterior.situacao === 'sem pregao') return [];
  var ids = [];
  AGENDA_ETAPAS_.forEach(function (d) {
    var e = anterior.etapas && anterior.etapas[d.id];
    if (!e || d.recuperavel === false) return;
    if (e.status === 'ok' || e.status === 'dispensada') return;
    if (e.status === 'falhou' && e.transitorio === false) return;
    ids.push(d.id);
  });
  return ids;
}

function agendaNovoEstado_(dia) {
  var etapas = {};
  AGENDA_ETAPAS_.forEach(function (d) { etapas[d.id] = agendaNovaEtapa_(); });
  return {
    dia: dia, situacao: 'agendada', motivo: '', etapaAtual: AGENDA_ETAPAS_[0].id, modo: '', recuperacoes: 0,
    proximaExecucao: '', etapas: etapas, log: [], atualizadoEm: ''
  };
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
// Datas (fuso de SP, nunca o fuso "local" de quem roda) e calendário B3
// ---------------------------------------------------------------------------

function agendaAgora_() { return new Date(); }

function agendaFormatar_(data, formato) {
  return Utilities.formatDate(data, AGENDA_FUSO_, formato || 'yyyy-MM-dd HH:mm:ss');
}

/** 'yyyy-MM-dd' do dia em São Paulo. */
function agendaChaveDia_(data) { return agendaFormatar_(data, 'yyyy-MM-dd'); }

/** Dia da semana (0 = domingo) a partir da chave do dia (calendário puro, sem fuso). */
function agendaDiaSemana_(chaveDia) {
  var p = chaveDia.split('-');
  return new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]))).getUTCDay();
}

/** Domingo a partir da chave do dia (calendário puro, sem fuso). */
function agendaEhDomingo_(chaveDia) { return agendaDiaSemana_(chaveDia) === 0; }

/** 'aaaa-mm-dd' de uma célula da aba de feriados (Date, 'aaaa-mm-dd' ou 'dd/mm/aaaa'); '' se não for data. */
function agendaNormalizarData_(v) {
  if (v instanceof Date) { try { return agendaChaveDia_(v); } catch (e) { return ''; } }
  var t = String(v == null ? '' : v).trim();
  var m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}

var _agendaFeriadosExtras_ = null;
/** Datas da aba "aux_feriados-b3" (1 leitura por execução; sem a aba/planilha, lista vazia). */
function agendaFeriadosExtras_() {
  if (_agendaFeriadosExtras_) return _agendaFeriadosExtras_;
  var datas = [];
  try {
    if (typeof SpreadsheetApp !== 'undefined') {
      var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(AGENDA_ABA_FERIADOS_);
      if (aba && aba.getLastRow() >= 2) {
        aba.getRange(2, 1, aba.getLastRow() - 1, 1).getValues().forEach(function (l) { var c = agendaNormalizarData_(l[0]); if (c) datas.push(c); });
      }
    }
  } catch (e) { datas = []; }
  _agendaFeriadosExtras_ = datas;
  return datas;
}

/** { util, tipo: 'util'|'domingo'|'sabado'|'feriado', motivo } — dia de pregão da B3 (A-55). */
function agendaClassificarDia_(chaveDia) {
  var dow = agendaDiaSemana_(chaveDia);
  if (dow === 0) return { util: false, tipo: 'domingo', motivo: 'Domingo' };
  if (dow === 6) return { util: false, tipo: 'sabado', motivo: 'Sábado' };
  if (AGENDA_FERIADOS_B3_.indexOf(chaveDia) !== -1 || agendaFeriadosExtras_().indexOf(chaveDia) !== -1) return { util: false, tipo: 'feriado', motivo: 'Feriado da B3' };
  return { util: true, tipo: 'util', motivo: '' };
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

function agendaCortar_(texto, max) {
  var s = String(texto == null ? '' : texto);
  max = max || 200;
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function agendaResumoTexto_(estado, rotulo) {
  if (!estado) return rotulo + ': nenhuma agenda registrada ainda (rode instalarAgendaDiaria()).';
  var l = [];
  l.push(rotulo + ' — ' + estado.dia + ': ' + estado.situacao + (estado.modo === 'recuperacao' ? ' [recuperação de lacuna]' : '') +
    (estado.proximaExecucao ? ' (próxima execução: ' + estado.proximaExecucao + ')' : '') +
    (estado.motivo ? ' — ' + estado.motivo : ''));
  AGENDA_ETAPAS_.forEach(function (d) {
    var e = estado.etapas[d.id];
    if (!e) return;
    l.push('  • ' + d.nome + (d.principal ? ' [principal]' : '') + ': ' + e.status +
      ' — ' + e.tentativas + '/' + agendaMaxTentativas_(e) + ' tentativa(s)' +
      (e.inicio ? ', início ' + e.inicio : '') + (e.fim ? ', fim ' + e.fim : '') +
      (e.ultimoErro ? ' — último erro: ' + e.ultimoErro : '') +
      (e.detalhe ? ' — ' + e.detalhe : ''));
  });
  if (estado.log && estado.log.length) l.push('  Log: ' + estado.log.join(' | '));
  return l.join('\n');
}
