// tests/leitura-cliente.test.js - 29/10/2026: o site lendo do Worker de leitura (assets/js/api-client.js, RF-03/04/05).
//  - tela publicada + sessão s1: vem do Worker (1 pedido, sem passar pelo Apps Script), com ETag/304;
//  - Worker com erro, 404, sem resposta em 1,5 s ou publicação anterior à última gravação: cai no Apps Script;
//  - depois de gravar: guarda o instante (_agora do Apps Script) e pede a republicação em segundo plano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getHome, getCarteirasFiis, getTransacoes, getSyncStatus, salvarDespesas, esquecerRespostasGuardadas, marcarGeracaoMinima, TEMPO_MAXIMO_LEITURA_MS } from '../assets/js/api-client.js';
import { usarMemoriaNoCacheDados } from '../assets/js/cache-dados.js';
import { LEITURA_URL, APPS_SCRIPT_URL } from '../assets/js/config.js';

const S1 = 's1.eyJlbWFpbCI6ImFAYi50ZXN0In0.assinatura';
const memoria = new Map();
globalThis.localStorage = { getItem: (k) => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, String(v)), removeItem: (k) => memoria.delete(k) };
const B = 1761700000000; // instante realista (a geração tem Date.now() de 13 dígitos)
const geracao = (ms) => `20261029a.${B + ms}abcd`;

function resposta(status, corpo, cab = {}) {
  const h = new Map(Object.entries(cab).map(([k, v]) => [k.toLowerCase(), v]));
  return { status, headers: { get: (k) => (h.has(k.toLowerCase()) ? h.get(k.toLowerCase()) : null) }, text: async () => (corpo == null ? '' : JSON.stringify(corpo)), json: async () => corpo };
}
function limpar() { memoria.clear(); esquecerRespostasGuardadas(); usarMemoriaNoCacheDados(new Map()); }

test('tela publicada vem do Worker (Authorization s1, sem Apps Script); 2ª vez manda If-None-Match e 304 reaproveita', async (t) => {
  limpar();
  const pedidos = [];
  t.mock.method(globalThis, 'fetch', async (url, op = {}) => {
    pedidos.push({ url: String(url), op });
    if (String(url).startsWith(LEITURA_URL)) {
      if (op.headers['If-None-Match'] === '"H1"') return resposta(304, null, { ETag: '"H1"', 'X-Geracao': geracao(1000) });
      return resposta(200, { ok: true, patrimonio: { total: 5 } }, { ETag: '"H1"', 'X-Geracao': geracao(1000) });
    }
    return resposta(200, { ok: true, origem: 'apps-script', _etag: 'E', _ms: 9000 });
  });
  const a = await getHome(S1);
  assert.equal(a._fonte, 'leitura');
  assert.equal(a.patrimonio.total, 5);
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].url, `${LEITURA_URL}/v1/tela/home`);
  assert.equal(pedidos[0].op.headers.Authorization, `Bearer ${S1}`);
  const b = await getHome(S1);
  assert.equal(pedidos[1].op.headers['If-None-Match'], '"H1"');
  assert.equal(b._naoMudou, true);
  assert.equal(b.patrimonio.total, 5);
  assert.ok(!pedidos.some((p) => p.url.startsWith(APPS_SCRIPT_URL)), 'o Apps Script nem foi chamado');
});

test('Worker com 404, 500, rede fora ou mais de 1,5 s: a tela vem do Apps Script como antes', async (t) => {
  for (const falha of ['404', '500', 'rede', 'lento']) {
    limpar();
    const urls = [];
    t.mock.method(globalThis, 'fetch', async (url, op = {}) => {
      urls.push(String(url));
      if (String(url).startsWith(LEITURA_URL)) {
        if (falha === '404') return resposta(404, { ok: false });
        if (falha === '500') return resposta(500, { ok: false });
        if (falha === 'rede') throw new TypeError('Failed to fetch');
        return new Promise((_, rej) => op.signal.addEventListener('abort', () => rej(new Error('abortado'))));
      }
      return resposta(200, { ok: true, origem: 'apps-script', _etag: 'E', _ms: 10 });
    });
    const inicio = Date.now();
    const r = await getCarteirasFiis(S1);
    assert.equal(r.origem, 'apps-script', falha);
    assert.equal(urls.length, 2, falha);
    if (falha === 'lento') assert.ok(Date.now() - inicio >= TEMPO_MAXIMO_LEITURA_MS - 50 && Date.now() - inicio < TEMPO_MAXIMO_LEITURA_MS + 1500);
  }
});

test('sem sessão s1 (token do Google) ou tela não publicada (syncStatus): direto no Apps Script', async (t) => {
  limpar();
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url) => { urls.push(String(url)); return resposta(200, { ok: true, _etag: 'E' }); });
  await getHome('eyJhbGciOi.google.token');
  await getSyncStatus(S1);
  assert.ok(urls.every((u) => u.startsWith(APPS_SCRIPT_URL)), urls.join(' | '));
});

test('29/10/2026: Transações também vem do Worker (o Atualizar não espera os ~15 s do Apps Script)', async (t) => {
  limpar();
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    urls.push(String(url));
    if (String(url).startsWith(LEITURA_URL)) return resposta(200, { ok: true, v: 'worker' }, { ETag: '"T"', 'X-Geracao': geracao(1) });
    return resposta(200, { ok: true, v: 'apps-script', _etag: 'E' });
  });
  assert.equal((await getTransacoes(S1)).v, 'worker');
  assert.ok(urls[0].startsWith(`${LEITURA_URL}/v1/tela/transacoes`), urls.join(' | '));
});

test('depois de gravar: publicação mais velha que a gravação não serve (Apps Script); a nova serve; republicação pedida em segundo plano', async (t) => {
  limpar();
  let geracaoWorker = geracao(1000);
  const pedidos = [];
  t.mock.method(globalThis, 'fetch', async (url, op = {}) => {
    pedidos.push({ url: String(url), corpo: op.body ? String(op.body) : '' });
    if (String(url).startsWith(LEITURA_URL)) return resposta(200, { ok: true, v: 'worker' }, { ETag: '"H"', 'X-Geracao': geracaoWorker });
    if (op.method === 'POST' && String(op.body).includes('action=salvarDespesas')) return resposta(200, { ok: true, _ms: 50, _agora: B + 5000 });
    return resposta(200, { ok: true, v: 'apps-script', _etag: 'E' });
  });
  assert.equal((await getHome(S1)).v, 'worker');
  await salvarDespesas(S1, []);
  assert.equal(Number(memoria.get('investiments_geracao_minima')), B + 5000, 'instante do Apps Script');
  assert.equal((await getHome(S1)).v, 'apps-script', 'publicação de antes da gravação não serve');
  geracaoWorker = geracao(6000);
  assert.equal((await getHome(S1)).v, 'worker', 'a publicação nova serve');
  await new Promise((r) => setTimeout(r, 1700));
  const pub = pedidos.filter((p) => p.corpo.includes('action=publicarLeitura'));
  assert.equal(pub.length, 1, 'uma republicação em segundo plano');
  // o mínimo só sobe
  marcarGeracaoMinima(B + 10);
  assert.equal(Number(memoria.get('investiments_geracao_minima')), B + 5000);
});
