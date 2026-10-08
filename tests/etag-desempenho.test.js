// tests/etag-desempenho.test.js
//
// 08/10/2026 (Etapa 0, Tiago: "o app é muito lento... o cache às vezes dá falsos positivos"):
//  - o servidor põe em toda resposta de leitura a impressão digital do CONTEÚDO (_etag) e o tempo dele (_ms);
//  - o navegador manda a etag que já tem; se o conteúdo não mudou volta só { naoMudou: true } e a resposta guardada vale;
//  - cada chamada é medida neste aparelho (desempenho.js) e aparece no popover "Registro de Controle".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { usarMemoriaNoCacheDados } from '../assets/js/cache-dados.js';
import { getCarteirasFiis, esquecerRespostasGuardadas } from '../assets/js/api-client.js';
import { registrarDesempenho, resumoDesempenho, htmlDesempenho } from '../assets/js/desempenho.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function armazenamentoFalso() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('jsonOut (Auth.gs): GET ok ganha _etag (MD5 do conteúdo) e _ms; com a mesma etag volta só naoMudou; erro e POST sem etag', () => {
  const sb = {
    ContentService: { createTextOutput: (t) => ({ t, setMimeType() { return this; }, getContent() { return this.t; } }), MimeType: { JSON: 'json' } },
    Utilities: {
      DigestAlgorithm: { MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (a, t) => [...createHash('md5').update(String(t), 'utf8').digest()],
      base64EncodeWebSafe: (b) => Buffer.from(b.map((x) => x & 255)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {} }) },
  };
  vm.createContext(sb);
  new vm.Script(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Auth.gs'), 'utf8')).runInContext(sb);
  sb.iniciarRequisicao_({ parameter: {} }, 'GET');
  const r1 = JSON.parse(sb.jsonOut({ ok: true, dados: [1, 2, 3] }).getContent());
  assert.deepEqual(r1.dados, [1, 2, 3]);
  assert.match(r1._etag, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(typeof r1._ms, 'number');
  sb.iniciarRequisicao_({ parameter: { etag: r1._etag } }, 'GET');
  const r2 = JSON.parse(sb.jsonOut({ ok: true, dados: [1, 2, 3] }).getContent());
  assert.deepEqual(Object.keys(r2).sort(), ['_etag', '_ms', 'naoMudou', 'ok']);
  sb.iniciarRequisicao_({ parameter: { etag: r1._etag } }, 'GET');
  const r3 = JSON.parse(sb.jsonOut({ ok: true, dados: [1, 2, 4] }).getContent());
  assert.deepEqual(r3.dados, [1, 2, 4], 'conteúdo mudou: manda tudo');
  assert.notEqual(r3._etag, r1._etag);
  sb.iniciarRequisicao_({ parameter: {} }, 'GET');
  const r4 = JSON.parse(sb.jsonOut({ ok: false, erro: 'x' }).getContent());
  assert.equal(r4._etag, undefined);
  sb.iniciarRequisicao_({ parameter: {} }, 'POST');
  assert.equal(JSON.parse(sb.jsonOut({ ok: true }).getContent())._etag, undefined, 'gravação nunca é "não mudou"');
});

test('api-client: 2ª leitura manda a etag; "naoMudou" devolve a resposta guardada (cópia) e mede; conteúdo novo substitui', async (t) => {
  usarMemoriaNoCacheDados(new Map());
  esquecerRespostasGuardadas();
  const chamadas = [];
  let resposta = { ok: true, carteira: { total: 10 }, _etag: 'E1', _ms: 900 };
  t.mock.method(globalThis, 'fetch', async (url) => {
    const p = new URL(url).searchParams;
    chamadas.push(p.get('etag'));
    const corpo = p.get('etag') && p.get('etag') === resposta._etag ? { ok: true, naoMudou: true, _etag: resposta._etag, _ms: 40 } : resposta;
    return { text: async () => JSON.stringify(corpo) };
  });
  const a = await getCarteirasFiis('tk');
  assert.equal(a.carteira.total, 10);
  a.carteira.total = 999; // quem chama mexe no objeto: a guardada não muda
  const b = await getCarteirasFiis('tk');
  assert.deepEqual(chamadas, [null, 'E1']);
  assert.equal(b.carteira.total, 10);
  assert.equal(b._naoMudou, true);
  resposta = { ok: true, carteira: { total: 11 }, _etag: 'E2', _ms: 800 };
  const c = await getCarteirasFiis('tk');
  assert.equal(c.carteira.total, 11);
  assert.equal(chamadas[2], 'E1');
  // guardada sumiu (outro aparelho/limpou) mas o servidor disse "não mudou": pede de novo SEM etag
  esquecerRespostasGuardadas(); usarMemoriaNoCacheDados(new Map());
  const d = await getCarteirasFiis('tk');
  assert.equal(d.carteira.total, 11);
  usarMemoriaNoCacheDados(null);
});

test('desempenho: mediana, pior caso (p95), servidor e "sem mudança" por tela; a mais lenta primeiro; html legível', () => {
  const arm = armazenamentoFalso();
  [800, 1200, 1000, 5000].forEach((ms, i) => registrarDesempenho('home', { total: ms, servidor: ms - 300, naoMudou: i === 3, bytes: 1800 * 1024 }, { armazenamento: arm }));
  registrarDesempenho('carteirasFiis', { total: 300, servidor: 200, bytes: 6000 }, { armazenamento: arm });
  registrarDesempenho('carteirasFiis', { total: 9999, ok: false }, { armazenamento: arm });
  const r = resumoDesempenho({ armazenamento: arm });
  assert.deepEqual(r.map((x) => x.acao), ['home', 'carteirasFiis']);
  assert.deepEqual({ n: r[0].n, mediana: r[0].mediana, p95: r[0].p95, serv: r[0].medianaServidor, nm: r[0].pctNaoMudou, kb: r[0].kb }, { n: 4, mediana: 1000, p95: 5000, serv: 700, nm: 25, kb: 1800 });
  assert.equal(r[1].n, 1, 'falha não entra na conta');
  const html = htmlDesempenho(r);
  assert.match(html, /Início.*1,0 s.*5,0 s.*700 ms.*25%/s);
  assert.match(htmlDesempenho([]), /Ainda sem medidas/);
});
