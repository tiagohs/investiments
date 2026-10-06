// tests/harness/fundamentos-planilha.test.js
//
// 06/10/2026 (Tiago: "resolva pra mim a questão do P/VP e P/L do GPRK e VNOM"): aba aux_fundamentos-resumo
// (Fundamentos.gs) + corrigirFormulasValuationPlanilha() (FundamentosPlanilha.gs). Tudo com dados INVENTADOS;
// o último teste usa tests/harness/fixtures.json (gitignored) só pra conferir os ativos reais, e é pulado sem ele.
// A planilha falsa não calcula fórmula: a LÓGICA das fórmulas é provada com o avaliador mínimo avaliador-formula.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AbaFalsa, planilhaFalsa, sandboxGas, plain } from './planilha-falsa.mjs';
import { avaliarFormula, ErroFormula } from './avaliador-formula.mjs';
import { lerFixturesRaw_ } from './gas-vm-harness.mjs';

const AGORA = new Date('2026-10-06T15:00:00Z');
const COL = { A: 1, J: 10, AB: 28, AC: 29, AK: 37, AL: 38 };
const CAB_AUX = ['Classe', 'Ticker', 'Nome', 'Tipo', 'Moeda', 'Preço Atual', 'Variação dia', 'Quantidade', 'Preço Médio', 'Preço Teto', 'Viés', 'P/VP', 'Desconto P/VP', 'P/L', 'Desconto P/L', 'Setor/Segmento', 'DY (%)'];

// --- montagem de planilhas inventadas --------------------------------------------------------------------------------
const json = (valores) => JSON.stringify({ valores, avisos: [] });
const dia = AGORA;

/** aux_fundamentos: [ticker, fonte, valores] */
const abaFund = (itens) => [['Ticker', 'Fonte', 'JSON', 'Atualizado em'], ...itens.map(([t, f, v]) => [t, f, json(v), dia])];
const auxAtivos = (itens) => [CAB_AUX, ...itens.map(([classe, ticker, preco]) => [classe, ticker, '', '', '', preco])];

/** Aba de carteira de ação no layout real: cabeçalho na linha 8 (Ticker em A, Valor atual em J, VPA em AB, LPA em AC, P/L em AK ou AL). */
function abaCarteira(nome, colPl, linhas, { cabecalho = true } = {}) {
  const larg = 45;
  const vazia = () => Array.from({ length: larg }, () => '');
  const out = [];
  for (let i = 0; i < 7; i++) out.push(vazia());
  const cab = vazia();
  if (cabecalho) { cab[0] = 'Ticker'; cab[COL.J - 1] = 'Valor atual'; cab[COL.AB - 1] = 'VPA'; cab[COL.AC - 1] = 'LPA'; cab[colPl - 1] = 'P/L'; cab[26] = 'DY (R$/ação)'; }
  out.push(cab);
  linhas.forEach((l, i) => {
    const r = vazia();
    r[0] = l.ticker ?? '';
    r[COL.J - 1] = l.preco ?? '';
    r[26] = { f: `=IF(Z${9 + i}="";"";Z${9 + i}*J${9 + i})`, v: 1 }; // DY (R$/ação): NÃO pode mudar
    r[COL.AB - 1] = { f: `=IFERROR(VLOOKUP(A${9 + i};'DB-X'!$1:$11020;27;0);"")`, v: l.vpaAntigo ?? '' };
    r[COL.AC - 1] = { f: `=IFERROR(VLOOKUP(A${9 + i};'DB-X'!$1:$11020;28;0);"")`, v: l.lpaAntigo ?? '' };
    r[colPl - 1] = { f: `=IFERROR(GOOGLEFINANCE(A${9 + i};"pe");"")`, v: l.plAntigo ?? '' };
    out.push(r);
  });
  return new AbaFalsa(nome, out);
}

/** Banco antigo (DB-Stocks / DB-Acoes): ticker na col A, VPA na 27, LPA na 28. */
function abaBanco(nome, itens) {
  return new AbaFalsa(nome, itens.map(([t, vpa, lpa]) => { const r = Array.from({ length: 30 }, () => ''); r[0] = t; r[26] = vpa; r[27] = lpa; return r; }));
}

function snapshotExceto(aba, colunas) {
  const out = {};
  aba.l.forEach((row, i) => (row || []).forEach((c, j) => { if (c && !colunas.includes(j + 1)) out[`${i + 1}:${j + 1}`] = JSON.stringify(c); }));
  return out;
}

// --- 1) resumo --------------------------------------------------------------------------------------------------------
function montarResumo() {
  const ss = planilhaFalsa({
    Auxiliar_ativos: auxAtivos([
      ['Ações EUA', 'AAAA', 11.28], ['Ações EUA', 'BBBB', 40.87], ['Ações EUA', 'CCCC', 7.97], ['Ações EUA', 'DDDD', 20],
      ['Ações', 'EEEE3', 12.5], ['FIIs', 'FFFF11', 95], ['Ações EUA', 'GGGG', 30], ['Ações EUA', 'HHHH', 5],
    ]),
    aux_fundamentos: abaFund([
      // "VPA 0,36 x Yahoo": o Yahoo tem P/VP 1,98 e VPA 5,62 (coerentes com o preço)
      ['AAAA', 'yahoo', { pvp: 1.98, pl: 7.8, vpa: 5.6166, lpa: 1.4246, cotacao: 10.9 }], ['AAAA', 'planilha', { pl: 7.48 }],
      // "PE 303 x 10,6": GOOGLEFINANCE em 303 e Yahoo em 10,6 (com VPA/LPA que não batem com o preço: sai derivado)
      ['BBBB', 'yahoo', { pvp: 1.58, pl: 10.6, vpa: 14.1364, lpa: -0.1, cotacao: 40.63 }], ['BBBB', 'planilha', { pl: 303.44 }],
      // ADR: Yahoo só tem P/VP e P/L (sem VPA/LPA) - PROSY tinha VPA 0 no DB
      ['CCCC', 'yahoo', { pvp: 1.6, pl: 7.86, cotacao: 7.83 }],
      // só o GOOGLEFINANCE, em 150 (a sanidade da mescla só corta acima de 200): a mescla devolve, o corte em 100 é da fórmula da planilha
      ['DDDD', 'planilha', { pl: 150 }],
      ['HHHH', 'planilha', { pl: 303 }], // acima de 200: a própria sanidade descarta, sem linha no resumo
      ['EEEE3', 'yahoo', { pvp: 1.25, pl: 8, vpa: 10, lpa: 1.56 }],
      ['FFFF11', 'yahoo', { pvp: 0.95 }],
      ['GGGG', 'sec', { cagrReceita5a: 0.05 }], // sem P/VP, P/L, VPA nem LPA: sem linha
    ]),
  });
  const { sb } = sandboxGas(ss, { agora: AGORA });
  return { ss, sb };
}

test('Resumo: uma linha por ação (BR e EUA) com o valor escolhido; VPA/LPA coerentes com o P/VP/P/L; FII e ticker sem dado ficam de fora', () => {
  const { ss, sb } = montarResumo();
  const n = sb.fundGravarResumo_(ss, sb.fundLerTabela_(ss), AGORA);
  const aba = ss.getSheetByName('aux_fundamentos-resumo');
  const v = aba.getRange(1, 1, aba.getLastRow(), 7).getValues();
  assert.deepEqual(plain(v[0]), ['Ticker', 'P/VP', 'P/L', 'VPA', 'LPA', 'Fonte', 'Atualizado em']);
  assert.equal(n, 5);
  assert.deepEqual(v.slice(1).map((l) => l[0]), ['AAAA', 'BBBB', 'CCCC', 'DDDD', 'EEEE3']);
  const por = Object.fromEntries(v.slice(1).map((l) => [l[0], l]));
  // AAAA: Yahoo vence o P/L (ordem de fontes EUA: yahoo, sec, planilha); VPA/LPA do Yahoo batem com preço ÷ P/VP/P/L: ficam
  assert.deepEqual(plain(por.AAAA.slice(1, 6)), [1.98, 7.8, 5.6166, 1.4246, 'yahoo']);
  // BBBB: P/L 10,6 (não os 303 do GOOGLEFINANCE); VPA do Yahoo não bate com preço ÷ P/VP -> derivado; LPA negativo -> derivado
  assert.equal(por.BBBB[1], 1.58);
  assert.equal(por.BBBB[2], 10.6);
  assert.equal(por.BBBB[3], Math.round(40.87 / 1.58 * 1e4) / 1e4);
  assert.equal(por.BBBB[4], Math.round(40.87 / 10.6 * 1e4) / 1e4);
  // CCCC (ADR sem VPA/LPA): derivados do preço da planilha
  assert.deepEqual(plain(por.CCCC.slice(1, 5)), [1.6, 7.86, Math.round(7.97 / 1.6 * 1e4) / 1e4, Math.round(7.97 / 7.86 * 1e4) / 1e4]);
  // DDDD: só a planilha, P/L 150 - a mescla repassa; quem corta é a fórmula (testado abaixo)
  assert.deepEqual(plain(por.DDDD.slice(1, 3)), ['', 150]);
  assert.ok(!por.HHHH, 'P/L 303 só no GOOGLEFINANCE: descartado pela sanidade, sem linha');
  assert.equal(por.EEEE3[3], 10);
  assert.ok(v.slice(1).every((l) => l[6] instanceof sb.Date || l[6] instanceof Date));
});

test('Resumo: gravado com UM setValues e regravado (não acumula) a cada rodada de atualizarFundamentos_, sem ir à internet quando tudo está fresco', () => {
  const ss = planilhaFalsa({
    Auxiliar_ativos: auxAtivos([['Ações EUA', 'AAAA', 11.28]]),
    aux_fundamentos: abaFund([['AAAA', 'yahoo', { pvp: 1.98, pl: 7.8 }], ['AAAA', 'sec', {}]]),
  });
  const { sb } = sandboxGas(ss, { agora: AGORA }); // sem urlFetch: qualquer consulta à internet derruba o teste
  let setValuesDoResumo = 0;
  const espiar = (n, aba) => {
    if (aba && n === 'aux_fundamentos-resumo' && !aba._espiada) {
      aba._espiada = true;
      const gr = aba.getRange.bind(aba);
      aba.getRange = (...a) => { const rg = gr(...a); const sv = rg.setValues.bind(rg); rg.setValues = (x) => { setValuesDoResumo++; return sv(x); }; return rg; };
    }
    return aba;
  };
  const get = ss.getSheetByName.bind(ss), ins = ss.insertSheet.bind(ss);
  ss.getSheetByName = (n) => espiar(n, get(n));
  ss.insertSheet = (n) => espiar(n, ins(n));
  const r = plain(sb.atualizarFundamentos_('Manual', {}));
  assert.match(r.detalhe, /resumo P\/VP e P\/L: 1 ação\(ões\) em aux_fundamentos-resumo/);
  const resumo = ss.getSheetByName('aux_fundamentos-resumo');
  assert.equal(resumo.getLastRow(), 2);
  assert.equal(setValuesDoResumo, 1, 'cabeçalho + linhas num setValues só');
  sb.atualizarFundamentos_('Automático', {});
  assert.equal(resumo.getLastRow(), 2, 'regrava a aba inteira: não duplica linha');
  assert.equal(setValuesDoResumo, 2);
});

// --- 2) corrigirFormulasValuationPlanilha ------------------------------------------------------------------------------
function montarCarteiras({ resumo = true } = {}) {
  const abas = {
    Auxiliar_ativos: auxAtivos([['Ações EUA', 'AAAA', 11.28], ['Ações EUA', 'BBBB', 40.87], ['Ações EUA', 'CCCC', 7.97], ['Ações', 'EEEE3', 12.5]]),
    aux_fundamentos: abaFund([
      ['AAAA', 'yahoo', { pvp: 1.98, pl: 7.8, vpa: 5.6166, lpa: 1.4246 }],
      ['BBBB', 'yahoo', { pvp: 1.58, pl: 10.6, vpa: 14.1364, lpa: -0.1 }],
      ['CCCC', 'yahoo', { pvp: 1.6, pl: 7.86 }],
      ['EEEE3', 'yahoo', { pvp: 1.25, pl: 8, vpa: 10, lpa: 1.56 }],
    ]),
    'Carteira Ações USA': abaCarteira('Carteira Ações USA', COL.AK, [
      { ticker: 'AAAA', preco: 11.28, vpaAntigo: 0.36, lpaAntigo: 3.21, plAntigo: 7.77 },
      { ticker: 'BBBB', preco: 40.87, vpaAntigo: 17.87, lpaAntigo: 0.3, plAntigo: 303.44 },
      { ticker: 'CCCC', preco: 7.97, vpaAntigo: 0 },
    ]),
    // BR: a primeira linha não tem ticker mas tem fórmula (como na planilha real) e entra igual
    'Carteira Ações': abaCarteira('Carteira Ações', COL.AL, [{ ticker: '' }, { ticker: 'EEEE3', preco: 12.5, vpaAntigo: 9.9, lpaAntigo: 1.5, plAntigo: 8.3 }]),
    'DB-Stocks': abaBanco('DB-Stocks', [['AAAA', 0.36, 3.21], ['BBBB', 17.87, 0.3], ['CCCC', 0, 0]]),
    'DB-Acoes': abaBanco('DB-Acoes', [['EEEE3', 9.9, 1.5]]),
  };
  const ss = planilhaFalsa(abas);
  const { sb, registro } = sandboxGas(ss, { agora: AGORA });
  if (resumo) sb.fundGravarResumo_(ss, sb.fundLerTabela_(ss), AGORA);
  return { ss, sb, registro };
}

test('corrigirFormulasValuationPlanilha: reescreve só VPA, LPA e P/L (EUA e BR), com ";" e nomes em inglês, e grava antes/depois no Registro', () => {
  const { ss, sb, registro } = montarCarteiras();
  const usa = ss.getSheetByName('Carteira Ações USA');
  const br = ss.getSheetByName('Carteira Ações');
  const antesUsa = snapshotExceto(usa, [COL.AB, COL.AC, COL.AK]);
  const antesBr = snapshotExceto(br, [COL.AB, COL.AC, COL.AL]);
  const r = plain(sb.corrigirFormulasValuationPlanilha());
  assert.equal(r.status, 'Sucesso', r.detalhe);
  assert.deepEqual(r.abas.map((a) => [a.aba, a.linhas, a.alteradas]), [['Carteira Ações USA', 3, 3], ['Carteira Ações', 2, 2]]);
  // nenhuma outra célula mexeu (inclui a fórmula de DY (R$/ação) e o preço)
  assert.deepEqual(snapshotExceto(usa, [COL.AB, COL.AC, COL.AK]), antesUsa);
  assert.deepEqual(snapshotExceto(br, [COL.AB, COL.AC, COL.AL]), antesBr);
  // fórmulas: prefere o resumo, cai no banco / GOOGLEFINANCE; ";" (nunca ","), sem número decimal e sem função em português
  const fAb = usa.formula('AB9'), fAc = usa.formula('AC9'), fAk = usa.formula('AK9');
  assert.match(fAb, /^=IFERROR\(LET\(preco;N\(\$J9\);resumo;N\(IFERROR\(VLOOKUP\(\$A9;'aux_fundamentos-resumo'!\$A:\$G;4;0\);0\)\);banco;N\(IFERROR\(VLOOKUP\(\$A9;'DB-Stocks'!\$1:\$11020;27;0\);0\)\);/);
  assert.match(fAc, /VLOOKUP\(\$A9;'aux_fundamentos-resumo'!\$A:\$G;5;0\).*VLOOKUP\(\$A9;'DB-Stocks'!\$1:\$11020;28;0\)/);
  assert.match(fAk, /^=IF\(\$A9="";"";IFERROR\(LET\(resumo;N\(IFERROR\(VLOOKUP\(\$A9;'aux_fundamentos-resumo'!\$A:\$G;3;0\);0\)\);google;N\(IFERROR\(GOOGLEFINANCE\(\$A9;"pe"\);0\)\);/);
  [fAb, fAc, fAk, br.formula('AB10'), br.formula('AC10'), br.formula('AL10')].forEach((f) => {
    assert.ok(!/[,]/.test(f.replace(/"[^"]*"/g, '')), `sem vírgula como separador: ${f}`);
    assert.ok(!/\d[.]\d/.test(f), 'sem decimal dentro da fórmula (independe do locale)');
    assert.ok(!/DUMMYFUNCTION|PROCV|SEERRO|SE\(/.test(f));
  });
  assert.match(br.formula('AB10'), /'DB-Acoes'!\$1:\$1001;27;0/);
  assert.match(br.formula('AL10'), /GOOGLEFINANCE\(\$A10;"pe"\)/);
  assert.match(br.formula('AB9'), /VLOOKUP\(\$A9;'aux_fundamentos-resumo'/, 'linha sem ticker mas com fórmula também entra');
  // Registro: antes/depois por ticker
  const reg = registro.find((x) => x[1] === 'corrigirFormulasValuationPlanilha');
  assert.ok(reg, 'gravou no Registro de Controle');
  assert.equal(reg[0], 'Sucesso');
  assert.match(reg[2], /AAAA P\/VP 31,33 -> /);
  assert.match(reg[2], /BBBB P\/VP 2,29 -> /);
  assert.equal(r.status, 'Sucesso');
});

test('corrigirFormulasValuationPlanilha: idempotente (2ª rodada não reescreve nada) e cria o resumo se a aba não existir', () => {
  const { ss, sb } = montarCarteiras({ resumo: false });
  assert.equal(ss.getSheetByName('aux_fundamentos-resumo'), null);
  const r1 = plain(sb.corrigirFormulasValuationPlanilha());
  assert.ok(ss.getSheetByName('aux_fundamentos-resumo').getLastRow() >= 5, 'montou o resumo com o que já havia em aux_fundamentos');
  assert.equal(r1.alteradas, 5);
  const foto = JSON.stringify(ss.getSheetByName('Carteira Ações USA').l);
  const r2 = plain(sb.corrigirFormulasValuationPlanilha());
  assert.equal(r2.alteradas, 0);
  assert.match(r2.detalhe, /já estava corrigido/);
  assert.equal(JSON.stringify(ss.getSheetByName('Carteira Ações USA').l), foto);
});

test('corrigirFormulasValuationPlanilha: cabeçalho que não bate = não mexe e avisa (Atenção)', () => {
  const ss = planilhaFalsa({
    aux_fundamentos: abaFund([]),
    'Carteira Ações USA': abaCarteira('Carteira Ações USA', COL.AK, [{ ticker: 'AAAA', preco: 10 }], { cabecalho: false }),
  });
  const { sb } = sandboxGas(ss, { agora: AGORA });
  const antes = JSON.stringify(ss.getSheetByName('Carteira Ações USA').l);
  const r = plain(sb.corrigirFormulasValuationPlanilha());
  assert.equal(r.status, 'Atenção');
  assert.match(r.detalhe, /cabeçalho .* não encontrado - não mexi/);
  assert.equal(JSON.stringify(ss.getSheetByName('Carteira Ações USA').l), antes);
});

// --- 3) a lógica das fórmulas (avaliador mínimo) ----------------------------------------------------------------------
/** Monta uma carteira de 1 linha (linha 9) + resumo + banco antigo e avalia VPA, LPA e P/L. */
function avaliarLinha({ preco, resumo, banco, google }) {
  const resumoLinhas = [['Ticker', 'P/VP', 'P/L', 'VPA', 'LPA', 'Fonte', 'Atualizado em']];
  if (resumo) resumoLinhas.push(['ZZZZ', resumo.pvp ?? '', resumo.pl ?? '', resumo.vpa ?? '', resumo.lpa ?? '', 'yahoo', '']);
  const ss = planilhaFalsa({
    'Carteira Ações USA': abaCarteira('Carteira Ações USA', COL.AK, [{ ticker: 'ZZZZ', preco }]),
    'aux_fundamentos-resumo': resumoLinhas,
    'DB-Stocks': abaBanco('DB-Stocks', banco ? [['ZZZZ', banco.vpa, banco.lpa]] : []),
    aux_fundamentos: abaFund([]),
  });
  const { sb } = sandboxGas(ss, { agora: AGORA });
  sb.corrigirFormulasValuationPlanilha();
  const aba = ss.getSheetByName('Carteira Ações USA');
  const ctx = { aba, abas: ss.abas, google: (t, at) => (google === undefined ? 'erro' : google) };
  const val = (a1) => { try { return avaliarFormula(aba.formula(a1), ctx); } catch (e) { if (e instanceof ErroFormula) return e.codigo; throw e; } };
  const vpa = val('AB9');
  return { vpa, lpa: val('AC9'), pl: val('AK9'), pvp: typeof vpa === 'number' ? preco / vpa : '' };
}

test('Fórmula (VPA): "VPA 0,36 x Yahoo 5,7" - o resumo vence; sem resumo, o VPA 0,36 (P/VP 31) é descartado em vez de virar P/VP absurdo', () => {
  const comResumo = avaliarLinha({ preco: 11.28, resumo: { pvp: 1.98, vpa: 5.7 }, banco: { vpa: 0.36, lpa: 3.21 } });
  assert.equal(comResumo.vpa, 5.7);
  assert.ok(comResumo.pvp > 1.9 && comResumo.pvp < 2.1, `P/VP ${comResumo.pvp}`);
  const semResumo = avaliarLinha({ preco: 11.28, resumo: null, banco: { vpa: 0.36, lpa: 3.21 } });
  assert.equal(semResumo.vpa, '', 'P/VP 31 fora de 0,05-20: vazio, nunca um número absurdo');
  const bancoBom = avaliarLinha({ preco: 11.28, resumo: null, banco: { vpa: 5.5, lpa: 1.4 } });
  assert.equal(bancoBom.vpa, 5.5, 'sem resumo e com banco plausível: vale o banco');
});

test('Fórmula (VPA): VPA 0 / vazio nunca vira #DIV/0! nem trava a outra fonte; resumo implausível cai no banco', () => {
  const zero = avaliarLinha({ preco: 7.97, resumo: null, banco: { vpa: 0, lpa: 0 } });
  assert.equal(zero.vpa, '');
  assert.notEqual(zero.vpa, '#DIV/0!');
  const zeroComResumo = avaliarLinha({ preco: 7.97, resumo: { pvp: 1.6, vpa: 4.98 }, banco: { vpa: 0, lpa: 0 } });
  assert.equal(zeroComResumo.vpa, 4.98);
  const resumoAbsurdo = avaliarLinha({ preco: 11, resumo: { vpa: 0.01 }, banco: { vpa: 5.5, lpa: 1 } }); // 11 / 0,01 = 1100
  assert.equal(resumoAbsurdo.vpa, 5.5);
  const nada = avaliarLinha({ preco: 11, resumo: null, banco: null });
  assert.equal(nada.vpa, '');
  assert.equal(nada.lpa, '');
  assert.equal(nada.pl, '');
  const semPreco = avaliarLinha({ preco: '', resumo: { vpa: 5.7 }, banco: { vpa: 0.36 } });
  assert.equal(semPreco.vpa, 5.7, 'sem cotação não dá pra checar o P/VP: vale o resumo');
});

test('Fórmula (P/L): "PE 303 x 10,6" - o resumo vence; sem resumo o GOOGLEFINANCE em 303 é descartado; faixa 0-100', () => {
  assert.equal(avaliarLinha({ preco: 40.87, resumo: { pl: 10.6 }, banco: null, google: 303.44 }).pl, 10.6);
  assert.equal(avaliarLinha({ preco: 40.87, resumo: null, banco: null, google: 303.44 }).pl, '', 'fora de 0-100: vazio');
  assert.equal(avaliarLinha({ preco: 40.87, resumo: null, banco: null, google: 8.2 }).pl, 8.2, 'sem resumo, GOOGLEFINANCE plausível vale');
  assert.equal(avaliarLinha({ preco: 40.87, resumo: { pl: -3 }, banco: null, google: 303 }).pl, '', 'P/L negativo do resumo e GOOGLEFINANCE absurdo: vazio');
  assert.equal(avaliarLinha({ preco: 40.87, resumo: { pl: 303 }, banco: null, google: 9 }).pl, 9, 'resumo fora da faixa: tenta o GOOGLEFINANCE');
  assert.equal(avaliarLinha({ preco: 40.87, resumo: null, banco: null, google: 'erro' }).pl, '', 'GOOGLEFINANCE carregando/erro: vazio, sem #N/A');
  assert.equal(avaliarLinha({ preco: 40.87, resumo: { pl: 100 }, banco: null }).pl, 100);
  assert.equal(avaliarLinha({ preco: 40.87, resumo: { pl: 0 }, banco: null }).pl, '');
});

test('Fórmula (LPA): prefere o resumo (inclui LPA derivado), cai no banco e fica vazio sem nenhum', () => {
  assert.equal(avaliarLinha({ preco: 40.87, resumo: { lpa: 3.86 }, banco: { vpa: 17.87, lpa: 0.3 } }).lpa, 3.86);
  assert.equal(avaliarLinha({ preco: 40.87, resumo: null, banco: { vpa: 17.87, lpa: 0.3 } }).lpa, 0.3);
  assert.equal(avaliarLinha({ preco: 40.87, resumo: { pvp: 1.5 }, banco: { vpa: 17.87, lpa: 0.3 } }).lpa, 0.3, 'resumo sem LPA: banco');
});

// --- 4) cadeia completa: rodada de fundamentos -> corrigir -> fórmulas (dados inventados dos 3 casos) -----------------------
test('Cadeia: atualizarFundamentos_ grava o resumo, corrigirFormulasValuationPlanilha() troca as fórmulas e P/VP/P/L ficam plausíveis nos 3 casos (VPA 0,36 / PE 303 / VPA 0)', () => {
  const abas = {
    Auxiliar_ativos: auxAtivos([['Ações EUA', 'AAAA', 11.28], ['Ações EUA', 'BBBB', 40.87], ['Ações EUA', 'CCCC', 7.97]]),
    aux_fundamentos: abaFund([
      ['AAAA', 'yahoo', { pvp: 1.98, pl: 7.8, vpa: 5.6166, lpa: 1.4246 }], ['AAAA', 'sec', {}],
      ['BBBB', 'yahoo', { pvp: 1.58, pl: 10.6, vpa: 14.1364, lpa: -0.1 }], ['BBBB', 'sec', {}],
      ['CCCC', 'yahoo', { pvp: 1.6, pl: 7.86 }], ['CCCC', 'sec', {}],
    ]),
    'Carteira Ações USA': abaCarteira('Carteira Ações USA', COL.AK, [
      { ticker: 'AAAA', preco: 11.28 }, { ticker: 'BBBB', preco: 40.87 }, { ticker: 'CCCC', preco: 7.97 },
    ]),
    'DB-Stocks': abaBanco('DB-Stocks', [['AAAA', 0.36, 3.21], ['BBBB', 17.87, 0.3], ['CCCC', 0, 0]]),
    'Carteira Ações': abaCarteira('Carteira Ações', COL.AL, []),
  };
  const ss = planilhaFalsa(abas);
  const { sb } = sandboxGas(ss, { agora: AGORA });
  sb.atualizarFundamentos_('Manual', {});
  sb.corrigirFormulasValuationPlanilha();
  const aba = ss.getSheetByName('Carteira Ações USA');
  const google = { AAAA: 7.48, BBBB: 303.44, CCCC: 'erro' };
  const ctx = { aba, abas: ss.abas, google: (t) => google[t] };
  const esperado = { AAAA: 7.8, BBBB: 10.6, CCCC: 7.86 };
  [9, 10, 11].forEach((linha, i) => {
    const t = ['AAAA', 'BBBB', 'CCCC'][i];
    const vpa = avaliarFormula(aba.formula(`AB${linha}`), ctx);
    const pl = avaliarFormula(aba.formula(`AK${linha}`), ctx);
    const preco = aba.valor(`J${linha}`);
    assert.equal(typeof vpa, 'number', `${t}: VPA ${vpa}`);
    const pvp = preco / vpa;
    assert.ok(pvp >= 0.05 && pvp <= 20, `${t}: P/VP ${pvp}`);
    assert.ok(Math.abs(pvp - { AAAA: 1.98, BBBB: 1.58, CCCC: 1.6 }[t]) < 0.06, `${t}: P/VP ${pvp} perto do escolhido`);
    assert.equal(pl, esperado[t], `${t}: P/L`);
  });
});

// --- 5) checagem [DADO DA PLANILHA] considera o resumo ---------------------------------------------------------------------
test('Checagem fundamentosFaixa com o resumo: planilha corrigida passa; planilha NÃO corrigida (Auxiliar_ativos com 31,3 / 303) continua acusando', async () => {
  const { CHECAGENS_QUALIDADE } = await import('./qualidade-dados.mjs');
  const checagem = CHECAGENS_QUALIDADE.find((c) => c.id === 'fundamentosFaixa');
  const fund = { linhas: [['Ticker', 'Fonte', 'JSON'],
    ['AAAA', 'yahoo', json({ pvp: 1.98, pl: 7.8 })], ['AAAA', 'planilha', json({ pl: 303 })], // fonte crua ruim: o resumo já a descartou
    ['BBBB', 'yahoo', json({ pvp: 1.58, pl: 10.6 })]] };
  const resumo = { linhas: [['Ticker', 'P/VP', 'P/L', 'VPA', 'LPA', 'Fonte', 'Atualizado em'], ['AAAA', 1.98, 7.8, 5.7, 1.4, 'yahoo'], ['BBBB', 1.58, 10.6, 25.9, 3.9, 'yahoo']] };
  const aux = (a, b) => ({ linhas: [['Classe', 'Ticker', '', '', '', '', '', '', '', '', '', 'P/VP', '', 'P/L'],
    ['Ações EUA', 'AAAA', '', '', '', '', '', '', '', '', '', a.pvp, '', a.pl], ['Ações EUA', 'BBBB', '', '', '', '', '', '', '', '', '', b.pvp, '', b.pl]] });
  const corrigida = checagem.rodar({ fixtures: { aux_fundamentos: fund, 'aux_fundamentos-resumo': resumo, Auxiliar_ativos: aux({ pvp: 2.0, pl: 7.8 }, { pvp: 1.6, pl: 10.6 }) } });
  assert.deepEqual(corrigida, [], 'com o resumo, a fonte crua em 303 não conta (já foi descartada pela mescla)');
  const naoCorrigida = checagem.rodar({ fixtures: { aux_fundamentos: fund, 'aux_fundamentos-resumo': resumo, Auxiliar_ativos: aux({ pvp: 31.3, pl: 7.8 }, { pvp: 1.6, pl: 302.9 }) } });
  assert.equal(naoCorrigida.length, 2);
  assert.ok(naoCorrigida.some((m) => /^AAAA P\/VP: .*Auxiliar_ativos 31\.3/.test(m)));
  assert.ok(naoCorrigida.some((m) => /^BBBB P\/L: .*Auxiliar_ativos 302\.9/.test(m)));
  // sem a aba de resumo (planilha ainda sem a correção): comportamento de antes, a fonte crua em 303 acusa
  const semAba = checagem.rodar({ fixtures: { aux_fundamentos: fund, Auxiliar_ativos: aux({ pvp: 2.0, pl: 7.8 }, { pvp: 1.6, pl: 10.6 }) } });
  assert.ok(semAba.some((m) => /^AAAA P\/L: .*planilha 303/.test(m)));
});

// --- 6) fixtures reais (pulado sem fixtures.json) -----------------------------------------------------------------------------
const FIXTURES_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures.json');
test('Fixtures reais: GPRK, VNOM e PROSY saem com P/VP em 0,05-20 e P/L em 0-100 depois da correção (e antes ainda eram absurdos)', (t) => {
  if (!fs.existsSync(FIXTURES_PATH)) return t.skip('sem fixtures.json');
  const fx = lerFixturesRaw_(FIXTURES_PATH);
  const rev = (v) => (v && typeof v === 'object' && v.__date__ ? new Date(v.__date__) : v);
  const linhas = (nome) => (fx[nome] ? fx[nome].linhas.map((l) => l.map(rev)) : []);
  const usaFx = linhas('Carteira Ações USA');
  if (!usaFx.length || !fx.aux_fundamentos) return t.skip('fixtures sem Carteira Ações USA / aux_fundamentos');
  // carteira real, com o que a planilha mostrava (valor) no lugar da fórmula antiga; DB-Stocks e GOOGLEFINANCE simulados com esse valor
  const larg = 45;
  const carteira = usaFx.map((l) => Array.from({ length: larg }, (_, j) => (l[j] == null ? '' : l[j])));
  const banco = new AbaFalsa('DB-Stocks', carteira.slice(8).filter((l) => l[0]).map((l) => { const r = Array.from({ length: 30 }, () => ''); r[0] = l[0]; r[26] = l[27]; r[27] = l[28]; return r; }));
  const googlePe = Object.fromEntries(carteira.slice(8).filter((l) => l[0]).map((l) => [l[0], l[36]]));
  carteira.slice(8).forEach((l) => { l[27] = { f: '=x', v: l[27] }; l[28] = { f: '=x', v: l[28] }; l[36] = { f: '=x', v: l[36] }; });
  const ss = planilhaFalsa({
    Auxiliar_ativos: linhas('Auxiliar_ativos'),
    aux_fundamentos: linhas('aux_fundamentos'),
    'Carteira Ações USA': new AbaFalsa('Carteira Ações USA', carteira),
    'DB-Stocks': banco,
    'Carteira Ações': new AbaFalsa('Carteira Ações', []),
  });
  const { sb } = sandboxGas(ss, { agora: AGORA });
  // ANTES: o que a planilha mostrava (P/VP = J / VPA do DB; P/L do GOOGLEFINANCE)
  const aba = ss.getSheetByName('Carteira Ações USA');
  const linhaDe = (tk) => 9 + carteira.slice(8).findIndex((l) => l[0] === tk);
  const antes = (tk) => { const r = linhaDe(tk); return { pvp: aba.valor(`J${r}`) / aba.valor(`AB${r}`), pl: aba.valor(`AK${r}`) }; };
  assert.ok(antes('GPRK').pvp > 20, 'antes: GPRK com P/VP absurdo');
  assert.ok(antes('VNOM').pl > 100, 'antes: VNOM com P/L absurdo');
  sb.fundGravarResumo_(ss, sb.fundLerTabela_(ss), AGORA);
  sb.corrigirFormulasValuationPlanilha();
  const ctx = { aba, abas: ss.abas, google: (tk) => googlePe[tk] };
  ['GPRK', 'VNOM', 'PROSY'].forEach((tk) => {
    const r = linhaDe(tk);
    const vpa = avaliarFormula(aba.formula(`AB${r}`), ctx);
    const pl = avaliarFormula(aba.formula(`AK${r}`), ctx);
    assert.equal(typeof vpa, 'number', `${tk}: VPA ${vpa}`);
    const pvp = aba.valor(`J${r}`) / vpa;
    assert.ok(pvp >= 0.05 && pvp <= 20, `${tk}: P/VP ${pvp}`);
    assert.ok(typeof pl === 'number' && pl > 0 && pl <= 100, `${tk}: P/L ${pl}`);
  });
});
