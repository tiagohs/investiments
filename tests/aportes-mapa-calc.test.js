// tests/aportes-mapa-calc.test.js
//
// 27/09/2026: contas do mapa de compras (aba Aportes, "Aportes realizados").
// Dados inventados (o repositório é público - nunca números reais).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classePorTicker, todasAsCompras, ultimosMeses, ativosDaClasseMapa, celulaMapa,
  ehMesAtual, mesesSemComprar, ultimaCompra, linhaMapa, resumoUltimaRodada, popoverMapa,
} from '../assets/js/pages/aportes-mapa-calc.js';

const CLASSES = {
  acoes: [{ ticker: 'ZZZZ3', nome: 'Zeta SA', moeda: 'BRL' }],
  fiis: [{ ticker: 'ABCD11', nome: 'Fundo ABCD', moeda: 'BRL' }, { ticker: 'WXYZ11', nome: 'Fundo WXYZ', moeda: 'BRL' }],
  acoesEua: [{ ticker: 'FAKE', nome: 'Fake Corp', moeda: 'USD' }],
};

const LANCAMENTOS = [
  { destino: 'transacoes', data: '2026-07-10', ativo: 'ABCD11', tipo: 'Compra', qtd: 2, preco: 100, valor: 200, moeda: 'BRL' },
  { destino: 'transacoes', data: '2026-08-12', ativo: 'ABCD11', tipo: 'Compra', qtd: 1, preco: 110, valor: 110, moeda: 'BRL' },
  { destino: 'transacoes', data: '2026-08-12', ativo: 'ZZZZ3', tipo: 'Compra', qtd: 5, preco: 20, valor: 100, moeda: 'BRL' },
  { destino: 'proventos', data: '2026-08-20', ativo: 'ABCD11', tipo: 'Rendimento', qtd: 3, preco: 1, valor: 3, moeda: 'BRL' },
  { destino: 'transacoesUsa', data: '2026-06-05', ativo: 'FAKE', tipo: 'Compra', qtd: 2, preco: 10, valor: 20, moeda: 'USD', cambio: 5, valorBRL: 100 },
  { destino: 'rendaFixa', data: '2026-08-01', ativo: 'Tesouro Fake 2030', movimentacao: 'Compra', tipo: 'Compra', valor: 500 },
];

test('classePorTicker e todasAsCompras: resolve a classe de cada lançamento e ignora proventos', () => {
  const mapaClasse = classePorTicker(CLASSES);
  assert.deepEqual(mapaClasse, { ZZZZ3: 'acoes', ABCD11: 'fiis', WXYZ11: 'fiis', FAKE: 'acoesEua' });
  const compras = todasAsCompras(LANCAMENTOS, mapaClasse);
  assert.equal(compras.length, 5, 'as 2 do ABCD11, a do ZZZZ3, a do FAKE e a de RF - proventos ficam de fora');
  assert.ok(compras.some((c) => c.ativo === 'Tesouro Fake 2030' && c.classe === 'rendaFixa'));
  assert.ok(compras.some((c) => c.ativo === 'FAKE' && c.classe === 'acoesEua' && c.valorBRL === 100));
});

test('ultimosMeses: as últimas N chaves aaaa-mm terminando em hoje, mais antiga primeiro', () => {
  assert.deepEqual(ultimosMeses('2026-09-26', 3), ['2026-07', '2026-08', '2026-09']);
  assert.deepEqual(ultimosMeses('2026-01-05', 3), ['2025-11', '2025-12', '2026-01'], 'vira o ano');
});

test('celulaMapa: soma o mês, calcula preço médio e a variação vs a compra anterior', () => {
  const mapaClasse = classePorTicker(CLASSES);
  const compras = todasAsCompras(LANCAMENTOS, mapaClasse);
  const jul = celulaMapa(compras, 'ABCD11', '2026-07');
  assert.equal(jul.qtd, 2);
  assert.equal(jul.precoMedio, 100);
  assert.equal(jul.delta, null, 'sem compra anterior ainda');
  const ago = celulaMapa(compras, 'ABCD11', '2026-08');
  assert.equal(ago.precoMedio, 110);
  assert.ok(Math.abs(ago.delta - 0.1) < 1e-9, '10% mais caro que a compra de julho');
  assert.equal(celulaMapa(compras, 'ABCD11', '2026-09'), null, 'não comprou em setembro');
});

test('celulaMapa: renda fixa não tem quantidade nem preço médio, só o valor', () => {
  const mapaClasse = classePorTicker(CLASSES);
  const compras = todasAsCompras(LANCAMENTOS, mapaClasse);
  const cel = celulaMapa(compras, 'Tesouro Fake 2030', '2026-08');
  assert.equal(cel.rf, true);
  assert.equal(cel.qtd, null);
  assert.equal(cel.precoMedio, null);
  assert.equal(cel.valor, 500);
});

test('ehMesAtual, mesesSemComprar e ultimaCompra', () => {
  assert.equal(ehMesAtual('2026-09', '2026-09-26'), true);
  assert.equal(ehMesAtual('2026-08', '2026-09-26'), false);
  const mapaClasse = classePorTicker(CLASSES);
  const compras = todasAsCompras(LANCAMENTOS, mapaClasse);
  assert.equal(mesesSemComprar(compras, 'ABCD11', '2026-09-26'), 1, 'última em agosto, hoje é setembro');
  assert.equal(mesesSemComprar(compras, 'WXYZ11', '2026-09-26'), null, 'nunca comprou');
  assert.equal(ultimaCompra(compras, 'ABCD11').data, '2026-08-12');
});

test('linhaMapa, ativosDaClasseMapa e resumoUltimaRodada: junta as células da janela e resume o mês mais recente', () => {
  const mapaClasse = classePorTicker(CLASSES);
  const compras = todasAsCompras(LANCAMENTOS, mapaClasse);
  const meses = ultimosMeses('2026-09-26', 3);
  const linha = linhaMapa(compras, 'ABCD11', meses, '2026-09-26');
  assert.equal(linha.celulas.length, 3);
  assert.equal(linha.semComprar, 1);
  const ativos = ativosDaClasseMapa('fiis', CLASSES, compras);
  assert.deepEqual(ativos.map((a) => a.ativo), ['ABCD11', 'WXYZ11']);
  const rodada = resumoUltimaRodada(compras, ativos, meses);
  assert.equal(rodada.mes, '2026-08');
  assert.deepEqual(rodada.entraram.map((a) => a.ativo), ['ABCD11']);
  assert.deepEqual(rodada.ficaramDeFora.map((a) => a.ativo), ['WXYZ11']);
});

test('popoverMapa: detalhe da compra, comparação com a anterior/hoje e conversão em reais (USD)', () => {
  const mapaClasse = classePorTicker(CLASSES);
  const compras = todasAsCompras(LANCAMENTOS, mapaClasse);
  const pop = popoverMapa(compras, 'ABCD11', '2026-08', { precoAtual: 120, precoMedioHoje: 105 });
  assert.equal(pop.itens.length, 1);
  assert.ok(Math.abs(pop.delta - 0.1) < 1e-9);
  assert.ok(Math.abs(pop.vsHoje - (120 / 110 - 1)) < 1e-9);
  assert.equal(pop.mesmoDia.length, 1, 'no mesmo dia também comprou ZZZZ3');
  assert.equal(pop.mesmoDia[0].ativo, 'ZZZZ3');

  const popUsd = popoverMapa(compras, 'FAKE', '2026-06', { precoAtual: 12, cambioHoje: 5.5 });
  assert.equal(popUsd.pagoBRL, 100);
  assert.equal(popUsd.cambioMedio, 5);
  assert.ok(Math.abs(popUsd.hojeBRL - (12 * 2 * 5.5)) < 1e-9);
  assert.ok(Math.abs(popUsd.efeitoDolar - (5.5 / 5 - 1)) < 1e-9);
});
