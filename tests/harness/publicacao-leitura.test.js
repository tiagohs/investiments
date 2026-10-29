// tests/harness/publicacao-leitura.test.js - 29/10/2026: camada de leitura no Cloudflare (apps-script/Publicacao.gs,
// docs/arquitetura-leitura-cloudflare.md). Com as fixtures da planilha:
//  - PARIDADE (RNF-07): o que o Worker entrega de cada tela é idêntico ao que o doGet devolve hoje (sem _etag/_ms);
//  - só vai ao Worker o que mudou (hash = etag do doGet); sem configuração, nada é publicado;
//  - contrato: toda ação GET do Router.gs está classificada como publicada ou "só Apps Script";
//  - a chave canônica é a mesma no Apps Script e no site/Worker; o gatilho do pregão respeita horário e feriado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { criarSandboxGs } from './gas-vm-harness.mjs';
import worker, { gravarLote } from '../../worker/src/index.js';
import { chaveLeitura, instanteDaGeracao, ACOES_PUBLICADAS, ACOES_PUBLICADAS_POR_ATIVO, ACOES_LIDAS_DO_WORKER, ACOES_COM_COTACAO, talvezNoPregao } from '../../assets/js/leitura-chave.js';
import { getAtivo, esquecerRespostasGuardadas } from '../../assets/js/api-client.js';
import { usarMemoriaNoCacheDados } from '../../assets/js/cache-dados.js';
import { LEITURA_URL } from '../../assets/js/config.js';
import { hmacBase64Url } from '../../worker/src/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, '..', '..');
const TEM_FIXTURES = fs.existsSync(path.join(__dirname, 'fixtures.json'));
const SEGREDO = 'x'.repeat(40);
const plain = (x) => JSON.parse(JSON.stringify(x));

class Comando {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Comando(this.db, this.sql, args.map((a) => (a instanceof ArrayBuffer ? new Uint8Array(a) : a))); }
  async first() { return this.db.prepare(this.sql).get(...this.args) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args) }; }
  executar() { this.db.prepare(this.sql).run(...this.args); }
}
function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(RAIZ, 'worker/schema.sql'), 'utf8'));
  return { db, prepare: (sql) => new Comando(db, sql), async batch(l) { db.exec('BEGIN'); l.forEach((c) => c.executar()); db.exec('COMMIT'); return []; } };
}

/** Sandbox com as fixtures + Utilities de gzip/HMAC + UrlFetchApp que entrega ao Worker de verdade (D1 em memória). */
function montar({ configurar = true } = {}) {
  const { sandbox: sb } = criarSandboxGs({ silencioso: true });
  const U = sb.Utilities;
  const utf8 = (t) => [...Buffer.from(String(t), 'utf8')].map((b) => (b > 127 ? b - 256 : b));
  sb.Utilities = {
    ...U,
    newBlob: (dados) => ({ getBytes: () => (Array.isArray(dados) ? dados : utf8(dados)), getDataAsString: () => String(dados) }),
    gzip: (blob) => { const z = zlib.gzipSync(Buffer.from(blob.getBytes().map((b) => b & 255))); return { getBytes: () => [...z].map((b) => (b > 127 ? b - 256 : b)) }; },
    base64Encode: (bytes) => Buffer.from(bytes.map((b) => b & 255)).toString('base64'),
    computeHmacSha256Signature: (valor, chave) => [...crypto.createHmac('sha256', chave).update(valor).digest()].map((b) => (b > 127 ? b - 256 : b)),
  };
  const env = { DB: d1(), PUBLICACAO_SEGREDO: SEGREDO, SESSAO_SEGREDO: 's', EMAILS_AUTORIZADOS: 'a@b.test', ORIGENS: '' };
  const enviados = [];
  const pendentes = [];
  sb.UrlFetchApp = {
    fetch: (url, op) => {
      if (!/\/v1\/publicar$/.test(url)) return { getResponseCode: () => 503, getContentText: () => '' };
      enviados.push({ url, op });
      // o Worker de verdade (assíncrono) - a resposta ok é a mesma que ele daria; os testes esperam `pendentes` antes de ler
      pendentes.push(worker.fetch(new Request(url, { method: 'POST', body: op.payload, headers: op.headers }), env).then((r) => r.json()));
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, recusadas: [] }) };
    },
  };
  if (configurar) sb.configurarLeituraDireto('https://leitura.exemplo.test', SEGREDO);
  return { sb, env, enviados, pendentes };
}

async function lerDoWorker(env, chave) {
  const linha = env.DB.db.prepare('SELECT corpo, hash, geracao FROM publicacao WHERE chave = ?').get(chave);
  return linha ? { json: JSON.parse(zlib.gunzipSync(Buffer.from(linha.corpo)).toString('utf8')), hash: linha.hash, geracao: linha.geracao } : null;
}

test('PARIDADE: cada tela publicada é idêntica à resposta do doGet (sem _etag/_ms) e chega ao Worker assinada', { skip: !TEM_FIXTURES && 'fixtures.json ausente' }, async () => {
  const { sb, env, enviados, pendentes } = montar();
  const r = plain(sb.publicarLeituraDireto());
  const respostas = await Promise.all(pendentes);
  assert.equal(r.configurado, true);
  assert.deepEqual(r.erros, [], 'nenhuma tela com erro');
  assert.ok(respostas.every((x) => x.ok && x.recusadas.length === 0), JSON.stringify(respostas));
  const familias = plain(sb.familiasLeitura_().map((f) => f.acao));
  assert.equal(r.publicadas, familias.length);
  assert.match(enviados[0].op.headers['X-Assinatura'], /^[\w-]{43}$/);
  for (const acao of familias) {
    // a resposta do doGet de hoje, como o site recebe (sem os carimbos da requisição)
    sb.iniciarExecucao_();
    sb.iniciarRequisicao_({ parameter: {} }, 'GET');
    const doGet = JSON.parse(sb[`handle${acao.charAt(0).toUpperCase()}${acao.slice(1)}`]
      ? sb[`handle${acao.charAt(0).toUpperCase()}${acao.slice(1)}`]({ parameter: {} }, { ok: true, email: 'a@b.test' }).getContent()
      : sb.familiasLeitura_().find((f) => f.acao === acao).fn({ parameter: {} }, { ok: true }).getContent());
    delete doGet._etag; delete doGet._ms;
    const pub = await lerDoWorker(env, acao);
    assert.ok(pub, `${acao} publicada`);
    assert.deepEqual(pub.json, doGet, `${acao}: Worker = doGet`);
    assert.equal(pub.json._ms, undefined, `${acao}: sem _ms`);
    assert.equal(pub.geracao, r.geracao);
  }
});

test('só vai o que mudou; sem configuração nada é publicado; telas de cotação e lista escolhida', { skip: !TEM_FIXTURES && 'fixtures.json ausente' }, async () => {
  const sem = montar({ configurar: false });
  const r0 = plain(sem.sb.publicarLeitura_({ familias: 'tudo' }));
  assert.equal(r0.configurado, false);
  assert.equal(sem.enviados.length, 0);

  const { sb, enviados, pendentes } = montar();
  plain(sb.publicarLeitura_({ familias: 'tudo' }));
  await Promise.all(pendentes);
  const antes = enviados.length;
  const r2 = plain(sb.publicarLeitura_({ familias: 'tudo' }));
  assert.equal(r2.publicadas, 0, 'nada mudou: nada vai');
  assert.equal(r2.iguais, sb.familiasLeitura_().length);
  assert.equal(r2.confirmadas, sb.familiasLeitura_().length, 'as iguais só confirmam a geração nova');
  assert.equal(enviados.length, antes + 2, 'um POST pras telas fixas e um pras dos ativos, só confirmando (sem corpo de tela)');
  assert.deepEqual(JSON.parse(enviados[enviados.length - 1].op.payload).itens, []);
  const r3 = plain(sb.publicarLeitura_({ familias: 'cotacao', forcar: true }));
  assert.equal(r3.publicadas, plain(sb.familiasLeitura_().filter((f) => f.cotacao)).length);
  const r4 = plain(sb.publicarLeitura_({ familias: ['home', 'metas'], forcar: true }));
  assert.equal(r4.publicadas, 2);
  // Worker fora do ar: o hash NÃO é guardado (na próxima, tenta de novo)
  sb.UrlFetchApp = { fetch: () => ({ getResponseCode: () => 502, getContentText: () => '' }) };
  const r5 = plain(sb.publicarLeitura_({ familias: ['home'], forcar: true }));
  assert.equal(r5.ok, false);
  assert.match(r5.erros[0].erro, /HTTP 502/);
});

test('29/10/2026 (bug): depois de uma gravação, a publicação seguinte é aceita pelo site - mesmo nas telas que não mudaram', { skip: !TEM_FIXTURES && 'fixtures.json ausente' }, async () => {
  // o site exige geração >= _agora (relógio do fim da gravação). A geração era o carimbo da GRAVAÇÃO (sempre anterior
  // ao _agora) e as telas iguais nem eram reenviadas: depois de gravar, o site nunca mais usava o Worker.
  const { sb, env, pendentes } = montar();
  plain(sb.publicarLeitura_({ familias: 'tudo' }));
  await Promise.all(pendentes);
  sb.registrarEscritaPlanilha_();
  await new Promise((r) => setTimeout(r, 5));
  const agora = Date.now(); // o _agora que o POST devolveria (Auth.gs!jsonOut)
  await new Promise((r) => setTimeout(r, 5));
  plain(sb.publicarLeitura_({ familias: 'tudo' }));
  await Promise.all(pendentes);
  for (const f of plain(sb.familiasLeitura_())) {
    const linha = await lerDoWorker(env, chaveLeitura(f.acao, f.params || {}));
    assert.ok(instanteDaGeracao(linha.geracao) >= agora, `${f.acao}: geração ${linha.geracao} anterior à gravação`);
  }
});

test('trava: publicação não usa o lock do script (gravação não espera); a 2ª ao mesmo tempo fica anotada e roda no fim da 1ª', { skip: !TEM_FIXTURES && 'fixtures.json ausente' }, async () => {
  const { sb, pendentes } = montar();
  let lockDoScript = 0;
  const lockOriginal = sb.LockService.getScriptLock;
  sb.LockService = { getScriptLock: () => { const l = lockOriginal(); return { ...l, waitLock: () => { lockDoScript++; }, tryLock: () => { lockDoScript++; return true; } }; } };
  // simula outra publicação segurando o recurso
  const outra = sb.travaRecurso_('leitura-publicacao', 'outra', { ttlMs: 60000, leitura: true });
  assert.equal(outra.tryLock(0), true);
  const adiada = plain(sb.publicarLeitura_({ familias: ['home'] }));
  assert.equal(adiada.adiada, true);
  assert.ok(sb.PropertiesService.getScriptProperties().getProperty('LEITURA_PENDENTE'));
  outra.releaseLock();
  const r = plain(sb.publicarLeitura_({ familias: ['metas'], forcar: true }));
  await Promise.all(pendentes);
  assert.equal(sb.PropertiesService.getScriptProperties().getProperty('LEITURA_PENDENTE'), null, 'o pedido anotado foi feito');
  assert.ok(r.publicadas >= 2, 'metas + home (a anotada)');
  // o lock do script só é usado nas seções críticas curtas da trava (tentar/soltar), nunca segurado a publicação inteira
  assert.ok(lockDoScript <= 6, `lock do script usado ${lockDoScript}x`);
});

test('contrato: toda ação GET do Router.gs é publicada ou está na lista "só Apps Script"; chave canônica igual nos dois lados', () => {
  const router = fs.readFileSync(path.join(RAIZ, 'apps-script/Router.gs'), 'utf8');
  const doGet = router.slice(router.indexOf('function doGet'), router.indexOf('function doPost'));
  const acoes = [...doGet.matchAll(/action === '([A-Za-z_]+)'/g)].map((m) => m[1]);
  const { sandbox: sb } = criarSandboxGs({ silencioso: true });
  const publicadas = plain(sb.familiasLeitura_().map((f) => f.acao));
  const so = plain(sb.LEITURA_SO_APPS_SCRIPT_);
  const porAtivo = plain(sb.LEITURA_POR_ATIVO_);
  assert.deepEqual([...ACOES_PUBLICADAS_POR_ATIVO].sort(), [...porAtivo].sort(), 'telas por ativo: a mesma lista nos dois lados');
  const semClasse = acoes.filter((a) => !publicadas.includes(a) && !so.includes(a) && !porAtivo.includes(a));
  assert.deepEqual(semClasse, [], 'ação GET nova: classifique em Publicacao.gs (familiasLeitura_ ou LEITURA_SO_APPS_SCRIPT_)');
  assert.deepEqual(publicadas.filter((a) => so.includes(a)), [], 'nenhuma nas duas listas');
  assert.deepEqual([...ACOES_PUBLICADAS].sort(), [...publicadas].sort(), 'o site conhece exatamente as telas que o Apps Script publica');
  assert.ok(ACOES_LIDAS_DO_WORKER.every((a) => publicadas.includes(a) || porAtivo.includes(a)), 'o site só lê do Worker o que é publicado');
  assert.deepEqual(porAtivo.filter((a) => so.includes(a)), [], 'ativo não pode estar em "só Apps Script"');
  for (const [acao, params] of [['home', {}], ['ativo', { ref: 'PETR4', semIndices: 1 }], ['x', { q: 'a b/ç', vazio: '', nulo: null }]]) {
    assert.equal(sb.chaveLeitura_(acao, params), chaveLeitura(acao, params));
  }
});

test('gatilho do pregão: dia útil da B3 entre 10:00 e 18:30 de São Paulo; fora disso não publica', () => {
  const { sandbox: sb } = criarSandboxGs({ silencioso: true });
  const sp = (iso) => new sb.Date(new Date(iso).getTime());
  assert.equal(sb.dentroDoPregaoLeitura_(sp('2026-10-29T14:00:00Z')), true, 'quinta 11:00 SP');
  assert.equal(sb.dentroDoPregaoLeitura_(sp('2026-10-29T12:30:00Z')), false, 'quinta 09:30 SP');
  assert.equal(sb.dentroDoPregaoLeitura_(sp('2026-10-29T21:45:00Z')), false, 'quinta 18:45 SP');
  assert.equal(sb.dentroDoPregaoLeitura_(sp('2026-10-31T14:00:00Z')), false, 'sábado');
  assert.equal(sb.dentroDoPregaoLeitura_(sp('2026-11-02T14:00:00Z')), false, 'Finados (feriado da B3 - faltava na lista até 29/10/2026)');
  assert.equal(sb.dentroDoPregaoLeitura_(sp('2026-10-12T14:00:00Z')), false, 'Aparecida (feriado da B3 - faltava na lista até 29/10/2026)');
  assert.equal(sb.dentroDoPregaoLeitura_(sp('2026-11-03T14:00:00Z')), true, 'terça depois de Finados');
});

/** O site (api-client.js de verdade) lendo do Worker de verdade (D1 em memória) - nada vai ao Apps Script. */
async function siteLendoDoWorker(t, env) {
  const memoria = new Map();
  globalThis.localStorage = { getItem: (k) => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, String(v)), removeItem: (k) => memoria.delete(k) };
  usarMemoriaNoCacheDados(new Map());
  esquecerRespostasGuardadas();
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    urls.push(String(url));
    if (!String(url).startsWith(LEITURA_URL)) throw new Error(`foi ao Apps Script: ${url}`);
    const r = await worker.fetch(new Request(String(url), init), env);
    if (r.headers.get('Content-Encoding') !== 'gzip') return r;
    const h = new Headers(r.headers); h.delete('Content-Encoding');
    return new Response(zlib.gunzipSync(Buffer.from(await r.arrayBuffer())), { status: r.status, headers: h });
  });
  const payload = Buffer.from(JSON.stringify({ email: 'a@b.test', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  return { token: `s1.${payload}.${await hmacBase64Url('s', payload)}`, urls };
}

test('telas dos ativos (29/10/2026): renda variável = tela sem posição + a linha da Carteira publicada - o site monta IGUAL ao doGet; renda fixa = a tela inteira', { skip: !TEM_FIXTURES && 'fixtures.json ausente' }, async (t) => {
  const { sb, env, pendentes } = montar();
  const r = plain(sb.publicarLeituraDireto());
  await Promise.all(pendentes);
  assert.deepEqual(r.erros, []);
  const refs = plain(sb.refsDosAtivosDaCarteira_(sb.SpreadsheetApp.getActiveSpreadsheet()));
  const rv = refs.filter((x) => !/^rf:/i.test(x));
  const rf = refs.filter((x) => /^rf:/i.test(x));
  assert.ok(rv.length > 5 && rf.length > 0, 'fixtures com ativos de renda variável e fixa');
  assert.equal(r.ativos.publicadas, refs.length, JSON.stringify(r.ativos));
  const { token, urls } = await siteLendoDoWorker(t, env);
  let comparados = 0;
  for (const ticker of rv) {
    sb.iniciarExecucao_();
    const esperado = plain(sb.montarTelaAtivo_(ticker, { semIndices: true }));
    if (!esperado.ativo) continue; // fora da carteira: o site vai ao Apps Script (testado no leitura-cliente)
    const site = await getAtivo(token, ticker, { semIndices: true });
    assert.equal(site._fonte, 'leitura', ticker);
    const { _fonte, ativo, ...resto } = plain(site);
    const { ativo: ativoEsperado, ...restoEsperado } = esperado;
    assert.deepEqual(resto, restoEsperado, `${ticker}: série, transações, proventos, fundamentos...`);
    for (const [k, v] of Object.entries(ativoEsperado)) assert.deepEqual(ativo[k], v, `${ticker}: ativo.${k}`);
    comparados++;
  }
  assert.ok(comparados >= 5, `comparou ${comparados} ativos`);
  for (const ref of rf) {
    sb.iniciarExecucao_();
    sb.iniciarRequisicao_({ parameter: {} }, 'GET');
    const doGet = JSON.parse(sb.handleAtivo({ parameter: { ref, semIndices: '1' } }, { ok: true }).getContent());
    delete doGet._etag; delete doGet._ms;
    const pub = await lerDoWorker(env, chaveLeitura('ativo', { ref, semIndices: 1 }));
    assert.deepEqual(pub.json, doGet, `${ref}: Worker = doGet`);
  }
  assert.ok(urls.every((u) => u.startsWith(LEITURA_URL)));
});

test('telas dos ativos: sem tempo, só vai o que já está no cache do Apps Script (o resto fica pra próxima publicação)', { skip: !TEM_FIXTURES && 'fixtures.json ausente' }, async () => {
  const { sb, pendentes } = montar();
  sb.LEITURA_ATIVOS_ORCAMENTO_MS_ = -1; // já sem tempo desde o 1º ativo
  const r = plain(sb.publicarLeitura_({ familias: 'tudo' }));
  await Promise.all(pendentes);
  const total = plain(sb.refsDosAtivosDaCarteira_(sb.SpreadsheetApp.getActiveSpreadsheet())).length;
  assert.equal(r.ativos.publicadas + r.ativos.semCache, total);
  assert.ok(r.ativos.semCache > 0, 'cache frio: nada calculado');
  const cota = plain(sb.publicarLeitura_({ familias: 'cotacao' }));
  assert.equal(cota.ativos, null, 'o gatilho de cotação não publica os ativos');
});

test('pedidos de publicação anotados se juntam (29/10/2026: o site pede só as telas que a gravação mudou)', () => {
  const { sandbox: sb } = criarSandboxGs({ silencioso: true });
  const cot = plain(sb.familiasLeitura_().filter((f) => f.cotacao).map((f) => f.acao));
  assert.equal(sb.juntarFamiliasLeitura_(null, ['home']).join(), 'home');
  assert.deepEqual(plain(sb.juntarFamiliasLeitura_(['gastos'], ['home', 'gastos'])), ['gastos', 'home']);
  assert.equal(sb.juntarFamiliasLeitura_(['gastos'], 'tudo'), 'tudo');
  assert.equal(sb.juntarFamiliasLeitura_('tudo', ['home']), 'tudo');
  assert.deepEqual(plain(sb.juntarFamiliasLeitura_('cotacao', ['gastos'])), [...cot, 'gastos']);
});

test('cotação de agora ao entrar (29/10/2026): o pedido do site só publica no pregão e se a última montagem de cotação tiver mais de 5 min; a publicação de cotação anota quando foi', { skip: !TEM_FIXTURES && 'fixtures.json ausente' }, async () => {
  const { sb, pendentes } = montar();
  assert.deepEqual([...ACOES_COM_COTACAO].sort(), plain(sb.familiasLeitura_().filter((f) => f.cotacao).map((f) => f.acao)).sort(), 'o site sabe quais telas têm cotação');
  const props = sb.PropertiesService.getScriptProperties();
  const sp = (iso) => new sb.Date(new Date(iso).getTime());
  props.setProperty('LEITURA_COTACAO_EM', String(Date.parse('2026-10-29T16:50:00Z')));
  assert.equal(sb.cotacaoPrecisaPublicar_(5, sp('2026-10-29T17:00:00Z')).precisa, true, 'quinta 14:00 SP, publicada 10 min antes');
  assert.match(sb.cotacaoPrecisaPublicar_(5, sp('2026-10-29T16:53:00Z')).motivo, /menos de 5 min/);
  assert.match(sb.cotacaoPrecisaPublicar_(5, sp('2026-10-31T17:00:00Z')).motivo, /fora do pregão/, 'sábado');
  assert.match(sb.cotacaoPrecisaPublicar_(5, sp('2026-11-02T17:00:00Z')).motivo, /fora do pregão/, 'feriado da B3');
  props.deleteProperty('LEITURA_COTACAO_EM');
  const antes = Date.now();
  plain(sb.publicarLeitura_({ familias: 'cotacao' }));
  await Promise.all(pendentes);
  assert.ok(Number(props.getProperty('LEITURA_COTACAO_EM')) >= antes, 'anotou o início da montagem');
  props.deleteProperty('LEITURA_COTACAO_EM');
  plain(sb.publicarLeitura_({ familias: ['gastos'] }));
  await Promise.all(pendentes);
  assert.equal(props.getProperty('LEITURA_COTACAO_EM'), null, 'publicação sem as telas de cotação não conta');
  // o pregão visto do aparelho (feriado o Apps Script confere)
  assert.equal(talvezNoPregao(Date.parse('2026-10-29T17:00:00Z')), true);
  assert.equal(talvezNoPregao(Date.parse('2026-10-29T12:59:00Z')), false, '09:59 SP');
  assert.equal(talvezNoPregao(Date.parse('2026-10-29T21:31:00Z')), false, '18:31 SP');
  assert.equal(talvezNoPregao(Date.parse('2026-11-01T17:00:00Z')), false, 'domingo');
});
