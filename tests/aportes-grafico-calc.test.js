// tests/aportes-grafico-calc.test.js
//
// 27/09/2026: gráfico "Suas compras no preço" (Tiago: "gosto do 1, pode
// incluir ele"). Dados inventados (o repositório é público).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seriePrecoMedio, comprasNoPeriodo, estatisticasGrafico } from '../assets/js/pages/aportes-grafico-calc.js';

const SERIE = [
  { data: '2026-01-02', preco: 10 },
  { data: '2026-03-01', preco: 12 },
  { data: '2026-06-01', preco: 8 },
  { data: '2026-09-01', preco: 11 },
];

const COMPRAS = [
  { data: '2025-11-01', qtd: 1, preco: 9 }, // antes do início do histórico visível - conta no PM inicial, não aparece no gráfico
  { data: '2026-03-15', qtd: 2, preco: 12.5 },
  { data: '2026-06-10', qtd: 1, preco: 7.5 },
];

test('seriePrecoMedio: preço médio corrido, incluindo compras antes do início e cobrindo as pontas do histórico', () => {
  const pontos = seriePrecoMedio(SERIE, COMPRAS);
  assert.equal(pontos[0].data, '2026-01-02', 'começa na ponta inicial do histórico');
  assert.equal(pontos[0].precoMedio, 9, 'já entra com a compra de novembro (antes do início)');
  const meio = pontos.find((p) => p.data === '2026-03-15');
  // (1×9 + 2×12,5) / 3 = 34/3
  assert.ok(Math.abs(meio.precoMedio - 34 / 3) < 1e-9);
  const fim = pontos[pontos.length - 1];
  assert.equal(fim.data, '2026-09-01', 'termina na ponta final do histórico');
  // (1×9 + 2×12,5 + 1×7,5) / 4 = 41,5/4
  assert.ok(Math.abs(fim.precoMedio - 41.5 / 4) < 1e-9);
});

test('seriePrecoMedio: sem nenhuma compra, preço médio é sempre null', () => {
  const pontos = seriePrecoMedio(SERIE, []);
  assert.ok(pontos.every((p) => p.precoMedio == null));
});

test('comprasNoPeriodo: só as compras dentro da janela visível, cronológicas', () => {
  const periodo = comprasNoPeriodo(SERIE, COMPRAS);
  assert.deepEqual(periodo.map((c) => c.data), ['2026-03-15', '2026-06-10'], 'a de novembro fica de fora (antes do início)');
});

test('estatisticasGrafico: preço médio pago no período x preço médio do próprio ativo, e quantas compras abaixo da média', () => {
  const stats = estatisticasGrafico(SERIE, COMPRAS);
  assert.equal(stats.n, 2);
  // (2×12,5 + 1×7,5) / 3 = 32,5/3
  assert.ok(Math.abs(stats.precoMedioPago - 32.5 / 3) < 1e-9);
  const mediaPeriodo = (10 + 12 + 8 + 11) / 4;
  assert.ok(Math.abs(stats.mediaPeriodo - mediaPeriodo) < 1e-9);
  assert.ok(Math.abs(stats.diferenca - (stats.precoMedioPago / mediaPeriodo - 1)) < 1e-9);
  assert.equal(stats.abaixoDaMedia, 1, 'só a compra de junho (7,5) ficou abaixo da média do período (10,25)');
});

test('estatisticasGrafico: sem compras no período devolve n=0', () => {
  const stats = estatisticasGrafico(SERIE, []);
  assert.deepEqual(stats, { n: 0 });
});
