/**
 * Intradia.gs - 26/09/2026 (Tiago: "os ativos favoritos... já vir mostrando o
 * gráfico de variação do dia" + índices mais compactos, com o mesmo gráfico).
 *
 * GET action=intradia&simbolos=IBOV,IFIX,SPX,USD,EUR,acoes:PETR4,fiis:BTLG11,usa:VNOM
 * -> { ok, resultado: { CHAVE: serie | null } }
 *
 * O GOOGLEFINANCE da planilha não tem preço durante o dia; a série vem do
 * gráfico público do Yahoo Finance (range=1d, velas de 5 min - o mesmo que o
 * Google Finance/Yahoo mostram no card). Só o DESENHO do dia sai daqui: os
 * números da tela (cotação e variação) continuam os da planilha, iguais ao
 * resto do app. Cache de 5 min por símbolo (CacheService) - a Início pede de
 * novo no "Atualizar dados" / a cada 5 min.
 *
 * serie = { preco, fechamentoAnterior, variacao (fração), dia ('yyyy-MM-dd'
 *   do pregão, no fuso da bolsa), inicio/fim (epoch s do pregão regular),
 *   t: [minutos desde o início], v: [preço] (no máx. ~100 pontos), moeda }
 */

var INTRADIA_INDICES_ = { IBOV: '^BVSP', IFIX: 'IFIX.SA', SPX: '^GSPC', USD: 'BRL=X', EUR: 'EURBRL=X' };
var INTRADIA_TTL_ = 300;
var INTRADIA_MAX_SIMBOLOS_ = 40;
var INTRADIA_MAX_PONTOS_ = 100;

/** 'IBOV' | 'acoes:PETR4' | 'fiis:BTLG11' | 'usa:VNOM' -> símbolo do Yahoo (null = não tem intradia, ex.: renda fixa). */
function simboloYahooIntradia_(chave) {
  var k = String(chave || '').trim();
  if (INTRADIA_INDICES_[k.toUpperCase()]) return INTRADIA_INDICES_[k.toUpperCase()];
  var m = k.match(/^(acoes|fiis|usa):([A-Za-z0-9.\-]{1,12})$/);
  if (!m) return null;
  var t = m[2].toUpperCase();
  return m[1] === 'usa' ? t : t + '.SA';
}

function handleIntradia(e) {
  try {
    var chaves = String((e && e.parameter && e.parameter.simbolos) || '').split(',')
      .map(function (s) { return s.trim(); }).filter(Boolean).slice(0, INTRADIA_MAX_SIMBOLOS_);
    return jsonOut({ ok: true, resultado: intradia_(chaves) });
  } catch (erro) {
    return jsonOut({ ok: false, etapa: 'intradia', erro: String(erro) });
  }
}

function intradia_(chaves, opcoes) {
  var o = opcoes || {};
  var out = {};
  var cache = null;
  try { cache = CacheService.getScriptCache(); } catch (e) { cache = null; }
  var faltam = [];
  var chavesCache = chaves.map(function (c) { return 'intradia_v1_' + c; });
  var emCache = {};
  if (cache && !o.semCache) { try { emCache = cache.getAll(chavesCache) || {}; } catch (e2) { emCache = {}; } }
  chaves.forEach(function (c) {
    var txt = emCache['intradia_v1_' + c];
    if (txt) { try { out[c] = JSON.parse(txt); return; } catch (e3) { /* refaz */ } }
    if (simboloYahooIntradia_(c)) faltam.push(c); else out[c] = null;
  });
  if (!faltam.length) return out;

  var buscar = function (hosts, lista) {
    var pedidos = lista.map(function (c) {
      return {
        url: 'https://' + hosts + '/v8/finance/chart/' + encodeURIComponent(simboloYahooIntradia_(c)) + '?range=1d&interval=5m&includePrePost=false',
        muteHttpExceptions: true,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      };
    });
    var respostas = o.fetchAll ? o.fetchAll(pedidos) : UrlFetchApp.fetchAll(pedidos);
    var falhou = [];
    respostas.forEach(function (r, i) {
      var serie = null;
      try { if (r.getResponseCode() === 200) serie = serieIntradiaDoYahoo_(JSON.parse(r.getContentText())); } catch (e4) { serie = null; }
      if (serie) out[lista[i]] = serie; else falhou.push(lista[i]);
    });
    return falhou;
  };
  var falhou = buscar('query1.finance.yahoo.com', faltam);
  if (falhou.length) falhou = buscar('query2.finance.yahoo.com', falhou);
  falhou.forEach(function (c) { out[c] = null; });

  if (cache) {
    var gravar = {};
    faltam.forEach(function (c) { if (out[c]) gravar['intradia_v1_' + c] = JSON.stringify(out[c]); });
    try { if (Object.keys(gravar).length) cache.putAll(gravar, INTRADIA_TTL_); } catch (e5) { /* só otimização */ }
  }
  return out;
}

/** Resposta do chart do Yahoo -> série enxuta (null se não tiver pontos). */
function serieIntradiaDoYahoo_(json) {
  var r = json && json.chart && json.chart.result && json.chart.result[0];
  if (!r || !r.meta) return null;
  var meta = r.meta;
  var ts = r.timestamp || [];
  var q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
  var closes = q.close || [];
  var periodo = meta.currentTradingPeriod && meta.currentTradingPeriod.regular;
  var tp = meta.tradingPeriods && meta.tradingPeriods[0] && meta.tradingPeriods[0][0];
  var inicio = (tp && tp.start) || (periodo && periodo.start) || (ts.length ? ts[0] : null);
  var fim = (tp && tp.end) || (periodo && periodo.end) || (ts.length ? ts[ts.length - 1] : null);
  var pontos = [];
  for (var i = 0; i < ts.length; i++) {
    if (typeof closes[i] === 'number' && isFinite(closes[i])) pontos.push([ts[i], closes[i]]);
  }
  if (!pontos.length || !inicio || !fim) return null;
  if (fim <= inicio) fim = pontos[pontos.length - 1][0];
  // câmbio negocia ~24h: o "pregão" é o intervalo dos próprios pontos
  if (pontos[0][0] < inicio) inicio = pontos[0][0];
  if (pontos[pontos.length - 1][0] > fim) fim = pontos[pontos.length - 1][0];
  var passo = Math.ceil(pontos.length / INTRADIA_MAX_PONTOS_);
  var reduzidos = pontos.filter(function (p, i) { return i % passo === 0 || i === pontos.length - 1; });
  var anterior = typeof meta.chartPreviousClose === 'number' ? meta.chartPreviousClose : meta.previousClose;
  var preco = typeof meta.regularMarketPrice === 'number' ? meta.regularMarketPrice : pontos[pontos.length - 1][1];
  var gmt = typeof meta.gmtoffset === 'number' ? meta.gmtoffset : -10800;
  var d = new Date((pontos[pontos.length - 1][0] + gmt) * 1000);
  var dia = d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
  return {
    preco: preco,
    fechamentoAnterior: typeof anterior === 'number' ? anterior : null,
    variacao: typeof anterior === 'number' && anterior ? preco / anterior - 1 : null,
    dia: dia,
    inicio: inicio,
    fim: fim,
    t: reduzidos.map(function (p) { return Math.round((p[0] - inicio) / 60); }),
    v: reduzidos.map(function (p) { return Math.round(p[1] * 10000) / 10000; }),
    moeda: meta.currency || null
  };
}
