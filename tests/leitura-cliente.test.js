// tests/leitura-cliente.test.js - 29/10/2026: o site lendo do Worker de leitura (assets/js/api-client.js, RF-03/04/05).
//  - tela publicada + sessão s1: vem do Worker (1 pedido, sem passar pelo Apps Script), com ETag/304;
//  - Worker com erro, 404, sem resposta em 1,5 s ou publicação anterior à última gravação: cai no Apps Script;
//  - depois de gravar: guarda o instante (_agora do Apps Script) e pede a republicação em segundo plano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getHome, getAtivo, getIntradia, INTRADIA_MAX_POR_PEDIDO, INTRADIA_WORKER_MAX, salvarFavoritos, salvarRegraGastos, getGastos, getCarteirasFiis, getTransacoes, getSyncStatus, salvarDespesas, esquecerRespostasGuardadas, marcarGeracaoMinima, TEMPO_MAXIMO_LEITURA_MS } from '../assets/js/api-client.js';
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
  assert.deepEqual(JSON.parse(memoria.get('investiments_geracao_minima')), { '*': B + 5000 }, 'instante do Apps Script, pra todas as telas (salvarDespesas não tem escopo menor)');
  assert.equal((await getHome(S1)).v, 'apps-script', 'publicação de antes da gravação não serve');
  geracaoWorker = geracao(6000);
  assert.equal((await getHome(S1)).v, 'worker', 'a publicação nova serve');
  await new Promise((r) => setTimeout(r, 1700));
  const pub = pedidos.filter((p) => p.corpo.includes('action=publicarLeitura'));
  assert.equal(pub.length, 1, 'uma republicação em segundo plano');
  // o mínimo só sobe
  marcarGeracaoMinima(B + 10);
  assert.deepEqual(JSON.parse(memoria.get('investiments_geracao_minima')), { '*': B + 5000 });
  assert.match(pub[0].corpo, /familias=tudo/);
  // formato antigo (um número) continua valendo pra todas
  memoria.set('investiments_geracao_minima', String(B + 9000));
  esquecerRespostasGuardadas();
  assert.equal((await getHome(S1)).v, 'apps-script');
});

test('29/10/2026: tela do ativo (renda variável) = ativoBase + a linha da Carteira publicada, sem Apps Script; o grupo é o da aba', async (t) => {
  limpar();
  const urls = [];
  const base = { ok: true, tipo: 'rv', ticker: 'TEST11', classe: 'fiis', ativo: null, serie: [{ data: '2026-10-01', valor: 10 }], hoje: '2026-10-29' };
  const carteira = { ok: true, carteira: { ativos: [{ ticker: 'OUTR11', grupo: 'Papel' }, { ticker: 'TEST11', cotacao: 101.5, grupo: 'Tijolo', grupoCarteira: 'Logística' }] } };
  t.mock.method(globalThis, 'fetch', async (url) => {
    urls.push(String(url));
    if (String(url).startsWith(`${LEITURA_URL}/v1/tela/ativoBase?ref=TEST11`)) return resposta(200, base, { ETag: '"B"', 'X-Geracao': geracao(1) });
    if (String(url).startsWith(`${LEITURA_URL}/v1/tela/carteirasFiis`)) return resposta(200, carteira, { ETag: '"C"', 'X-Geracao': geracao(1) });
    return resposta(200, { ok: true, v: 'apps-script', _etag: 'E' });
  });
  const r = await getAtivo(S1, 'test11', { semIndices: true });
  assert.equal(r._fonte, 'leitura');
  assert.deepEqual(r.ativo, { ticker: 'TEST11', cotacao: 101.5, grupo: 'Logística' });
  assert.deepEqual(r.serie, base.serie);
  assert.ok(urls.every((u) => u.startsWith(LEITURA_URL)), urls.join(' | '));
});

test('tela do ativo: fora da carteira, ainda não publicada, renda fixa ou sem índices da Início - cada um no caminho certo', async (t) => {
  limpar();
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    urls.push(String(url));
    const u = String(url);
    if (u.startsWith(`${LEITURA_URL}/v1/tela/ativoBase?ref=VEND3`)) return resposta(200, { ok: true, tipo: 'rv', ticker: 'VEND3', classe: 'acoes' }, { ETag: '"V"', 'X-Geracao': geracao(1) });
    if (u.startsWith(`${LEITURA_URL}/v1/tela/carteirasAcoes`)) return resposta(200, { ok: true, carteira: { ativos: [{ ticker: 'ABCD3' }] } }, { ETag: '"A"', 'X-Geracao': geracao(1) });
    if (u.startsWith(`${LEITURA_URL}/v1/tela/ativo?ref=rf`)) return resposta(200, { ok: true, tipo: 'rf', v: 'worker-rf' }, { ETag: '"R"', 'X-Geracao': geracao(1) });
    if (u.startsWith(LEITURA_URL)) return resposta(404, { ok: false, erro: 'não publicado' });
    return resposta(200, { ok: true, v: 'apps-script', _etag: 'E' });
  });
  assert.equal((await getAtivo(S1, 'VEND3', { semIndices: true })).v, 'apps-script', 'vendido (fora da carteira): o Apps Script procura nas 3 classes');
  assert.equal((await getAtivo(S1, 'NOVO3', { semIndices: true })).v, 'apps-script', 'não publicado (404)');
  assert.equal((await getAtivo(S1, 'rf:Tesouro Selic 2029|XP', { semIndices: true })).v, 'worker-rf', 'renda fixa: a tela inteira');
  urls.length = 0;
  assert.equal((await getAtivo(S1, 'ABCD3')).v, 'apps-script', 'sem a série da Início no aparelho: com índices, do Apps Script');
  assert.ok(urls.every((u) => !u.includes('/v1/tela/ativoBase')), 'nem tenta o ativoBase');
});

test('29/10/2026: intradia pedidos juntos viram 1 pedido (até 40 símbolos); cada um recebe só o que pediu', async (t) => {
  limpar();
  const pedidos = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    const simbolos = new URL(String(url)).searchParams.get('simbolos').split(',');
    pedidos.push(simbolos);
    return resposta(200, { ok: true, resultado: Object.fromEntries(simbolos.map((s) => [s, [{ t: 1, p: s.length }]])) });
  });
  const [a, b] = await Promise.all([getIntradia('tok', ['IBOV', 'acoes:AAAA3']), getIntradia('tok', ['acoes:AAAA3', 'usa:CCCC'])]);
  assert.deepEqual(pedidos, [['IBOV', 'acoes:AAAA3', 'usa:CCCC']]);
  assert.deepEqual(Object.keys(a.resultado), ['IBOV', 'acoes:AAAA3']);
  assert.deepEqual(Object.keys(b.resultado), ['acoes:AAAA3', 'usa:CCCC']);
  pedidos.length = 0;
  const muitos = Array.from({ length: INTRADIA_MAX_POR_PEDIDO + 5 }, (_, i) => `acoes:T${i}`);
  const c = await getIntradia('tok', muitos);
  assert.deepEqual(pedidos.map((p) => p.length), [INTRADIA_MAX_POR_PEDIDO, 5]);
  assert.equal(Object.keys(c.resultado).length, muitos.length);
});

test('29/10/2026: favoritos salvos - a Início do Worker continua servindo, com a lista salva por cima até a publicação nova; as outras telas nem sentem', async (t) => {
  limpar();
  let geracaoHome = geracao(1000);
  const pedidos = [];
  t.mock.method(globalThis, 'fetch', async (url, op = {}) => {
    const u = String(url);
    pedidos.push({ url: u, corpo: op.body ? String(op.body) : '' });
    if (u.startsWith(`${LEITURA_URL}/v1/tela/home`)) return resposta(200, { ok: true, v: 'worker', favoritos: ['acoes:VELHA3'] }, { ETag: `"H${geracaoHome}"`, 'X-Geracao': geracaoHome });
    if (u.startsWith(LEITURA_URL)) return resposta(200, { ok: true, v: 'worker' }, { ETag: '"X"', 'X-Geracao': geracao(1000) });
    if (op.method === 'POST' && String(op.body).includes('action=salvarFavoritos')) return resposta(200, { ok: true, favoritos: ['acoes:NOVA3', 'fiis:TEST11'], _agora: B + 5000 });
    return resposta(200, { ok: true, v: 'apps-script', _etag: 'E' });
  });
  await salvarFavoritos(S1, ['acoes:NOVA3', 'fiis:TEST11']);
  const h = await getHome(S1);
  assert.equal(h.v, 'worker', 'sem esperar 30 s pelo Apps Script');
  assert.deepEqual(h.favoritos, ['acoes:NOVA3', 'fiis:TEST11'], 'com a lista que acabou de ser salva');
  assert.equal((await getCarteirasFiis(S1)).v, 'worker');
  geracaoHome = geracao(6000); // a publicação nova já tem a lista: o remendo some
  const h2 = await getHome(S1);
  assert.deepEqual(h2.favoritos, ['acoes:VELHA3'], 'vale o que veio publicado');
  assert.equal(memoria.has('investiments_favoritos_locais'), false);
  await new Promise((r) => setTimeout(r, 1700));
  const pub = pedidos.filter((p) => p.corpo.includes('action=publicarLeitura'));
  assert.equal(pub.length, 1);
  assert.match(pub[0].corpo, /familias=home(&|$)/, 'republica só a Início');
});

test('gravação nos gastos: só os gastos esperam a publicação nova (Apps Script); a Início continua no Worker', async (t) => {
  limpar();
  const pedidos = [];
  t.mock.method(globalThis, 'fetch', async (url, op = {}) => {
    const u = String(url);
    pedidos.push({ url: u, corpo: op.body ? String(op.body) : '' });
    if (u.startsWith(LEITURA_URL)) return resposta(200, { ok: true, v: 'worker' }, { ETag: '"X"', 'X-Geracao': geracao(1000) });
    if (op.method === 'POST') return resposta(200, { ok: true, _agora: B + 5000 });
    return resposta(200, { ok: true, v: 'apps-script', _etag: 'E' });
  });
  await salvarRegraGastos(S1, 'MERCADO', 'Mercado');
  assert.equal((await getGastos(S1)).v, 'apps-script');
  assert.equal((await getHome(S1)).v, 'worker');
  await new Promise((r) => setTimeout(r, 1700));
  assert.match(pedidos.find((p) => p.corpo.includes('action=publicarLeitura')).corpo, /familias=gastos(&|$)/);
});

test('29/10/2026: gráfico do dia pelo Worker (Yahoo direto); o que ele não conseguir vai ao Apps Script; Yahoo recusando = pausa', async (t) => {
  limpar();
  const sessao = new Map();
  globalThis.sessionStorage = { getItem: (k) => (sessao.has(k) ? sessao.get(k) : null), setItem: (k, v) => sessao.set(k, String(v)), removeItem: (k) => sessao.delete(k) };
  const pedidos = [];
  let workerFalha = false;
  t.mock.method(globalThis, 'fetch', async (url) => {
    const u = new URL(String(url));
    const simbolos = (u.searchParams.get('simbolos') || '').split(',');
    pedidos.push({ origem: String(url).startsWith(LEITURA_URL) ? 'cf' : 'as', simbolos });
    if (String(url).startsWith(LEITURA_URL)) {
      if (workerFalha) return resposta(200, { ok: true, resultado: {}, falhas: simbolos });
      return resposta(200, { ok: true, resultado: Object.fromEntries(simbolos.filter((s) => s !== 'acoes:BLOQ3').map((s) => [s, { v: [1], de: 'cf' }])), falhas: simbolos.includes('acoes:BLOQ3') ? ['acoes:BLOQ3'] : [] });
    }
    return resposta(200, { ok: true, resultado: Object.fromEntries(simbolos.map((s) => [s, { v: [2], de: 'as' }])) });
  });
  const chaves = Array.from({ length: INTRADIA_WORKER_MAX + 2 }, (_, i) => `acoes:T${i}`).concat(['acoes:BLOQ3']);
  const r = await getIntradia(S1, chaves);
  assert.deepEqual(pedidos.filter((p) => p.origem === 'cf').map((p) => p.simbolos.length), [INTRADIA_WORKER_MAX, 3], 'Worker em pedaços de 15');
  assert.deepEqual(pedidos.filter((p) => p.origem === 'as').map((p) => p.simbolos), [['acoes:BLOQ3']], 'só a falha vai ao Apps Script');
  assert.equal(r.resultado['acoes:T0'].de, 'cf');
  assert.equal(r.resultado['acoes:BLOQ3'].de, 'as');
  // Yahoo recusando tudo no Cloudflare: Apps Script, e a aba para de tentar o Worker por 30 min
  workerFalha = true;
  pedidos.length = 0;
  const r2 = await getIntradia(S1, ['IBOV', 'acoes:T1']);
  assert.equal(r2.resultado.IBOV.de, 'as');
  pedidos.length = 0;
  await getIntradia(S1, ['IBOV']);
  assert.deepEqual(pedidos.map((p) => p.origem), ['as'], 'pausa: nem tenta o Worker');
  delete globalThis.sessionStorage;
});
