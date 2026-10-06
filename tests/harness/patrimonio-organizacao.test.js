// tests/harness/patrimonio-organizacao.test.js
//
// 27/09/2026: apps-script/Patrimonio.gs (aba "Patrimônio" da Organização
// Financeira).
//  1) Planilha REAL (fixtures.json, se existir): a tela monta com os
//     investimentos da Início, o investido mês a mês da mesma série e as
//     despesas/metas da Distribuição e Metas (índices falsos - sem rede).
//  2) Gravação, normalização e índices numa planilha falsa em memória
//     (valores inventados - o repositório é público).
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

const INDICES_FALSOS = {
  fipezap: () => ({ serie: [['2024-01', 100], ['2025-01', 110]], precoM2: 9000, mesPreco: '2025-01' }),
  ivgr: () => [['2024-01', 500], ['2025-01', 520]],
};

test('Patrimônio (planilha real): investimentos da Início, investido por mês da série e despesas/metas da DM', (t) => {
  if (!fs.existsSync(FIXTURES)) { t.skip('sem fixtures.json'); return; }
  const raw = JSON.parse(fs.readFileSync(FIXTURES, 'utf8'));
  const sb = { console: { ...console, log() {} } };
  vm.createContext(sb);
  montarSandboxComFixtures_(raw, sb);
  for (const f of fs.readdirSync(path.join(ROOT, 'apps-script')).filter((x) => x.endsWith('.gs')).sort()) {
    new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8'), { filename: f }).runInContext(sb);
  }
  const ss = sb.SpreadsheetApp.getActiveSpreadsheet();
  // 06/10/2026 (Controle 17): a planilha real já tem a aba aux_patrimonio-indices PREENCHIDA (o app gravou a série do FipeZap/IVG-R em
  // 27/09), e o código a usa em vez de buscar - o teste de "gravar e ler os índices falsos" parte de uma aba vazia, como na Controle 16.
  const abaIndices = ss.getSheetByName('aux_patrimonio-indices');
  if (abaIndices && typeof abaIndices.clearContents === 'function') abaIndices.clearContents();
  const r = semRealm(sb.montarTelaPatrimonio_(ss, new sb.Date(), { buscarIndices: INDICES_FALSOS }));
  const erros = [];
  const home = semRealm(sb.montarHome_());
  if (!perto(r.investimentos.total, home.patrimonio.total)) erros.push('total != Início');
  if (!perto(r.investimentos.longoPrazo + r.investimentos.reserva, r.investimentos.total)) erros.push('longo prazo + reserva != total');
  const serie = semRealm(sb.montarSerieHistoricoInicio_());
  const porMes = {};
  serie.forEach((p) => { const m = p.data.slice(0, 7); porMes[m] = (porMes[m] || 0) + (p.fluxoCaixaLongoPrazo || 0); });
  r.historicoMensal.forEach((m) => { if (!perto(m.aporteLongoPrazo, porMes[m.mes] || 0)) erros.push(`${m.mes}: aporte LP ${m.aporteLongoPrazo} x série ${porMes[m.mes]}`); });
  const ultimo = serie[serie.length - 1];
  const ultMes = r.historicoMensal[r.historicoMensal.length - 1];
  if (!perto(ultMes.patrimonio, ultimo.patrimonio)) erros.push('último mês != último ponto da série');
  assert.ok(r.despesas.itens.length > 0, 'veio a lista de despesas');
  assert.ok(r.metas.rendimento > 0, 'veio o rendimento da DM (M18)');
  assert.equal(r.indices.fipezap.length, 2, 'índices (falsos) gravados e lidos da aba');
  t.diagnostic(`${r.historicoMensal.length} meses de histórico · ${r.despesas.itens.length} despesas · avisos: ${JSON.stringify(r.avisos || {})}`);
  assert.deepEqual(erros, []);
});

// --- planilha falsa ---------------------------------------------------------
function criarFalsa() {
  const abas = new Map();
  const nova = (nome) => {
    const cel = new Map();
    const col = (l) => l.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    const aba = {
      nome,
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
  return { abas, getSheetByName: (n) => abas.get(n) || null, insertSheet: (n) => { const a = nova(n); abas.set(n, a); return a; } };
}

function sandbox() {
  const sb = {
    console: { ...console, log() {} },
    SpreadsheetApp: { flush() {} },
    Utilities: { getUuid: (() => { let n = 0; return () => `id-${++n}`; })() },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    Logger: { log() {} },
  };
  vm.createContext(sb);
  new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', 'Patrimonio.gs'), 'utf8'), { filename: 'Patrimonio.gs' }).runInContext(sb);
  return sb;
}

test('salvarPatrimonio_: grava por chave (JSON), substitui na 2ª vez, apaga com vazio e devolve a config', () => {
  const sb = sandbox();
  const ss = criarFalsa();
  const agora = new Date('2026-01-10T12:00:00Z');
  let r = semRealm(sb.salvarPatrimonio_(ss, 'imovel', JSON.stringify({ valorCompra: 300000, dataCompra: '2022-05', cidade: 'Cidade X', metodo: 'fipezap', lixo: 'fora' }), agora));
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.config), ['imovel']);
  assert.equal(r.config.imovel.valorCompra, 300000);
  assert.equal(r.config.imovel.lixo, undefined, 'campo desconhecido não entra');
  r = semRealm(sb.salvarPatrimonio_(ss, 'imovel', JSON.stringify({ valorCompra: 310000, dataCompra: '2022-05' }), agora));
  assert.equal(r.config.imovel.valorCompra, 310000);
  assert.equal(r.config.imovel.metodo, 'media', 'método padrão');
  assert.equal(ss.getSheetByName('aux_patrimonio').getLastRow(), 2, 'substituiu a linha');
  sb.salvarPatrimonio_(ss, 'outros', JSON.stringify([{ nome: '=Carro', tipo: 'bem', valor: 20000 }, { nome: 'Empréstimo', tipo: 'divida', valor: 5000 }]), agora);
  r = semRealm(sb.salvarPatrimonio_(ss, 'imovel', '', agora));
  assert.deepEqual(Object.keys(r.config), ['outros']);
  assert.equal(r.config.outros[0].nome, 'Carro', 'fórmula neutralizada');
  assert.equal(r.config.outros[1].tipo, 'divida');
  assert.ok(r.config.outros[0].id, 'ganha um id');
});

test('salvarPatrimonio_: recusa chave desconhecida, JSON quebrado e números fora do esperado', () => {
  const sb = sandbox();
  const ss = criarFalsa();
  assert.equal(sb.salvarPatrimonio_(ss, 'senha', '{}').ok, false);
  assert.equal(sb.salvarPatrimonio_(ss, 'fies', '{quebrado').ok, false);
  assert.throws(() => sb.salvarPatrimonio_(ss, 'fies', JSON.stringify({ saldo: 1000, taxaMensal: 0.5 })), /taxaMensal/);
  assert.throws(() => sb.salvarPatrimonio_(ss, 'imovel', JSON.stringify({ valorCompra: 0, dataCompra: '2020-01' })), /valor de compra/);
  assert.throws(() => sb.salvarPatrimonio_(ss, 'financiamento', JSON.stringify({ saldo: 'abc' })), /saldo/);
});

test('normalizarPatrimonio_: FGTS e IR guardam só os totais conhecidos', () => {
  const sb = sandbox();
  const fgts = semRealm(sb.normalizarPatrimonio_('fgts', { contas: [{ empregador: 'Empresa Z', admissao: '2020-02-03', saldo: 1500, dataSaldo: '2026-01-21', mensal: [['2026-01', 1500], ['xx', 1]], saques: { aniversario: 100 }, pis: '123', movimentos: [{}] }] }));
  assert.deepEqual(Object.keys(fgts.contas[0]).includes('pis'), false);
  assert.deepEqual(Object.keys(fgts.contas[0]).includes('movimentos'), false, 'os lançamentos um a um não vão pra planilha');
  assert.deepEqual(fgts.contas[0].mensal, [['2026-01', 1500]]);
  const ir = semRealm(sb.normalizarPatrimonio_('ir', { anos: [{ ano: 2025, exercicio: 2026, bens: 10, grupos: { '04': { anterior: 1, atual: 10, qtd: 1 } }, cpf: 'x' }, { ano: 2023, bens: 5 }] }));
  assert.deepEqual(ir.anos.map((a) => a.ano), [2023, 2025], 'em ordem de ano');
  assert.equal(ir.anos[1].cpf, undefined);
});

test('historicoMensalPatrimonio_: último patrimônio do mês e soma dos aportes do mês', () => {
  const sb = sandbox();
  const r = semRealm(sb.historicoMensalPatrimonio_([
    { data: '2026-01-02', patrimonio: 100, rendaEmergencial: 10, fluxoCaixaPatrimonio: 50, fluxoCaixaLongoPrazo: 40, fluxoCaixaRendaEmergencial: 10 },
    { data: '2026-01-30', patrimonio: 160, rendaEmergencial: 10, fluxoCaixaPatrimonio: 5, fluxoCaixaLongoPrazo: 5, fluxoCaixaRendaEmergencial: 0 },
    { data: '2026-02-03', patrimonio: 170, rendaEmergencial: 12, fluxoCaixaPatrimonio: 0 },
  ]));
  assert.deepEqual(r.map((m) => [m.mes, m.patrimonio, m.aporte, m.aporteLongoPrazo]), [['2026-01', 160, 55, 45], ['2026-02', 170, 0, 0]]);
});

// 05/10/2026 (auditoria A-09): linha repetida na série não conta em dobro
test('historicoMensalPatrimonio_: dia repetido na série conta uma vez só (a última linha do dia vence)', () => {
  const sb = sandbox();
  const r = semRealm(sb.historicoMensalPatrimonio_([
    { data: '2026-01-02', patrimonio: 100, fluxoCaixaPatrimonio: 50, fluxoCaixaLongoPrazo: 40 },
    { data: '2026-01-02', patrimonio: 105, fluxoCaixaPatrimonio: 50, fluxoCaixaLongoPrazo: 40 },
    { data: '2026-01-30', patrimonio: 160, fluxoCaixaPatrimonio: 5, fluxoCaixaLongoPrazo: 5 },
    { data: '2026-01-30', patrimonio: 160, fluxoCaixaPatrimonio: 5, fluxoCaixaLongoPrazo: 5 },
    { data: '2026-02-03', patrimonio: 170 },
  ]));
  assert.deepEqual(r.map((m) => [m.mes, m.patrimonio, m.aporte, m.aporteLongoPrazo]), [['2026-01', 160, 55, 45], ['2026-02', 170, 0, 0]]);
});

test('FipeZap: acha a aba da cidade pelo nome (sem acento) e lê índice e preço médio; o "." de mês sem dado fica de fora', () => {
  const sb = sandbox();
  const arq = {
    'xl/workbook.xml': '<workbook><sheets><sheet name="Resumo" sheetId="1" r:id="rId1"/><sheet name="Cidade Ñ" sheetId="2" r:id="rId7"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId7" Type="x" Target="worksheets/sheet9.xml"/></Relationships>',
    'xl/worksheets/sheet9.xml': '<sheetData><row r="4"><c r="B4" t="s"><v>5</v></c></row>'
      + '<row r="5"><c r="B5" s="1"><v>45292</v></c><c r="C5" t="s"><v>92</v></c></row>'
      + '<row r="6"><c r="B6" s="1"><v>45323</v></c><c r="C6"><v>100.5</v></c><c r="R6"><v>8000.123</v></c></row>'
      + '<row r="7"><c r="B7" s="1"><v>45352</v></c><c r="C7"><v>101</v></c><c r="R7" t="s"><v>92</v></c></row></sheetData>',
  };
  const r = semRealm(sb.lerFipezapXlsx_(arq, 'cidade n'));
  assert.deepEqual(r.serie, [['2024-02', 100.5], ['2024-03', 101]]);
  assert.equal(r.precoM2, 8000.12);
  assert.equal(r.mesPreco, '2024-02');
  assert.throws(() => sb.lerFipezapXlsx_(arq, 'Outra'), /não achei a aba/);
  assert.deepEqual(semRealm(sb.serieIvgrDeJson_([{ data: '01/02/2024', valor: '10.5' }, { data: '01/01/2024', valor: '10' }, { data: 'x', valor: '1' }])), [['2024-01', 10], ['2024-02', 10.5]]);
});

test('lerIndicesPatrimonio_: busca e grava; dentro de 15 dias usa a aba; se a busca falhar, fica com o que tinha e avisa', () => {
  const sb = sandbox();
  const ss = criarFalsa();
  let buscas = 0;
  const buscar = { fipezap: () => { buscas += 1; return INDICES_FALSOS.fipezap(); }, ivgr: () => INDICES_FALSOS.ivgr() };
  const d0 = new Date('2026-03-01T12:00:00Z');
  let r = semRealm(sb.lerIndicesPatrimonio_(ss, 'Cidade X', d0, buscar));
  assert.equal(buscas, 1);
  assert.deepEqual(r.fipezap, [['2024-01', 100], ['2025-01', 110]]);
  assert.deepEqual(r.ivgr, [['2024-01', 500], ['2025-01', 520]]);
  assert.equal(r.cidade, 'Cidade X');
  r = semRealm(sb.lerIndicesPatrimonio_(ss, 'Cidade X', new Date('2026-03-10T12:00:00Z'), buscar));
  assert.equal(buscas, 1, 'fresco: não buscou de novo');
  const falha = { fipezap: () => { throw new Error('sem rede'); }, ivgr: () => { throw new Error('sem rede'); } };
  r = semRealm(sb.lerIndicesPatrimonio_(ss, 'Cidade X', new Date('2026-04-10T12:00:00Z'), falha));
  assert.equal(r.fipezap.length, 2, 'ficou com os antigos');
  assert.match(r.aviso, /não atualizaram/);
  sb.lerIndicesPatrimonio_(ss, 'Outra Cidade', new Date('2026-04-11T12:00:00Z'), buscar);
  assert.equal(buscas, 2, 'mudou a cidade: busca de novo');
});

// 03/10/2026 (Patrimônio vs. inflação - patrimonio-inflacao.js): CDI e IPCA
// do fim de cada mês junto do histórico mensal.
test('historicoMensalPatrimonio_: CDI e IPCA (base 100) do último dia de cada mês', () => {
  const sb = sandbox();
  const r = semRealm(sb.historicoMensalPatrimonio_([
    { data: '2026-01-02', patrimonio: 100, indiceCdi: 100.05, indiceIpca: 100.01 },
    { data: '2026-01-30', patrimonio: 160, indiceCdi: 101, indiceIpca: 100.4 },
    { data: '2026-02-03', patrimonio: 170, indiceCdi: 101.2, indiceIpca: 100.45 },
    { data: '2026-03-01', patrimonio: 175 },
  ]));
  assert.deepEqual(r.map((m) => [m.mes, m.indiceCdi, m.indiceIpca]), [['2026-01', 101, 100.4], ['2026-02', 101.2, 100.45], ['2026-03', undefined, undefined]]);
});

test('Patrimônio (planilha real): CDI e IPCA em todos os meses do histórico, iguais aos da série da Início', (t) => {
  if (!fs.existsSync(FIXTURES)) { t.skip('sem fixtures.json'); return; }
  const raw = JSON.parse(fs.readFileSync(FIXTURES, 'utf8'));
  const sb = { console: { ...console, log() {} } };
  vm.createContext(sb);
  montarSandboxComFixtures_(raw, sb);
  for (const f of fs.readdirSync(path.join(ROOT, 'apps-script')).filter((x) => x.endsWith('.gs')).sort()) {
    new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8'), { filename: f }).runInContext(sb);
  }
  const r = semRealm(sb.montarTelaPatrimonio_(sb.SpreadsheetApp.getActiveSpreadsheet(), new sb.Date(), { buscarIndices: INDICES_FALSOS }));
  const serie = semRealm(sb.montarSerieHistoricoInicio_());
  const fimDoMes = {};
  serie.forEach((p) => { fimDoMes[p.data.slice(0, 7)] = p; });
  const erros = [];
  r.historicoMensal.forEach((m) => {
    if (typeof m.indiceCdi !== 'number' || typeof m.indiceIpca !== 'number') erros.push(`${m.mes}: sem índice`);
    else if (m.indiceCdi !== fimDoMes[m.mes].indiceCdi || m.indiceIpca !== fimDoMes[m.mes].indiceIpca) erros.push(`${m.mes}: diferente da série`);
  });
  assert.ok(r.historicoMensal.length > 12);
  assert.deepEqual(erros, []);
});
