// tests/harness/transacoes.test.js
//
// 26/09/2026: tela Transações no Apps Script - Lancamentos.gs (conferir o
// que já está na planilha, gravar nas colunas certas, ordem de data, lote
// de RF Contratada) e Aportes.gs (aux_aportes: salvar, regravar pelo id,
// concluir, excluir; ativos do carrinho com o último preço pago; resumo por
// mês). Planilha falsa, valores inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const plain = (x) => JSON.parse(JSON.stringify(x));
const D = (s) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));

function planilhaFalsa(inicial = {}, { maxRows = 60 } = {}) {
  const abas = {};
  const criar = (nome, linhas = []) => {
    const dados = linhas.map((l) => [...l]);
    let max = Math.max(maxRows, dados.length);
    abas[nome] = {
      _dados: dados,
      getMaxRows: () => max,
      getLastRow: () => { for (let i = dados.length - 1; i >= 0; i--) if ((dados[i] || []).some((v) => v !== '' && v != null)) return i + 1; return 0; },
      insertRowsAfter: (_, n) => { max += n; },
      deleteRow: (r) => { dados.splice(r - 1, 1); },
      getRange: (r1, c1, n = 1, nc = 1) => ({
        getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: nc }, (_, j) => { const v = (dados[r1 - 1 + i] || [])[c1 - 1 + j]; return v == null ? '' : v; })),
        getValue: () => { const v = (dados[r1 - 1] || [])[c1 - 1]; return v == null ? '' : v; },
        setValues: (vals) => vals.forEach((l, i) => { const row = dados[r1 - 1 + i] || (dados[r1 - 1 + i] = []); l.forEach((v, j) => { row[c1 - 1 + j] = v; }); }),
        sort: ({ column }) => {
          const bloco = Array.from({ length: n }, (_, i) => (dados[r1 - 1 + i] || []).slice(c1 - 1, c1 - 1 + nc));
          const k = column - c1;
          const val = (x) => (x instanceof Date ? x.getTime() : x);
          bloco.sort((a, b) => (val(a[k]) < val(b[k]) ? -1 : val(a[k]) > val(b[k]) ? 1 : 0));
          bloco.forEach((l, i) => { const row = dados[r1 - 1 + i] || (dados[r1 - 1 + i] = []); l.forEach((v, j) => { row[c1 - 1 + j] = v; }); });
        },
      }),
    };
    return abas[nome];
  };
  Object.entries(inicial).forEach(([n, l]) => criar(n, l));
  return { getSheetByName: (n) => abas[n] || null, insertSheet: (n) => criar(n) };
}

const cab = (n) => Array.from({ length: n }, () => ['']);
function planilhaBase() {
  return planilhaFalsa({
    'Transações': [...cab(5), ['Ticker', 'Data', 'Tipo', 'Preço', 'Qtd.', 'Taxa'],
      ['ABCD3', D('2026-08-10'), 'Compra', 20, 10, ''], ['TEST11', D('2026-08-12'), 'Compra', 100, 1, ''], ['TEST11', D('2026-08-12'), 'Compra', 101, 1, '']],
    'Transações - USA': [...cab(5), ['Ticker'], ['AAA', D('2026-04-09'), 'Compra', 8.28, 2, '']],
    'Transações Renda Fixa': [...cab(5), ['Produto'], ['Tesouro Selic 2029', D('2025-01-06'), 'Compra', 'Credito', 'XP INVESTIMENTOS CCTVM S/A.', 0.1, 15000, 1500]],
    'Proventos': [...cab(6), ['Data Com'], ['', D('2026-08-25'), 'TEST11', 'Rendimento', 2, 0.8, 1.6]],
    'Proventos - USA': [...cab(6), ['Data Com']],
    'Carteira Ações': [['Ticker'], ['ABCD3'], ['NOVO3']],
    'Carteira FIIs': [['Ticker'], ['TEST11']],
    'Auxiliar_ativos': [['Classe', 'Ticker'],
      ['Ações', 'ABCD3', 'Empresa ABCD', '', 'R$', 20, 0.01, 10, 20, 25, 'Comprar', '', '', '', '', '', '', '', 200, 200],
      ['FIIs', 'TEST11', 'Fundo Teste', '', 'R$', 100, 0, 2, 100.5, 110, 'Aguardar', '', '', '', '', '', '', '', 201, 200],
      ['Ações EUA', 'AAA', 'Aaa Corp', '', 'US$', 10, 0, 2, 8.28, 12, 'Comprar', '', '', '', '', '', '', '', 16.56, 20]],
    'Carteira Renda Fixa': [...cab(8), ['', 'Renda Emergencial', '\t\nTesouro Selic 2029', 'Tesouro Selic (LFT)', 'SELIC', 'XP INVESTIMENTOS CCTVM S/A.', 0.1, '', 1500, '', D('2029-03-01'), 1600]],
    'RF Contratada - Lotes': [['Título']],
    'Distribuição e Metas': [],
  });
}

function sandbox(ss) {
  const registro = [];
  const caches = { limpou: 0 };
  const sb = {
    console: { log() {} }, Logger: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    Session: { getScriptTimeZone: () => 'America/Sao_Paulo' },
    Utilities: { formatDate: () => '20260926-101010' },
    chaveDiaISOInicio_: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    normalizarInstituicaoRF_: (i) => (String(i || '').toUpperCase().includes('XP') ? 'XP' : String(i || '').toUpperCase().replace(/[^A-Z0-9]/g, '')),
    classesDaCarteiraParaProventos_: () => ({ ABCD3: 'acoes', TEST11: 'fiis', AAA: 'acoesEua' }),
    mapasDoPatrimonioParaProventos_: () => ({ mapaCambioUsd: { '2026-04-01': 5 } }),
    cambioUsdParaData_: () => 5,
    gravarRegistroControle_: (...a) => registro.push(a),
    limparCacheHistoricoInicio_: () => { caches.limpou += 1; },
    jsonOut: (x) => x,
  };
  vm.createContext(sb);
  new vm.Script('this.Date = Date;').runInContext(sb);
  new vm.Script(['ImportB3.gs', 'Lancamentos.gs', 'Aportes.gs'].map((f) => fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8')).join('\n'), { filename: 'transacoes.gs' }).runInContext(sb);
  return { sb, registro, caches };
}

test('Lançamentos: simular separa novo / já lançado / parecido / bloqueado / incompleto', () => {
  const ss = planilhaBase();
  const { sb } = sandbox(ss);
  const itens = [
    { destino: 'transacoes', ticker: 'ABCD3', data: '2026-08-10', tipo: 'Compra', preco: 20, qtd: 10, taxa: 0 },
    { destino: 'transacoes', ticker: 'TEST11', data: '2026-08-12', tipo: 'Compra', preco: 100.5, qtd: 2, taxa: 0 },
    { destino: 'transacoes', ticker: 'ABCD3', data: '2026-09-01', tipo: 'Compra', preco: 21, qtd: 5, taxa: 0 },
    { destino: 'transacoes', ticker: 'ZZZZ3', data: '2026-09-01', tipo: 'Compra', preco: 1, qtd: 1, taxa: 0 },
    { destino: 'transacoesUsa', ticker: 'AAA', data: '2026-04-09', tipo: 'Compra', preco: 8.27, qtd: 1, taxa: 0.1 },
    { destino: 'transacoesUsa', ticker: 'AAA', data: '2026-04-09', tipo: 'Compra', preco: 8.27, qtd: 1, taxa: 0.1 },
    { destino: 'proventos', ticker: 'TEST11', dataPagamento: '2026-08-25', tipo: 'Rendimento', qtd: 2, valorPorCota: 0.8, valor: 1.6 },
    { destino: 'proventos', ticker: 'NINGUEM11', dataPagamento: '2026-08-25', tipo: 'Rendimento', qtd: 2, valorPorCota: 0.8, valor: 1.6 },
    { destino: 'rendaFixa', produto: 'Tesouro Selic 2029', data: '2025-01-06', movimentacao: 'Compra', entradaSaida: 'Credito', instituicao: 'XP INVESTIMENTOS CCTVM S/A', qtd: 0.1, preco: 15000, valor: 1500 },
    { destino: 'transacoes', ticker: 'ABCD3', data: '', tipo: 'Compra', preco: 1, qtd: 1 },
  ];
  const r = plain(sb.importarLancamentos_(itens, { simular: true }));
  assert.deepEqual(r.itens.map((c) => c.situacao), ['lancado', 'parecido', 'novo', 'bloqueado', 'parecido', 'parecido', 'lancado', 'bloqueado', 'lancado', 'invalido']);
  assert.match(r.itens[3].motivo, /Carteira/);
  assert.equal(r.total, 0);
  assert.equal(ss.getSheetByName('Transações')._dados.length, 9, 'simular não grava nada');
});

test('Lançamentos: grava só os novos (e os forçados), nas colunas certas, põe em ordem de data, lote de RF e limpa os caches', () => {
  const ss = planilhaBase();
  const { sb, registro, caches } = sandbox(ss);
  const itens = [
    { destino: 'transacoes', ticker: 'ABCD3', data: '2026-09-01', tipo: 'Compra', preco: 21, qtd: 5, taxa: 0 },
    { destino: 'transacoes', ticker: 'NOVO3', data: '2026-08-11', tipo: 'Compra', preco: 5, qtd: 3, taxa: 0 },
    { destino: 'transacoes', ticker: 'ABCD3', data: '2026-08-10', tipo: 'Compra', preco: 20, qtd: 10, taxa: 0 },
    { destino: 'transacoes', ticker: 'TEST11', data: '2026-08-12', tipo: 'Compra', preco: 100, qtd: 1, taxa: 0, forcar: true },
    { destino: 'proventos', ticker: 'ABCD3', dataCom: '', dataPagamento: '2026-09-10', tipo: 'JCP', qtd: 0, valorPorCota: 0, valor: 3.5 },
    { destino: 'rendaFixa', produto: 'Tesouro IPCA+ 2035', data: '2026-09-05', movimentacao: 'Compra', entradaSaida: 'Credito', instituicao: 'XP INVESTIMENTOS', qtd: 0.2, preco: 3000, valor: 600, taxaContratada: 'IPCA + 7,5%' },
    { destino: 'rendaFixa', produto: 'Tesouro Prefixado 2023', data: '2021-04-01', movimentacao: 'Transferencia', entradaSaida: 'Debito', instituicao: 'RICO', qtd: 0.5, preco: null, valor: null },
  ];
  const r = plain(sb.importarLancamentos_(itens, { simular: false, origem: 'Teste' }));
  assert.deepEqual(r.gravados, { transacoes: 3, rendaFixa: 2, proventos: 1 });
  assert.equal(r.lotesRf, 1);
  assert.deepEqual(r.itens.map((c) => c.situacao), ['gravado', 'gravado', 'lancado', 'gravado', 'gravado', 'gravado', 'gravado']);
  const tr = ss.getSheetByName('Transações')._dados.slice(6).map((l) => [l[0], sb.chaveDiaISOInicio_(l[1]), l[3], l[4], l[5]]);
  assert.deepEqual(tr, [
    ['ABCD3', '2026-08-10', 20, 10, ''], ['NOVO3', '2026-08-11', 5, 3, ''], ['TEST11', '2026-08-12', 100, 1, ''], ['TEST11', '2026-08-12', 101, 1, ''],
    ['TEST11', '2026-08-12', 100, 1, ''], ['ABCD3', '2026-09-01', 21, 5, ''],
  ]);
  const prov = ss.getSheetByName('Proventos')._dados[8];
  assert.deepEqual([prov[0], prov[2], prov[3], prov[4], prov[6]], ['', 'ABCD3', 'JCP', '-', 3.5]);
  const rf = ss.getSheetByName('Transações Renda Fixa')._dados.slice(6).map((l) => [l[0], l[2], l[5], l[6], l[7]]);
  assert.deepEqual(rf[0], ['Tesouro Prefixado 2023', 'Transferencia', 0.5, '-', '-'], 'antes, pela data');
  assert.deepEqual(ss.getSheetByName('RF Contratada - Lotes')._dados[1].slice(6), ['IPCA', 0.075, 'IPCA + 7,5%']);
  assert.equal(caches.limpou, 1);
  assert.equal(registro.length, 1);
  assert.match(registro[0][2], /3 em Transações/);
});

test('Aportes: aux_aportes criada no 1º salvar; regravar pelo id; concluir tira quem não comprou; excluir; último pago vem do aporte mais novo', () => {
  const ss = planilhaBase();
  const { sb } = sandbox(ss);
  const id = sb.salvarAporte_({ data: '2026-09-26', status: 'aguardando', observacao: 'dia 26', itens: [
    { classe: 'fiis', ativo: 'TEST11', qtdPlanejada: 3, precoPlanejado: 100, valorPlanejado: 300 },
    { classe: 'acoesEua', ativo: 'AAA', qtdPlanejada: 1.5, precoPlanejado: 10, valorPlanejado: 15 },
    { classe: 'rendaFixa', ativo: 'Tesouro Selic 2029', instituicao: 'XP INVESTIMENTOS CCTVM S/A.', valorPlanejado: 500 },
  ] });
  assert.match(id, /^AP-/);
  let aportes = plain(sb.lerAportes_(ss));
  assert.equal(aportes.length, 1);
  assert.equal(aportes[0].status, 'aguardando');
  assert.equal(aportes[0].itens[1].moeda, 'USD');
  assert.equal(ss.getSheetByName('aux_aportes')._dados[1][2], 'Aguardando');
  sb.salvarAporte_({ id, data: '2026-09-26', status: 'concluido', itens: [
    { classe: 'fiis', ativo: 'TEST11', qtdPlanejada: 3, precoPlanejado: 100, valorPlanejado: 300, qtdFinal: 3, precoFinal: 99, valorFinal: 297 },
    { classe: 'acoesEua', ativo: 'AAA', qtdPlanejada: 1.5, precoPlanejado: 10, valorPlanejado: 15, qtdFinal: 0, precoFinal: 10, valorFinal: 0 },
    { classe: 'rendaFixa', ativo: 'Tesouro Selic 2029', instituicao: 'XP INVESTIMENTOS CCTVM S/A.', valorPlanejado: 500, valorFinal: 480 },
  ] });
  aportes = plain(sb.lerAportes_(ss));
  assert.equal(aportes.length, 1, 'regravou, não duplicou');
  assert.equal(aportes[0].status, 'concluido');
  assert.deepEqual(aportes[0].itens.map((i) => i.ativo), ['TEST11', 'Tesouro Selic 2029']);
  assert.throws(() => sb.salvarAporte_({ data: '2026-09-26', status: 'concluido', itens: [{ classe: 'fiis', ativo: 'X', valorFinal: 0 }] }), /Cancelar aporte/);
  assert.throws(() => sb.salvarAporte_({ data: '26/09', status: 'aguardando', itens: [{ classe: 'fiis', ativo: 'X' }] }), /data inválida/);

  const tela = plain(sb.montarTelaTransacoes_());
  const fii = tela.classes.fiis.find((a) => a.ticker === 'TEST11');
  assert.deepEqual(fii.ultimoPago, { preco: 99, qtd: 3, data: '2026-09-26', origem: 'aporte' });
  const acao = tela.classes.acoes.find((a) => a.ticker === 'ABCD3');
  assert.deepEqual([acao.precoAtual, acao.vies, acao.precoTeto, acao.ultimoPago.preco, acao.ultimoPago.data], [20, 'Comprar', 25, 20, '2026-08-10']);
  assert.equal(tela.classes.rendaFixa[0].titulo, 'Tesouro Selic 2029');
  assert.equal(tela.classes.rendaFixa[0].ultimoPago.valor, 480);
  assert.deepEqual(tela.resumo['2026-08'], { acoes: 200, fiis: 201, acoesEua: 0, acoesEuaUsd: 0, rendaFixa: 0, total: 401 });
  assert.deepEqual(tela.resumo['2026-04'], { acoes: 0, fiis: 0, acoesEua: 82.8, acoesEuaUsd: 16.56, rendaFixa: 0, total: 82.8 });
  assert.equal(tela.lancamentos[0].data, '2026-08-25');

  assert.equal(sb.excluirAporte_(id), 2);
  assert.equal(sb.lerAportes_(ss).length, 0);
});
