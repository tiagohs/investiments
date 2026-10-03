// tests/harness/proventos-conferencia.test.js
//
// 02/10/2026 (Tiago: "Proventos: se a data de pagamento já passou, deduz
// que está pago. Eu mando no final do mês [o arquivo da B3] e você faz o
// check final."): Proventos.gs - conciliação com o extrato da B3
// (conciliarProventosB3_), registro do extrato pela importação de
// Lançamentos (registrarExtratoB3Proventos_, aux_proventos-conferencia) e a
// situação de cada provento na resposta (montarProventosAnunciados_).
// Planilha falsa, relógio fixo, valores inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planilhaFalsa, sandboxGas, AbaFalsa, D, plain } from './planilha-falsa.mjs';

const HOJE = new Date('2026-10-20T15:00:00Z'); // 20/10/2026 12h em São Paulo

function sandboxSo() {
  const { sb } = sandboxGas(planilhaFalsa({}), { agora: HOJE });
  return sb;
}

// ---------------------------------------------------------------------------
// conciliarProventosB3_ (pura)
// ---------------------------------------------------------------------------

test('conciliar: bate (data a até 5 dias), valor diferente, ausente no mês conferido, extra do extrato, JCP com IR, 2 contas e tipo escrito diferente', () => {
  const sb = sandboxSo();
  const conhecidos = [
    { id: 'a', ticker: 'AAAA11', tipo: 'Rendimento', data: '2026-09-14', valor: 100, fonte: 'FNet' }, // B3 pagou 1 dia depois
    { id: 'b', ticker: 'BBBB3', tipo: 'Dividendo', data: '2026-09-10', valor: 20, fonte: 'Planilha' }, // B3: 19,00
    { id: 'c', ticker: 'CCCC3', tipo: 'Dividendo', data: '2026-09-20', valor: 7, fonte: 'Planilha' }, // não veio
    { id: 'd', ticker: 'DDDD3', tipo: 'JCP', data: '2026-09-05', valor: 10, fonte: 'B3' }, // bruto; B3 líquido 8,50
    { id: 'e1', ticker: 'EEEE3', tipo: 'Dividendo', data: '2026-09-08', valor: 3, fonte: 'Planilha' }, // 2 contas
    { id: 'e2', ticker: 'EEEE3', tipo: 'Dividendo', data: '2026-09-08', valor: 2, fonte: 'Planilha' },
    { id: 'f', ticker: 'FFFF3', tipo: 'Rendimento', data: '2026-09-11', valor: 0.57, fonte: 'Planilha' }, // B3 chama de Dividendo
    { id: 'g', ticker: 'GGGG11', tipo: 'Rendimento', data: '2026-10-03', valor: 9, fonte: 'FNet' }, // fora do mês conferido
    { id: 'h', ticker: 'HHHH11', tipo: 'Rendimento', data: '2026-09-02', valor: 5, fonte: 'Planilha' }, // B3 9 dias depois: longe demais
    { id: 'i', ticker: 'IIII3', tipo: 'Dividendo', data: '2026-09-09', valor: 4, fonte: 'Planilha' }, // arredondamento (4,03)
  ];
  const extrato = [
    { ticker: 'AAAA11', tipo: 'Rendimento', data: '2026-09-15', valor: 100 },
    { ticker: 'BBBB3', tipo: 'Dividendo', data: '2026-09-10', valor: 19 },
    { ticker: 'DDDD3', tipo: 'JCP', data: '2026-09-05', valor: 8.5 },
    { ticker: 'EEEE3', tipo: 'Dividendo', data: '2026-09-08', valor: 4 },
    { ticker: 'EEEE3', tipo: 'Dividendo', data: '2026-09-08', valor: 1 },
    { ticker: 'FFFF3', tipo: 'Dividendo', data: '2026-09-11', valor: 0.57 },
    { ticker: 'HHHH11', tipo: 'Rendimento', data: '2026-09-11', valor: 5 },
    { ticker: 'ZZZZ11', tipo: 'Rendimento', data: '2026-09-25', valor: 12 }, // não existia
    { ticker: 'IIII3', tipo: 'Dividendo', data: '2026-09-09', valor: 4.03 },
  ];
  const periodos = [{ mes: '2026-09', inicio: '2026-09-01', fim: '2026-09-30' }];
  const r = plain(sb.conciliarProventosB3_(conhecidos, extrato, periodos));
  const sit = (id) => (r.porId[id] || {}).situacao;
  assert.equal(sit('a'), 'confirmado');
  assert.equal(r.porId.a.dataB3, '2026-09-15');
  assert.equal(sit('b'), 'divergente');
  assert.equal(r.porId.b.diferenca, -1);
  assert.equal(r.porId.b.valorB3, 19);
  assert.equal(sit('c'), 'nao_confirmado');
  assert.equal(sit('d'), 'confirmado');
  assert.equal(r.porId.d.ir, true, 'JCP: líquido de 15% de IR bate');
  assert.equal(sit('e1'), 'confirmado');
  assert.equal(sit('e2'), 'confirmado', '2 linhas no mesmo dia somam dos 2 lados');
  assert.equal(sit('f'), 'confirmado', 'tipo diferente com o mesmo valor');
  assert.equal(sit('g'), undefined, 'fora do mês conferido: continua presumido');
  assert.equal(sit('h'), 'nao_confirmado', 'mais de 5 dias não casa');
  assert.equal(sit('i'), 'confirmado', 'diferença de arredondamento');
  assert.deepEqual(r.extras.map((e) => [e.ticker, e.data]).sort(), [['HHHH11', '2026-09-11'], ['ZZZZ11', '2026-09-25']]);
});

test('conciliar: cada linha do extrato casa com 1 só (a mais parecida) e tipo diferente com valor diferente não casa', () => {
  const sb = sandboxSo();
  const r = plain(sb.conciliarProventosB3_(
    [
      { id: 'longe', ticker: 'AAAA11', tipo: 'Rendimento', data: '2026-09-11', valor: 100, fonte: 'FNet' },
      { id: 'perto', ticker: 'AAAA11', tipo: 'Rendimento', data: '2026-09-15', valor: 100, fonte: 'Planilha' },
      { id: 'jcp', ticker: 'BBBB3', tipo: 'JCP', data: '2026-09-10', valor: 50, fonte: 'Planilha' },
    ],
    [{ ticker: 'AAAA11', tipo: 'Rendimento', data: '2026-09-15', valor: 100 }, { ticker: 'BBBB3', tipo: 'Dividendo', data: '2026-09-10', valor: 3 }],
    [{ mes: '2026-09', inicio: '2026-09-01', fim: '2026-09-30' }],
  ));
  assert.equal(r.porId.perto.situacao, 'confirmado');
  assert.equal(r.porId.longe.situacao, 'nao_confirmado', 'o FNet duplicado do lançado não conta 2 vezes');
  assert.equal(r.porId.jcp.situacao, 'nao_confirmado');
  assert.equal(r.extras.length, 1);
});

// ---------------------------------------------------------------------------
// Fluxo inteiro: importação de Lançamentos -> aux_proventos-conferencia -> situação
// ---------------------------------------------------------------------------

function planilhaComProventos() {
  const ss = planilhaFalsa({});
  const { sb } = sandboxGas(ss, { agora: HOJE });
  const cab = (n) => Array.from({ length: n }, () => ['']);
  ss.abas.Auxiliar_ativos = new AbaFalsa('Auxiliar_ativos', [
    ['Classe', 'Ticker'],
    ['FIIs', 'AAAA11', 'Fundo A', '', 'R$', 100, '', 100, 95],
    ['FIIs', 'DDDD11', 'Fundo D', '', 'R$', 10, '', 10, 9],
    ['Ações', 'BBBB3', 'Empresa B', '', 'R$', 20, '', 50, 18],
  ]);
  ss.abas['Carteira Ações'] = new AbaFalsa('Carteira Ações', [['Ticker'], ['BBBB3']]);
  ss.abas['Carteira FIIs'] = new AbaFalsa('Carteira FIIs', [['Ticker'], ['AAAA11'], ['DDDD11']]);
  const tx = (t, d, q) => [t, D(sb, d), 'Compra', 10, q, '', '', '', '', '', q];
  ss.abas['Transações'] = new AbaFalsa('Transações', [...cab(5), ['Ticker'], tx('AAAA11', '2026-08-01', 100), tx('DDDD11', '2026-08-01', 10), tx('BBBB3', '2026-08-01', 50)], { maxRows: 40 });
  const pv = (pag, t, tipo, valor) => ['', D(sb, pag), t, tipo, 50, valor / 50, valor];
  ss.abas.Proventos = new AbaFalsa('Proventos', [...cab(6), ['Data Com'],
    pv('2026-09-15', 'BBBB3', 'Dividendo', 10), // antes da conferência existir: sem situação
    pv('2026-10-02', 'BBBB3', 'JCP', 8.5), // lançado; o extrato confirma
    pv('2026-10-10', 'BBBB3', 'Dividendo', 20), // extrato: 19,00
    pv('2026-10-18', 'BBBB3', 'Dividendo', 5), // depois da última data do extrato: presumido
  ], { maxRows: 40 });
  ss.abas['Proventos - USA'] = new AbaFalsa('Proventos - USA', [...cab(7)], { maxRows: 20 });
  ss.abas['aux_proventos-anunciados'] = new AbaFalsa('aux_proventos-anunciados', [
    ['Ticker', 'Tipo', 'Data com', 'Data pagamento', 'Valor por cota', 'Isento IR', 'Documento FNet', 'Atualizado em'],
    ['AAAA11', 'Rendimento', '2026-09-30', '2026-10-14', 1, 'Sim', '1', ''], // extrato: 15/10
    ['AAAA11', 'Rendimento', '2026-10-15', '2026-10-20', 0.1, 'Sim', '2', ''], // paga HOJE: pago presumido
    ['AAAA11', 'Rendimento', '2026-10-16', '2026-10-21', 0.2, 'Sim', '3', ''], // amanhã: a receber
    ['DDDD11', 'Rendimento', '2026-09-30', '2026-10-05', 0.5, 'Sim', '4', ''], // o extrato não trouxe
  ]);
  return { ss, sb };
}

const linhaB3 = (ticker, data, tipo, valor, arquivo = 'movimentacao-outubro.xlsx') => ({ destino: 'proventos', ticker, dataCom: '', dataPagamento: data, tipo, qtd: 1, valorPorCota: valor, valor, arquivo });
const EXTRATO = [
  linhaB3('AAAA11', '2026-10-15', 'Rendimento', 100),
  linhaB3('BBBB3', '2026-10-02', 'JCP', 8.5),
  linhaB3('BBBB3', '2026-10-10', 'Dividendo', 19),
  linhaB3('FFFF11', '2026-10-08', 'Rendimento', 3), // não existia (fica "extra")
];

test('antes do extrato: pagamento até hoje é pago presumido (hoje inclusive, amanhã a receber); lançados desde a conferência também', () => {
  const { sb } = planilhaComProventos();
  const out = plain(sb.montarProventosAnunciados_(null, {}));
  assert.deepEqual(out.aReceber.map((p) => [p.ticker, p.dataPagamento]), [['AAAA11', '2026-10-21']]);
  assert.deepEqual(out.pagosNaoLancados.map((p) => [p.ticker, p.dataPagamento, p.valor, p.conferencia]),
    [['DDDD11', '2026-10-05', 5, 'presumido'], ['AAAA11', '2026-10-14', 100, 'presumido'], ['AAAA11', '2026-10-20', 10, 'presumido']]);
  assert.deepEqual(out.recebidosNoMes.map((p) => [p.dataPagamento, p.tipo, p.conferencia]),
    [['2026-10-02', 'JCP', 'presumido'], ['2026-10-10', 'Dividendo', 'presumido'], ['2026-10-18', 'Dividendo', 'presumido']]);
  assert.equal(out.conferencia.presumidos.quantidade, 6);
  assert.deepEqual(out.conferencia.periodos, []);
});

test('extrato pela importação de Lançamentos (já na conferência): grava aux_proventos-conferencia, confirma, aponta valor diferente, não confirmado e extra; resumo volta pra tela', () => {
  const { ss, sb } = planilhaComProventos();
  const r = plain(sb.importarLancamentos_(EXTRATO.map((x) => ({ ...x })), { simular: true }));
  assert.equal(r.total, 0, 'simular não grava na aba Proventos');
  const c = r.conferenciaProventos;
  assert.deepEqual(c.meses, ['2026-10']);
  assert.deepEqual([c.confirmados, c.divergentes, c.naoConfirmados, c.extras], [2, 1, 1, 1]);
  assert.deepEqual(c.divergencias.map((d) => [d.ticker, d.valor, d.valorB3, d.diferenca]), [['BBBB3', 20, 19, -1]]);
  assert.deepEqual(c.naoConfirmadosLista.map((d) => [d.ticker, d.data, d.fonte]), [['DDDD11', '2026-10-05', 'FNet']]);
  assert.deepEqual(c.extrasLista.map((d) => d.ticker), ['FFFF11']);

  const aba = ss.aba('aux_proventos-conferencia');
  const linhas = aba.getRange(1, 1, aba.getLastRow(), 8).getValues();
  assert.deepEqual(linhas[0].slice(0, 2), ['Linha', 'Ticker / mês']);
  assert.equal(linhas.filter((l) => l[0] === 'B3').length, 4);
  const mes = linhas.find((l) => l[0] === 'Mês conferido');
  assert.equal(mes[1], '2026-10');
  assert.equal(sb.chaveDiaISOInicio_(mes[3]), '2026-10-15', 'mês corrente: conferido até a última data do extrato');

  const out = plain(sb.montarProventosAnunciados_(null, {}));
  const nl = Object.fromEntries(out.pagosNaoLancados.map((p) => [p.dataPagamento + p.ticker, p]));
  assert.equal(nl['2026-10-14AAAA11'].conferencia, 'confirmado');
  assert.equal(nl['2026-10-14AAAA11'].dataB3, '2026-10-15');
  assert.equal(nl['2026-10-05DDDD11'].conferencia, 'nao_confirmado');
  assert.equal(nl['2026-10-20AAAA11'].conferencia, 'presumido', 'depois da última data conferida');
  assert.deepEqual(out.recebidosNoMes.map((p) => [p.dataPagamento, p.conferencia]), [['2026-10-02', 'confirmado'], ['2026-10-10', 'divergente'], ['2026-10-18', 'presumido']]);
  assert.equal(out.recebidosNoMes[1].valorB3, 19);
  assert.equal(out.statusPlanilha['BBBB3|2026-09-15|Dividendo'], undefined, 'anterior à conferência: sem situação');
});

test('mandar o mesmo extrato de novo, um pedaço dele (reconferir) ou o mesmo provento em 2 arquivos não duplica; 2 contas (2 linhas iguais no arquivo) ficam as 2', () => {
  const { ss, sb } = planilhaComProventos();
  const contar = () => { const a = ss.aba('aux_proventos-conferencia'); return a.getRange(2, 1, a.getLastRow() - 1, 1).getValues().filter((l) => l[0] === 'B3').length; };
  sb.importarLancamentos_(EXTRATO.map((x) => ({ ...x })), { simular: true });
  assert.equal(contar(), 4);
  sb.importarLancamentos_(EXTRATO.map((x) => ({ ...x })), { simular: true });
  sb.importarLancamentos_(EXTRATO.slice(0, 2).map((x) => ({ ...x })), { simular: true });
  sb.importarLancamentos_([{ ...EXTRATO[0], arquivo: 'proventos-recebidos.xlsx' }, { ...EXTRATO[0] }], { simular: true });
  assert.equal(contar(), 4);
  sb.importarLancamentos_([linhaB3('BBBB3', '2026-10-12', 'Dividendo', 2), linhaB3('BBBB3', '2026-10-12', 'Dividendo', 2)], { simular: true });
  assert.equal(contar(), 6, 'a mesma linha 2x no mesmo arquivo = 2 contas');
  // lançamento manual (sem arquivo) e provento ainda não pago não entram
  sb.importarLancamentos_([{ ...linhaB3('BBBB3', '2026-10-13', 'Dividendo', 1), arquivo: undefined }, linhaB3('BBBB3', '2026-10-25', 'Dividendo', 1)], { simular: true });
  assert.equal(contar(), 6);
});

test('gravar os novos do extrato: a linha nova da aba Proventos fica confirmada e o anúncio do FNet com data diferente não conta 2 vezes', () => {
  const { ss, sb } = planilhaComProventos();
  const r = plain(sb.importarLancamentos_(EXTRATO.slice(0, 1).map((x) => ({ ...x })), { simular: false, origem: 'Teste' }));
  assert.equal(r.gravados.proventos, 1);
  assert.equal(r.conferenciaProventos.confirmados >= 1, true);
  const out = plain(sb.montarProventosAnunciados_(null, {}));
  assert.ok(!out.pagosNaoLancados.some((p) => p.ticker === 'AAAA11' && p.dataPagamento === '2026-10-14'), 'FNet de 14/10 = linha da B3 de 15/10 já lançada');
  const linha = out.recebidosNoMes.find((p) => p.ticker === 'AAAA11');
  assert.deepEqual([linha.dataPagamento, linha.valor, linha.conferencia], ['2026-10-15', 100, 'confirmado']);
  assert.ok(ss.aba('Proventos').getLastRow() > 11);
});
