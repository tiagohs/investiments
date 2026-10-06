// tests/harness/o4-cdi-12m.test.js
//
// 06/10/2026 (A-77): o CDI 12m da tela do ativo (referencias.cdi12m, %) e o do Macro (juros.cdi12m, fração) saem
// da MESMA função (BackfillIndices.gs!cdiAcumulado12m_). Dados inventados + (com fixtures) conferência real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { montarSandboxComFixtures_ } from './gas-vm-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAS_DIR = path.resolve(__dirname, '..', '..', 'apps-script');
const FIXTURES = path.join(__dirname, 'fixtures.json');

function sandbox(fixtures = {}) {
  const sb = { console: { ...console, log() {} } };
  vm.createContext(sb);
  montarSandboxComFixtures_(fixtures, sb);
  for (const f of fs.readdirSync(GAS_DIR).filter((x) => x.endsWith('.gs')).sort()) {
    new vm.Script(fs.readFileSync(path.join(GAS_DIR, f), 'utf8'), { filename: f }).runInContext(sb);
  }
  return sb;
}

test('cdiAcumulado12mDeLinhas_: compõe 1 valor por dia na janela de 365 dias; <200 dias = null; ignora outros índices e dias repetidos', () => {
  const sb = sandbox();
  const agora = new sb.Date('2026-10-06T15:00:00Z');
  const linhas = [];
  for (let i = 0; i < 300; i++) {
    const d = new sb.Date(agora.getTime() - i * 86400000);
    linhas.push([d, 'CDI', 0.05]);
    if (i % 50 === 0) linhas.push([d, 'CDI', 0.05]); // repetida
    linhas.push([d, 'SELIC', 0.9]); // outro índice
  }
  linhas.push([new sb.Date(agora.getTime() - 400 * 86400000), 'CDI', 5]); // fora da janela
  const r = sb.cdiAcumulado12mDeLinhas_(linhas, agora);
  assert.equal(r.dias, 300);
  assert.equal(r.fracao, Math.round((1.0005 ** 300 - 1) * 10000) / 10000);
  assert.equal(r.ate, '2026-10-06');
  assert.equal(sb.cdiAcumulado12mDeLinhas_(linhas.slice(0, 100), agora), null);
});

test('Ativo e Macro devolvem o MESMO CDI 12m (aba com linhas inventadas)', () => {
  const agora = Date.now();
  const linhas = [['Data', 'Índice', 'Valor']];
  for (let i = 0; i < 260; i++) linhas.push([{ __date__: new Date(agora - i * 86400000).toISOString() }, 'CDI', 0.0525]);
  const sb = sandbox({ 'aux_historico-indices': { linhas, lastRow: linhas.length } });
  const ss = sb.SpreadsheetApp.getActiveSpreadsheet();
  const macro = sb.macroCdi12m_(ss, new sb.Date());
  const ativo = sb.referenciasDeMercado_();
  assert.ok(macro > 0);
  assert.equal(ativo.cdi12m, Math.round(macro * 10000) / 100);
});

test('fixtures: Ativo e Macro batem entre si com os dados reais', { skip: !fs.existsSync(FIXTURES) }, () => {
  const sb = sandbox(JSON.parse(fs.readFileSync(FIXTURES, 'utf8')));
  const macro = sb.macroCdi12m_(sb.SpreadsheetApp.getActiveSpreadsheet(), new sb.Date());
  const ativo = sb.referenciasDeMercado_();
  assert.ok(macro > 0.03 && macro < 0.4, 'valor plausível');
  assert.equal(ativo.cdi12m, Math.round(macro * 10000) / 100);
});
