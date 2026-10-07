// tests/colar-tabela-parse.test.js - 07/10/2026: "Colar uma tabela" (Transações › Lançamentos). Parser puro. Dados INVENTADOS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerTabelaColada, itensRendaFixaDaTabela, itensAcoesDaTabela, numeroColado, dataColada, tipoColado, celulasDaLinha } from '../assets/js/pages/colar-tabela-parse.js';

const CAB = ['Data', 'Tipo', 'Quantidade', 'Preço', 'Custos Op.', 'Valor total', 'Origem'];
const L1 = ['05/10/2026', 'Compra', '100,50000000', 'R$ 2,00000000', 'R$ 0,00', 'R$ 201,00', 'Manual'];
const L2 = ['01/10/2026', 'Compra', '50,25', 'R$ 2,00', 'R$ 0,00', 'R$ 100,50', 'Manual'];
const L3 = ['15/09/2026', 'Resgate', '10,00000000', 'R$ 1,99000000', 'R$ 0,00', 'R$ 19,90', 'Manual'];
const resumo = (r) => r.linhas.map((l) => [l.data, l.tipo, l.qtd, l.preco, l.valor]);

test('números: pt-BR, en, R$, milhar, parênteses e vazios', () => {
  assert.equal(numeroColado('R$ 1.234,56'), 1234.56);
  assert.equal(numeroColado('121,01928834'), 121.01928834);
  assert.equal(numeroColado('1,234.56'), 1234.56);
  assert.equal(numeroColado('1.234.567,8'), 1234567.8);
  assert.equal(numeroColado('1.234'), 1234, 'um ponto + 3 dígitos = milhar');
  assert.equal(numeroColado('0.123'), 0.123);
  assert.equal(numeroColado('12.5'), 12.5);
  assert.equal(numeroColado('(200,00)'), -200);
  assert.equal(numeroColado('-R$ 5,00'), -5);
  assert.equal(numeroColado('R$ 0,00'), 0);
  for (const v of ['', '-', null, 'Manual', 'R$']) assert.equal(numeroColado(v), null, String(v));
});

test('datas: dd/mm/aaaa, d/m/aa, aaaa-mm-dd; data impossível = vazio', () => {
  assert.equal(dataColada('05/10/2026'), '2026-10-05');
  assert.equal(dataColada('5/1/26'), '2026-01-05');
  assert.equal(dataColada('2026-10-05'), '2026-10-05');
  assert.equal(dataColada('2026-10-05 10:30'), '2026-10-05');
  assert.equal(dataColada('31/02/2026'), '');
  assert.equal(dataColada('hoje'), '');
});

test('tipos: compra/aplicação -> compra; venda/resgate -> resgate; resto vazio', () => {
  ['Compra', 'compra', 'Aplicação', 'APLICACAO', 'Aporte'].forEach((t) => assert.equal(tipoColado(t), 'compra', t));
  ['Venda', 'Resgate', 'resgate total', 'Saque'].forEach((t) => assert.equal(tipoColado(t), 'resgate', t));
  ['Come-cotas', 'Rendimento', '', 'Manual'].forEach((t) => assert.equal(tipoColado(t), '', t));
});

test('Gorila: cabeçalho + linhas separadas por TAB, com R$ e vírgula decimal', () => {
  const texto = [CAB, L1, L2, L3].map((l) => l.join('\t')).join('\n');
  const r = lerTabelaColada(texto);
  assert.equal(r.temCabecalho, true);
  assert.deepEqual(r.avisos, []);
  assert.deepEqual(resumo(r), [['2026-10-05', 'compra', 100.5, 2, 201], ['2026-10-01', 'compra', 50.25, 2, 100.5], ['2026-09-15', 'resgate', 10, 1.99, 19.9]]);
  assert.equal(r.linhas.every((l) => !l.aviso), true);
});

test('Gorila: cotas com 8 casas e valor redondo (qtd × preço bate dentro dos centavos)', () => {
  const r = lerTabelaColada('Data\tTipo\tQuantidade\tPreço\tCustos Op.\tValor total\tOrigem\n05/10/2026\tCompra\t121,01928834\tR$ 1,65262912\tR$ 0,00\tR$ 200,00\tManual');
  assert.equal(r.linhas.length, 1);
  assert.equal(r.linhas[0].qtd, 121.01928834);
  assert.equal(r.linhas[0].preco, 1.65262912);
  assert.equal(r.linhas[0].valor, 200);
  assert.equal(r.linhas[0].aviso, '');
});

test('separador ";" e 2+ espaços; fim de linha do Windows e linhas vazias/espaços sobrando', () => {
  const pv = [CAB, L1, L2].map((l) => l.join(';')).join('\r\n');
  assert.deepEqual(resumo(lerTabelaColada(pv)), [['2026-10-05', 'compra', 100.5, 2, 201], ['2026-10-01', 'compra', 50.25, 2, 100.5]]);
  const esp = [CAB, L1, L2].map((l) => `  ${l.join('   ')}  `).join('\n\n\n');
  const r = lerTabelaColada(esp);
  assert.deepEqual(resumo(r), [['2026-10-05', 'compra', 100.5, 2, 201], ['2026-10-01', 'compra', 50.25, 2, 100.5]]);
  assert.deepEqual(r.avisos, []);
});

test('linha com espaço simples (sem TAB): "R$" solto é juntado ao número; cabeçalho por palavras', () => {
  assert.deepEqual(celulasDaLinha('05/10/2026 Compra 121,01 R$ 1,65 R$ 0,00 R$ 200,00 Manual'), ['05/10/2026', 'Compra', '121,01', 'R$ 1,65', 'R$ 0,00', 'R$ 200,00', 'Manual']);
  assert.deepEqual(celulasDaLinha('Data Tipo Quantidade Preço Custos Op. Valor total Origem'), ['Data', 'Tipo', 'Quantidade', 'Preço', 'Custos Op.', 'Valor total', 'Origem']);
  const r = lerTabelaColada('Data Tipo Quantidade Preço Custos Op. Valor total Origem\n05/10/2026 Compra 100,5 R$ 2,00 R$ 0,00 R$ 201,00 Manual');
  assert.deepEqual(resumo(r), [['2026-10-05', 'compra', 100.5, 2, 201]]);
});

test('uma célula por linha (alguns sites quebram a linha a cada célula)', () => {
  const texto = [...CAB, ...L1, ...L2].join('\n');
  const r = lerTabelaColada(texto);
  assert.deepEqual(resumo(r), [['2026-10-05', 'compra', 100.5, 2, 201], ['2026-10-01', 'compra', 50.25, 2, 100.5]]);
});

test('cabeçalho em outra ordem e com outros nomes (Operação, Cotas, Valor da cota, Total)', () => {
  const texto = ['Operação\tData\tTotal (R$)\tValor da cota\tCotas', 'Aplicação\t05/10/2026\t201,00\t2,00\t100,5', 'Resgate\t06/10/2026\t20,00\t2,00\t10'].join('\n');
  const r = lerTabelaColada(texto);
  assert.deepEqual(resumo(r), [['2026-10-05', 'compra', 100.5, 2, 201], ['2026-10-06', 'resgate', 10, 2, 20]]);
});

test('sem cabeçalho: ordem do Gorila (e cabeçalho repetido no meio é ignorado)', () => {
  const r = lerTabelaColada([L1, L2, CAB, L3].map((l) => l.join('\t')).join('\n'));
  assert.equal(r.temCabecalho, false);
  assert.deepEqual(resumo(r), [['2026-10-05', 'compra', 100.5, 2, 201], ['2026-10-01', 'compra', 50.25, 2, 100.5], ['2026-09-15', 'resgate', 10, 1.99, 19.9]]);
  assert.deepEqual(r.avisos, []);
});

test('sem cabeçalho e sem a coluna de custos: quantidade, preço e valor', () => {
  const r = lerTabelaColada('05/10/2026\tCompra\t100,5\tR$ 2,00\tR$ 201,00');
  assert.deepEqual(resumo(r), [['2026-10-05', 'compra', 100.5, 2, 201]]);
});

test('só o valor (sem quantidade/preço): aceita; preço sai da conta quando há quantidade e valor', () => {
  const so = lerTabelaColada('Data\tTipo\tValor total\n05/10/2026\tCompra\tR$ 500,00\n06/10/2026\tResgate\tR$ 100,00');
  assert.deepEqual(resumo(so), [['2026-10-05', 'compra', null, null, 500], ['2026-10-06', 'resgate', null, null, 100]]);
  const qv = lerTabelaColada('Data\tTipo\tQuantidade\tValor total\n05/10/2026\tCompra\t250\tR$ 500,00');
  assert.deepEqual(resumo(qv), [['2026-10-05', 'compra', 250, 2, 500]]);
  const qp = lerTabelaColada('Data\tTipo\tQuantidade\tPreço\n05/10/2026\tCompra\t10\tR$ 2,5');
  assert.deepEqual(resumo(qp), [['2026-10-05', 'compra', 10, 2.5, 25]], 'sem valor: quantidade × preço');
});

test('rodapé ("Total") e linhas vazias são ignorados sem aviso', () => {
  const r = lerTabelaColada([CAB.join('\t'), L1.join('\t'), '', 'Total\t\t150,75\t\t\tR$ 301,50\t', 'Mostrando 1 de 1'].join('\n'));
  assert.equal(r.linhas.length, 1);
  assert.deepEqual(r.avisos, []);
});

test('linha ruim vira aviso com o motivo e não trava as outras', () => {
  const texto = [CAB.join('\t'), L1.join('\t'),
    ['31/02/2026', 'Compra', '1', 'R$ 1,00', 'R$ 0,00', 'R$ 1,00', 'Manual'].join('\t'),
    ['03/10/2026', 'Come-cotas', '', '', '', 'R$ 3,00', 'Auto'].join('\t'),
    ['04/10/2026', 'Compra', '', '', '', '', 'Manual'].join('\t'),
    'lixo qualquer sem data',
    L2.join('\t')].join('\n');
  const r = lerTabelaColada(texto);
  assert.equal(r.linhas.length, 2);
  assert.equal(r.avisos.length, 4);
  const m = r.avisos.map((a) => a.motivo);
  assert.match(m[0], /data.*válida/i);
  assert.match(m[1], /come-cotas.*não é compra nem resgate/i);
  assert.match(m[2], /valor/i);
  assert.match(m[3], /data/i);
  assert.deepEqual(r.avisos.map((a) => a.n), [3, 4, 5, 6], 'nº da linha no texto colado');
});

test('quantidade × preço diferente do valor: aviso na linha (ela continua entrando); com custos soma/subtrai', () => {
  const r = lerTabelaColada([CAB.join('\t'),
    ['05/10/2026', 'Compra', '100', 'R$ 2,00', 'R$ 0,00', 'R$ 250,00', 'Manual'].join('\t'),
    ['06/10/2026', 'Compra', '100', 'R$ 2,00', 'R$ 5,00', 'R$ 205,00', 'Manual'].join('\t'),
    ['07/10/2026', 'Compra', '100', 'R$ 2,00', 'R$ 0,00', 'R$ 200,00', 'Manual'].join('\t')].join('\n'));
  assert.equal(r.linhas.length, 3);
  assert.match(r.linhas[0].aviso, /200,00.*250,00/);
  assert.equal(r.linhas[1].aviso, '', 'valor = qtd × preço + custos');
  assert.equal(r.linhas[2].aviso, '');
  // preço mostrado com poucas casas: a folga do arredondamento não gera falso alarme
  const folga = lerTabelaColada('Data\tTipo\tQuantidade\tPreço\tValor total\n05/10/2026\tCompra\t121,01928834\tR$ 1,65\tR$ 200,00');
  assert.equal(folga.linhas[0].aviso, '');
});

test('texto vazio ou sem nenhuma data: sem linhas e com aviso', () => {
  assert.deepEqual(lerTabelaColada('').linhas, []);
  assert.deepEqual(lerTabelaColada('   \n \n').avisos, []);
  const r = lerTabelaColada('Isto não é uma tabela\noutra linha qualquer');
  assert.equal(r.linhas.length, 0);
  assert.ok(r.avisos.length >= 1);
});

test('itens de Renda Fixa: título/instituição da tela; compra = Credito, resgate = Debito; taxa e destino só nas compras', () => {
  const r = lerTabelaColada([CAB, L1, L3].map((l) => l.join('\t')).join('\n'));
  const itens = itensRendaFixaDaTabela(r.linhas, { produto: ' Fundo  DI Teste ', instituicao: 'CORRETORA X', taxaContratada: '100% do CDI', destinoRf: 'objetivo' });
  assert.deepEqual(itens, [
    { destino: 'rendaFixa', produto: 'Fundo DI Teste', data: '2026-10-05', movimentacao: 'Compra', entradaSaida: 'Credito', instituicao: 'CORRETORA X', qtd: 100.5, preco: 2, valor: 201, taxaContratada: '100% do CDI', destinoRf: 'objetivo' },
    { destino: 'rendaFixa', produto: 'Fundo DI Teste', data: '2026-09-15', movimentacao: 'Resgate', entradaSaida: 'Debito', instituicao: 'CORRETORA X', qtd: 10, preco: 1.99, valor: 19.9 },
  ]);
});

test('itens de Ações/FIIs: precisa de ticker, quantidade e preço; custos viram taxa; fracionário perde o F', () => {
  const texto = ['Data\tTicker\tTipo\tQuantidade\tPreço\tCustos\tValor total',
    '05/10/2026\tabcd3\tCompra\t10\tR$ 20,00\tR$ 1,00\tR$ 201,00',
    '06/10/2026\tTEST11F\tVenda\t5\tR$ 100,00\tR$ 0,00\tR$ 500,00',
    '07/10/2026\t\tCompra\t5\tR$ 10,00\tR$ 0,00\tR$ 50,00'].join('\n');
  const r = lerTabelaColada(texto);
  assert.equal(r.temTicker, true);
  const { itens, avisos } = itensAcoesDaTabela(r.linhas);
  assert.deepEqual(itens, [
    { destino: 'transacoes', ticker: 'ABCD3', data: '2026-10-05', tipo: 'Compra', qtd: 10, preco: 20, taxa: 1 },
    { destino: 'transacoes', ticker: 'TEST11', data: '2026-10-06', tipo: 'Venda', qtd: 5, preco: 100, taxa: 0 },
  ]);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0].motivo, /ticker/i);
});
