/**
 * Sync.gs — Sincronização do histórico de patrimônio
 * ("aux_historico-patrimonio") + Registro de Controle.
 *
 * Duas origens chamam a MESMA função central (atualizarHistorico):
 *   - gatilho diário automático  → gatilhoDiario()
 *   - botão manual no site       → Router.gs (doPost), ação "sincronizarAgora"
 *   - "tentar novamente" (retry) → mesma ação + lista de tickers
 *     específicos, em vez de rodar os 29 de novo
 *
 * A 1ª sincronização de um ticker (nenhuma linha ainda em
 * aux_historico-patrimonio) faz o backfill completo a partir da data
 * da 1ª transação dele — não um valor arbitrário. As chamadas
 * seguintes são incrementais (só o que falta desde a última salva).
 * Pára sozinha antes do limite de 6min do Apps Script, deixando o
 * resto pra próxima chamada (campo naoProcessados no retorno).
 *
 * Se o GOOGLEFINANCE não terminar de calcular um backfill longo a
 * tempo (histórico de anos), o ticker grava o que já deu tempo de
 * calcular e volta pra fila (naoProcessados) — a PRÓXIMA chamada
 * retoma exatamente de onde parou (ultimaDataSalva_ acha a última
 * linha já gravada), então cada retomada pega um intervalo bem menor
 * e converge sozinha em poucas rodadas, sem nunca gravar um ticker
 * incompleto como "sucesso".
 *
 * SETUP (rodar uma vez, se ainda não rodou):
 * 1) instalarGatilhoDiario() manualmente no editor.
 * 2) Aba "Registro de Controle" com cabeçalho na linha 1:
 *    Timestamp | Origem | Status | Detalhe.
 * 3) [testes] Aba "aux_tests" com o MESMO cabeçalho de "aux_historico-patrimonio"
 *    (linha 1): Data | Ticker | Classe | Cotas | Preço | Valor | Câmbio | Valor BRL.
 *    Usada só pelos testes de Registro de Controle (Atenção/Erro/retry) — o
 *    handleSincronizarAgora, quando recebe e.parameter.opcoesTeste, grava aqui
 *    em vez de na aba real, e a origem gravada fica sempre "Teste".
 */

var NOME_ABA_HISTORICO = 'aux_historico-patrimonio';
var NOME_ABA_REGISTRO = 'Registro de Controle';
var CELULA_RASCUNHO = 'Auxiliar_app!AZ1';
var CELULA_RASCUNHO_SAIDA = 'Auxiliar_app!AZ1:BA4000'; // ~15+ anos de pregões — margem de segurança pro backfill completo

// 22 ativos BR = 12 Ações + 10 FIIs (bate com "22 BR" do backfill validado).
var TICKERS_BR = ['WIZC3', 'VAMO3', 'SEER3', 'TUPY3', 'AXIA7', 'AGRO3', 'B3SA3', 'BBAS3', 'BBSE3', 'EGIE3', 'PETR4', 'VALE3',
                   'BTLG11', 'GARE11', 'PMLL11', 'VGIP11', 'TRXF11', 'RECR11', 'RBRY11', 'KNUQ11', 'HGRU11', 'XPML11'];
// 7 ativos USA (confirmado — Carteira Ações USA tem 7, não 8).
var TICKERS_USA = ['GPRK', 'CHTR', 'SIRI', 'EWBC', 'PAM', 'PROSY', 'VNOM'];

/**
 * Instala o gatilho diário — rodar UMA VEZ, manualmente, no editor.
 * Time-driven trigger não tem opção nativa "seg-sáb" na API, por isso
 * ele dispara todo dia e é a própria gatilhoDiario() que pula domingo.
 */
function instalarGatilhoDiario() {
  var jaExiste = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'gatilhoDiario';
  });
  if (jaExiste) {
    Logger.log('Gatilho já existe, nada a fazer.');
    return;
  }
  ScriptApp.newTrigger('gatilhoDiario')
    .timeBased()
    .everyDays(1)
    .atHour(10)
    .nearMinute(1)
    .create();
  Logger.log('Gatilho diário instalado (dispara por volta de 10h, todo dia — domingo é ignorado dentro da própria função).');
}

/** Chamada pelo gatilho — só filtra domingo antes de rodar a rotina de verdade. */
function gatilhoDiario() {
  if (new Date().getDay() === 0) { // 0 = domingo
    Logger.log('Hoje é domingo, gatilho não faz nada.');
    return;
  }
  atualizarHistorico('Automático', null);
}

/**
 * Handler chamado pelo Router (doPost) — botão manual e "tentar novamente".
 * e.parameter.tickers (opcional): string JSON com lista de tickers pra
 *   reprocessar seletivamente. Se ausente, roda pra todos os 29 ativos.
 */
function handleSincronizarAgora(e) {
  try {
    var tickersEspecificos = null;
    if (e.parameter.tickers) {
      tickersEspecificos = JSON.parse(e.parameter.tickers);
    }

    // Modo teste: roda a MESMA rotina, mas gravando em "aux_tests" em vez de
    // "aux_historico-patrimonio" (planilha real nunca é tocada) e, opcionalmente,
    // forçando alguns tickers a "falhar" de propósito (determinístico — não
    // depende de um erro de verdade do GOOGLEFINANCE) pra testar os caminhos
    // de Atenção/Erro do Registro de Controle. Origem sempre "Teste" nesse
    // modo, pra nunca se confundir com uma sincronização real no histórico.
    var opcoes = null;
    var origem = 'Manual';
    if (e.parameter.opcoesTeste) {
      var opcoesTeste = JSON.parse(e.parameter.opcoesTeste);
      opcoes = {
        abaHistoricoNome: opcoesTeste.abaHistoricoNome || 'aux_tests',
        tickersParaFalhar: opcoesTeste.tickersParaFalhar || []
      };
      origem = 'Teste';
    }

    var resultado = atualizarHistorico(origem, tickersEspecificos, opcoes);
    return jsonOut({ ok: true, resultado: resultado });
  } catch (erro) {
    return jsonOut({ ok: false, erro: String(erro) });
  }
}

/**
 * Rotina central. Pra cada ativo (ou só pra tickersEspecificos, num
 * retry seletivo): descobre a última data já salva, busca só o
 * intervalo que falta, grava as linhas novas. Nunca recalcula um dia
 * já salvo — mesmo princípio do backfill original.
 *
 * @param {string} origem - "Automático", "Manual" ou "Teste"
 * @param {Array<string>|null} tickersEspecificos - null = todos os 29
 * @param {Object|null} opcoes - uso exclusivo dos testes (ver handleSincronizarAgora):
 *   { abaHistoricoNome: string, tickersParaFalhar: Array<string> }
 *   Fora de teste, sempre null — grava em NOME_ABA_HISTORICO normalmente.
 * @return {Object} { status, ok: [tickers], falharam: [{ticker, erro}] }
 */
// Orçamento de tempo por execução — o Apps Script mata a execução em 6min;
// paramos com folga antes disso (sobra tempo pra gravar o Registro de
// Controle) em vez de deixar estourar e perder esse registro. Ativos que não
// deram tempo de processar ficam pra próxima chamada — como cada um lembra
// sua própria última data salva (ultimaDataSalva_), retomar é automático e
// cada retomada fica mais rápida (só os que ainda faltam fazem trabalho de
// verdade; os já em dia só conferem a data e pulam).
var LIMITE_MS_EXECUCAO = 4.5 * 60 * 1000;

// Teto duro: nenhuma espera de buscarPrecoHistorico_ pode ultrapassar isso
// (contado desde o início da execução) — dá uma folga de ~30s antes do
// limite real de 6min do Apps Script pra sobrar tempo de gravar o que já
// foi calculado e escrever o Registro de Controle.
var LIMITE_MS_ABSOLUTO = 5.5 * 60 * 1000;

function atualizarHistorico(origem, tickersEspecificos, opcoes) {
  var inicioExecucao = Date.now();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nomeAbaHistorico = (opcoes && opcoes.abaHistoricoNome) || NOME_ABA_HISTORICO;
  var abaHistorico = ss.getSheetByName(nomeAbaHistorico);
  if (!abaHistorico) throw new Error('Aba "' + nomeAbaHistorico + '" não encontrada.');
  var tickersParaFalhar = (opcoes && opcoes.tickersParaFalhar) || [];

  var todosTickers = TICKERS_BR.concat(TICKERS_USA);
  var tickers = (tickersEspecificos && tickersEspecificos.length) ? tickersEspecificos : todosTickers;

  var ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);

  var ok = [];
  var falharam = [];
  var naoProcessados = [];
  var lacunasEncontradas = []; // pedaços sem dado disponível de verdade (não é falta de tempo) — ver buscarPrecoHistorico_

  // Câmbio USD/BRL: busca UMA vez por execução, reaproveitado por todos os
  // tickers USA — mas o intervalo tem que cobrir a UNIÃO das datas de início
  // de TODOS eles, calculada aqui ANTES do loop principal. Buscar só na hora
  // em que o 1º ticker USA aparece no loop (como era antes) tem um bug: um
  // ticker USA processado DEPOIS, com uma data de início mais antiga que a
  // desse 1º, reaproveitaria o mesmo cache e ficaria sem câmbio casado pros
  // dias anteriores ao início do cache — Câmbio/Valor BRL em branco nesses
  // dias, silenciosamente.
  var cambioCache = null;
  var tickersUsaNestaExecucao = tickers.filter(function (t) { return TICKERS_USA.indexOf(t) !== -1 && tickersParaFalhar.indexOf(t) === -1; });
  if (tickersUsaNestaExecucao.length) {
    var inicioMaisAntigoUsa = null;
    tickersUsaNestaExecucao.forEach(function (t) {
      var historico = carregarHistoricoTransacoes_(ss, t, 'USA');
      var ultima = ultimaDataSalva_(abaHistorico, t);
      var base = ultima || (historico.length ? umDiaAntes_(historico[0].data) : diasAtras_(31));
      var inicioT = new Date(base);
      inicioT.setDate(inicioT.getDate() + 1);
      if (inicioT <= ontem && (!inicioMaisAntigoUsa || inicioT < inicioMaisAntigoUsa)) {
        inicioMaisAntigoUsa = inicioT;
      }
    });
    if (inicioMaisAntigoUsa) {
      var orcamentoCambioInicial = LIMITE_MS_ABSOLUTO - (Date.now() - inicioExecucao) - 2000;
      cambioCache = orcamentoCambioInicial > 3000
        ? buscarPrecoHistorico_('CURRENCY:USDBRL', 'USA', inicioMaisAntigoUsa, ontem, orcamentoCambioInicial)
        : { precos: [], completo: false };
    }
  }

  for (var i = 0; i < tickers.length; i++) {
    if (Date.now() - inicioExecucao > LIMITE_MS_EXECUCAO) {
      // concat, não sobrescreve — tickers já colocados aqui em rodadas
      // anteriores do loop (backfill parcial) não podem ser perdidos
      naoProcessados = naoProcessados.concat(tickers.slice(i));
      break;
    }

    var ticker = tickers[i];
    try {
      if (tickersParaFalhar.indexOf(ticker) !== -1) {
        // Falha simulada (só em modo teste) — determinística, não depende de
        // nenhum erro real do GOOGLEFINANCE, pra testar Atenção/Erro/retry
        // seletivo de forma confiável.
        throw new Error('Falha simulada (teste) — ticker propositalmente marcado pra falhar');
      }

      var classe = (TICKERS_USA.indexOf(ticker) === -1) ? 'BR' : 'USA';
      var historicoTransacoes = carregarHistoricoTransacoes_(ss, ticker, classe);

      var ultimaData = ultimaDataSalva_(abaHistorico, ticker);
      if (!ultimaData) {
        // Ticker ainda sem nenhuma linha em aux_historico-patrimonio — não é
        // um "está 31 dias desatualizado", é a 1ª sincronização de verdade.
        // Backfill completo a partir da data da 1ª transação (não um valor
        // arbitrário) — mesmo algoritmo descrito no Plano de Implementação.
        ultimaData = historicoTransacoes.length ? umDiaAntes_(historicoTransacoes[0].data) : diasAtras_(31);
      }
      var inicio = new Date(ultimaData);
      inicio.setDate(inicio.getDate() + 1);

      if (inicio > ontem) {
        ok.push(ticker); // já está em dia, nada a fazer
        continue;
      }

      var orcamentoRestante = LIMITE_MS_ABSOLUTO - (Date.now() - inicioExecucao);
      if (orcamentoRestante < 5000) {
        // não sobra tempo seguro nem pra 1 tentativa — deixa pra próxima chamada
        naoProcessados.push(ticker);
        continue;
      }

      Logger.log('=== ' + ticker + ': buscando de ' + inicio.toISOString().slice(0,10) + ' até ' + ontem.toISOString().slice(0,10) + ' (orçamento restante: ' + orcamentoRestante + 'ms) ===');
      var busca = buscarPrecoHistorico_(ticker, classe, inicio, ontem, orcamentoRestante - 2000);
      Logger.log('=== ' + ticker + ': total acumulado ' + busca.precos.length + ' linhas, completo=' + busca.completo + ', lacunas=' + JSON.stringify(busca.lacunas) + ' ===');

      if (busca.lacunas && busca.lacunas.length) {
        busca.lacunas.forEach(function (l) {
          lacunasEncontradas.push(ticker + ': ' + l.inicio + ' a ' + l.fim);
        });
      }

      var cambioPorDia = null;
      var cambioCompleto = true;
      if (classe === 'USA' && busca.precos.length) {
        // cambioCache já foi buscado no pré-passo acima, cobrindo a união das
        // datas de início de TODOS os tickers USA desta execução — nunca
        // busca de novo aqui (evitava o bug do cache com intervalo estreito
        // demais pra alguns tickers).
        cambioPorDia = cambioCache ? cambioCache.precos : [];
        cambioCompleto = cambioCache ? cambioCache.completo : false;
      }

      if (busca.precos.length) {
        gravarLinhasHistorico_(abaHistorico, ticker, classe, busca.precos, cambioPorDia, historicoTransacoes);
      }

      if (busca.completo && cambioCompleto) {
        ok.push(ticker);
      } else {
        // GOOGLEFINANCE não terminou de calcular a tempo (comum em backfills
        // de anos) — o que já foi calculado FOI gravado acima; o resto fica
        // pra próxima chamada, que retoma de onde parou (intervalo bem menor).
        naoProcessados.push(ticker);
      }
    } catch (erro) {
      falharam.push({ ticker: ticker, erro: String(erro) });
    }
  }

  var status;
  if (naoProcessados.length && falharam.length === 0) {
    status = 'Atenção'; // parcial por tempo, não por falha — mas ainda não é um "Sucesso" completo
  } else if (falharam.length === 0) {
    status = 'Sucesso';
  } else if (falharam.length === tickers.length) {
    status = 'Erro';
  } else {
    status = 'Atenção';
  }

  var partes = [];
  partes.push(ok.length + ' de ' + tickers.length + ' ativos atualizados');
  if (falharam.length) {
    partes.push(falharam.length + ' falharam: ' + falharam.map(function (f) { return f.ticker; }).join(', '));
  }
  if (naoProcessados.length) {
    partes.push(naoProcessados.length + ' incompletos (falta tempo ou GOOGLEFINANCE ainda calculando — retomam sozinhos na próxima chamada, de onde pararam): ' + naoProcessados.join(', '));
  }
  if (lacunasEncontradas.length) {
    partes.push(lacunasEncontradas.length + ' lacuna(s) — sem dado disponível pro período (não é falta de tempo, provável ausência real no GOOGLEFINANCE — ex: ticker novo/renomeado): ' + lacunasEncontradas.join(' | '));
  }
  var detalhe = partes.join(' — ');

  gravarRegistroControle_(status, origem, detalhe);

  return { status: status, ok: ok, falharam: falharam, naoProcessados: naoProcessados, lacunas: lacunasEncontradas };
}

/** Devolve a última data salva pra esse ticker, ou null se ele ainda não tem nenhuma linha (nunca sincronizado — dispara o backfill completo em atualizarHistorico). */
function ultimaDataSalva_(aba, ticker) {
  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return null;

  var dados = aba.getRange(2, 1, ultimaLinha - 1, 2).getValues(); // A=Data, B=Ticker
  var ultima = null;
  for (var i = 0; i < dados.length; i++) {
    if (dados[i][1] === ticker && dados[i][0] instanceof Date) {
      if (!ultima || dados[i][0] > ultima) ultima = dados[i][0];
    }
  }
  return ultima; // null se esse ticker ainda não apareceu na aba
}

function diasAtras_(n) {
  var d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function umDiaAntes_(d) {
  var novo = new Date(d);
  novo.setDate(novo.getDate() - 1);
  return novo;
}

/**
 * Busca o preço de fechamento (ou câmbio, se ticker for
 * "CURRENCY:USDBRL") num intervalo de datas, via GOOGLEFINANCE, com o
 * mecanismo de célula de rascunho já validado no backfill: escreve a
 * fórmula → força recálculo (flush) → lê o resultado → limpa a célula.
 *
 * Fórmula em INGLÊS (DATE, não DATA) com ";" como separador de
 * argumento — a planilha está em locale pt-BR, então o separador tem
 * que ser ";", mas o nome da função continua em inglês (confirmado no
 * backfill original: português+";" dá #NAME?, inglês+"," dá #ERROR!,
 * só inglês+";" funciona).
 *
 * IMPORTANTE — 3 tentativas de backfill completo da TUPY3 (histórico de
 * ~3,7 anos), cada uma com MAIS tempo de espera que a anterior, trouxeram
 * CADA VEZ MENOS dados (708 linhas → 538 → 433). Isso descarta "só precisa
 * esperar mais": se fosse cálculo assíncrono ainda em andamento, esperar
 * mais teria que trazer mais dados, nunca menos. O padrão bate com um
 * teto/truncamento do GOOGLEFINANCE quando o intervalo pedido numa única
 * fórmula é grande demais (via script, não digitado à mão) — não com uma
 * corrida contra o tempo.
 *
 * Por isso, em vez de 1 fórmula cobrindo o intervalo inteiro, essa função
 * agora divide em PEDAÇOS de CHUNK_DIAS (dias corridos) e faz uma chamada
 * GOOGLEFINANCE por pedaço, juntando o resultado — cada pedido fica bem
 * menor que qualquer teto plausível, e cada pedaço é rápido de confirmar
 * como "terminou de verdade" (a tolerância compara com o fim DO PEDAÇO,
 * não com "ontem"). Mesmo que ainda exista algum componente de
 * assincronia, o polling por pedaço (buscarChunkGoogleFinance_) continua
 * cobrindo isso.
 *
 * Se o orçamento de tempo (orcamentoMs) acabar no meio dos pedaços,
 * devolve { completo: false } com os pedaços que já deu tempo de buscar —
 * NUNCA lança erro nesse caso, pra não perder o que já foi calculado. Quem
 * chama decide o que fazer (gravar o parcial e recolocar o ticker na fila
 * pra próxima chamada continuar exatamente do pedaço onde parou).
 *
 * @param {number} [orcamentoMs] - tempo máximo (ms) que essa função pode
 *   gastar no total (todos os pedaços), antes de desistir e devolver o que
 *   já tiver.
 */
var CHUNK_DIAS = 180; // ~6 meses por chamada GOOGLEFINANCE — bem abaixo de qualquer teto plausível

function buscarPrecoHistorico_(ticker, classe, inicio, fim, orcamentoMs) {
  var prefixo = (classe === 'BR') ? 'BVMF:' : '';
  var tickerCompleto = ticker.indexOf(':') === -1 ? (prefixo + ticker) : ticker; // não prefixa de novo se já vier com "CURRENCY:" etc.

  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var celula = planilha.getRange(CELULA_RASCUNHO);
  var saidaRange = planilha.getRange(CELULA_RASCUNHO_SAIDA);

  var resultadoTotal = [];
  var completo = true;
  var lacunas = []; // pedaços sem NENHUM dado disponível (não é falta de tempo — é ausência real, ex: ticker novo/renomeado sem histórico indexado ainda pro período)
  var inicioOrcamento = Date.now();
  var chunkInicio = new Date(inicio);

  while (chunkInicio <= fim) {
    var orcamentoUsado = Date.now() - inicioOrcamento;
    if (orcamentoMs != null && orcamentoUsado >= orcamentoMs) { completo = false; break; }

    var chunkFim = new Date(chunkInicio);
    chunkFim.setDate(chunkFim.getDate() + CHUNK_DIAS);
    if (chunkFim > fim) chunkFim = new Date(fim);

    var orcamentoChunk = (orcamentoMs != null) ? (orcamentoMs - orcamentoUsado) : null;
    Logger.log('[' + tickerCompleto + '] pedaço ' + chunkInicio.toISOString().slice(0,10) + ' a ' + chunkFim.toISOString().slice(0,10) + ' — orçamento restante: ' + orcamentoChunk + 'ms');
    var chunk = buscarChunkGoogleFinance_(celula, saidaRange, tickerCompleto, chunkInicio, chunkFim, orcamentoChunk);
    Logger.log('[' + tickerCompleto + '] resultado do pedaço: ' + chunk.precos.length + ' linhas, completo=' + chunk.completo + ', esgotouTentativas=' + chunk.esgotouTentativas);

    if (chunk.completo) {
      resultadoTotal = resultadoTotal.concat(chunk.precos);
    } else if (chunk.precos.length === 0 && chunk.esgotouTentativas) {
      // Esgotou TODAS as tentativas locais (não foi cortado por falta de
      // orçamento) e não voltou NENHUMA linha — isso não é "ainda
      // calculando", é ausência real de dado pro período (ex: ticker
      // trocou de código/nome e o Google só indexou o histórico a partir
      // de uma certa data). Registra a lacuna e PULA pro próximo pedaço,
      // em vez de desistir do ativo inteiro aqui.
      Logger.log('[' + tickerCompleto + '] SEM DADOS nesse pedaço (provável ausência real, não falta de tempo) — pulando e seguindo pros próximos');
      lacunas.push({ inicio: chunkInicio.toISOString().slice(0,10), fim: chunkFim.toISOString().slice(0,10) });
    } else {
      // Parcial, ou cortado por falta de orçamento — pode genuinamente
      // ainda estar calculando. Pára aqui (guarda o que já tinha) e retoma
      // exatamente desse pedaço na próxima chamada.
      resultadoTotal = resultadoTotal.concat(chunk.precos);
      completo = false;
      break;
    }

    chunkInicio = new Date(chunkFim);
    chunkInicio.setDate(chunkInicio.getDate() + 1); // próximo pedaço começa no dia seguinte ao fim deste
  }

  return { precos: resultadoTotal, completo: completo, lacunas: lacunas };
}

/** Busca UM pedaço (inicio..fim já pequenos, <= CHUNK_DIAS) via GOOGLEFINANCE, com o mesmo mecanismo de célula de rascunho + polling. */
function buscarChunkGoogleFinance_(celula, saidaRange, tickerCompleto, inicio, fim, orcamentoMs) {
  // Limpa QUALQUER resíduo do pedaço/ticker anterior ANTES de pedir o
  // cálculo novo — sem isso, uma leitura antecipada pode pegar dado velho
  // que passa pelo teste de tolerância por coincidência.
  celula.clearContent();
  saidaRange.clearContent();
  SpreadsheetApp.flush();

  var formula = '=GOOGLEFINANCE("' + tickerCompleto + '";"close";DATE(' +
    inicio.getFullYear() + ';' + (inicio.getMonth() + 1) + ';' + inicio.getDate() + ');DATE(' +
    fim.getFullYear() + ';' + (fim.getMonth() + 1) + ';' + fim.getDate() + '))';

  celula.setFormula(formula);
  SpreadsheetApp.flush();

  // Pedaço já é pequeno (<=6 meses) — poucas tentativas costumam bastar;
  // mantém uma janela generosa (~16,5s) só como rede de segurança.
  var ESPERAS_MS = [500, 1000, 1500, 2000, 2500, 3000, 3000, 3000];
  var TOLERANCIA_DIAS = 5; // fds/feriado — a última linha real costuma ficar 1-4 dias antes de "fim"
  var resultado = [];
  var completo = false;
  var esperaAcumulada = 0;
  // true só se chegou na ÚLTIMA tentativa sem ter sido cortado por
  // orcamentoMs no meio do caminho — distingue "esgotei tudo que podia
  // tentar" de "não tive chance de tentar tudo" (o 2º caso pode ainda estar
  // calculando, o 1º já é sinal forte de ausência real de dado).
  var esgotouTentativas = false;

  for (var tentativa = 0; tentativa < ESPERAS_MS.length; tentativa++) {
    var espera = ESPERAS_MS[tentativa];
    if (orcamentoMs != null && (esperaAcumulada + espera) > orcamentoMs) break; // cortado por orçamento — não esgotou por escolha própria
    Utilities.sleep(espera);
    esperaAcumulada += espera;

    var saida = saidaRange.getValues();
    resultado = [];
    // A primeira linha da saída é cabeçalho ("Date", "Close") — descarta.
    for (var i = 1; i < saida.length; i++) {
      if (!saida[i][0]) break;
      resultado.push({ data: saida[i][0], preco: saida[i][1] });
    }

    if (resultado.length) {
      var ultimaCalculada = resultado[resultado.length - 1].data;
      var diasDeFolga = (fim - ultimaCalculada) / 86400000;
      Logger.log('  tentativa ' + tentativa + ' (espera acumulada ' + esperaAcumulada + 'ms): ' + resultado.length + ' linhas, última=' + ultimaCalculada + ', diasDeFolga=' + diasDeFolga);
      if (diasDeFolga <= TOLERANCIA_DIAS) { completo = true; break; } // perto o bastante do fim DO PEDAÇO — terminou de verdade
    } else {
      Logger.log('  tentativa ' + tentativa + ' (espera acumulada ' + esperaAcumulada + 'ms): 0 linhas (saída ainda vazia ou #N/A/#ERRO)');
    }

    if (tentativa === ESPERAS_MS.length - 1) esgotouTentativas = true;
  }

  celula.clearContent();
  saidaRange.clearContent();

  return { precos: resultado, completo: completo, esgotouTentativas: esgotouTentativas };
}

/**
 * Carrega, uma vez por ticker (não uma vez por dia), a lista
 * (data, cotas acumuladas) direto de Transações — usada pra achar
 * quantas unidades você tinha em qualquer dia do intervalo, sem reler
 * a planilha inteira a cada dia.
 */
function carregarHistoricoTransacoes_(ss, ticker, classe) {
  var aba = ss.getSheetByName(classe === 'USA' ? 'Transações - USA' : 'Transações');
  var ultimaLinha = aba.getLastRow();
  var dados = aba.getRange(7, 1, ultimaLinha - 6, 13).getValues(); // A..M (M = "Cotas até a data")

  var pontos = [];
  dados.forEach(function (linha) {
    if (linha[0] === ticker && linha[1] instanceof Date) {
      pontos.push({ data: linha[1], cotas: linha[12] });
    }
  });
  pontos.sort(function (a, b) { return a.data - b.data; });
  return pontos;
}

/** Quantidade que você tinha numa data específica: o último ponto de Transações com data <= a data pedida (0 se nenhum). */
function quantidadeNaData_(pontos, data) {
  var melhor = 0;
  for (var i = 0; i < pontos.length; i++) {
    if (pontos[i].data <= data) melhor = pontos[i].cotas;
    else break;
  }
  return melhor;
}

/**
 * Grava as linhas novas em aux_historico-patrimonio — append-only, nunca
 * sobrescreve um dia já salvo.
 *
 * IMPORTANTE: usa 1 setValues() em bloco, NUNCA appendRow() num loop.
 * appendRow() é 1 chamada de API por linha — pra um backfill de centenas
 * de linhas (TUPY3 tem ~600+ dias de pregão) isso vira centenas de
 * chamadas individuais numa planilha que já é pesada (milhares de
 * fórmulas, tabelas dinâmicas), e sozinho já é suficiente pra estourar o
 * limite de 6min do Apps Script — mesmo com a busca no GOOGLEFINANCE
 * rápida (ver buscarPrecoHistorico_). setValues() em bloco é 1 chamada só,
 * ordens de magnitude mais rápida.
 */
function gravarLinhasHistorico_(aba, ticker, classe, precos, cambioPorDia, historicoTransacoes) {
  if (!precos.length) return;

  var linhas = precos.map(function (p) {
    var cotas = quantidadeNaData_(historicoTransacoes, p.data);
    var valor = cotas * p.preco;
    var cambio = '';
    var valorBrl = valor;

    if (classe === 'USA' && cambioPorDia) {
      var doDia = cambioPorDia.filter(function (c) { return mesmoDia_(c.data, p.data); })[0];
      cambio = doDia ? doDia.preco : '';
      valorBrl = cambio ? (valor * cambio) : '';
    }

    // Ordem das colunas: Data | Ticker | Classe | Cotas | Preço | Valor | Câmbio | Valor BRL
    return [p.data, ticker, classe, cotas, p.preco, valor, cambio, valorBrl];
  });

  var primeiraLinhaNova = aba.getLastRow() + 1;
  aba.getRange(primeiraLinhaNova, 1, linhas.length, 8).setValues(linhas);
}

function mesmoDia_(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Insere uma nova linha de histórico em "Registro de Controle" logo abaixo do cabeçalho (mais recente sempre no topo). */
function gravarRegistroControle_(status, origem, detalhe) {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_REGISTRO);
  if (!aba) throw new Error('Aba "' + NOME_ABA_REGISTRO + '" não encontrada — crie com cabeçalho Timestamp | Origem | Status | Detalhe na linha 1.');
  aba.insertRowAfter(1);
  var linhaNova = aba.getRange(2, 1, 1, 4);
  linhaNova.setValues([[new Date(), origem, status, detalhe]]);
  aba.getRange(2, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');

  // Evita crescimento infinito: mantém só as últimas 300 execuções no histórico.
  var LIMITE_HISTORICO_REGISTRO = 300;
  var totalLinhas = aba.getLastRow();
  if (totalLinhas > LIMITE_HISTORICO_REGISTRO + 1) {
    aba.deleteRows(LIMITE_HISTORICO_REGISTRO + 2, totalLinhas - LIMITE_HISTORICO_REGISTRO - 1);
  }
}

/** Handler chamado pelo Router (doGet). Alimenta o badge/painel de sincronização no topo do site. */
function handleSyncStatus(e) {
  try {
    return jsonOut({ ok: true, resultado: lerUltimoRegistroControle_() });
  } catch (erro) {
    return jsonOut({ ok: false, erro: String(erro) });
  }
}

function lerUltimoRegistroControle_() {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_REGISTRO);
  if (!aba || aba.getLastRow() < 2) {
    return { status: 'Sem dados', origem: '', timestamp: null, detalhe: 'Nenhuma sincronização registrada ainda.' };
  }
  var linha = aba.getRange(2, 1, 1, 4).getValues()[0];
  return { timestamp: linha[0], origem: linha[1], status: linha[2], detalhe: linha[3] };
}
