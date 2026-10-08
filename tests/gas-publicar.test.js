// tests/gas-publicar.test.js
//
// 08/10/2026 (Etapa 0): scripts/gas.mjs publica o Apps Script com o clasp (sem colar arquivo por arquivo). Testa as partes
// sem rede: o ID da implantação vem da URL do site, a comparação Google x pasta, o manifesto com os escopos fixos, a
// conferência de sintaxe - e que os escopos fixos cobrem TODO serviço que o código usa (senão a função perde permissão).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { idImplantacaoDoSite, compararPastas, manifestoComEscopos, conferirSintaxe, ESCOPOS } from '../scripts/gas.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAS = path.resolve(__dirname, '..', 'apps-script');

test('ID da implantação sai da URL do Web App em config.js', () => {
  assert.equal(idImplantacaoDoSite("export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfyc_Teste-123/exec';"), 'AKfyc_Teste-123');
  assert.equal(idImplantacaoDoSite('nada aqui'), null);
  assert.ok(idImplantacaoDoSite(), 'o config.js real tem a URL');
});

test('comparar Google x pasta: sobrando no Google (ex. cópia velha), faltando e diferentes; ignora .gs/.js e fim de linha', () => {
  const g = fs.mkdtempSync(path.join(os.tmpdir(), 'g-')), l = fs.mkdtempSync(path.join(os.tmpdir(), 'l-'));
  fs.writeFileSync(path.join(g, 'A.gs'), 'function a() {}\r\n'); fs.writeFileSync(path.join(l, 'A.gs'), 'function a() {}\n');
  fs.writeFileSync(path.join(g, 'B.js'), 'function b() { return 1; }'); fs.writeFileSync(path.join(l, 'B.gs'), 'function b() { return 2; }');
  fs.writeFileSync(path.join(g, 'Velho.gs'), '//'); fs.writeFileSync(path.join(l, 'Novo.gs'), '//');
  assert.deepEqual(compararPastas(g, l), { soNoGoogle: ['Velho'], soNaPasta: ['Novo'], diferentes: ['B'] });
});

test('manifesto: acrescenta os escopos fixos sem tirar nada', () => {
  const m = manifestoComEscopos({ timeZone: 'America/Sao_Paulo', webapp: { access: 'ANYONE_ANONYMOUS' }, oauthScopes: ['https://www.googleapis.com/auth/outro'] });
  assert.equal(m.timeZone, 'America/Sao_Paulo');
  assert.deepEqual(m.webapp, { access: 'ANYONE_ANONYMOUS' });
  assert.ok(m.oauthScopes.includes('https://www.googleapis.com/auth/outro'));
  ESCOPOS.forEach((s) => assert.ok(m.oauthScopes.includes(s)));
});

test('sintaxe: a pasta apps-script/ do repositório passa; erro aponta o arquivo', () => {
  assert.deepEqual(conferirSintaxe(GAS), []);
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 's-'));
  fs.writeFileSync(path.join(p, 'Ruim.gs'), 'function x( {');
  assert.match(conferirSintaxe(p)[0], /^Ruim\.gs: /);
});

test('escopos fixos cobrem todo serviço que o código usa (DriveApp só lê; escrita no Drive só pela API REST com drive.file) e batem com apps-script/appsscript.json', () => {
  const manifesto = JSON.parse(fs.readFileSync(path.join(GAS, 'appsscript.json'), 'utf8'));
  assert.deepEqual([...manifesto.oauthScopes].sort(), [...ESCOPOS].sort(), 'appsscript.json e scripts/gas.mjs!ESCOPOS iguais');
  assert.deepEqual(manifesto.webapp, { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' }, 'o Web App roda como o dono e aceita chamada anônima (o login é o token do site)');
  const codigo = fs.readdirSync(GAS).filter((f) => f.endsWith('.gs')).map((f) => fs.readFileSync(path.join(GAS, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1')).join('\n');
  const precisa = {
    'SpreadsheetApp.': 'https://www.googleapis.com/auth/spreadsheets',
    'DriveApp.': 'https://www.googleapis.com/auth/drive.readonly',
    'UrlFetchApp.': 'https://www.googleapis.com/auth/script.external_request',
    'ScriptApp.newTrigger': 'https://www.googleapis.com/auth/script.scriptapp',
    'MailApp.': 'https://www.googleapis.com/auth/script.send_mail',
    'getEffectiveUser().getEmail': 'https://www.googleapis.com/auth/userinfo.email',
    'googleapis.com/upload/drive': 'https://www.googleapis.com/auth/drive.file', // 08/10/2026: cópia .xlsx (ExportarPlanilha.gs) pela API REST
  };
  for (const [uso, escopo] of Object.entries(precisa)) if (codigo.includes(uso)) assert.ok(ESCOPOS.includes(escopo), `${uso} precisa de ${escopo}`);
  const naoCobertos = ['GmailApp.', 'DocumentApp.', 'CalendarApp.', 'FormApp.', 'SlidesApp.', 'Drive.Files', 'BigQuery.'].filter((s) => codigo.includes(s));
  assert.deepEqual(naoCobertos, [], 'serviço novo no código: acrescente o escopo em scripts/gas.mjs!ESCOPOS e no appsscript.json');
  const escritaDrive = /DriveApp\.(createFile|createFolder|createShortcut)|\.setTrashed\(|\.makeCopy\(|\.moveTo\(|\.addFile\(|\.removeFile\(|\.setContent\(/;
  assert.ok(!escritaDrive.test(codigo), 'o código escreve no Drive: troque drive.readonly por drive nos escopos');
});

test('atualizar-fixtures: procura a cópia .xlsx do Drive para desktop (macOS, Meu Drive / My Drive)', async () => {
  const { candidatos } = await import('../scripts/atualizar-fixtures.mjs');
  const lista = candidatos('/Users/alguem', (p) => (p.endsWith('CloudStorage') ? ['GoogleDrive-alguem@exemplo.test', 'Dropbox'] : []));
  assert.ok(lista.includes('/Users/alguem/Library/CloudStorage/GoogleDrive-alguem@exemplo.test/Meu Drive/investiments-dados/Investimentos - Controle.xlsx'));
  assert.ok(lista.includes('/Users/alguem/Library/CloudStorage/GoogleDrive-alguem@exemplo.test/My Drive/investiments-dados/Investimentos - Controle.xlsx'));
  assert.ok(!lista.some((p) => p.includes('Dropbox')));
});

test('ExportarPlanilha.gs: a cópia .xlsx é gravada pela API REST (mesmo arquivo atualizado no lugar), nunca por DriveApp', () => {
  const codigo = fs.readFileSync(path.join(GAS, 'ExportarPlanilha.gs'), 'utf8');
  assert.match(codigo, /export\?format=xlsx/);
  assert.match(codigo, /upload\/drive\/v3\/files\/'.*uploadType=media/);
  assert.doesNotMatch(codigo, /DriveApp\./);
  assert.match(codigo, /function instalarCopiaDiariaDireto\(/);
});

test('Auth.gs!ESCOPOS_PROJETO_ (conferência de permissões no editor) = scripts/gas.mjs!ESCOPOS', () => {
  const codigo = fs.readFileSync(path.join(GAS, 'Auth.gs'), 'utf8');
  const bloco = codigo.match(/var ESCOPOS_PROJETO_ = \[([\s\S]*?)\];/)[1];
  const lista = [...bloco.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...lista].sort(), [...ESCOPOS].sort());
});

test('ambienteClasp: com .clasprc.json na raiz, o clasp roda com um HOME temporário com essa credencial e a renovada volta pro arquivo', async () => {
  const { ambienteClasp } = await import('../scripts/gas.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-'));
  const rc = path.join(dir, '.clasprc.json');
  assert.equal(ambienteClasp(rc, { HOME: '/home/x' }).env.HOME, '/home/x', 'sem o arquivo: login normal');
  fs.writeFileSync(rc, '{"token":"velho"}');
  const amb = ambienteClasp(rc, { HOME: '/home/x' });
  assert.notEqual(amb.env.HOME, '/home/x');
  assert.equal(fs.readFileSync(path.join(amb.env.HOME, '.clasprc.json'), 'utf8'), '{"token":"velho"}');
  assert.equal(amb.env.npm_config_cache, path.join('/home/x', '.npm'));
  fs.writeFileSync(path.join(amb.env.HOME, '.clasprc.json'), '{"token":"novo"}'); // o clasp renovou
  amb.depois();
  assert.equal(fs.readFileSync(rc, 'utf8'), '{"token":"novo"}');
  assert.equal(fs.existsSync(amb.env.HOME), false);
});
