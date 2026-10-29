// tests/harness/intradia-worker.test.js - 29/10/2026: o gráfico do dia pelo Worker (worker/src/intradia.js) é a MESMA conta
// do Apps Script (Intradia.gs): símbolo do Yahoo e série enxuta conferidos nos dois lados; o Worker separa "o Yahoo não
// respondeu" (falhas -> o site pede ao Apps Script) de "o Yahoo respondeu que não tem" (null); 5 min de memória.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import worker from '../../worker/src/index.js';
import { intradiaWorker, esquecerIntradiaWorker, INTRADIA_WORKER_MAX } from '../../worker/src/intradia.js';
import { simboloYahooIntradia, serieIntradiaDoYahoo } from '../../assets/js/intradia-yahoo.js';
import { hmacBase64Url } from '../../worker/src/auth.js';
import { INTRADIA_WORKER_MAX as MAX_SITE } from '../../assets/js/api-client.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const plain = (x) => JSON.parse(JSON.stringify(x));

function gas() {
  const sb = { console, Logger: { log() {} } };
  vm.createContext(sb);
  new vm.Script(fs.readFileSync(path.join(RAIZ, 'apps-script/Intradia.gs'), 'utf8'), { filename: 'Intradia.gs' }).runInContext(sb);
  return sb;
}

/** Resposta do chart do Yahoo inventada (n velas de 5 min a partir de `inicio`, com buracos e período). */
function chart({ n = 80, inicio = 1793278800, preco = 30.5, anterior = 30, buracos = [3, 10], periodo = true, tp = true, gmt = -10800, moeda = 'BRL', fora = 0 } = {}) {
  const ts = Array.from({ length: n }, (_, i) => inicio + i * 300 - fora);
  const close = ts.map((_, i) => (buracos.includes(i) ? null : Math.round((anterior + Math.sin(i / 7) * 0.8) * 1e6) / 1e6));
  const reg = { start: inicio, end: inicio + 7 * 3600 };
  return { chart: { result: [{ meta: { regularMarketPrice: preco, chartPreviousClose: anterior, gmtoffset: gmt, currency: moeda,
    ...(periodo ? { currentTradingPeriod: { regular: reg } } : {}), ...(tp ? { tradingPeriods: [[reg]] } : {}) },
  timestamp: ts, indicators: { quote: [{ close }] } }] } };
}

test('a mesma conta do Apps Script: símbolo do Yahoo e série (pontos reduzidos, período, dia no fuso da bolsa, variação)', () => {
  const sb = gas();
  for (const c of ['IBOV', 'ifix', 'SPX', 'USD', 'EUR', 'acoes:petr4', 'fiis:BTLG11', 'usa:VNOM', 'usa:BRK.B', 'rf:Tesouro', '', 'acoes:', 'xyz:ABC']) {
    assert.equal(simboloYahooIntradia(c), sb.simboloYahooIntradia_(c), c);
  }
  const casos = [chart(), chart({ n: 250 }), chart({ periodo: false, tp: false }), chart({ fora: 3600, moeda: 'USD', gmt: -14400 }), chart({ n: 1 }),
    chart({ buracos: Array.from({ length: 80 }, (_, i) => i) }), { chart: { result: [] } }, null,
    (() => { const c = chart(); delete c.chart.result[0].meta.chartPreviousClose; c.chart.result[0].meta.previousClose = 29; return c; })(),
    (() => { const c = chart(); delete c.chart.result[0].meta.regularMarketPrice; return c; })()];
  for (const [i, c] of casos.entries()) assert.deepEqual(serieIntradiaDoYahoo(c), plain(sb.serieIntradiaDoYahoo_(c)), `caso ${i}`);
  assert.equal(INTRADIA_WORKER_MAX, MAX_SITE, 'site e Worker com o mesmo teto por pedido');
});

test('Worker: o Yahoo respondeu (série ou 404 = null) x não respondeu (falhas, tenta query2 antes); renda fixa sem pedido; 5 min de memória', async () => {
  esquecerIntradiaWorker();
  const pedidos = [];
  const fetchImpl = async (url) => {
    pedidos.push(url);
    if (url.includes('BLOQ3')) return new Response('', { status: 429 });
    if (url.includes('SUMIU3')) return new Response('{}', { status: 404 });
    if (url.includes('QUERY1FALHA') && url.includes('query1')) throw new Error('rede');
    return new Response(JSON.stringify(chart()), { status: 200 });
  };
  const r = await intradiaWorker(['acoes:PETR4', 'acoes:BLOQ3', 'acoes:SUMIU3', 'rf:Tesouro', 'usa:QUERY1FALHA', 'acoes:PETR4'], { fetchImpl, agoraMs: 1000 });
  assert.deepEqual(Object.keys(r.resultado).sort(), ['acoes:PETR4', 'acoes:SUMIU3', 'rf:Tesouro', 'usa:QUERY1FALHA']);
  assert.deepEqual(r.resultado['acoes:PETR4'], serieIntradiaDoYahoo(chart()));
  assert.equal(r.resultado['acoes:SUMIU3'], null);
  assert.equal(r.resultado['rf:Tesouro'], null);
  assert.deepEqual(r.falhas, ['acoes:BLOQ3']);
  assert.equal(pedidos.filter((u) => u.includes('BLOQ3')).length, 2, 'query1 e query2');
  assert.ok(pedidos.some((u) => u.includes('query2') && u.includes('QUERY1FALHA')));
  pedidos.length = 0;
  await intradiaWorker(['acoes:PETR4', 'acoes:SUMIU3'], { fetchImpl, agoraMs: 1000 + 60000 });
  assert.deepEqual(pedidos, [], 'na memória (série 5 min, "não tem" 3 min)');
  await intradiaWorker(['acoes:PETR4'], { fetchImpl, agoraMs: 1000 + 6 * 60000 });
  assert.equal(pedidos.length, 1, 'passou dos 5 min: pede de novo');
  const muitos = await intradiaWorker(Array.from({ length: 30 }, (_, i) => `acoes:T${i}`), { fetchImpl, agoraMs: 1 });
  assert.equal(Object.keys(muitos.resultado).length, INTRADIA_WORKER_MAX, 'no máximo 15 por pedido');
});

test('Worker: /v1/intradia só com sessão s1', async () => {
  const env = { DB: { prepare: () => ({}) }, SESSAO_SEGREDO: 's', EMAILS_AUTORIZADOS: 'a@b.test', ORIGENS: '' };
  const sem = await worker.fetch(new Request('https://w.test/v1/intradia?simbolos=rf:X'), env);
  assert.equal(sem.status, 401);
  const payload = Buffer.from(JSON.stringify({ email: 'a@b.test', exp: Math.floor(Date.now() / 1000) + 60 })).toString('base64url');
  const token = `s1.${payload}.${await hmacBase64Url('s', payload)}`;
  const ok = await worker.fetch(new Request('https://w.test/v1/intradia?simbolos=rf:X', { headers: { Authorization: `Bearer ${token}` } }), env);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, resultado: { 'rf:X': null }, falhas: [] });
});
