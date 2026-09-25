// tests/harness/sessao.test.js
//
// 25/09/2026: sessão de vários dias (apps-script/Auth.gs) no lugar do token
// do Google (1 hora): criada só a partir do login do Google, assinada com a
// chave das Propriedades do script, recusada se adulterada, expirada, de
// outro e-mail ou depois de encerrarTodasAsSessoesDireto(). Roda o Auth.gs
// real num sandbox, com Utilities/PropertiesService de mentira (HMAC do Node).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAS_DIR = path.resolve(__dirname, '..', '..', 'apps-script');

function sandboxAuth() {
  const props = new Map();
  const bytes = (v) => (typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v));
  const sb = {
    console,
    Logger: { log() {} },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (props.has(k) ? props.get(k) : null),
      setProperty: (k, v) => props.set(k, v),
      deleteProperty: (k) => props.delete(k),
    }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      base64EncodeWebSafe: (v) => bytes(v).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
      computeHmacSha256Signature: (valor, chave) => Array.from(crypto.createHmac('sha256', chave).update(valor).digest()),
      newBlob: (arr) => ({ getDataAsString: () => Buffer.from(arr).toString('utf8') }),
    },
    UrlFetchApp: { fetch: () => { throw new Error('não devia chamar o Google pra uma sessão'); } },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; }, getContent() { return this.t; } }) },
  };
  vm.createContext(sb);
  new vm.Script(fs.readFileSync(path.join(GAS_DIR, 'Auth.gs'), 'utf8'), { filename: 'Auth.gs' }).runInContext(sb);
  sb.EMAIL = vm.runInContext('AUTHORIZED_EMAIL', sb); // const do .gs não vira propriedade do global
  return { sb, props };
}

test('sessão: criada a partir do login do Google, vale SESSAO_DIAS dias sem consultar o Google, e o exp é lido pelo site', () => {
  const { sb } = sandboxAuth();
  const resp = JSON.parse(sb.handleCriarSessao({ ok: true, email: sb.EMAIL, tipo: 'google' }).getContent());
  assert.equal(resp.ok, true);
  assert.match(resp.token, /^s1\.[\w-]+\.[\w-]+$/);
  const dias = (resp.exp - Date.now() / 1000) / 86400;
  assert.ok(Math.abs(dias - sb.SESSAO_DIAS) < 0.01);
  const auth = sb.verificarToken(resp.token);
  assert.equal(auth.ok, true);
  assert.equal(auth.tipo, 'sessao');
  assert.equal(auth.email, sb.EMAIL);
  // o site (auth.js!decodeTokenPayload) lê o exp da 2ª parte
  const payload = JSON.parse(Buffer.from(resp.token.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(payload.exp, resp.exp);
});

test('sessão: recusada se adulterada, expirada, de outro e-mail, criada a partir de outra sessão, ou depois de encerrar todas', () => {
  const { sb } = sandboxAuth();
  const { token } = sb.criarTokenSessao_(sb.EMAIL);
  const [p0, p1, p2] = token.split('.');
  const outroPayload = Buffer.from(JSON.stringify({ email: sb.EMAIL, exp: 9999999999 })).toString('base64url');
  assert.equal(sb.verificarToken(`${p0}.${outroPayload}.${p2}`).ok, false, 'dados trocados, assinatura velha');
  // 25/09/2026: troca o 1º caractere da assinatura (antes era o último virar
  // "A" - quando ele JÁ era "A", o token não mudava e o teste falhava ~1 em 16)
  const assinaturaTrocada = (p2[0] === 'A' ? 'B' : 'A') + p2.slice(1);
  assert.equal(sb.verificarToken(`${p0}.${p1}.${assinaturaTrocada}`).ok, false, 'assinatura adulterada');
  assert.match(sb.verificarTokenSessao_(token, Date.now() + (sb.SESSAO_DIAS + 1) * 86400000).erro, /expirada/);
  assert.match(sb.verificarToken(sb.criarTokenSessao_('outra@pessoa.test').token).erro, /não autorizado/);
  const deSessao = JSON.parse(sb.handleCriarSessao(sb.verificarToken(token)).getContent());
  assert.equal(deSessao.ok, false, 'uma sessão não renova a si mesma');
  sb.encerrarTodasAsSessoesDireto();
  assert.equal(sb.verificarToken(token).ok, false, 'chave trocada: a sessão antiga cai');
});
