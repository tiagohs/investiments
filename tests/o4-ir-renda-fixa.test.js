// 06/10/2026 (A-82): módulo único de IR/IOF no front (assets/js/ir-renda-fixa.js), espelho de RendaFixaIR.gs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { aliquotaIrPorDias, aliquotaIrPorMeses, aliquotaIofPorDias, impostoDoLote } from '../assets/js/ir-renda-fixa.js';
import { aliquotaIr } from '../assets/js/pages/simulador-dividas-calc.js';

function gs() {
  const sb = { console, Utilities: {}, Session: { getScriptTimeZone: () => 'America/Sao_Paulo' } };
  vm.createContext(sb);
  new vm.Script(fs.readFileSync(new URL('../apps-script/RendaFixaIR.gs', import.meta.url), 'utf8'), { filename: 'RendaFixaIR.gs' }).runInContext(sb);
  return sb;
}

test('IR e IOF do front dão EXATAMENTE o mesmo que o GS, dia a dia (0 a 2000 dias)', () => {
  const sb = gs();
  for (let d = 0; d <= 2000; d++) {
    assert.equal(aliquotaIrPorDias(d), sb.aliquotaIRRendaFixa_(d), `IR ${d}d`);
    assert.equal(aliquotaIofPorDias(d), sb.aliquotaIofRendaFixa_(d), `IOF ${d}d`);
  }
});

test('faixas do IR e IOF regressivo; meses (simulador) usam a mesma tabela', () => {
  assert.deepEqual([180, 181, 360, 361, 720, 721].map(aliquotaIrPorDias), [0.225, 0.2, 0.2, 0.175, 0.175, 0.15]);
  assert.equal(aliquotaIofPorDias(1), 0.96);
  assert.equal(aliquotaIofPorDias(28), 0.06);
  assert.equal(aliquotaIofPorDias(29), 0.03);
  assert.equal(aliquotaIofPorDias(30), 0);
  for (const m of [0, 3, 5.9, 6, 11.8, 12, 23.6, 24, 30]) {
    assert.equal(aliquotaIr(m), aliquotaIrPorMeses(m));
    assert.equal(aliquotaIrPorMeses(m), aliquotaIrPorDias(m * 30.4375));
  }
});

test('impostoDoLote: IOF antes do IR; isento e sem rendimento não pagam', () => {
  const l = impostoDoLote({ rendimento: 100, dias: 10 });
  assert.equal(l.iof, 66);
  assert.ok(Math.abs(l.ir - 34 * 0.225) < 1e-9);
  assert.ok(Math.abs(l.liquido - (100 - 66 - 34 * 0.225)) < 1e-9);
  assert.deepEqual(impostoDoLote({ rendimento: 100, dias: 10, isento: true }), { iof: 0, ir: 0, total: 0, liquido: 100 });
  assert.equal(impostoDoLote({ rendimento: -5, dias: 400 }).total, 0);
  assert.ok(Math.abs(impostoDoLote({ rendimento: 100, dias: 400 }).ir - 17.5) < 1e-9);
});

test('a tabela de IR não está mais copiada em analise-grafico.js nem no simulador', () => {
  for (const f of ['../assets/js/analise-grafico.js', '../assets/js/pages/simulador-dividas-calc.js']) {
    const t = fs.readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.doesNotMatch(t, /0\.225/, f);
    assert.match(t, /ir-renda-fixa\.js/, f);
  }
});
