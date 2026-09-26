// tests/lancamentos-parse.test.js
//
// 26/09/2026: leitura dos extratos da tela Transações (aba Lançamentos) -
// B3 Negociação / Movimentação / Proventos recebidos e o Extrato de
// atividade da Interactive Brokers. Arquivos e valores inventados, no mesmo
// formato dos de verdade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  identificarArquivo, lerNegociacaoB3, lerMovimentacaoB3, lerProventosRecebidosB3, lerExtratoIbkr, lerArquivos,
  lerNumero, lerData, tickerSemFracionario, fusaoIbkr, lerCsv, valorDoItem,
} from '../assets/js/pages/lancamentos-parse.js';

const NEGOCIACAO = [
  ['Data do Negócio', 'Tipo de Movimentação', 'Mercado', 'Prazo/Vencimento', 'Instituição', 'Código de Negociação', 'Quantidade', 'Preço', 'Valor'],
  ['09/09/2026', 'Compra', 'Mercado à Vista', '-', 'CORRETORA X', 'TEST11', 4, 71.1, 284.4],
  ['14/08/2026', 'Compra', 'Mercado Fracionário', '-', 'CORRETORA X', 'ABCD3F', 10, 17.89, 178.9],
  ['13/08/2026', 'Venda', 'Mercado à Vista', '-', 'CORRETORA X', 'ABCD3', 5, '18,50', 92.5],
  ['12/08/2026', 'Compra', 'Opção de Compra', '-', 'CORRETORA X', 'ABCDH20', 100, 0.5, 50],
];

const MOVIMENTACAO = [
  ['Entrada/Saída', 'Data', 'Movimentação', 'Produto', 'Instituição', 'Quantidade', 'Preço unitário', 'Valor da Operação'],
  ['Credito', '05/08/2026', 'Compra', 'Tesouro IPCA+ 2032', 'CORRETORA X', 0.26, 2965.01, 770.9],
  ['Debito', '01/04/2021', 'Transferencia', 'Tesouro Prefixado 2023', 'CORRETORA Y', 0.55, '-', '-'],
  ['Credito', '25/08/2026', 'Rendimento', 'TEST11 - FUNDO TESTE FII', 'CORRETORA X', 44, 0.81, 35.64],
  ['Credito', '20/08/2026', 'Juros Sobre Capital Próprio', 'ABCD3 - EMPRESA ABCD S.A.', 'CORRETORA X', 85, 0.35, 24.58],
  ['Credito', '14/08/2026', 'Transferência - Liquidação', 'ABCD3 - EMPRESA ABCD S.A.', 'CORRETORA X', 10, 17.89, 178.9],
  ['Credito', '10/08/2026', 'Empréstimo', 'ABCD3 - EMPRESA ABCD S.A.', 'CORRETORA X', 100, '-', '-'],
  ['Credito', '09/08/2026', 'Desdobro', 'EFGH3 - EMPRESA EFGH', 'CORRETORA X', 10, '-', '-'],
];

const PROVENTOS = [
  ['Produto', 'Pagamento', 'Tipo de Evento', 'Instituição', 'Quantidade', 'Preço unitário', 'Valor líquido'],
  ['TEST11 - FUNDO TESTE FII', '25/08/2026', 'Rendimento', 'CORRETORA X', '44', 0.81, 35.64],
  ['EFGH3 - EMPRESA EFGH', '20/05/2026', 'Juros Sobre Capital Próprio', 'CORRETORA X', '61,40', 0.09, 4.57],
  ['Tesouro IPCA+ com Juros Semestrais 2045', '15/05/2026', 'Juros', 'CORRETORA X', '0,10', 139.08, 13.91],
  ['', '', '', '', '', '', ''],
  ['Total', '', '', '', '', '', 54.12],
];

const IBKR = [
  'Statement,Header,Nome do campo,Valor do campo',
  'Statement,Data,BrokerName,Interactive Brokers LLC',
  'Operações,Header,DataDiscriminator,Categoria de ativos,Moeda,Símbolo,Data/hora,Quantidade,Preço Neg.,Preço Fch.,Rendimentos,Corr/Taxa,Base,P&L realizados,P&L MTM,Código',
  'Operações,Data,Order,Ações,USD,AAA,"2026-02-09, 11:34:51",1,81.77,83.43,-81.77,-0.8177,82.5877,0,1.66,O',
  'Operações,SubTotal,,Ações,USD,AAA,,1,,,-81.77,-0.8177,82.5877,0,1.66,',
  'Operações,Data,Order,Ações,USD,OLD,"2025-12-01, 12:12:47",1,46,45.33,-46,-0.46,46.46,0,-0.67,O',
  'Operações,Data,Order,Ações,USD,BBB,"2026-03-04, 13:00:40",-2,10.5,10.4,21,-0.21,0,0,0,C',
  'Operações,Total,,Ações,USD,,,,,,-2076.93,-19.9,2096.83,0,-4.17,',
  'Operações societárias,Header,Categoria de ativos,Moeda,Data do relatório,Data/hora,Descrição,Quantidade,Rendimentos,Valor,P&L realizados,Código',
  'Operações societárias,Data,Ações,USD,2026-08-20,"2026-08-19, 20:25:00","OLD(US000) Mesclado(Aquisição) WITH US111 59 para 250 (NEW, NEW CORP, US111)",2.7693,0,409.19,0,',
  'Operações societárias,Data,Ações,USD,2026-08-20,"2026-08-19, 20:25:00","OLD(US000) Mesclado(Aquisição) WITH US111 59 para 250 (OLD, OLD CORP, US000)",-11.73,0,-422.31,0,',
  'Alteração nos dividendos acumulados,Header,Categoria de ativos,Moeda,Símbolo,Data,Data ex,Data de pagamento,Quantidade,Impostos,Taxa,Taxa bruta,Valor bruto,Valor líquido,Código',
  'Alteração nos dividendos acumulados,Data,Ações,USD,AAA,2026-08-07,2026-08-10,2026-08-26,23.6378,1.91,0,0.27,6.38,4.47,Po',
  'Alteração nos dividendos acumulados,Data,Ações,USD,AAA,2026-08-26,2026-08-10,2026-08-26,23.6378,-1.91,0,0.27,-6.38,-4.47,Re',
  'Alteração nos dividendos acumulados,Data,Ações,USD,CCC,2025-10-29,2025-10-30,2025-12-05,4.896,0.03,0.04,0.046588,0.22,0.15,Po',
  'Alteração nos dividendos acumulados,Data,Ações,USD,CCC,2025-10-29,2025-10-30,2025-12-05,4.896,-0.03,-0.04,0.046588,-0.22,-0.15,Re',
  'Alteração nos dividendos acumulados,Data,Ações,USD,CCC,2025-10-30,2025-10-31,2025-12-05,4.896,0.03,0.04,0.046588,0.22,0.16,Po',
  'Alteração nos dividendos acumulados,Data,Ações,USD,CCC,2025-12-05,2025-10-31,2025-12-05,4.896,-0.03,-0.04,0.046105,-0.22,-0.15,Re',
  'Alteração nos dividendos acumulados,Data,Ações,USD,DDD,2026-09-15,2026-09-16,2026-10-13,8.3846,0,0.16,0.02,0,-0.16,ADR;Po',
  'Alteração nos dividendos acumulados,Data,Ações,USD,EEE,2026-09-18,2026-09-19,2026-10-02,10,0,0,0.5,5,5,Po',
].join('\n');

test('lançamentos: número e data em qualquer formato; ticker do fracionário; fusão da IBKR', () => {
  assert.equal(lerNumero('1.234,56'), 1234.56);
  assert.equal(lerNumero('61,40'), 61.4);
  assert.equal(lerNumero('R$ 3,00'), 3);
  assert.equal(lerNumero('-'), null);
  assert.equal(lerNumero(12.5), 12.5);
  assert.equal(lerData('09/09/2026'), '2026-09-09');
  assert.equal(lerData('2025-09-29, 12:22:20'), '2025-09-29');
  assert.equal(lerData(46000), '2025-12-09');
  assert.equal(tickerSemFracionario('ABCD3F'), 'ABCD3');
  assert.equal(tickerSemFracionario('TEST11F'), 'TEST11');
  assert.equal(tickerSemFracionario('TEST11'), 'TEST11');
  const f = fusaoIbkr('OLD(US000) Mesclado(Aquisição) WITH US111 59 para 250 (NEW, NEW CORP, US111)');
  assert.deepEqual({ ...f, fator: Math.round(f.fator * 1000) / 1000 }, { antigo: 'OLD', novo: 'NEW', fator: 0.236 });
  assert.equal(fusaoIbkr('OLD(US000) Mesclado(Aquisição) WITH US111 59 para 250 (OLD, OLD CORP, US000)'), null);
  assert.deepEqual(lerCsv('a,"b, c",d\n"x ""y""",2'), [['a', 'b, c', 'd'], ['x "y"', '2']]);
});

test('lançamentos: reconhece cada arquivo pelo cabeçalho', () => {
  assert.equal(identificarArquivo({ linhas: NEGOCIACAO }), 'b3Negociacao');
  assert.equal(identificarArquivo({ linhas: MOVIMENTACAO }), 'b3Movimentacao');
  assert.equal(identificarArquivo({ linhas: PROVENTOS }), 'b3Proventos');
  assert.equal(identificarArquivo({ linhas: [['Produto', 'Tipo de Evento', 'Previsão de pagamento', 'Valor líquido']] }), 'b3ProventosAReceber');
  assert.equal(identificarArquivo({ texto: IBKR }), 'ibkr');
  assert.equal(identificarArquivo({ linhas: [['a', 'b']] }), '');
  assert.equal(identificarArquivo({ texto: 'x,y\n1,2' }), '');
});

test('lançamentos: B3 Negociação -> Transações (fracionário sem F, venda, opção fica de fora)', () => {
  const r = lerNegociacaoB3(NEGOCIACAO);
  assert.deepEqual(r.itens.map((i) => [i.ticker, i.data, i.tipo, i.qtd, i.preco]), [
    ['TEST11', '2026-09-09', 'Compra', 4, 71.1],
    ['ABCD3', '2026-08-14', 'Compra', 10, 17.89],
    ['ABCD3', '2026-08-13', 'Venda', 5, 18.5],
  ]);
  assert.ok(r.itens.every((i) => i.destino === 'transacoes' && i.taxa === 0));
  assert.equal(r.ignorados.length, 1);
  assert.match(r.ignorados[0].motivo, /opções/);
});

test('lançamentos: B3 Movimentação -> Renda Fixa e Proventos; liquidação/aluguel/desdobro não viram lançamento', () => {
  const r = lerMovimentacaoB3(MOVIMENTACAO);
  const rf = r.itens.filter((i) => i.destino === 'rendaFixa');
  assert.deepEqual(rf.map((i) => [i.produto, i.data, i.movimentacao, i.entradaSaida, i.qtd, i.preco, i.valor]), [
    ['Tesouro IPCA+ 2032', '2026-08-05', 'Compra', 'Credito', 0.26, 2965.01, 770.9],
    ['Tesouro Prefixado 2023', '2021-04-01', 'Transferencia', 'Debito', 0.55, null, null],
  ]);
  const prov = r.itens.filter((i) => i.destino === 'proventos');
  assert.deepEqual(prov.map((i) => [i.ticker, i.dataPagamento, i.tipo, i.qtd, i.valorPorCota, i.valor]), [
    ['TEST11', '2026-08-25', 'Rendimento', 44, 0.81, 35.64],
    ['ABCD3', '2026-08-20', 'JCP', 85, 0.35, 24.58],
  ]);
  assert.equal(r.ignorados.length, 3);
  assert.match(r.ignorados[0].motivo, /Negociação/);
  assert.match(r.ignorados[1].motivo, /Aluguel/);
});

test('lançamentos: B3 Proventos recebidos -> Proventos (JCP, quantidade "61,40"); cupom do Tesouro vai pra Renda Fixa; rodapé ignorado', () => {
  const r = lerProventosRecebidosB3(PROVENTOS);
  assert.deepEqual(r.itens.map((i) => [i.destino, i.ticker || i.produto, i.tipo || i.movimentacao, i.qtd, i.valor]), [
    ['proventos', 'TEST11', 'Rendimento', 44, 35.64],
    ['proventos', 'EFGH3', 'JCP', 61.4, 4.57],
    ['rendaFixa', 'Tesouro IPCA+ com Juros Semestrais 2045', 'Juros', 0.1, 13.91],
  ]);
  assert.equal(r.ignorados.length, 1, 'a linha de total');
});

test('lançamentos: Interactive Brokers - compras/vendas, fusão converte o ticker antigo, só dividendo pago entra', () => {
  const r = lerExtratoIbkr(IBKR);
  const tr = r.itens.filter((i) => i.destino === 'transacoesUsa');
  assert.deepEqual(tr.map((i) => [i.ticker, i.data, i.tipo, i.qtd, i.preco, i.taxa]), [
    ['AAA', '2026-02-09', 'Compra', 1, 81.77, 0.8177],
    ['NEW', '2025-12-01', 'Compra', 0.236, 194.9153, 0.46],
    ['BBB', '2026-03-04', 'Venda', 2, 10.5, 0.21],
  ]);
  assert.match(tr[1].obs, /OLD convertido em NEW/);
  const dv = r.itens.filter((i) => i.destino === 'proventosUsa');
  assert.deepEqual(dv.map((i) => [i.ticker, i.dataCom, i.dataPagamento, i.qtd, i.valorPorCota, i.valor]), [
    ['AAA', '2026-08-07', '2026-08-26', 23.6378, 0.27, 4.47],
    ['CCC', '2025-10-30', '2025-12-05', 4.896, 0.046588, 0.16],
  ]);
  assert.deepEqual(r.ignorados.map((i) => i.ativo), ['OLD', 'EEE'], 'fusão (1 linha só) + dividendo ainda não pago; taxa de ADR sem dividendo some');
});

test('lançamentos: vários arquivos de uma vez - uid sequencial, nome do arquivo e erros claros', () => {
  const r = lerArquivos([
    { nome: 'negociacao.xlsx', linhas: NEGOCIACAO },
    { nome: 'ibkr.csv', texto: IBKR },
    { nome: 'receber.xlsx', linhas: [['Produto', 'Tipo de Evento', 'Previsão de pagamento', 'Valor líquido']] },
    { nome: 'outro.xlsx', linhas: [['x']] },
  ]);
  assert.deepEqual(r.itens.map((i) => i.uid), r.itens.map((_, i) => i));
  assert.equal(r.itens[0].arquivo, 'negociacao.xlsx');
  assert.match(r.arquivos[2].erro, /tela Proventos/);
  assert.match(r.arquivos[3].erro, /Não reconheci/);
  assert.equal(valorDoItem(r.itens[0]), 284.4);
});
