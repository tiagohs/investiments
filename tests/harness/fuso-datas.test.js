// tests/harness/fuso-datas.test.js - 07/10/2026 (Tiago colou as compras do fundo e as datas ficaram UM DIA ANTES na planilha).
// O script roda em America/Sao_Paulo e a PLANILHA em America/New_York: toda data que o site GRAVA é a meia-noite NO FUSO DA PLANILHA
// (Planilha.gs!dataNaPlanilha_) e a leitura (chaveDiaISOInicio_, fuso do script) devolve o MESMO dia. A função de 1 vez
// (corrigirDatasGravadasNoFusoDireto) conserta o que já foi gravado como meia-noite de São Paulo. Dados INVENTADOS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planilhaFalsa, sandboxGas, plain } from './planilha-falsa.mjs';

const NY = 'America/New_York';
const SP = 'America/Sao_Paulo';
const brancas = (n) => Array.from({ length: n }, () => ['']);
const fmt = (sb, d, tz, f) => sb.Utilities.formatDate(d, tz, f);

function montar(fuso = NY, extras = {}) {
  const ss = planilhaFalsa({
    'Transações': [...brancas(5), ['Ticker', 'Data', 'Tipo', 'Preço', 'Qtd.', 'Taxa']],
    'Transações - USA': [...brancas(5), ['Ticker', 'Data']],
    'Transações Renda Fixa': [...brancas(5), ['Produto', 'Data']],
    'Proventos': [...brancas(6), ['Data Com', 'Data do pagamento', 'Ticker', 'Tipo']],
    'Proventos - USA': [...brancas(6), ['Data Com']],
    'RF Contratada - Lotes': [['Título', 'Instituição', 'Data']],
    'Carteira Ações': [['Ticker']], 'Carteira FIIs': [['Ticker']],
    'Auxiliar_ativos': [['Classe', 'Ticker'], ['Ações EUA', 'BBBB']],
    'Carteira Renda Fixa': [...brancas(7), ['Código', 'Marca', 'Título', 'Tipo', 'Indexador', 'Instituição']],
    ...extras,
  }, { fuso });
  const { sb } = sandboxGas(ss);
  return { ss, sb };
}

/** Date que o script do Tiago (SP) gravaria hoje: meia-noite de São Paulo. */
const meiaNoiteSp = (sb, chave) => sb.Utilities.parseDate(chave, SP, 'yyyy-MM-dd');

test('helper: dataNaPlanilha_ é a meia-noite NO FUSO DA PLANILHA e a leitura (fuso do script) devolve o mesmo dia', () => {
  // a leitura (fuso do script, São Paulo) devolve o mesmo dia quando a planilha está no fuso de SP ou a oeste dele (Nova York, o caso real)
  for (const fuso of [NY, SP]) {
    const { ss, sb } = montar(fuso);
    for (const chave of ['2026-10-05', '2026-03-08', '2026-11-01', '2025-02-05', '2026-12-31', '2027-01-01']) {
      const d = sb.dataNaPlanilha_(ss, chave);
      assert.equal(fmt(sb, d, fuso, 'HH:mm:ss'), '00:00:00', `${fuso} ${chave}: meia-noite no fuso da planilha`);
      assert.equal(fmt(sb, d, fuso, 'yyyy-MM-dd'), chave, `${fuso} ${chave}: o dia na planilha`);
      assert.equal(sb.chaveDiaISOInicio_(d), chave, `${fuso} ${chave}: o site (fuso do script) lê o mesmo dia`);
    }
  }
});

test('helper: vazio/inválido devolve vazio; Date entra como o dia dela no fuso do script; sem fuso na planilha cai no do script', () => {
  const { ss, sb } = montar(NY);
  for (const v of ['', null, undefined, 'abc', '05/10/2026']) assert.equal(sb.dataNaPlanilha_(ss, v), '', String(v));
  const d = sb.dataNaPlanilha_(ss, meiaNoiteSp(sb, '2026-10-05'));
  assert.equal(fmt(sb, d, NY, 'yyyy-MM-dd'), '2026-10-05');
  assert.equal(fmt(sb, d, NY, 'HH:mm'), '00:00');
  assert.equal(sb.dataNaPlanilha_(null, '2026-10-05').getTime(), sb.dataNaPlanilha_(ss, '2026-10-05').getTime(), 'sem ss usa a planilha ativa');
  const semFuso = { getSpreadsheetTimeZone: () => '' };
  assert.equal(sb.fusoDaPlanilha_(semFuso), SP);
  assert.equal(sb.fusoDaPlanilha_({}), SP);
});

test('Lançamentos: transações, renda fixa, proventos e lote de RF Contratada gravam a meia-noite do fuso da planilha (nada de dia antes)', () => {
  const { ss, sb } = montar(NY);
  const itens = [
    { destino: 'transacoes', ticker: 'AAAA3', data: '2026-10-05', tipo: 'Compra', preco: 10, qtd: 5 },
    { destino: 'transacoesUsa', ticker: 'BBBB', data: '2026-10-04', tipo: 'Compra', preco: 3, qtd: 2 },
    { destino: 'rendaFixa', produto: 'Fundo DI Teste', data: '2026-10-04', movimentacao: 'Compra', entradaSaida: 'Credito', instituicao: 'CORRETORA X S/A', qtd: 10, preco: 2, valor: 20, taxaContratada: '100% do CDI' },
  ];
  // proventos só entram de ativo que já tem transação: o ticker vem de uma compra existente
  ss.abas['Transações'].l.push(['AAAA3', sb.dataNaPlanilha_(ss, '2026-01-02'), 'Compra', 10, 1, ''].map((v) => ({ v, f: '', r1c1: '' })));
  const r = plain(sb.importarLancamentos_(itens, { simular: false, origem: 'Manual' }));
  assert.equal(r.total, 3);
  const dataDe = (aba, linha, col) => ss.abas[aba].peek(linha, col).v;
  const conferir = (d, chave, onde) => {
    assert.equal(fmt(sb, d, NY, 'HH:mm:ss'), '00:00:00', onde + ': 00:00 na planilha');
    assert.equal(fmt(sb, d, NY, 'yyyy-MM-dd'), chave, onde + ': dia certo na planilha');
    assert.equal(sb.chaveDiaISOInicio_(d), chave, onde + ': o site lê o mesmo dia');
  };
  const achar = (aba, chaveCol0, valor, colData) => {
    const linhas = ss.abas[aba].l; const i = linhas.findIndex((l, k) => k >= 5 && l[chaveCol0] && l[chaveCol0].v === valor && l[colData] && sb.ehDataPlanilha_(l[colData].v) && fmt(sb, l[colData].v, NY, 'yyyy-MM-dd') !== '2026-01-02');
    assert.ok(i >= 0, aba + ' sem a linha gravada');
    return i + 1;
  };
  conferir(dataDe('Transações', achar('Transações', 0, 'AAAA3', 1), 2), '2026-10-05', 'Transações');
  conferir(dataDe('Transações - USA', achar('Transações - USA', 0, 'BBBB', 1), 2), '2026-10-04', 'Transações - USA');
  conferir(dataDe('Transações Renda Fixa', achar('Transações Renda Fixa', 0, 'Fundo DI Teste', 1), 2), '2026-10-04', 'Transações Renda Fixa');
  conferir(ss.abas['RF Contratada - Lotes'].peek(2, 3).v, '2026-10-04', 'Lote de RF Contratada');
});

test('Lançamentos: provento grava Data Com e Data de pagamento no fuso da planilha', () => {
  const { ss, sb } = montar(NY);
  ss.abas['Transações'].l.push(['CCCC3', sb.dataNaPlanilha_(ss, '2026-01-02'), 'Compra', 10, 1, ''].map((v) => ({ v, f: '', r1c1: '' })));
  const r = plain(sb.importarLancamentos_([{ destino: 'proventos', ticker: 'CCCC3', tipo: 'Dividendo', dataCom: '2026-09-24', dataPagamento: '2026-10-01', qtd: 1, valorPorCota: 0.5, valor: 0.5 }], { simular: false, origem: 'Manual' }));
  assert.equal(r.total, 1);
  const l = ss.abas['Proventos'].l.find((x, k) => k >= 7 && x[2] && x[2].v === 'CCCC3');
  assert.equal(fmt(sb, l[0].v, NY, 'yyyy-MM-dd'), '2026-09-24');
  assert.equal(fmt(sb, l[0].v, NY, 'HH:mm:ss'), '00:00:00');
  assert.equal(sb.chaveDiaISOInicio_(l[1].v), '2026-10-01');
  assert.equal(fmt(sb, l[1].v, NY, 'HH:mm:ss'), '00:00:00');
});

test('Aportes/B3: dataPlanilhaLanc_ e normalizarData_ usam o mesmo helper', () => {
  const { sb } = montar(NY);
  assert.equal(fmt(sb, sb.dataPlanilhaLanc_('2026-10-05'), NY, 'HH:mm'), '00:00');
  assert.equal(fmt(sb, sb.normalizarData_('2026-10-05'), NY, 'HH:mm'), '00:00');
  assert.equal(sb.dataPlanilhaLanc_(''), '');
  const ja = new sb.Date(2026, 9, 5, 15, 30);
  assert.equal(sb.normalizarData_(ja), ja, 'Date entra como veio');
});

// ---------------------------------------------------------------------------
// Função de 1 vez
// ---------------------------------------------------------------------------

const cel = (v, f = '') => ({ v, f, r1c1: '' });

function montarComErradas(sb0) {
  const sp = (c) => meiaNoiteSp(sb0, c);
  const nyMeiaNoite = (c) => sb0.dataNaPlanilha_(null, c);
  const carimbo = new Date(Date.UTC(2026, 9, 5, 14, 13, 56)); // hora de verdade (carimbo de gravação)
  const abas = {
    'Transações': [...brancas(5), ['Ticker', 'Data'], ['AAAA3', sp('2026-10-05')], ['AAAA3', nyMeiaNoite('2026-10-06')], ['AAAA3', sp('2025-02-05')]],
    'Transações - USA': [...brancas(5), ['Ticker', 'Data'], ['BBBB', sp('2026-10-04')], ['BBBB', '']],
    'Transações Renda Fixa': [...brancas(5), ['Produto', 'Data'], ...Array.from({ length: 4 }, (_, i) => ['Fundo DI Teste', sp(`2026-0${i + 1}-1${i}`)])],
    'Proventos': [...brancas(6), ['Data Com', 'Data do pagamento', 'Ticker'], ['', sp('2026-09-24'), 'DDDD11'], [sp('2026-09-10'), sp('2026-09-24'), 'EEEE3']],
    'Proventos - USA': [...brancas(6), ['Data Com'], ['']],
    'RF Contratada - Lotes': [['Título', 'Instituição', 'Data'], ['Fundo DI Teste', 'X', sp('2026-03-11')], ['Fundo DI Teste', 'X', nyMeiaNoite('2026-03-12')]],
    'aux_aportes': [['Id', 'Data', 'Status'], ['AP-1', sp('2026-10-04'), 'Concluído', carimbo]],
    'aux_aportes_eua': [['Id', 'Ticker', 'Data'], ['AP-1', 'SIRI', sp('2026-10-04')]],
    'aux_caixa_dolar': [['Id', 'Data'], ['CX-1', sp('2026-10-04')]],
    'Carteira Renda Fixa': [...brancas(7), ['Código']],
    'Carteira Ações': [['Ticker']], 'Carteira FIIs': [['Ticker']], 'Auxiliar_ativos': [['Classe', 'Ticker']],
  };
  // célula com fórmula (nunca deve ser tocada, mesmo que o resultado dela caia à meia-noite de SP)
  abas['Transações'].push(['FORM', cel(sp('2026-10-07'), '=B8')]);
  return abas;
}

test('correção de 1 vez: só o que é meia-noite de São Paulo vira meia-noite da planilha; 00:00 da planilha, fórmula, carimbo e outras colunas ficam', () => {
  const sb0 = montar(NY).sb;
  const ss = planilhaFalsa(montarComErradas(sb0), { fuso: NY });
  const { sb } = sandboxGas(ss);
  const antes = (aba, r, c) => ss.abas[aba].peek(r, c).v;
  const carimboAntes = antes('aux_aportes', 2, 4);
  const r = plain(sb.corrigirDatasGravadasNoFusoDireto());
  assert.deepEqual(r.abas, {
    'Transações': 2, 'Transações - USA': 1, 'Transações Renda Fixa': 4, 'Proventos': 3, 'Proventos - USA': 0,
    'RF Contratada - Lotes': 1, 'aux_aportes': 1, 'aux_aportes_eua': 1, 'aux_caixa_dolar': 1,
  });
  assert.equal(r.total, 14);
  const dia = (aba, r2, c) => fmt(sb, ss.abas[aba].peek(r2, c).v, NY, 'yyyy-MM-dd') + ' ' + fmt(sb, ss.abas[aba].peek(r2, c).v, NY, 'HH:mm');
  assert.equal(dia('Transações', 6 + 1, 2), '2026-10-05 00:00');
  assert.equal(dia('Transações', 6 + 2, 2), '2026-10-06 00:00', 'já estava certa: igual');
  assert.equal(dia('Transações', 6 + 3, 2), '2025-02-05 00:00');
  assert.equal(dia('Transações Renda Fixa', 7, 2), '2026-01-10 00:00');
  assert.equal(dia('Proventos', 8, 2), '2026-09-24 00:00');
  assert.equal(dia('Proventos', 9, 1), '2026-09-10 00:00');
  assert.equal(dia('RF Contratada - Lotes', 2, 3), '2026-03-11 00:00');
  assert.equal(dia('aux_caixa_dolar', 2, 2), '2026-10-04 00:00');
  assert.equal(ss.abas['Transações - USA'].peek(8, 2).v, '', 'célula vazia continua vazia');
  assert.equal(antes('aux_aportes', 2, 4), carimboAntes, 'carimbo de hora de verdade não muda');
  assert.equal(ss.abas['Transações'].peek(10, 2).f, '=B8', 'a fórmula fica');
  assert.notEqual(fmt(sb, ss.abas['Transações'].peek(10, 2).v, NY, 'HH:mm'), '00:00', 'e o valor dela não é regravado (continua meia-noite de São Paulo)');
  // o site (fuso do script) lê o mesmo dia de antes em todas
  assert.equal(sb.chaveDiaISOInicio_(ss.abas['Transações'].peek(7, 2).v), '2026-10-05');
  assert.equal(sb.chaveDiaISOInicio_(ss.abas['Transações Renda Fixa'].peek(8, 2).v), '2026-02-11');
});

test('correção de 1 vez: idempotente (2ª rodada não muda nada), simulação só conta e fusos iguais não fazem nada', () => {
  const sb0 = montar(NY).sb;
  const ss = planilhaFalsa(montarComErradas(sb0), { fuso: NY });
  const { sb } = sandboxGas(ss);
  const sim = plain(sb.testarCorrigirDatasGravadasNoFusoDireto());
  assert.equal(sim.total, 14);
  assert.equal(sim.simulado, true);
  assert.notEqual(fmt(sb, ss.abas['Transações'].peek(7, 2).v, NY, 'HH:mm'), '00:00', 'a simulação não gravou');
  assert.equal(plain(sb.corrigirDatasGravadasNoFusoDireto()).total, 14);
  const instantes = Object.fromEntries(Object.entries(ss.abas).map(([n, a]) => [n, a.l.map((l) => l.map((c) => (c.v instanceof Date ? c.v.getTime() : c.v)))]));
  assert.equal(plain(sb.corrigirDatasGravadasNoFusoDireto()).total, 0, '2ª rodada: nada a corrigir');
  const depois = Object.fromEntries(Object.entries(ss.abas).map(([n, a]) => [n, a.l.map((l) => l.map((c) => (c.v instanceof Date ? c.v.getTime() : c.v)))]));
  assert.deepEqual(depois, instantes);
  // mesmo fuso (planilha = script): nada a fazer
  const ssIgual = planilhaFalsa(montarComErradas(sb0), { fuso: SP });
  const { sb: sbIgual } = sandboxGas(ssIgual);
  assert.equal(plain(sbIgual.corrigirDatasGravadasNoFusoDireto()).total, 0);
});

test('correção de 1 vez: horário de verão dos EUA (22:00 x 23:00 em Nova York) e virada de ano entram do mesmo jeito', () => {
  const sb0 = montar(NY).sb;
  const chaves = ['2026-01-15', '2026-03-07', '2026-03-09', '2026-10-31', '2026-11-02', '2026-12-31', '2027-01-01'];
  const ss = planilhaFalsa({
    'Transações': [...brancas(5), ['Ticker', 'Data'], ...chaves.map((c) => ['AAAA3', meiaNoiteSp(sb0, c)])],
    'Carteira Renda Fixa': [...brancas(7), ['Código']],
  }, { fuso: NY });
  const { sb } = sandboxGas(ss);
  assert.equal(plain(sb.corrigirDatasGravadasNoFusoDireto()).abas['Transações'], chaves.length);
  chaves.forEach((c, i) => {
    const d = ss.abas['Transações'].peek(7 + i, 2).v;
    assert.equal(fmt(sb, d, NY, 'yyyy-MM-dd'), c);
    assert.equal(fmt(sb, d, NY, 'HH:mm'), '00:00');
  });
});
