// tests/harness/indices-repetidos.test.js
//
// 27/09/2026: IPCA de 01/08/2026 gravado 6x em aux_historico-indices (a
// atualização diária regravava o mês). Datas e valores inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

function montar(linhas) {
  const cel = linhas.map((l) => [...l]);
  const aba = {
    getLastRow: () => cel.length + 1,
    getRange(r, c, nr, nc) {
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (cel[r - 2 + i] || [])[c - 1 + j] ?? '')),
        setValues: (v) => v.forEach((l, i) => l.forEach((x, j) => { (cel[r - 2 + i] = cel[r - 2 + i] || [])[c - 1 + j] = x; })),
      };
    },
  };
  const sb = { console, Logger: { log() {} }, SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => aba }), flush() {} } };
  vm.createContext(sb);
  new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', 'BackfillIndices.gs'), 'utf8'), { filename: 'BackfillIndices.gs' }).runInContext(sb);
  return { sb, cel };
}

test('atualização diária não regrava o mês do IPCA que já está salvo (o BCB devolve o mês inteiro)', () => {
  const agosto = new Date(2026, 7, 1);
  const { sb, cel } = montar([[new Date(2026, 6, 1), 'IPCA', 0.2], [agosto, 'IPCA', -0.1]]);
  sb.buscarTaxasBcbComoLinhas_ = (nome) => (nome === 'IPCA' ? [[new Date(2026, 7, 1), 'IPCA', -0.1]] : []);
  const r = sb.atualizarTaxasBcbIncremental_({ IPCA: agosto });
  assert.equal(r.linhasNovas, 0);
  assert.equal(cel.length, 2);
  sb.buscarTaxasBcbComoLinhas_ = (nome) => (nome === 'IPCA' ? [[new Date(2026, 7, 1), 'IPCA', -0.1], [new Date(2026, 8, 1), 'IPCA', 0.3]] : []);
  assert.equal(sb.atualizarTaxasBcbIncremental_({ IPCA: agosto }).linhasNovas, 1, 'setembro entra, agosto não');
});

test('removerIndicesRepetidos: mostra sem mexer; com true, fica uma linha por índice + data', () => {
  const d = new Date(2026, 7, 1);
  const { sb, cel } = montar([[new Date(2026, 6, 1), 'IPCA', 0.2], [d, 'IPCA', -0.1], [d, 'CDI', 0.05], [d, 'IPCA', -0.1], [d, 'IPCA', -0.1]]);
  assert.equal(sb.removerIndicesRepetidos().repetidas, 2);
  assert.equal(cel.filter((l) => l[1] === 'IPCA').length, 4, 'sem o true não mexe');
  const r = sb.removerIndicesRepetidos(true);
  assert.equal(r.aplicado, true);
  assert.deepEqual(cel.map((l) => l[1]), ['IPCA', 'IPCA', 'CDI', '', '']);
});
