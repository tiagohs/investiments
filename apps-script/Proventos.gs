/**
 * Proventos.gs - 24/09/2026 (Tiago: tela "Proventos" + proventos na Início
 * e nas Carteiras).
 *
 * Fontes, todas lidas da planilha (o site nunca chama nada de fora):
 *  - aba "Proventos" / "Proventos - USA": o que você já recebeu (e o que
 *    você lançou com pagamento futuro). A lista sai de
 *    FluxoCaixaInicio.gs!calcularFluxoCaixaDiario_ (listaProventos) - a MESMA
 *    classe e o MESMO valor em R$ dos campos proventos* do histórico, que as
 *    Carteiras somam;
 *  - aba "B3 - proventos a receber": a exportação "Proventos a receber" da
 *    Área do Investidor da B3/corretora, colada como veio (a partir de A1).
 *    Traz ações E FIIs, com a quantidade e o valor líquido já calculados;
 *  - aba aux_proventos-anunciados: FIIs anunciados no FNet
 *    (FnetProventos.gs, gatilho diário).
 * Um mesmo provento (ticker + dia de pagamento) aparece uma vez só, nesta
 * ordem de preferência: sua aba Proventos > exportação da B3 > FNet.
 */

var ABA_B3_PROVENTOS_A_RECEBER = 'B3 - proventos a receber';

// ---------------------------------------------------------------------------
// Tela Proventos
// ---------------------------------------------------------------------------

function handleProventos(e, auth) {
  if (!auth || !auth.ok) return jsonOut({ ok: false, etapa: 'autenticação', erro: auth ? auth.erro : 'token ausente na chamada' });
  try {
    return jsonOut(montarTelaProventosComCache_());
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'proventos', erro: String(erro) });
  }
}

/**
 * { ok, hoje, recebidos, aReceber, pagosNaoLancados, atualizadoB3, ativos, aplicado, aportes12m }
 *  - recebidos: pagos até hoje (aba Proventos/Proventos - USA), com classe
 *    ('acoes'|'fiis'|'acoesEua'), tipo, quantidade, valor por cota e valor em R$;
 *  - aReceber / pagosNaoLancados: ver montarProventosAnunciados_;
 *  - ativos: carteira de hoje (Auxiliar_ativos) - quantidade, preço médio,
 *    preço atual, DY - pro "yield on cost" de cada ativo;
 *  - aplicado / aportes12m: Valor aplicado de hoje e aportes líquidos dos
 *    últimos 365 dias por classe (mesmos campos fluxoAplicado* do histórico).
 */
function montarTelaProventos_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoje = chaveDiaISOInicio_(new Date());
  var mapas = mapasDoPatrimonioParaProventos_(ss);
  var fluxo = calcularFluxoCaixaDiario_(mapas.mapaCambioUsd, mapas.classePorTicker);
  var recebidos = (fluxo.listaProventos || []).filter(function (p) { return p.data <= hoje; })
    .sort(function (a, b) { return a.data < b.data ? 1 : (a.data > b.data ? -1 : (a.ticker < b.ticker ? -1 : 1)); });

  var limite12m = chaveDiaISOInicio_(new Date(Date.now() - 365 * 86400000));
  var somaMapa = function (mapa, desde) {
    return Object.keys(mapa || {}).reduce(function (s, k) { return (k <= hoje && (!desde || k > desde)) ? s + (Number(mapa[k]) || 0) : s; }, 0);
  };
  var r2 = function (n) { return Math.round(n * 100) / 100; };
  var anunciados = montarProventosAnunciados_(null, { mapaCambioUsd: mapas.mapaCambioUsd });

  return {
    ok: true,
    hoje: hoje,
    recebidos: recebidos,
    aReceber: anunciados.aReceber,
    pagosNaoLancados: anunciados.pagosNaoLancados,
    atualizadoB3: anunciados.atualizadoB3,
    ativos: ativosParaProventos_(ss),
    aplicado: { acoes: r2(somaMapa(fluxo.acoesAplicado)), fiis: r2(somaMapa(fluxo.fiisAplicado)), acoesEua: r2(somaMapa(fluxo.usaAplicado)) },
    aportes12m: { acoes: r2(somaMapa(fluxo.acoesAplicado, limite12m)), fiis: r2(somaMapa(fluxo.fiisAplicado, limite12m)), acoesEua: r2(somaMapa(fluxo.usaAplicado, limite12m)) }
  };
}

// ---------------------------------------------------------------------------
// Cache da tela (25/09/2026, Tiago: "sinto que está demorando muito pra
// carregar"): montarTelaProventos_ relê Transações, Proventos e o histórico
// de patrimônio inteiros a cada chamada. A resposta fica no CacheService
// (em pedaços - passa de 100KB - mesmos helpers da série da Início) até
// alguma dessas abas mudar de tamanho, virar o dia, ou alguém importar a B3 /
// o FNet gravar anúncio novo / clicar "Limpar cache" (invalidarCacheProventos_).
// ---------------------------------------------------------------------------

var PROP_VERSAO_CACHE_PROVENTOS = 'PROVENTOS_CACHE_VERSAO';

function chaveCacheTelaProventos_(ss) {
  var linhas = function (nome) { var aba = ss.getSheetByName(nome); return aba ? aba.getLastRow() : 0; };
  var versao = '0';
  try { versao = PropertiesService.getScriptProperties().getProperty(PROP_VERSAO_CACHE_PROVENTOS) || '0'; } catch (e) { /* sem versão: só as contagens */ }
  return 'proventos_tela_v1_' + chaveDiaISOInicio_(new Date()) + '_' + contarLinhasFluxoCaixa_(ss) + '_' +
    [ABA_B3_PROVENTOS_A_RECEBER, 'aux_proventos-anunciados', 'aux_historico-patrimonio', 'Auxiliar_ativos'].map(linhas).join('_') + '_' + versao;
}

/** Faz a próxima leitura da tela Proventos (e da meta de Renda Passiva) recalcular. */
function invalidarCacheProventos_() {
  try { PropertiesService.getScriptProperties().setProperty(PROP_VERSAO_CACHE_PROVENTOS, String(Date.now())); } catch (e) { /* cache é só otimização */ }
  // 25/09/2026: a tela de cada ativo também mostra proventos/anúncios (Ativo.gs)
  if (typeof invalidarCacheAtivos_ === 'function') invalidarCacheAtivos_();
}

function montarTelaProventosComCache_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var chave = chaveCacheTelaProventos_(ss);
  var emCache = lerSerieHistoricoCache_(chave);
  if (emCache) {
    console.log('montarTelaProventosComCache_: cache HIT (' + chave + ')');
    return emCache;
  }
  var marca = Date.now();
  var tela = montarTelaProventos_();
  console.log('montarTelaProventosComCache_: cache MISS (' + chave + ') - montou em ' + (Date.now() - marca) + 'ms');
  gravarSerieHistoricoCache_(chave, tela);
  return tela;
}

/**
 * Meta de Renda Passiva (Distribuições e Metas): média dos proventos dos 12
 * últimos meses FECHADOS (o mês de hoje fica fora), de TODAS as carteiras
 * (Ações, FIIs e Ações EUA em reais, pelo câmbio do dia do pagamento) - a
 * mesma lista e a mesma régua da tela Proventos
 * (assets/js/pages/proventos-calc.js!mesesFechadosDoPeriodo). Antes vinha da
 * fórmula da planilha (Aux_dash_Proventos), que só via a aba Proventos
 * (sem os dividendos em dólar).
 * Devolve { media, total, inicio: 'yyyy-MM', fim: 'yyyy-MM' }.
 */
function mediaRendaPassiva12Meses_(recebidos, hoje) {
  var mais = function (anoMes, n) {
    var a = Number(anoMes.slice(0, 4)), m = Number(anoMes.slice(5, 7));
    var t = a * 12 + (m - 1) + n;
    return Math.floor(t / 12) + '-' + ('0' + ((t % 12) + 1)).slice(-2);
  };
  var fim = mais(hoje.slice(0, 7), -1);
  var inicio = mais(fim, -11);
  var total = (recebidos || []).reduce(function (s, p) {
    var m = String(p.data || '').slice(0, 7);
    return (m >= inicio && m <= fim && typeof p.valor === 'number') ? s + p.valor : s;
  }, 0);
  total = Math.round(total * 100) / 100;
  return { media: Math.round((total / 12) * 100) / 100, total: total, inicio: inicio, fim: fim };
}

/**
 * Câmbio USD por dia e classe de cada ticker, lidos de aux_historico-patrimonio
 * com as MESMAS regras de HistoricoInicio.gs!montarSerieHistoricoInicio_ (o
 * histórico em si fica em cache e não devolve esses mapas).
 */
function mapasDoPatrimonioParaProventos_(ss) {
  var mapaCambioUsd = {}, classePorTicker = {};
  var aba = ss.getSheetByName('aux_historico-patrimonio');
  if (!aba || aba.getLastRow() < 2) return { mapaCambioUsd: mapaCambioUsd, classePorTicker: classePorTicker };
  var hoje = chaveDiaISOInicio_(new Date());
  aba.getRange(2, 1, aba.getLastRow() - 1, 7).getValues().forEach(function (linha) {
    if (!(linha[0] instanceof Date)) return;
    var chave = chaveDiaISOInicio_(linha[0]);
    if (chave > hoje) return;
    if (linha[2] === 'USA' && typeof linha[6] === 'number' && linha[6]) mapaCambioUsd[chave] = linha[6];
    var ticker = linha[1];
    if (tickerForaDoHistoricoInicio_(ticker)) return;
    classePorTicker[ticker] = (linha[2] === 'BR' && typeof TICKERS_FIIS_BR !== 'undefined' && TICKERS_FIIS_BR.indexOf(ticker) !== -1) ? 'FII' : linha[2];
  });
  return { mapaCambioUsd: mapaCambioUsd, classePorTicker: classePorTicker };
}

/** Carteira de hoje (Auxiliar_ativos) - só renda variável com quantidade > 0. */
function ativosParaProventos_(ss) {
  var aba = ss.getSheetByName('Auxiliar_ativos');
  if (!aba || aba.getLastRow() < 2) return [];
  var classe = { 'Ações': 'acoes', 'FIIs': 'fiis', 'Ações EUA': 'acoesEua' };
  return aba.getRange(2, 1, aba.getLastRow() - 1, 17).getValues()
    .filter(function (l) { return classe[l[0]] && l[1] && Number(l[7]) > 0; })
    .map(function (l) {
      return {
        ticker: String(l[1]).trim().toUpperCase(), nome: String(l[2] || ''), classe: classe[l[0]], moeda: String(l[4] || ''),
        precoAtual: Number(l[5]) || null, quantidade: Number(l[7]) || 0, precoMedio: Number(l[8]) || null,
        dy: typeof l[16] === 'number' ? l[16] : null
      };
    });
}

// ---------------------------------------------------------------------------
// A receber / pagos não lançados / recebidos no mês (Home e tela Proventos)
// ---------------------------------------------------------------------------

/**
 * {
 *   aReceber: pagamento de hoje em diante (ou sem data definida), ainda não
 *     recebido - fonte 'Planilha' (lançado por você com data futura), 'B3'
 *     (exportação) ou 'FNet' (FIIs);
 *   pagosNaoLancados: pagos nos últimos 60 dias (B3/FNet) que não estão na
 *     aba Proventos;
 *   recebidosNoMes: aba Proventos/Proventos - USA, pagos neste mês até hoje;
 *   atualizadoB3: data da exportação da B3 (se houver)
 * }
 * Cada item: { ticker, classe, tipo, dataCom, dataPagamento ('' = a definir),
 *   quantidade, valorPorCota, valor (R$, líquido), fonte, jaLancado }.
 * `historico` (opcional, Home): câmbio de cada dia (cambioUsd) pros
 * proventos em dólar do mês; `opcoes.mapaCambioUsd` faz o mesmo sem histórico.
 */
function montarProventosAnunciados_(historico, opcoes) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoje = chaveDiaISOInicio_(new Date());
  var mesAtual = hoje.slice(0, 7);
  var limitePassado = chaveDiaISOInicio_(new Date(Date.now() - 60 * 86400000));
  var r2 = function (n) { return Math.round(n * 100) / 100; };

  var classes = classesDaCarteiraParaProventos_(ss);
  var classeDe = function (ticker, moeda) {
    if (moeda === 'USD') return 'acoesEua';
    return classes[ticker] || (/11$/.test(ticker) ? 'fiis' : 'acoes');
  };

  var planilha = lerLinhasAbaProventos_(ss);
  // chave = ticker + dia de pagamento + tipo (a mesma ação paga JCP e dividendo no mesmo dia)
  var chaveDe = function (ticker, dia, tipo) { return ticker + '|' + dia + '|' + normalizarTipoProvento_(tipo); };
  // já está na sua aba Proventos? mesmo ticker e dia de pagamento, e mesmo tipo OU mesmo valor
  // (±2%: o nome do tipo na sua aba pode não ser o mesmo da B3 - ex. "Rendimento" x "Dividendo")
  var planilhaPorDia = {};
  planilha.forEach(function (p) { (planilhaPorDia[p.ticker + '|' + p.dataPagamento] = planilhaPorDia[p.ticker + '|' + p.dataPagamento] || []).push(p); });
  var foiLancado = function (ticker, dia, tipo, valor) {
    return (planilhaPorDia[ticker + '|' + dia] || []).some(function (p) {
      return normalizarTipoProvento_(p.tipo) === normalizarTipoProvento_(tipo) || Math.abs(p.liquido - valor) <= Math.max(0.02, Math.abs(valor) * 0.02);
    });
  };

  // câmbio por dia (proventos em dólar do mês)
  var cambioPorDia = (opcoes && opcoes.mapaCambioUsd) || {};
  (historico || []).forEach(function (p) { if (p && p.cambioUsd) cambioPorDia[p.data] = p.cambioUsd; });
  var chavesCambio = Object.keys(cambioPorDia).sort();
  var cambioDoDia = function (dia) {
    if (!chavesCambio.length) return null;
    return typeof cambioUsdParaData_ === 'function' ? cambioUsdParaData_(cambioPorDia, chavesCambio, dia) : cambioPorDia[chavesCambio[chavesCambio.length - 1]];
  };

  var itens = {}, ordem = [];
  var juntar = function (item) {
    var k = chaveDe(item.ticker, item.dataPagamento, item.tipo) + (item.dataPagamento ? '' : '|' + item.valor);
    var ja = itens[k];
    if (ja) {
      // mesma linha da B3 em 2 contas/corretoras: soma (nunca duplica nem perde)
      if (ja.fonte === 'B3' && item.fonte === 'B3') {
        ja.quantidade += item.quantidade;
        ja.valor = r2(ja.valor + item.valor);
      }
      return;
    }
    itens[k] = item;
    ordem.push(k);
  };

  // 1) sua aba Proventos: lançados com pagamento futuro (BR; os em dólar entram quando pagos)
  planilha.forEach(function (p) {
    if (p.dataPagamento <= hoje || p.moeda !== 'BRL' || p.tipo === 'Juros') return;
    juntar({ ticker: p.ticker, classe: classeDe(p.ticker, p.moeda), tipo: normalizarTipoProvento_(p.tipo), dataCom: p.dataCom, dataPagamento: p.dataPagamento,
      quantidade: p.quantidade, valorPorCota: p.valorPorCota, valor: r2(p.liquido), fonte: 'Planilha', jaLancado: true });
  });

  // 2) exportação da B3 (ações e FIIs, quantidade e valor líquido prontos)
  var b3 = lerProventosB3AReceber_(ss);
  b3.itens.forEach(function (p) {
    if (p.dataPagamento && foiLancado(p.ticker, p.dataPagamento, p.tipo, p.valor)) return; // já na aba Proventos
    juntar({ ticker: p.ticker, classe: classeDe(p.ticker, 'BRL'), tipo: p.tipo, dataCom: '', dataPagamento: p.dataPagamento,
      quantidade: p.quantidade, valorPorCota: p.valorPorCota, valor: r2(p.valor), fonte: 'B3', jaLancado: false });
  });

  // 3) FNet (FIIs): quantidade na data com pelas Transações
  var anunciados = lerProventosAnunciados_(ss);
  if (anunciados.length) {
    var quantidadeNaData = quantidadesNaDataCom_(ss, anunciados.map(function (p) { return p.ticker; }));
    anunciados.forEach(function (p) {
      var quantidade = quantidadeNaData(p.ticker, p.dataCom);
      if (!(quantidade > 0) || !(p.valor > 0)) return;
      if (foiLancado(p.ticker, p.dataPagamento, p.tipo, quantidade * p.valor)) return; // já na aba Proventos
      juntar({ ticker: p.ticker, classe: classeDe(p.ticker, 'BRL'), tipo: p.tipo, dataCom: p.dataCom, dataPagamento: p.dataPagamento,
        quantidade: quantidade, valorPorCota: p.valor, valor: r2(quantidade * p.valor), fonte: 'FNet', jaLancado: false });
    });
  }

  var aReceber = [], pagosNaoLancados = [];
  ordem.forEach(function (k) {
    var p = itens[k];
    if (!p.dataPagamento || p.dataPagamento > hoje || (p.dataPagamento === hoje && !p.jaLancado)) aReceber.push(p);
    else if (p.fonte !== 'Planilha' && !p.jaLancado && p.dataPagamento >= limitePassado) pagosNaoLancados.push(p);
  });

  // recebidos neste mês (aba Proventos/Proventos - USA)
  var recebidosNoMes = [];
  planilha.forEach(function (p) {
    if (p.dataPagamento > hoje || p.dataPagamento.slice(0, 7) !== mesAtual || p.tipo === 'Juros') return;
    var cambio = p.moeda === 'USD' ? cambioDoDia(p.dataPagamento) : 1;
    if (!cambio) return;
    recebidosNoMes.push({ ticker: p.ticker, classe: classeDe(p.ticker, p.moeda), tipo: normalizarTipoProvento_(p.tipo), dataCom: p.dataCom, dataPagamento: p.dataPagamento,
      quantidade: p.quantidade, valorPorCota: p.valorPorCota, moeda: p.moeda, valor: r2(p.liquido * cambio), fonte: 'Planilha', jaLancado: true });
  });

  var porPagamento = function (a, b) {
    var da = a.dataPagamento || '9999', db = b.dataPagamento || '9999';
    return da < db ? -1 : (da > db ? 1 : (a.ticker < b.ticker ? -1 : 1));
  };
  return {
    aReceber: aReceber.sort(porPagamento),
    pagosNaoLancados: pagosNaoLancados.sort(porPagamento),
    recebidosNoMes: recebidosNoMes.sort(porPagamento),
    atualizadoB3: b3.atualizadoEm || null
  };
}

function normalizarTipoProvento_(tipoBruto) {
  var t = String(tipoBruto || '').toUpperCase();
  if (/JCP|JUROS SOBRE/.test(t)) return 'JCP';
  if (/DIVID/.test(t)) return 'Dividendo';
  if (/RENDIMENTO/.test(t)) return 'Rendimento';
  if (/AMORTIZ/.test(t)) return 'Amortização';
  return String(tipoBruto || '').trim() || 'Outros';
}

/** Auxiliar_ativos: ticker -> 'acoes'|'fiis'|'acoesEua'. */
function classesDaCarteiraParaProventos_(ss) {
  var aba = ss.getSheetByName('Auxiliar_ativos');
  var out = {};
  if (!aba || aba.getLastRow() < 2) return out;
  var classe = { 'Ações': 'acoes', 'FIIs': 'fiis', 'Ações EUA': 'acoesEua' };
  aba.getRange(2, 1, aba.getLastRow() - 1, 2).getValues().forEach(function (l) {
    if (classe[l[0]] && l[1]) out[String(l[1]).trim().toUpperCase()] = classe[l[0]];
  });
  return out;
}

/** Linhas das abas Proventos (R$) e Proventos - USA (US$), colunas A..G. */
function lerLinhasAbaProventos_(ss) {
  var out = [];
  [['Proventos', 'BRL'], ['Proventos - USA', 'USD']].forEach(function (par) {
    var aba = ss.getSheetByName(par[0]);
    if (!aba || aba.getLastRow() < 1) return;
    aba.getRange(1, 1, aba.getLastRow(), 7).getValues().forEach(function (l) {
      if (!(l[1] instanceof Date)) return;
      var ticker = String(l[2] || '').trim().toUpperCase();
      var liquido = Number(l[6]);
      if (!ticker || !isFinite(liquido)) return;
      out.push({
        ticker: ticker, moeda: par[1], tipo: String(l[3] || '').trim(),
        dataCom: l[0] instanceof Date ? chaveDiaISOInicio_(l[0]) : '',
        dataPagamento: chaveDiaISOInicio_(l[1]),
        quantidade: Number(l[4]) || 0, valorPorCota: Number(l[5]) || 0, liquido: liquido
      });
    });
  });
  return out;
}

/** Quantidade de cada ticker numa data (soma da coluna K de Transações até o dia, inclusive). */
function quantidadesNaDataCom_(ss, tickersLista) {
  var tickers = {};
  (tickersLista || []).forEach(function (t) { tickers[t] = 1; });
  var movimentos = {};
  var abaT = ss.getSheetByName('Transações');
  if (abaT && abaT.getLastRow() >= LINHA_DADOS_TRANSACOES_FLUXO) {
    abaT.getRange(LINHA_DADOS_TRANSACOES_FLUXO, 1, abaT.getLastRow() - LINHA_DADOS_TRANSACOES_FLUXO + 1, 11).getValues().forEach(function (l) {
      var t = String(l[0] || '').trim().toUpperCase();
      if (!tickers[t] || !(l[1] instanceof Date)) return;
      var q = Number(l[10]);
      if (!isFinite(q) || !q) return;
      (movimentos[t] = movimentos[t] || []).push({ dia: chaveDiaISOInicio_(l[1]), q: q });
    });
  }
  return function (t, dia) {
    return (movimentos[t] || []).reduce(function (s, m) { return m.dia <= dia ? s + m.q : s; }, 0);
  };
}

/**
 * Aba "B3 - proventos a receber": a exportação da Área do Investidor colada
 * como veio (ou importada pela tela Proventos - handleImportarProventosB3).
 * Devolve { itens: [{ ticker, tipo, dataPagamento, quantidade, valorPorCota, valor }], atualizadoEm }.
 */
function lerProventosB3AReceber_(ss) {
  var aba = ss.getSheetByName(ABA_B3_PROVENTOS_A_RECEBER);
  if (!aba || aba.getLastRow() < 2) return { itens: [], atualizadoEm: null };
  var largura = Math.min(Math.max(aba.getLastColumn(), 9), 20);
  return extrairProventosB3DeLinhas_(aba.getRange(1, 1, aba.getLastRow(), largura).getValues());
}

/**
 * Lê a matriz da exportação "Proventos a receber" da B3. Procura o
 * cabeçalho ("Produto" ... "Valor líquido") nas 15 primeiras linhas;
 * "Produto" = "TICKER - NOME"; "Previsão de pagamento" dd/mm/aaaa (texto ou
 * data) ou "-" (sem data definida). Linha de total e linhas vazias são
 * ignoradas. `atualizadoEm`: célula abaixo de "Importado em" (o app grava
 * isso ao importar) - opcional.
 */
function extrairProventosB3DeLinhas_(linhas) {
  var norm = function (s) { return String(s == null ? '' : s).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); };
  var cab = -1, idx = {}, atualizadoEm = null;
  for (var i = 0; i < Math.min(linhas.length, 15) && cab === -1; i++) {
    var nomes = linhas[i].map(norm);
    if (nomes.indexOf('produto') !== -1 && nomes.some(function (n) { return n.indexOf('valor liquido') === 0; })) {
      cab = i;
      nomes.forEach(function (n, j) { if (n && idx[n] === undefined) idx[n] = j; });
    }
  }
  if (cab === -1) return { itens: [], atualizadoEm: null };
  if (idx['importado em'] !== undefined && linhas[cab + 1]) {
    var carimbo = linhas[cab + 1][idx['importado em']];
    atualizadoEm = carimbo instanceof Date ? chaveDiaISOInicio_(carimbo) : (chaveDeCelulaProvento_(carimbo) || null);
  }
  var col = function (prefixo) {
    var k = Object.keys(idx).filter(function (n) { return n.indexOf(prefixo) === 0; })[0];
    return k === undefined ? -1 : idx[k];
  };
  var cProduto = col('produto'), cEvento = col('tipo de evento'), cPag = col('previsao de pagamento'),
    cQtd = col('quantidade'), cPreco = col('preco unitario'), cValor = col('valor liquido');
  var numero = function (v) {
    if (typeof v === 'number') return v;
    var s = String(v || '').replace(/[^\d,.-]/g, '');
    if (/,\d{1,}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  };
  var itens = [];
  for (var r = cab + 1; r < linhas.length; r++) {
    var l = linhas[r];
    var produto = String(l[cProduto] || '').trim();
    if (!produto) continue;
    var ticker = produto.split(' - ')[0].trim().toUpperCase();
    if (!/^[A-Z0-9]{4,6}\d{0,2}$/.test(ticker)) continue;
    var pag = cPag === -1 ? '' : l[cPag];
    var dataPagamento = pag instanceof Date ? chaveDiaISOInicio_(pag) : chaveDeCelulaProvento_(pag);
    var valor = numero(l[cValor]);
    if (!(valor > 0)) continue;
    itens.push({
      ticker: ticker, tipo: normalizarTipoProvento_(cEvento === -1 ? '' : l[cEvento]), dataPagamento: dataPagamento || '',
      quantidade: cQtd === -1 ? 0 : (numero(l[cQtd]) || 0), valorPorCota: cPreco === -1 ? 0 : (numero(l[cPreco]) || 0), valor: valor
    });
  }
  return { itens: itens, atualizadoEm: atualizadoEm };
}

// ---------------------------------------------------------------------------
// Importar a exportação da B3 pela tela Proventos (doPost importarProventosB3)
// ---------------------------------------------------------------------------

/**
 * e.parameter.linhas: STRING JSON com a matriz da planilha exportada (lida no
 * navegador com SheetJS, como veio - ver assets/js/pages/proventos.js).
 * A exportação é uma foto de TUDO o que está a receber, então substitui o
 * conteúdo da aba (não acumula). Datas "dd/mm/aaaa" viram data de verdade
 * (meio-dia, sem virar o dia por fuso); "-" continua "-".
 */
function handleImportarProventosB3(e) {
  try {
    return jsonOut(importarProventosB3_(e.parameter.linhas));
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'importarProventosB3', erro: String(erro) });
  }
}

function importarProventosB3_(linhasJson) {
  var linhas = JSON.parse(linhasJson || '[]');
  if (!Array.isArray(linhas) || !linhas.length) return { ok: false, erro: 'arquivo vazio' };
  if (linhas.length > 2000) return { ok: false, erro: 'arquivo grande demais (' + linhas.length + ' linhas)' };
  var largura = 0;
  linhas = linhas.map(function (l) {
    var linha = (Array.isArray(l) ? l : []).slice(0, 18).map(function (v) {
      if (v === null || v === undefined) return '';
      if (typeof v === 'number' || typeof v === 'boolean') return v;
      var t = String(v).slice(0, 200);
      var m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12) : t;
    });
    largura = Math.max(largura, linha.length);
    return linha;
  });
  var lido = extrairProventosB3DeLinhas_(linhas);
  if (!lido.itens.length) return { ok: false, erro: 'não achei a tabela "Proventos a receber" da B3 (cabeçalho com Produto e Valor líquido) nem nenhum provento com valor' };

  // carimbo "Importado em" 2 colunas depois da tabela, na linha do cabeçalho
  var cab = 0;
  for (var i = 0; i < Math.min(linhas.length, 15); i++) {
    if (linhas[i].some(function (v) { return String(v).trim().toLowerCase() === 'produto'; })) { cab = i; break; }
  }
  var colCarimbo = largura + 1;
  var total = largura + 2;
  var matriz = linhas.map(function (l, r) {
    var linha = l.slice();
    while (linha.length < total) linha.push('');
    if (r === cab) linha[colCarimbo] = 'Importado em';
    if (r === cab + 1) linha[colCarimbo] = new Date();
    return linha;
  });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABA_B3_PROVENTOS_A_RECEBER) || ss.insertSheet(ABA_B3_PROVENTOS_A_RECEBER);
  aba.clearContents();
  aba.getRange(1, 1, matriz.length, total).setValues(matriz);
  invalidarCacheProventos_();
  var soma = lido.itens.reduce(function (s, p) { return s + p.valor; }, 0);
  return { ok: true, importados: lido.itens.length, total: Math.round(soma * 100) / 100 };
}
