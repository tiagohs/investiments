// tests/harness/aconfirmar.test.js
//
// 05/10/2026 (A-24 e A-22): lançamentos "a confirmar" (aporte concluído de ação/FII/Renda Fixa que a
// importação da B3 ainda não trouxe; derivado, nada gravado nas abas) e custo em reais das ações EUA
// com o câmbio da compra. Planilha falsa, valores inventados.
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

const CAMBIO = { '2026-04-01': 5, '2026-06-01': 6 };
function sandbox(ss) {
  const sb = {
    console: { log() {} }, Logger: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    Session: { getScriptTimeZone: () => 'America/Sao_Paulo' },
    Utilities: { formatDate: () => '20261005-101010' },
    chaveDiaISOInicio_: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    normalizarInstituicaoRF_: (i) => (String(i || '').toUpperCase().includes('XP') ? 'XP' : String(i || '').toUpperCase().replace(/[^A-Z0-9]/g, '')),
    classesDaCarteiraParaProventos_: () => ({ ABCD3: 'acoes', TEST11: 'fiis', AAA: 'acoesEua' }),
    mapasDoPatrimonioParaProventos_: () => ({ mapaCambioUsd: CAMBIO }),
    cambioUsdParaData_: (mapa, chaves, data) => { let m = null; chaves.forEach((c) => { if (c <= data) m = c; }); return m ? mapa[m] : mapa[chaves[0]]; },
    gravarRegistroControle_: () => {}, limparCacheHistoricoInicio_: () => {}, jsonOut: (x) => x,
  };
  vm.createContext(sb);
  new vm.Script('this.Date = Date;').runInContext(sb);
  new vm.Script(['Planilha.gs', 'ImportB3.gs', 'Lancamentos.gs', 'Aportes.gs', 'CarteirasHome.gs'].map((f) => fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8')).join('\n'), { filename: 'aconfirmar.gs' }).runInContext(sb);
  return sb;
}

const concluido = (sb, ss, data, itens) => sb.salvarAporte_({ data, status: 'concluido', observacao: '', itens: itens.map((i) => ({ valorFinal: i.qtdFinal && i.precoFinal ? i.qtdFinal * i.precoFinal : undefined, ...i })) });

test('A-24: aporte concluído sem lançamento vira "a confirmar" (ação/FII e Renda Fixa; EUA fora) e some quando a importação traz o lançamento', () => {
  const ss = planilhaBase();
  const sb = sandbox(ss);
  const id = concluido(sb, ss, '2026-09-30', [
    { classe: 'acoes', ativo: 'ABCD3', qtdPlanejada: 5, precoPlanejado: 20, qtdFinal: 5, precoFinal: 20.2, valorFinal: 101 },
    { classe: 'fiis', ativo: 'TEST11', qtdPlanejada: 2, precoPlanejado: 100, qtdFinal: 2, precoFinal: 100, valorFinal: 200 },
    { classe: 'acoesEua', ativo: 'AAA', qtdPlanejada: 1, precoPlanejado: 10, qtdFinal: 1, precoFinal: 10, valorFinal: 10 },
    { classe: 'rendaFixa', ativo: 'Tesouro Selic 2029', instituicao: 'XP INVESTIMENTOS CCTVM S/A.', valorPlanejado: 500, valorFinal: 500 },
  ]);
  let r = plain(sb.lancamentosAConfirmarDaPlanilha_(ss, null, null));
  assert.deepEqual(r.map((x) => [x.ativo, x.destino, x.qtd, x.valor]).sort(), [
    ['ABCD3', 'transacoes', 5, 101], ['TEST11', 'transacoes', 2, 200], ['Tesouro Selic 2029', 'rendaFixa', null, 500],
  ].sort(), 'Ações EUA não entra');
  assert.ok(r.every((x) => x.aConfirmar === true && x.aporteId === id && x.tipo === 'Compra'));
  assert.equal(ss.getSheetByName('Transações').getLastRow(), 9, 'nada é gravado nas abas reais (3 linhas de dados + cabeçalho)');

  // a importação traz ABCD3 (2 dias depois, mesma quantidade) e a aplicação do Tesouro: somem; TEST11 continua
  const resultado = plain(sb.importarLancamentos_([
    { destino: 'transacoes', ticker: 'ABCD3', data: '2026-10-02', tipo: 'Compra', preco: 20.2, qtd: 5, taxa: 0 },
    { destino: 'rendaFixa', produto: 'Tesouro Selic 2029', data: '2026-09-30', movimentacao: 'Compra', entradaSaida: 'Credito', instituicao: 'XP INVESTIMENTOS CCTVM S/A.', qtd: 0.03, preco: 16666.67, valor: 500 },
  ], { origem: 'Teste' }));
  assert.equal(resultado.total, 2);
  r = plain(sb.lancamentosAConfirmarDaPlanilha_(ss, null, null));
  assert.deepEqual(r.map((x) => x.ativo), ['TEST11']);

  // sem duplicar: reconciliar de novo (nada novo na planilha) não muda nada
  assert.deepEqual(plain(sb.lancamentosAConfirmarDaPlanilha_(ss, null, null)).map((x) => x.ativo), ['TEST11']);
});

test('A-24: casamento por janela de datas, quantidade parcial e consumo (um lançamento cobre um aporte só)', () => {
  const ss = planilhaBase(); // ABCD3 já tem 10 em 10/08 e TEST11 2 em 12/08
  const sb = sandbox(ss);
  // aporte de 10/08 com 10 de ABCD3 já está lançado; outro igual, 3 semanas depois, não
  concluido(sb, ss, '2026-08-10', [{ classe: 'acoes', ativo: 'ABCD3', qtdFinal: 10, precoFinal: 20 }]);
  assert.equal(plain(sb.lancamentosAConfirmarDaPlanilha_(ss, null, null)).length, 0, 'lançamento do mesmo dia cobre');
  concluido(sb, ss, '2026-09-01', [{ classe: 'acoes', ativo: 'ABCD3', qtdFinal: 10, precoFinal: 20 }]);
  assert.equal(plain(sb.lancamentosAConfirmarDaPlanilha_(ss, null, null)).length, 1, 'lançamento de agosto não cobre o aporte de setembro (fora da janela)');
  // TEST11 (2 cotas lançadas em 12/08): cobre o aporte de 12/08 e só um deles quando há dois iguais
  concluido(sb, ss, '2026-08-12', [{ classe: 'fiis', ativo: 'TEST11', qtdFinal: 2, precoFinal: 100 }]);
  assert.deepEqual(plain(sb.lancamentosAConfirmarDaPlanilha_(ss, null, null)).map((x) => x.ativo), ['ABCD3'], 'só o aporte de setembro sobra');
  concluido(sb, ss, '2026-08-13', [{ classe: 'fiis', ativo: 'TEST11', qtdFinal: 2, precoFinal: 100 }]);
  assert.deepEqual(plain(sb.lancamentosAConfirmarDaPlanilha_(ss, null, null)).map((x) => x.ativo).sort(), ['ABCD3', 'TEST11'], 'um lançamento não cobre dois aportes');
});

test('A-24: lançamento parcial deixa só o que falta a confirmar (quantidade que sobrou)', () => {
  const ss = planilhaBase();
  const sb = sandbox(ss);
  concluido(sb, ss, '2026-08-12', [{ classe: 'fiis', ativo: 'TEST11', qtdFinal: 5, precoFinal: 100 }]); // planilha tem 2 de TEST11 em 12/08
  const r = plain(sb.lancamentosAConfirmarDaPlanilha_(ss, null, null));
  assert.equal(r.length, 1);
  assert.equal(r[0].qtd, 3);
  assert.equal(r[0].valor, 300);
  // tolerância de 2%: 99 de 100 cotas lançadas conta como confirmado
  const ss2 = planilhaBase();
  ss2.getSheetByName('Transações')._dados.push(['NOVO3', D('2026-09-01'), 'Compra', 10, 99, '']);
  const sb2 = sandbox(ss2);
  concluido(sb2, ss2, '2026-09-01', [{ classe: 'acoes', ativo: 'NOVO3', qtdFinal: 100, precoFinal: 10 }]);
  assert.equal(plain(sb2.lancamentosAConfirmarDaPlanilha_(ss2, null, null)).length, 0);
});

test('A-24: aporte aguardando não entra; a tela e o aviso do header trazem a lista; salvar/excluir devolvem a lista nova', () => {
  const ss = planilhaBase();
  const sb = sandbox(ss);
  sb.salvarAporte_({ data: '2026-09-30', status: 'aguardando', itens: [{ classe: 'acoes', ativo: 'ABCD3', qtdPlanejada: 5, precoPlanejado: 20 }] });
  assert.equal(plain(sb.lancamentosAConfirmarDaPlanilha_(ss, null, null)).length, 0);
  assert.deepEqual(plain(sb.handleAportesPendentes({}, { ok: true })).aConfirmar, []);
  const r = plain(sb.handleSalvarAporte({ parameter: { aporte: JSON.stringify({ data: '2026-09-30', status: 'concluido', itens: [{ classe: 'acoes', ativo: 'ABCD3', qtdFinal: 5, precoFinal: 20, valorFinal: 100 }] }) } }));
  assert.equal(r.ok, true);
  assert.equal(r.aConfirmar.length, 1);
  assert.equal(plain(sb.handleAportesPendentes({}, { ok: true })).aConfirmar.length, 1);
  const tela = plain(sb.montarTelaTransacoes_());
  assert.equal(tela.aConfirmar.length, 1);
  const x = plain(sb.handleExcluirAporte({ parameter: { id: r.id } }));
  assert.deepEqual(x.aConfirmar, []);
});

test('A-22: custo em reais de cada ação EUA com o câmbio do dia de cada compra (custo médio na venda)', () => {
  const ss = planilhaBase();
  const sb = sandbox(ss);
  const usa = ss.getSheetByName('Transações - USA');
  usa._dados.length = 0;
  usa._dados.push(...cab(5), ['Ticker'],
    ['AAA', D('2026-04-09'), 'Compra', 10, 2, 1], // (20 + 1) US$ a 5,00 = 105
    ['AAA', D('2026-06-10'), 'Compra', 12, 1, 0], // 12 US$ a 6,00 = 72 -> custo 177 p/ 3 cotas
    ['AAA', D('2026-06-20'), 'Venda', 15, 1, 0], // sai 1/3 do custo (59) -> sobra 118
    ['BBB', D('2026-04-09'), 'Compra', 5, 2, 0]); // 10 US$ a 5,00 = 50
  const c = plain(sb.custoBrlAcoesEuaPorTicker_(ss));
  assert.deepEqual(c, { AAA: 118, BBB: 50 });
  // o câmbio de hoje não entra: mudar o mapa de hoje não muda o custo
  CAMBIO['2026-10-05'] = 9;
  assert.deepEqual(plain(sb.custoBrlAcoesEuaPorTicker_(ss)), { AAA: 118, BBB: 50 });
  delete CAMBIO['2026-10-05'];
  // posição zerada não aparece
  usa._dados.push(['BBB', D('2026-07-01'), 'Venda', 6, 2, 0]);
  assert.deepEqual(plain(sb.custoBrlAcoesEuaPorTicker_(ss)), { AAA: 118 });
});
