// tests/harness/incorporacoes.test.js
//
// 27/09/2026: apps-script/Incorporacoes.gs - tirar de vez da planilha um
// ticker incorporado (STR -> VNOM).
//  1) Planilha REAL (fixtures.json, se existir): simula e aplica numa cópia
//     em memória - nada é gravado em arquivo.
//  2) Planilha falsa com tickers inventados (o repositório é público): os
//     casos em que o script se recusa a mexer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { montarSandboxComFixtures_ } from './gas-vm-harness.mjs';
import { CHECAGENS_QUALIDADE } from './qualidade-dados.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES = path.join(__dirname, 'fixtures.json');
const semRealm = (o) => JSON.parse(JSON.stringify(o));

function carregarGs(sb, arquivos) {
  for (const f of arquivos) new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8'), { filename: f }).runInContext(sb);
}

test('STR (planilha real): simular não mexe; aplicar tira as linhas de STR, mantém as VNOM e some a venda falsa', (t) => {
  if (!fs.existsSync(FIXTURES)) { t.skip('sem fixtures.json'); return; }
  const raw = JSON.parse(fs.readFileSync(FIXTURES, 'utf8'));
  const sb = { console: { ...console, log() {} } };
  vm.createContext(sb);
  montarSandboxComFixtures_(raw, sb);
  sb.SpreadsheetApp.flush = () => {};
  carregarGs(sb, ['Incorporacoes.gs']);
  const ss = sb.SpreadsheetApp.getActiveSpreadsheet();
  const inc = semRealm(sb.INCORPORACOES_[0]);
  const aba = ss.getSheetByName('Transações - USA');
  const colA = () => aba.getRange(7, 1, 900, 1).getValues().map((l) => String(l[0] || '').trim());
  const antesStr = colA().filter((x) => x === 'STR').length;
  if (!antesStr) { t.skip('a planilha exportada já não tem STR'); return; }
  const antesVnom = colA().filter((x) => x === 'VNOM').length;
  const sim = semRealm(sb.limparIncorporacao_(ss, inc, false));
  assert.deepEqual(sim.problemas, []);
  assert.equal(sim.aplicado, false);
  assert.equal(colA().filter((x) => x === 'STR').length, antesStr, 'simular não mexe');
  assert.ok(sim.transacoes.removidas.every((r) => r.tipo === 'Venda' ? r.vendaFalsa : !!r.espelho), 'cada compra de STR tem o espelho de VNOM; a venda é a falsa, depois da incorporação');
  const r = semRealm(sb.limparIncorporacao_(ss, inc, true));
  assert.equal(r.aplicado, true);
  assert.equal(colA().filter((x) => x === 'STR').length, 0);
  assert.equal(colA().filter((x) => x === 'VNOM').length, antesVnom, 'VNOM intacta');
  const hist = ss.getSheetByName('aux_historico-patrimonio');
  assert.equal(hist.getRange(2, 2, hist.getLastRow() - 1, 1).getValues().filter((l) => l[0] === 'STR').length, 0);
  const prov = ss.getSheetByName('Proventos - USA');
  assert.equal(prov.getRange(8, 3, prov.getLastRow() - 7, 1).getValues().filter((l) => l[0] === 'STR').length, 0);
  // a checagem da venda com preço absurdo passa nos dados limpos
  const venda = CHECAGENS_QUALIDADE.find((c) => c.id === 'vendaPrecoAbsurdo');
  const limpo = JSON.parse(JSON.stringify(raw));
  limpo['Transações - USA'].linhas = limpo['Transações - USA'].linhas.filter((l, i) => i < 6 || String(l[0] || '').trim() !== 'STR');
  assert.deepEqual(venda.rodar({ fixtures: limpo }).filter((m) => /STR/.test(m)), []);
  t.diagnostic(`${r.transacoes.removidas.length} linhas de STR em Transações - USA, ${r.historico.removidas} no histórico, ${r.proventos.trocados.length} provento(s) passados pra VNOM`);
});

// --- planilha falsa ---------------------------------------------------------
function planilha(transacoes, historico = [], proventos = []) {
  const abas = {};
  const nova = (nome, primeira, linhas) => {
    const cel = linhas.map((l) => [...l]);
    abas[nome] = {
      cel,
      getLastRow: () => primeira + cel.length - 1,
      getRange(r, c, nr = 1, nc = 1) {
        return {
          getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => ((cel[r - primeira + i] || [])[c - 1 + j] ?? ''))),
          setValues: (v) => v.forEach((l, i) => l.forEach((x, j) => { (cel[r - primeira + i] = cel[r - primeira + i] || [])[c - 1 + j] = x; })),
          setValue: (x) => { (cel[r - primeira] = cel[r - primeira] || [])[c - 1] = x; },
        };
      },
    };
  };
  nova('Transações - USA', 7, transacoes);
  nova('aux_historico-patrimonio', 2, historico);
  nova('Proventos - USA', 8, proventos);
  return { abas, getSheetByName: (n) => abas[n] || null };
}

function sandbox() {
  const sb = { console, SpreadsheetApp: { flush() {} }, Logger: { log() {} } };
  vm.createContext(sb);
  carregarGs(sb, ['Incorporacoes.gs']);
  return sb;
}
const INC = { antigo: 'OLDX', novo: 'NEWX', fator: 0.5, data: '2025-03-01' };

test('incorporação (planilha falsa): tira o antigo, mantém a ordem dos outros e troca o ticker do provento', () => {
  const sb = sandbox();
  const ss = planilha([
    ['OLDX', '2025-01-10', 'Compra', 10, 2, 0],
    ['NEWX', '2025-01-10', 'Compra', 20, 1, 0],
    ['ABCD', '2025-02-01', 'Compra', 5, 3, 0],
    ['NEWX', '2025-04-01', 'Compra', 22, 1, 0],
    ['OLDX', '2025-06-01', 'Venda', 90, 2, 0],
  ], [['2025-01-10', 'OLDX', 'USA', 2, 99, 198, '', ''], ['2025-01-10', 'NEWX', 'USA', 1, 20, 20, '', '']], [['2025-02-01', '2025-02-10', 'OLDX', 'Dividendo', 2, 0.1, 0.2]]);
  const r = semRealm(sb.limparIncorporacao_(ss, INC, true));
  assert.deepEqual(r.problemas, []);
  assert.deepEqual(ss.abas['Transações - USA'].cel.map((l) => l[0]), ['NEWX', 'ABCD', 'NEWX', '', '']);
  assert.deepEqual(ss.abas['aux_historico-patrimonio'].cel.map((l) => l[1]), ['NEWX', '']);
  assert.equal(ss.abas['Proventos - USA'].cel[0][2], 'NEWX');
  const de2 = semRealm(sb.limparIncorporacao_(ss, INC, true));
  assert.equal(de2.transacoes.removidas.length, 0, 'rodar de novo não acha mais nada');
});

test('incorporação (planilha falsa): sem a compra espelho ou com venda antes da incorporação, não mexe em nada', () => {
  const sb = sandbox();
  const sem = planilha([['OLDX', '2025-01-10', 'Compra', 10, 2, 0], ['ABCD', '2025-02-01', 'Compra', 5, 3, 0]]);
  const r = semRealm(sb.limparIncorporacao_(sem, INC, true));
  assert.equal(r.ok, false);
  assert.match(r.problemas[0], /sem a compra espelho de NEWX/);
  assert.equal(sem.abas['Transações - USA'].cel[0][0], 'OLDX', 'não mexeu');
  const antes = planilha([['OLDX', '2025-01-10', 'Compra', 10, 2, 0], ['NEWX', '2025-01-10', 'Compra', 20, 1, 0], ['OLDX', '2025-02-01', 'Venda', 12, 1, 0]]);
  const r2 = semRealm(sb.limparIncorporacao_(antes, INC, true));
  assert.equal(r2.ok, false);
  assert.match(r2.problemas[0], /ANTES da incorporação/);
});
