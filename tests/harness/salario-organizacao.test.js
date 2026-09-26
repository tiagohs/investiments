// tests/harness/salario-organizacao.test.js
//
// 26/09/2026: apps-script/Salario.gs (aba "Salário e investimentos" da
// Organização Financeira).
//  1) Planilha REAL (fixtures.json, se existir): base = DM!N11/Q11/S11, e o
//     investido por mês = a soma dos fluxos da mesma série da Início.
//  2) Gravação numa planilha falsa em memória (valores inventados).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { montarSandboxComFixtures_ } from './gas-vm-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES = path.join(__dirname, 'fixtures.json');
const semRealm = (o) => JSON.parse(JSON.stringify(o));
const perto = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;

test('Salário (planilha real): base = DM!N11/Q11/S11 e investido por mês = soma dos fluxos da série da Início', (t) => {
  if (!fs.existsSync(FIXTURES)) { t.skip('sem fixtures.json'); return; }
  const raw = JSON.parse(fs.readFileSync(FIXTURES, 'utf8'));
  const sb = { console: { ...console, log() {} } };
  vm.createContext(sb);
  montarSandboxComFixtures_(raw, sb);
  for (const f of fs.readdirSync(path.join(ROOT, 'apps-script')).filter((x) => x.endsWith('.gs')).sort()) {
    new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8'), { filename: f }).runInContext(sb);
  }
  const ss = sb.SpreadsheetApp.getActiveSpreadsheet();
  const dm = ss.getSheetByName('Distribuição e Metas');
  const r = semRealm(sb.montarTelaSalario_(ss, new sb.Date()));
  const erros = [];
  if (!perto(r.base.liquido, dm.getRange('N11').getValue())) erros.push('líquido != N11');
  if (!perto(r.base.percentualInvestir, dm.getRange('Q11').getValue(), 1e-9)) erros.push('% != Q11');
  if (!perto(r.base.aporteMeta, r.base.liquido * r.base.percentualInvestir)) erros.push('S11 != N11*Q11');
  const serie = semRealm(sb.montarSerieHistoricoInicio_());
  const porMes = {};
  serie.forEach((p) => { const m = p.data.slice(0, 7); porMes[m] = (porMes[m] || 0) + (p.fluxoCaixaPatrimonio || 0); });
  r.mensal.forEach((m) => { if (!perto(m.total, porMes[m.mes] || 0)) erros.push(`${m.mes}: total ${m.total} x série ${porMes[m.mes]}`); });
  r.mensal.forEach((m) => { if (!perto(m.total, m.longoPrazo + m.reserva)) erros.push(`${m.mes}: total != longo prazo + reserva`); });
  assert.equal(r.mensal.length, 36);
  assert.equal(r.mensal.filter((m) => m.parcial).length, 1);
  t.diagnostic(`${r.mensal.length} meses · proventos em ${r.mensal.filter((m) => m.proventos > 0).length} deles · avisos: ${JSON.stringify(r.avisos || {})}`);
  assert.deepEqual(erros, []);
});

// --- planilha falsa ---------------------------------------------------------
function criarFalsa() {
  const abas = new Map();
  const nova = (nome) => {
    const cel = new Map();
    const col = (l) => l.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    const aba = {
      cel,
      getLastRow() { let m = 0; for (const [k, v] of cel) if (v !== '' && v != null) m = Math.max(m, Number(k.split(',')[0])); return m; },
      getRange(a, b, nr, nc) {
        let r0; let c0; let r1; let c1;
        if (typeof a === 'string') { const m = a.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/); c0 = col(m[1]); r0 = +m[2]; c1 = m[3] ? col(m[3]) : c0; r1 = m[4] ? +m[4] : r0; } else { r0 = a; c0 = b; r1 = a + (nr || 1) - 1; c1 = b + (nc || 1) - 1; }
        return {
          getValues() { const o = []; for (let r = r0; r <= r1; r++) { const l = []; for (let c = c0; c <= c1; c++) { const v = cel.get(`${r},${c}`); l.push(typeof v === 'string' ? v.replace(/^'/, '') : (v ?? '')); } o.push(l); } return o; },
          getValue() { return this.getValues()[0][0]; },
          setValues(v) { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cel.set(`${r},${c}`, v[r - r0][c - c0]); },
          setValue(v) { cel.set(`${r0},${c0}`, v); },
        };
      },
      deleteRow(linha) {
        const novas = new Map();
        for (const [k, v] of cel) { const [r, c] = k.split(',').map(Number); if (r === linha) continue; novas.set(`${r > linha ? r - 1 : r},${c}`, v); }
        cel.clear(); novas.forEach((v, k) => cel.set(k, v));
      },
      setFrozenRows() {},
    };
    return aba;
  };
  const ss = { getSheetByName: (n) => abas.get(n) || null, insertSheet: (n) => { const a = nova(n); abas.set(n, a); return a; } };
  const dm = ss.insertSheet('Distribuição e Metas');
  dm.getRange('N11:S11').setValues([[10000, '', '', 0.2, '', 2000]]);
  dm.getRange('K18:Q18').setValues([[1000, 0.25, 0.06, 900000, '', '', 50000]]);
  return ss;
}
function sandboxGs(ss) {
  const sb = {
    console: { ...console, log() {} }, jsonOut: (o) => o,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    // Despesas/série/proventos não fazem parte deste teste
    lerDespesasOrganizacao_: () => ({ despesas: { totalReal: 5000, totalComFolga: 5500 }, reserva: { atual: 30000, meta: 40000 } }),
    montarSerieHistoricoInicio_: () => [
      { data: '2026-02-03', fluxoCaixaPatrimonio: 1000, fluxoCaixaLongoPrazo: 1000, fluxoCaixaRendaEmergencial: 0 },
      { data: '2026-02-20', fluxoCaixaPatrimonio: 500, fluxoCaixaLongoPrazo: 0, fluxoCaixaRendaEmergencial: 500 },
      { data: '2026-03-10', fluxoCaixaPatrimonio: -2000, fluxoCaixaLongoPrazo: 0, fluxoCaixaRendaEmergencial: -2000 },
    ],
    montarTelaProventosComCache_: () => ({ recebidos: [{ data: '2026-02-15', valor: 120 }, { data: '2025-01-15', valor: 99 }] }),
  };
  vm.createContext(sb);
  new vm.Script('this.Date = Date; this.JSON = JSON;').runInContext(sb);
  new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', 'Salario.gs'), 'utf8'), { filename: 'Salario.gs' }).runInContext(sb);
  return sb;
}
const HOJE = () => new Date(2026, 2, 20, 12);

test('Salario.gs: tela lê a base da DM, soma investido/proventos por mês (36 meses, o atual parcial) e sem aba Salário não quebra', () => {
  const ss = criarFalsa();
  const sb = sandboxGs(ss);
  const r = semRealm(sb.montarTelaSalario_(ss, HOJE()));
  assert.deepEqual(r.base, { liquido: 10000, percentualInvestir: 0.2, aporteMeta: 2000 });
  assert.equal(r.patrimonio.desejado, 900000);
  assert.equal(r.mensal.length, 36);
  const fev = r.mensal.find((m) => m.mes === '2026-02');
  assert.deepEqual([fev.total, fev.longoPrazo, fev.reserva, fev.proventos, fev.parcial], [1500, 1000, 500, 120, false]);
  const mar = r.mensal.find((m) => m.mes === '2026-03');
  assert.equal(mar.parcial, true);
  assert.equal(mar.reserva, -2000);
  assert.deepEqual(r.pagamentos, []);
});

test('Salario.gs: salvar pagamento cria a aba, grava mês como texto, substitui mesmo mês+tipo, "usar como base" atualiza N11; excluir apaga', () => {
  const ss = criarFalsa();
  const sb = sandboxGs(ss);
  const pag = { mes: '2026-02', tipo: 'Mensal', dataCredito: '2026-03-05', salarioBase: 10000, outrosVencimentos: 100, totalVencimentos: 10100, inss: 900, irrf: 1500, outrosDescontos: 250, totalDescontos: 2650, liquido: 7450, fgts: 800, itens: [{ codigo: '1', descricao: 'Salário', vencimento: 10000 }] };
  let r = semRealm(sb.salvarPagamentoSalario_(ss, pag, { usarComoBase: true }, HOJE()));
  assert.equal(r.ok, true, r.erro);
  const aba = ss.getSheetByName('Salário');
  assert.equal(aba.getRange('A1').getValue(), 'Mês');
  assert.equal(aba.cel.get('2,1'), "'2026-02", 'mês gravado como texto (o Sheets não vira data)');
  assert.equal(r.pagamentos.length, 1);
  assert.equal(r.pagamentos[0].liquido, 7450);
  assert.equal(r.pagamentos[0].itens[0].descricao, 'Salário');
  assert.equal(r.base.liquido, 7450, 'N11 atualizado');
  assert.equal(ss.getSheetByName('Distribuição e Metas').getRange('N11').getValue(), 7450);

  r = semRealm(sb.salvarPagamentoSalario_(ss, { ...pag, liquido: 7500 }, {}, HOJE()));
  assert.equal(r.pagamentos.length, 1, 'mesmo mês + tipo substitui');
  assert.equal(r.pagamentos[0].liquido, 7500);
  assert.equal(r.base.liquido, 7450, 'sem "usar como base" a N11 fica');

  r = semRealm(sb.salvarPagamentoSalario_(ss, { mes: '2026-11', tipo: '13º (1ª parcela)', status: 'Previsto', liquido: 5000, percentualInvestir: 0.5 }, { usarComoBase: true }, HOJE()));
  assert.equal(r.pagamentos.length, 2);
  assert.equal(r.pagamentos[0].status, 'Previsto');
  assert.equal(r.base.liquido, 7450, 'previsto nunca vira base');

  r = semRealm(sb.excluirPagamentoSalario_(ss, '2026-02', 'Mensal', HOJE()));
  assert.deepEqual(r.pagamentos.map((p) => p.tipo), ['13º (1ª parcela)']);
  assert.equal(semRealm(sb.excluirPagamentoSalario_(ss, '2026-02', 'Mensal', HOJE())).ok, false);
});

test('Salario.gs: validações e salvar a base (líquido e % em fração)', () => {
  const ss = criarFalsa();
  const sb = sandboxGs(ss);
  const falha = (p) => semRealm(sb.salvarPagamentoSalario_(ss, p, {}, HOJE())).erro;
  assert.match(falha({ mes: 'xx', liquido: 1 }), /mês inválido/);
  assert.match(falha({ mes: '2026-01', tipo: 'Qualquer', liquido: 1 }), /tipo inválido/);
  assert.match(falha({ mes: '2026-01' }), /líquido/);
  assert.match(falha({ mes: '2026-01', liquido: 10, inss: -1 }), /inválido em inss/);
  assert.match(falha({ mes: '2026-01', liquido: 10, percentualInvestir: 3 }), /% para investir/);
  let r = semRealm(sb.salvarSalarioBase_(ss, '12000', '0.25'));
  assert.equal(r.ok, true);
  assert.equal(ss.getSheetByName('Distribuição e Metas').getRange('N11').getValue(), 12000);
  assert.equal(ss.getSheetByName('Distribuição e Metas').getRange('Q11').getValue(), 0.25);
  r = semRealm(sb.salvarSalarioBase_(ss, '', '1.5'));
  assert.match(r.erro, /% pra investir inválido/);
  assert.match(semRealm(sb.salvarSalarioBase_(ss, '-5', '')).erro, /salário líquido inválido/);
  assert.match(semRealm(sb.salvarSalarioBase_(ss, '', '')).erro, /nada pra salvar/);
});
