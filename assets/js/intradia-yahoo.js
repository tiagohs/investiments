/**
 * intradia-yahoo.js - 29/10/2026: o gráfico do dia lido do Yahoo pelo Worker do Cloudflare (worker/src/intradia.js), sem
 * passar pelo Apps Script. É a MESMA conta do apps-script/Intradia.gs (simboloYahooIntradia_ e serieIntradiaDoYahoo_),
 * conferida nos dois lados por tests/harness/intradia-worker.test.js. Só o desenho do dia sai daqui: cotação e variação
 * da tela continuam as da planilha.
 */
// 30/10/2026 (tela de Notícias, "O que mexe com a bolsa"): Brent, ouro, Bitcoin, juro de 10 anos dos EUA e minério de ferro
export const INTRADIA_INDICES = Object.freeze({ IBOV: '^BVSP', IFIX: 'IFIX.SA', SPX: '^GSPC', USD: 'BRL=X', EUR: 'EURBRL=X', BRENT: 'BZ=F', OURO: 'GC=F', BTC: 'BTC-USD', US10Y: '^TNX', MINERIO: 'TIO=F' });
export const INTRADIA_MAX_PONTOS = 100;

/** 'IBOV' | 'acoes:PETR4' | 'fiis:BTLG11' | 'usa:VNOM' -> símbolo do Yahoo (null = não tem intradia, ex.: renda fixa). */
export function simboloYahooIntradia(chave) {
  const k = String(chave || '').trim();
  if (INTRADIA_INDICES[k.toUpperCase()]) return INTRADIA_INDICES[k.toUpperCase()];
  const m = k.match(/^(acoes|fiis|usa):([A-Za-z0-9.\-]{1,12})$/);
  if (!m) return null;
  const t = m[2].toUpperCase();
  return m[1] === 'usa' ? t : `${t}.SA`;
}

/** Resposta do chart do Yahoo -> série enxuta (null se não tiver pontos). */
export function serieIntradiaDoYahoo(json) {
  const r = json && json.chart && json.chart.result && json.chart.result[0];
  if (!r || !r.meta) return null;
  const meta = r.meta;
  const ts = r.timestamp || [];
  const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
  const closes = q.close || [];
  const periodo = meta.currentTradingPeriod && meta.currentTradingPeriod.regular;
  const tp = meta.tradingPeriods && meta.tradingPeriods[0] && meta.tradingPeriods[0][0];
  let inicio = (tp && tp.start) || (periodo && periodo.start) || (ts.length ? ts[0] : null);
  let fim = (tp && tp.end) || (periodo && periodo.end) || (ts.length ? ts[ts.length - 1] : null);
  const pontos = [];
  for (let i = 0; i < ts.length; i++) {
    if (typeof closes[i] === 'number' && Number.isFinite(closes[i])) pontos.push([ts[i], closes[i]]);
  }
  if (!pontos.length || !inicio || !fim) return null;
  if (fim <= inicio) fim = pontos[pontos.length - 1][0];
  if (pontos[0][0] < inicio) inicio = pontos[0][0]; // câmbio negocia ~24h: o "pregão" é o intervalo dos próprios pontos
  if (pontos[pontos.length - 1][0] > fim) fim = pontos[pontos.length - 1][0];
  const passo = Math.ceil(pontos.length / INTRADIA_MAX_PONTOS);
  const reduzidos = pontos.filter((p, i) => i % passo === 0 || i === pontos.length - 1);
  const anterior = typeof meta.chartPreviousClose === 'number' ? meta.chartPreviousClose : meta.previousClose;
  const preco = typeof meta.regularMarketPrice === 'number' ? meta.regularMarketPrice : pontos[pontos.length - 1][1];
  const gmt = typeof meta.gmtoffset === 'number' ? meta.gmtoffset : -10800;
  const d = new Date((pontos[pontos.length - 1][0] + gmt) * 1000);
  const dia = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return {
    preco,
    fechamentoAnterior: typeof anterior === 'number' ? anterior : null,
    variacao: typeof anterior === 'number' && anterior ? preco / anterior - 1 : null,
    dia,
    inicio,
    fim,
    t: reduzidos.map((p) => Math.round((p[0] - inicio) / 60)),
    v: reduzidos.map((p) => Math.round(p[1] * 10000) / 10000),
    moeda: meta.currency || null,
  };
}
