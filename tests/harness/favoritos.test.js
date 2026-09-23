// tests/harness/favoritos.test.js
//
// 23/09/2026 - apps-script/Favoritos.gs (favoritos da Início), rodando o .gs
// literal no sandbox do harness. A parte de gravação roda SEM fixtures.json
// (planilha vazia em memória - a aba "Auxiliar_favoritos" nasce no 1º
// salvamento); a última checagem usa as fixtures reais, se existirem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { montarSandboxComFixtures_, carregarTodasAsTelasComDadosReais } from './gas-vm-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAS = path.resolve(__dirname, '..', '..', 'apps-script');
const FIXTURES_PATH = path.join(__dirname, 'fixtures.json');

function sandboxVazio() {
  const sandbox = { console: { ...console, log() {} } };
  vm.createContext(sandbox);
  montarSandboxComFixtures_({}, sandbox);
  for (const f of ['Auth.gs', 'Favoritos.gs']) new vm.Script(fs.readFileSync(path.join(GAS, f), 'utf8'), { filename: f }).runInContext(sandbox);
  return sandbox;
}
// arrays do vm são de outra realm - JSON pra comparar com deepStrictEqual
const ler = (sb) => JSON.parse(JSON.stringify(sb.lerFavoritos_()));
const salvar = (sb, ids) => JSON.parse(sb.handleSalvarFavoritos({ parameter: { ids: typeof ids === 'string' ? ids : JSON.stringify(ids) } }).getContent());

test('Favoritos.gs: sem a aba, a lista é vazia; salvar cria a aba e devolve a lista na ordem (sem repetidos, sem espaços)', () => {
  const sb = sandboxVazio();
  assert.deepEqual(ler(sb), []);
  const r = salvar(sb, ['usa:VNOM', ' acoes:BBAS3 ', 'usa:VNOM', 'rf:BRSTNCLF1RI1']);
  assert.equal(r.ok, true);
  assert.deepEqual(r.favoritos, ['usa:VNOM', 'acoes:BBAS3', 'rf:BRSTNCLF1RI1']);
  assert.deepEqual(ler(sb), ['usa:VNOM', 'acoes:BBAS3', 'rf:BRSTNCLF1RI1']);
  const aba = sb.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Auxiliar_favoritos');
  assert.deepEqual(JSON.parse(JSON.stringify(aba.getRange(1, 1, 1, 2).getValues()[0])), ['Ativo (classe:ref)', 'Salvo em']);
});

test('Favoritos.gs: cada salvamento substitui a lista inteira (nova ordem, e o que saiu some da aba)', () => {
  const sb = sandboxVazio();
  salvar(sb, ['a:1', 'b:2', 'c:3']);
  salvar(sb, ['c:3', 'a:1']);
  assert.deepEqual(ler(sb), ['c:3', 'a:1']);
  salvar(sb, []);
  assert.deepEqual(ler(sb), []);
});

test('Favoritos.gs: entrada inválida é recusada com mensagem clara e NÃO apaga o que estava salvo', () => {
  const sb = sandboxVazio();
  salvar(sb, ['acoes:BBAS3']);
  for (const [bruto, msg] of [['nao-e-json', /JSON/], ['{"a":1}', /array/], ['[1]', /texto/], ['["sem-classe"]', /inválido/], [JSON.stringify(Array.from({ length: 201 }, (_, i) => `a:${i}`)), /máximo/]]) {
    const r = salvar(sb, bruto);
    assert.equal(r.ok, false, bruto);
    assert.match(r.erro, msg);
  }
  assert.deepEqual(ler(sb), ['acoes:BBAS3']);
});

test('Router.gs: doPost despacha action=salvarFavoritos', () => {
  const texto = fs.readFileSync(path.join(GAS, 'Router.gs'), 'utf8');
  assert.match(texto, /action === 'salvarFavoritos'[\s\S]{0,80}handleSalvarFavoritos\(e\)/);
});

test('Home.gs (dados reais): a resposta da Início traz `favoritos` (array)', async (t) => {
  if (!fs.existsSync(FIXTURES_PATH)) { t.skip('tests/harness/fixtures.json ausente'); return; }
  const { home } = await carregarTodasAsTelasComDadosReais({ fixturesPath: FIXTURES_PATH });
  assert.ok(Array.isArray(home.favoritos));
  assert.equal(home.avisos && home.avisos.favoritos, undefined);
});
