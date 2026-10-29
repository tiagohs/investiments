// tests/worker-leitura.test.js - 29/10/2026: Worker da camada de leitura (worker/src, docs/arquitetura-leitura-cloudflare.md).
// Roda o Worker de verdade (módulos ES) com o D1 emulado em node:sqlite e confere: a sessão s1 criada pelo Auth.gs real
// é aceita (e adulterada, vencida ou de outro e-mail não), a publicação só entra assinada e dentro da janela, o corpo volta
// igual em gzip com ETag e 304, publicação velha não sobrescreve a nova, CORS só para as origens permitidas.
// Valores sintéticos: nenhum dado real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import worker, { gravarLote, paraBytes, MAX_CORPO_BYTES } from '../worker/src/index.js';
import { verificarSessao, listaDeEmails, hmacBase64Url } from '../worker/src/auth.js';
import { chaveLeitura, instanteDaGeracao } from '../assets/js/leitura-chave.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEM = 'https://site.exemplo.test';
const SEGREDO_SESSAO = 'segredo-de-sessao-de-teste';
const SEGREDO_PUB = 'segredo-de-publicacao-de-teste';
const EMAIL = 'dono@exemplo.test';

// ---- D1 de mentira em cima do SQLite do Node (mesma SQL do schema.sql) ----
class Comando {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Comando(this.db, this.sql, args.map((a) => (a instanceof ArrayBuffer ? new Uint8Array(a) : a))); }
  async first() { return this.db.prepare(this.sql).get(...this.args) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args) }; }
  async run() { this.executar(); return { success: true }; }
  executar() { this.db.prepare(this.sql).run(...this.args); }
}
function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(RAIZ, 'worker/schema.sql'), 'utf8'));
  return {
    db,
    prepare: (sql) => new Comando(db, sql),
    async batch(lista) { db.exec('BEGIN'); try { lista.forEach((c) => c.executar()); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } return []; },
  };
}
const ambiente = () => ({ DB: d1(), SESSAO_SEGREDO: SEGREDO_SESSAO, PUBLICACAO_SEGREDO: SEGREDO_PUB, EMAILS_AUTORIZADOS: `${EMAIL}, outra@exemplo.test`, ORIGENS: `${ORIGEM},http://localhost:8000` });

// ---- Auth.gs real, para criar a sessão como o Apps Script cria ----
function authGs(segredo = SEGREDO_SESSAO) {
  const props = new Map([['EMAIL_AUTORIZADO', EMAIL]]);
  const bytes = (v) => (typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v));
  const sb = {
    console, Logger: { log() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => props.set(k, v), deleteProperty: (k) => props.delete(k) }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      base64EncodeWebSafe: (v) => bytes(v).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
      computeHmacSha256Signature: (valor, chave) => Array.from(crypto.createHmac('sha256', chave).update(valor).digest()),
      newBlob: (arr) => ({ getDataAsString: () => Buffer.from(arr).toString('utf8') }),
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; }, getContent() { return this.t; } }) },
  };
  vm.createContext(sb);
  new vm.Script(fs.readFileSync(path.join(RAIZ, 'apps-script/Auth.gs'), 'utf8'), { filename: 'Auth.gs' }).runInContext(sb);
  props.set(sb.PROP_SEGREDO_SESSAO, segredo);
  return sb;
}

const gz = (obj) => zlib.gzipSync(Buffer.from(JSON.stringify(obj), 'utf8'));
const md5 = (obj) => crypto.createHash('md5').update(JSON.stringify(obj)).digest('base64url');
function item(chave, obj) { const z = gz(obj); return { chave, hash: md5(obj), bytes: z.length, gz: z.toString('base64') }; }
const geracao = (ms) => `20261029a.${ms}abcd`;

async function publicar(env, lote, { carimbo = Date.now(), segredo = SEGREDO_PUB } = {}) {
  const corpo = JSON.stringify(lote);
  const assinatura = await hmacBase64Url(segredo, `${carimbo}.${corpo}`);
  return worker.fetch(new Request('https://w.exemplo.test/v1/publicar', { method: 'POST', body: corpo, headers: { 'X-Carimbo': String(carimbo), 'X-Assinatura': assinatura } }), env);
}
function ler(env, caminho, { token, etag, origem = ORIGEM } = {}) {
  const headers = { Origin: origem };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (etag) headers['If-None-Match'] = etag;
  return worker.fetch(new Request(`https://w.exemplo.test${caminho}`, { headers }), env);
}
const corpoJson = async (r) => JSON.parse(zlib.gunzipSync(Buffer.from(await r.arrayBuffer())).toString('utf8'));

test('sessão s1: a criada pelo Auth.gs vale no Worker; adulterada, vencida, outro e-mail ou lista vazia não', async () => {
  const sb = authGs();
  const { token, exp } = sb.criarTokenSessao_(EMAIL);
  const env = { segredo: SEGREDO_SESSAO, emails: EMAIL };
  assert.deepEqual(await verificarSessao(token, env), { ok: true, email: EMAIL });
  const [p, d, a] = token.split('.');
  assert.equal((await verificarSessao(`${p}.${d}.${a.slice(0, -2)}xx`, env)).ok, false, 'assinatura adulterada');
  assert.equal((await verificarSessao(token, { ...env, segredo: 'outro' })).ok, false, 'outro segredo');
  assert.equal((await verificarSessao(token, { ...env, agoraMs: (exp + 1) * 1000 })).erro, 'sessão expirada');
  assert.equal((await verificarSessao(token, { ...env, emails: 'outra@exemplo.test' })).erro, 'e-mail não autorizado');
  assert.equal((await verificarSessao(token, { ...env, emails: '' })).ok, false, 'sem lista ninguém entra (como o Auth.gs)');
  assert.equal((await verificarSessao('', env)).ok, false);
  assert.equal((await verificarSessao('eyJ.abc.def', env)).ok, false, 'token do Google não vale aqui');
  // a mesma regra de lista do Auth.gs!emailsAutorizados_
  assert.deepEqual(listaDeEmails(' A@x.test;b@x.test  a@x.test,'), ['a@x.test', 'b@x.test']);
});

test('publicar + ler: corpo em gzip com ETag, 304 quando igual, 404 sem publicação, 401 sem sessão', async () => {
  const env = ambiente();
  const home = { ok: true, patrimonio: { total: 1234.56 }, texto: 'ação com acento ç' };
  const r = await publicar(env, { geracao: geracao(1761700000000), itens: [item('home', home), item('ativo?ticker=AAAA3', { ok: true, t: 'AAAA3' })] });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, gravadas: 2, confirmadas: 0, recusadas: [] });
  const token = authGs().criarTokenSessao_(EMAIL).token;
  const a = await ler(env, '/v1/tela/home', { token });
  assert.equal(a.status, 200);
  assert.equal(a.headers.get('Content-Encoding'), 'gzip');
  assert.equal(a.headers.get('ETag'), `"${md5(home)}"`);
  assert.equal(a.headers.get('X-Geracao'), geracao(1761700000000));
  assert.equal(a.headers.get('Access-Control-Allow-Origin'), ORIGEM);
  assert.match(a.headers.get('Access-Control-Expose-Headers'), /ETag/);
  assert.deepEqual(await corpoJson(a), home, 'o JSON volta idêntico');
  const b = await ler(env, '/v1/tela/home', { token, etag: `"${md5(home)}"` });
  assert.equal(b.status, 304);
  assert.equal(b.body, null);
  const c = await ler(env, '/v1/tela/ativo?ticker=AAAA3', { token });
  assert.deepEqual(await corpoJson(c), { ok: true, t: 'AAAA3' }, 'tela com parâmetro pela chave canônica');
  assert.equal((await ler(env, '/v1/tela/metas', { token })).status, 404);
  assert.equal((await ler(env, '/v1/tela/home')).status, 401);
  assert.equal((await ler(env, '/v1/tela/home', { token: 's1.x.y' })).status, 401);
  assert.equal((await ler(env, '/v1/tela/ho%20me', { token })).status, 400);
  const outra = await ler(env, '/v1/tela/home', { token, origem: 'https://malicioso.test' });
  assert.equal(outra.headers.get('Access-Control-Allow-Origin'), null, 'origem fora da lista não ganha CORS');
  const pre = await worker.fetch(new Request('https://w.exemplo.test/v1/tela/home', { method: 'OPTIONS', headers: { Origin: ORIGEM } }), env);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Max-Age'), '86400');
  const estado = await (await ler(env, '/v1/estado', { token })).json();
  assert.deepEqual(estado.publicacoes.map((p) => p.chave), ['ativo?ticker=AAAA3', 'home']);
  assert.equal(JSON.parse(estado.estado.ultima_publicacao).itens, 2);
});

test('publicação: sem assinatura, assinatura errada ou carimbo velho é recusada; nada é gravado', async () => {
  const env = ambiente();
  const lote = { geracao: geracao(1761700000000), itens: [item('home', { ok: true })] };
  assert.equal((await publicar(env, lote, { segredo: 'errado' })).status, 401);
  assert.equal((await publicar(env, lote, { carimbo: Date.now() - 11 * 60 * 1000 })).status, 401);
  const semCab = await worker.fetch(new Request('https://w.exemplo.test/v1/publicar', { method: 'POST', body: JSON.stringify(lote) }), env);
  assert.equal(semCab.status, 401);
  assert.equal(env.DB.db.prepare('SELECT COUNT(*) n FROM publicacao').get().n, 0);
});

test('publicação: geração mais velha não sobrescreve a mais nova; corpo que não é gzip, grande demais ou chave inválida é recusado', async () => {
  const env = ambiente();
  const token = authGs().criarTokenSessao_(EMAIL).token;
  await gravarLote(env.DB ? env : env, { geracao: geracao(2000000000000), itens: [item('home', { v: 'nova' })] }, '2026-10-29T12:00:00Z');
  await gravarLote(env, { geracao: geracao(1000000000000), itens: [item('home', { v: 'velha' })] }, '2026-10-29T12:01:00Z');
  assert.deepEqual(await corpoJson(await ler(env, '/v1/tela/home', { token })), { v: 'nova' });
  const ruins = await gravarLote(env, { geracao: geracao(3000000000000), itens: [
    { chave: 'x', hash: 'abcdefgh', bytes: 3, gz: Buffer.from('{"a":1}').toString('base64') },
    { chave: 'home; DROP TABLE', hash: 'abcdefgh', bytes: 1, gz: gz({}).toString('base64') },
    { chave: 'grande', hash: 'abcdefgh', bytes: 1, gz: Buffer.concat([Buffer.from([0x1f, 0x8b]), Buffer.alloc(MAX_CORPO_BYTES)]).toString('base64') },
  ] }, '2026-10-29T12:02:00Z');
  assert.equal(ruins.ok, false);
  assert.deepEqual(ruins.recusadas.map((r) => r.chave), ['x', 'home; DROP TABLE', 'grande']);
  assert.equal(env.DB.db.prepare('SELECT COUNT(*) n FROM publicacao').get().n, 1);
});

test('confirmação (tela que não mudou): sobe a geração sem reenviar o corpo - só com o MESMO hash e geração mais nova', async () => {
  // 29/10/2026 (bug): sem isso a tela igual ficava com a geração antiga e o site a recusava depois de qualquer gravação
  const env = ambiente();
  const token = authGs().criarTokenSessao_(EMAIL).token;
  const home = { ok: true, v: 1 };
  await gravarLote(env, { geracao: geracao(1000000000000), itens: [item('home', home), item('metas', { ok: true })] }, '2026-10-29T12:00:00Z');
  const r = await gravarLote(env, { geracao: geracao(2000000000000), itens: [], confirmar: [{ chave: 'home', hash: md5(home) }, { chave: 'metas', hash: 'outrohash1' }] }, '2026-10-29T12:05:00Z');
  assert.equal(r.ok, true);
  assert.equal(r.confirmadas, 2);
  const a = await ler(env, '/v1/tela/home', { token });
  assert.equal(a.headers.get('X-Geracao'), geracao(2000000000000), 'mesmo hash: geração nova');
  assert.deepEqual(await corpoJson(a), home, 'corpo intacto');
  assert.equal((await ler(env, '/v1/tela/metas', { token })).headers.get('X-Geracao'), geracao(1000000000000), 'hash diferente: não confirma');
  await gravarLote(env, { geracao: geracao(1500000000000), itens: [], confirmar: [{ chave: 'home', hash: md5(home) }] }, '2026-10-29T12:06:00Z');
  assert.equal((await ler(env, '/v1/tela/home', { token })).headers.get('X-Geracao'), geracao(2000000000000), 'confirmação velha não volta a geração');
  const ruim = await gravarLote(env, { geracao: geracao(3000000000000), itens: [], confirmar: [{ chave: 'home; DROP', hash: 'abcdefgh' }] }, '2026-10-29T12:07:00Z');
  assert.equal(ruim.ok, false);
});

test('chave canônica e instante da geração', () => {
  assert.equal(chaveLeitura('home'), 'home');
  assert.equal(chaveLeitura('ativo', { ticker: 'PETR4', classe: 'acoes', vazio: '' }), 'ativo?classe=acoes&ticker=PETR4');
  assert.equal(chaveLeitura('x', { q: 'a b/ç' }), 'x?q=a%20b%2F%C3%A7');
  assert.equal(instanteDaGeracao('20261028a.1761700000000k3f9'), 1761700000000);
  assert.equal(instanteDaGeracao('20261028a.0'), 0);
  assert.equal(instanteDaGeracao(''), 0);
  assert.deepEqual([...paraBytes([1, 2, 3])], [1, 2, 3]);
  assert.deepEqual([...paraBytes(new Uint8Array([4]).buffer)], [4]);
});
