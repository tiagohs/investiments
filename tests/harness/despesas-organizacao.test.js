// tests/harness/despesas-organizacao.test.js
//
// 26/09/2026: tela Organização Financeira (apps-script/Despesas.gs +
// assets/js/pages/organizacao-calc.js).
//
//  1) Com a planilha REAL (fixtures.json, se existir): as contas da tela
//     (simulador) dão exatamente os números que a planilha calcula - custo de
//     vida, base e meta da reserva, renda e patrimônio desejado, aporte.
//  2) Gravação numa planilha FALSA em memória (nomes e valores inventados),
//     que imita o Sheets no que importa aqui: inserir/remover linhas desloca
//     as referências (inclusive a de 'Distribuição e Metas'!K11 pro total) e
//     as fórmulas usadas são calculadas de verdade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { montarSandboxComFixtures_ } from './gas-vm-harness.mjs';
import { calcularOrganizacao, rascunhoDoServidor, payloadRascunho, categoriaSugerida } from '../../assets/js/pages/organizacao-calc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES = path.join(__dirname, 'fixtures.json');
const perto = (a, b, tol = 0.005) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------------------
// 1) Dados reais
// ---------------------------------------------------------------------------
test('Organização (planilha real): simulador da tela = números da planilha (custo de vida, meta da reserva, patrimônio desejado, aporte)', (t) => {
  if (!fs.existsSync(FIXTURES)) { t.skip('sem fixtures.json'); return; }
  const raw = JSON.parse(fs.readFileSync(FIXTURES, 'utf8'));
  if (!raw['Despesas Essenciais']) { t.skip('fixtures.json sem a aba Despesas Essenciais - rode extrair-fixtures.py de novo'); return; }
  const sb = { console: { ...console, log() {} } };
  vm.createContext(sb);
  montarSandboxComFixtures_(raw, sb);
  for (const f of fs.readdirSync(path.join(ROOT, 'apps-script')).filter((x) => x.endsWith('.gs')).sort()) {
    new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8'), { filename: f }).runInContext(sb);
  }
  const r = JSON.parse(JSON.stringify(sb.lerDespesasOrganizacao_(sb.SpreadsheetApp.getActiveSpreadsheet())));
  const c = calcularOrganizacao(rascunhoDoServidor(r), { reserva: r.reserva, salario: r.salario, patrimonio: r.patrimonio });
  const erros = [];
  const conf = (nome, tela, planilha) => { if (!perto(tela, planilha)) erros.push(`${nome}: tela ${tela} x planilha ${planilha}`); };
  conf('gasto real (B do Total)', c.totalReal, r.despesas.totalReal);
  conf('custo de vida (C do Total)', c.totalComFolga, r.despesas.totalComFolga);
  conf('média de gastos da DM (K11)', c.totalComFolga, r.reserva.mediaGastos);
  conf('base da reserva (M11)', c.base, r.reserva.base);
  conf('meta da reserva (M12)', c.meta, r.reserva.meta);
  conf('renda desejada (M19)', c.rendaDesejada, r.patrimonio.rendaDesejada);
  conf('patrimônio desejado (N18)', c.patrimonioDesejado, r.patrimonio.desejado);
  conf('aporte (S11)', c.salario.aporte, r.salario.aporte);
  r.despesas.itens.forEach((i) => {
    const mensal = i.frequencia === 'Anual' ? i.valor / 12 : i.valor;
    conf(`"${i.nome}" com folga (C${i.linha})`, mensal * (1 + r.despesas.folga), i.comFolga);
  });
  const semSugestao = r.despesas.itens.filter((i) => !i.categoria && !categoriaSugerida(i.nome)).map((i) => i.nome);
  t.diagnostic(`${r.despesas.itens.length} despesas · cobertura ${c.cobertura?.toFixed(2)} meses · sem categoria sugerida: ${semSugestao.join(', ') || 'nenhuma'}`);
  assert.deepEqual(erros, []);
});

// ---------------------------------------------------------------------------
// 2) Planilha falsa
// ---------------------------------------------------------------------------
const COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const colNum = (l) => l.split('').reduce((n, ch) => n * 26 + COLS.indexOf(ch) + 1, 0);

function criarPlanilhaFalsa({ itens, folga = 0.1, meses = 6, sobra = 0.1, reservaAtual = 5000 }) {
  const abas = new Map();
  const ss = {
    getSheetByName: (n) => abas.get(n) || null,
    insertSheet: (n) => { const a = criarAba(n); abas.set(n, a); return a; },
  };

  function criarAba(nome) {
    const cel = new Map(); // "r,c" -> valor | { f }
    const k = (r, c) => `${r},${c}`;
    const aba = {
      nome, cel,
      getLastRow() { let m = 0; for (const key of cel.keys()) { const [r] = key.split(',').map(Number); const v = cel.get(key); if (v !== '' && v != null) m = Math.max(m, r); } return m; },
      ler(r, c) {
        const v = cel.get(k(r, c));
        if (v && typeof v === 'object' && 'f' in v) return avaliar(v.f, aba);
        return v == null ? '' : v;
      },
      getRange(a, b, nr, nc) {
        let r0; let c0; let r1; let c1;
        if (typeof a === 'string') {
          const m = a.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
          c0 = colNum(m[1]); r0 = Number(m[2]); c1 = m[3] ? colNum(m[3]) : c0; r1 = m[4] ? Number(m[4]) : r0;
        } else { r0 = a; c0 = b; r1 = a + (nr || 1) - 1; c1 = b + (nc || 1) - 1; }
        const cada = (fn) => { for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) fn(r, c); };
        return {
          getValues() { const out = []; for (let r = r0; r <= r1; r += 1) { const l = []; for (let c = c0; c <= c1; c += 1) l.push(aba.ler(r, c)); out.push(l); } return out; },
          getValue() { return aba.ler(r0, c0); },
          setValues(v) { cada((r, c) => cel.set(k(r, c), v[r - r0][c - c0])); },
          setValue(v) { cel.set(k(r0, c0), v); },
          setFormulas(v) { cada((r, c) => cel.set(k(r, c), { f: v[r - r0][c - c0] })); },
          setFormula(f) { cel.set(k(r0, c0), { f }); },
          copyFormatToRange() { aba.formatoCopiado = true; },
        };
      },
      insertRowsBefore(linha, n) { deslocar(aba, linha, n); },
      deleteRows(linha, n) {
        for (let r = linha; r < linha + n; r += 1) for (let c = 1; c <= 26; c += 1) cel.delete(k(r, c));
        deslocar(aba, linha + n, -n);
      },
    };
    return aba;
  }

  // move as células e corrige as referências (desta aba e das outras que apontam pra ela)
  function deslocar(aba, aPartirDe, n) {
    const novas = new Map();
    for (const [key, v] of aba.cel) {
      const [r, c] = key.split(',').map(Number);
      novas.set(`${r >= aPartirDe ? r + n : r},${c}`, v);
    }
    aba.cel.clear();
    novas.forEach((v, key) => aba.cel.set(key, v));
    const ajustar = (f, soDaAba) => f.replace(/('[^']+'!)?(\$?)([A-Z]+)(\$?)(\d+)/g, (m, pref, d1, col, d2, row) => {
      const alvo = pref ? pref.slice(1, -2) : soDaAba;
      if (alvo !== aba.nome) return m;
      const rr = Number(row);
      return `${pref || ''}${d1}${col}${d2}${rr >= aPartirDe ? rr + n : rr}`;
    });
    for (const outra of abas.values()) {
      for (const [key, v] of outra.cel) if (v && typeof v === 'object' && 'f' in v) outra.cel.set(key, { f: ajustar(v.f, outra.nome) });
    }
  }

  function avaliar(f, aba) {
    const n = (v) => (typeof v === 'number' ? v : Number(v) || 0);
    const ref = (s, a = aba) => { const m = s.replace(/\$/g, '').match(/^([A-Z]+)(\d+)$/); return n(a.ler(Number(m[2]), colNum(m[1]))); };
    const faixa = (col, r0, r1, a = aba) => { const out = []; for (let r = r0; r <= r1; r += 1) out.push(a.ler(r, colNum(col))); return out; };
    let m;
    if ((m = f.match(/^=B(\d+)\+\(B\1\*(\$C\$\d+)\)$/))) return ref(`B${m[1]}`) * (1 + ref(m[2]));
    if ((m = f.match(/^=IF\(E(\d+)="Anual",B\1\/12,B\1\)\*\(1\+(\$C\$\d+)\)$/))) return (aba.ler(Number(m[1]), 5) === 'Anual' ? ref(`B${m[1]}`) / 12 : ref(`B${m[1]}`)) * (1 + ref(m[2]));
    if ((m = f.match(/^=SUM\(([A-Z])(\d+):\1(\d+)\)$/))) return faixa(m[1], Number(m[2]), Number(m[3])).reduce((s, v) => s + n(v), 0);
    if ((m = f.match(/^=SUMIF\(E(\d+):E(\d+),"<>Anual",B\1:B\2\)\+SUMIF\(E\1:E\2,"Anual",B\1:B\2\)\/12$/))) {
      const e = faixa('E', Number(m[1]), Number(m[2])); const b = faixa('B', Number(m[1]), Number(m[2]));
      return b.reduce((s, v, i) => s + (e[i] === 'Anual' ? n(v) / 12 : n(v)), 0);
    }
    if ((m = f.match(/^='Despesas Essenciais'!(\$?C\$?\d+)$/))) return ref(m[1], abas.get('Despesas Essenciais'));
    if (f === '=K11*L11') return ref('K11') * ref('L11');
    if (f === '=M11+(M11*$L$12)') return ref('M11') * (1 + ref('L12'));
    throw new Error(`fórmula não suportada no fake: ${f}`);
  }

  const de = ss.insertSheet('Despesas Essenciais');
  de.getRange('A1').setValue('DESPESAS ESSENCIAIS');
  de.getRange('B5:C5').setValues([['Ajuste de Segurança', folga]]);
  de.getRange('A6:C6').setValues([['Despesas', 'Média de Gastos', 'Total']]);
  itens.forEach(([nome, valor], i) => {
    const r = 7 + i;
    de.getRange(`A${r}:B${r}`).setValues([[nome, valor]]);
    de.getRange(`C${r}`).setFormula(`=B${r}+(B${r}*$C$5)`);
  });
  const tot = 7 + itens.length;
  de.getRange(`A${tot}`).setValue('Total:');
  de.getRange(`B${tot}`).setFormula(`=SUM(B7:B${tot - 1})`);
  de.getRange(`C${tot}`).setFormula(`=SUM(C7:C${tot - 1})`);
  de.getRange('G6').setValue('rascunho à parte'); // coluna livre (F:J) - não pode ser tocada

  const dm = ss.insertSheet('Distribuição e Metas');
  dm.getRange('K11').setFormula(`='Despesas Essenciais'!$C$${tot}`);
  dm.getRange('L11').setValue(meses);
  dm.getRange('M11').setFormula('=K11*L11');
  dm.getRange('N11').setValue(10000);
  dm.getRange('Q11').setValue(0.2);
  dm.getRange('S11').setValue(2000);
  dm.getRange('L12').setValue(sobra);
  dm.getRange('M12').setFormula('=M11+(M11*$L$12)');
  dm.getRange('K18:M18').setValues([[1000, 0.25, 0.06]]);
  dm.getRange('E19').setValue(reservaAtual);
  return ss;
}

function sandboxGs() {
  const sb = {
    console: { ...console, log() {} },
    jsonOut: (o) => o,
    SpreadsheetApp: { flush() {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  };
  vm.createContext(sb);
  new vm.Script('this.Date = Date; this.Array = Array; this.JSON = JSON;').runInContext(sb);
  new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', 'Despesas.gs'), 'utf8'), { filename: 'Despesas.gs' }).runInContext(sb);
  return sb;
}
const semRealm = (o) => JSON.parse(JSON.stringify(o));
const ITENS = [['Aluguel Teste', 1000], ['Mercado Teste', 500], ['Internet Teste', 100]];

test('Despesas.gs: lê a aba (folga, itens, totais) e a DM (média de gastos, meses, sobra, meta, reserva atual)', () => {
  const sb = sandboxGs();
  const ss = criarPlanilhaFalsa({ itens: ITENS });
  const r = semRealm(sb.lerDespesasOrganizacao_(ss));
  assert.equal(r.despesas.folga, 0.1);
  assert.deepEqual(r.despesas.itens.map((i) => [i.linha, i.nome, i.valor, i.frequencia]), [[7, 'Aluguel Teste', 1000, 'Mensal'], [8, 'Mercado Teste', 500, 'Mensal'], [9, 'Internet Teste', 100, 'Mensal']]);
  assert.ok(perto(r.despesas.totalComFolga, 1760));
  assert.ok(perto(r.reserva.mediaGastos, 1760));
  assert.ok(perto(r.reserva.meta, 1760 * 6 * 1.1));
  assert.equal(r.reserva.atual, 5000);
  assert.equal(r.historico.length, 0);
  assert.equal(typeof r.assinatura, 'string');
});

test('Despesas.gs: salvar edita, insere, marca anual e a DM (K11 -> meta) acompanha; o simulador da tela bate com a planilha', () => {
  const sb = sandboxGs();
  const ss = criarPlanilhaFalsa({ itens: ITENS });
  const antes = semRealm(sb.lerDespesasOrganizacao_(ss));
  const rasc = rascunhoDoServidor(antes);
  rasc.itens[1].valor = 600; // edita
  rasc.itens[2].categoria = 'Contas da casa';
  rasc.itens.push({ id: 'n1', nome: 'IPVA Teste', valor: 1200, categoria: 'Transporte', frequencia: 'Anual', nova: true });
  rasc.itens.push({ id: 'n2', nome: 'Academia Teste', valor: 90, categoria: 'Saúde', frequencia: 'Mensal', nova: true });
  rasc.meses = 8;
  const previsto = calcularOrganizacao(rasc, { reserva: antes.reserva, salario: antes.salario, patrimonio: antes.patrimonio });

  const r = semRealm(sb.salvarDespesasOrganizacao_(ss, payloadRascunho(rasc), new Date('2026-09-26T15:00:00Z')));
  assert.equal(r.ok, true, r.erro);
  const de = ss.getSheetByName('Despesas Essenciais');
  const dm = ss.getSheetByName('Distribuição e Metas');
  assert.deepEqual(r.despesas.itens.map((i) => [i.linha, i.nome, i.valor, i.categoria, i.frequencia]), [
    [7, 'Aluguel Teste', 1000, '', 'Mensal'], [8, 'Mercado Teste', 600, '', 'Mensal'], [9, 'Internet Teste', 100, 'Contas da casa', 'Mensal'],
    [10, 'IPVA Teste', 1200, 'Transporte', 'Anual'], [11, 'Academia Teste', 90, 'Saúde', 'Mensal'],
  ]);
  assert.equal(de.ler(12, 1), 'Total:', 'o Total desceu 2 linhas');
  assert.equal(de.ler(6, 4), 'Categoria');
  assert.equal(de.ler(6, 5), 'Frequência');
  assert.equal(de.ler(6, 7), 'rascunho à parte', 'colunas F:J não são tocadas');
  assert.equal(dm.cel.get('11,11').f, "='Despesas Essenciais'!$C$12", 'K11 da DM continua apontando pro Total');
  assert.equal(de.cel.get('10,3').f, '=IF(E10="Anual",B10/12,B10)*(1+$C$5)');
  // gasto real: 1000 + 600 + 100 + 1200/12 + 90 = 1890 · com folga 2079
  assert.ok(perto(r.despesas.totalReal, 1890));
  assert.ok(perto(r.despesas.totalComFolga, 2079));
  assert.equal(r.reserva.meses, 8);
  assert.ok(perto(r.reserva.meta, 2079 * 8 * 1.1));
  // o que a tela previu antes de gravar = o que a planilha calculou depois
  assert.ok(perto(previsto.totalComFolga, r.despesas.totalComFolga));
  assert.ok(perto(previsto.meta, r.reserva.meta));
  assert.ok(de.formatoCopiado, 'linhas novas herdam o formato da 1ª despesa');
});

test('Despesas.gs: remover encolhe a lista, o Total sobe e a referência da DM acompanha; o histórico nasce com "antes" e "depois"', () => {
  const sb = sandboxGs();
  const ss = criarPlanilhaFalsa({ itens: ITENS });
  const antes = semRealm(sb.lerDespesasOrganizacao_(ss));
  const rasc = rascunhoDoServidor(antes);
  rasc.itens[0].removida = true;
  const r = semRealm(sb.salvarDespesasOrganizacao_(ss, payloadRascunho(rasc), new Date('2026-09-26T15:00:00Z')));
  assert.equal(r.ok, true, r.erro);
  const de = ss.getSheetByName('Despesas Essenciais');
  assert.deepEqual(r.despesas.itens.map((i) => i.nome), ['Mercado Teste', 'Internet Teste']);
  assert.equal(de.ler(9, 1), 'Total:');
  assert.equal(de.ler(10, 1), '', 'sobrou nada embaixo');
  assert.equal(ss.getSheetByName('Distribuição e Metas').cel.get('11,11').f, "='Despesas Essenciais'!$C$9");
  assert.ok(perto(r.reserva.mediaGastos, 660));
  assert.deepEqual(r.historico.map((h) => h.totalComFolga), [1760, 660]);
  assert.equal(ss.getSheetByName('aux_historico-despesas').ler(1, 1), 'Data');

  // 2ª gravação: só acrescenta o "depois"
  const rasc2 = rascunhoDoServidor(r);
  rasc2.folga = 0.2;
  const r2 = semRealm(sb.salvarDespesasOrganizacao_(ss, payloadRascunho(rasc2), new Date('2026-09-27T15:00:00Z')));
  assert.equal(r2.ok, true, r2.erro);
  assert.equal(r2.historico.length, 3);
  assert.ok(perto(r2.despesas.totalComFolga, 720));
  assert.equal(r2.despesas.folga, 0.2);
});

test('Despesas.gs: planilha mudou desde a leitura -> recusa (conflito) sem tocar em nada; validações', () => {
  const sb = sandboxGs();
  const ss = criarPlanilhaFalsa({ itens: ITENS });
  const antes = semRealm(sb.lerDespesasOrganizacao_(ss));
  ss.getSheetByName('Despesas Essenciais').getRange('B7').setValue(1111); // alguém editou direto na planilha
  const rasc = rascunhoDoServidor(antes);
  rasc.itens[2].valor = 150;
  const r = semRealm(sb.salvarDespesasOrganizacao_(ss, payloadRascunho(rasc), new Date()));
  assert.equal(r.ok, false);
  assert.equal(r.conflito, true);
  assert.equal(ss.getSheetByName('Despesas Essenciais').ler(9, 2), 100, 'nada gravado');
  assert.equal(ss.getSheetByName('aux_historico-despesas'), null);

  const falha = (itens, extra = {}) => semRealm(sb.salvarDespesasOrganizacao_(ss, { itens, ...extra }, new Date()));
  assert.match(falha([]).erro, /pelo menos 1/);
  assert.match(falha([{ nome: '', valor: 1 }]).erro, /sem nome/);
  assert.match(falha([{ nome: 'X', valor: -1 }]).erro, /valor inválido/);
  assert.match(falha([{ nome: 'Total geral', valor: 1 }]).erro, /reservado/);
  assert.match(falha([{ nome: 'X', valor: 1 }], { folga: '2' }).erro, /folga inválida/);
  assert.match(falha([{ nome: 'X', valor: 1 }], { meses: '0' }).erro, /meses inválido/);
});

test('Despesas.gs: nome que começa com "=" vira texto (não fórmula)', () => {
  const sb = sandboxGs();
  const ss = criarPlanilhaFalsa({ itens: ITENS });
  const r = semRealm(sb.salvarDespesasOrganizacao_(ss, { itens: [{ nome: '=1+1', valor: 10 }] }, new Date()));
  assert.equal(r.ok, true, r.erro);
  assert.equal(ss.getSheetByName('Despesas Essenciais').ler(7, 1), "'=1+1");
});
