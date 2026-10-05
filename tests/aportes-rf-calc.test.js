// tests/aportes-rf-calc.test.js
//
// 05/10/2026: Tesouro Direto por valor ou por quantidade - mínimo = 0,01 título
// = 1% do PU de compra do dia (regra da B3 em vigor desde 18/11/2024; o piso de
// R$ 30 deixou de existir). Exemplos de PU inventados, os dois primeiros iguais
// aos exemplos publicados pela B3 (R$ 7,67 e R$ 156,13).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  minimoTesouro, qtdTesouroPorValor, valorTesouroPorQtd, compraPorValor, compraPorQuantidade, ehTesouro, puDoTitulo, acharTesouroHoje, textoMinimo,
} from '../assets/js/pages/aportes-rf-calc.js';
import { formatBRL } from '../assets/js/format.js';

test('mínimo é 1% do PU, arredondado em centavos (sem piso de R$ 30)', () => {
  assert.equal(minimoTesouro(15613.45), 156.13);
  assert.equal(minimoTesouro(767.46), 7.67, 'título barato aceita menos de R$ 30');
  assert.equal(minimoTesouro(20142), 201.42);
  assert.equal(minimoTesouro(19943.12), 199.43);
  assert.equal(minimoTesouro(0), null);
  assert.equal(minimoTesouro(null), null);
});

test('valor -> quantidade com 2 casas pra baixo; o que custa de verdade é qtd × PU; sobra do que não coube', () => {
  assert.equal(qtdTesouroPorValor(500, 2610), 0.19);
  assert.equal(valorTesouroPorQtd(0.19, 2610), 495.9);
  const c = compraPorValor(500, 2610);
  assert.deepEqual([c.qtd, c.valor, c.sobra, c.abaixoMinimo, c.minimo], [0.19, 495.9, 4.1, false, 26.1]);
  assert.equal(compraPorValor(26.1, 2610).qtd, 0.01, 'exatamente o mínimo compra 0,01');
  assert.equal(compraPorValor(26.09, 2610).abaixoMinimo, true);
  assert.equal(compraPorValor(26.09, 2610).qtd, 0);
  assert.equal(compraPorValor(201.42, 20142).qtd, 0.01, 'o R$ 201,42 de hoje: 0,01 de um título de R$ 20.142');
  assert.equal(qtdTesouroPorValor(0.3 * 100, 3000), 0.01, 'sem erro de ponto flutuante na divisão');
});

test('quantidade -> valor; quantidade com mais de 2 casas é cortada', () => {
  const c = compraPorQuantidade(0.019, 20142);
  assert.deepEqual([c.qtd, c.valor, c.abaixoMinimo], [0.01, 201.42, false]);
  assert.equal(compraPorQuantidade(0.005, 20142).abaixoMinimo, true);
  assert.equal(compraPorQuantidade(2, 100.5).valor, 201);
});

test('quem é Tesouro e o PU de hoje (cotação do .gs, taxa de hoje antiga ou lista); texto do mínimo', () => {
  assert.equal(ehTesouro('\t\nTesouro Selic 2029'), true);
  assert.equal(ehTesouro('CDB Banco X'), false);
  assert.equal(puDoTitulo({ cotacao: { pu: 100 }, taxaHoje: { pu: 90 } }), 100);
  assert.equal(puDoTitulo({ taxaHoje: { pu: 90 } }), 90);
  assert.equal(puDoTitulo({ cotacao: null, taxaHoje: null }), null);
  const lista = [{ nome: 'Tesouro Selic 2032', pu: 20142 }];
  assert.equal(acharTesouroHoje(lista, '  tesouro selic 2032 ').pu, 20142);
  assert.equal(acharTesouroHoje(lista, 'Tesouro Selic 2033'), null);
  assert.equal(textoMinimo(20142, formatBRL).replace(/ /g, ' '), 'mínimo hoje R$ 201,42 (1% do PU de R$ 20.142,00)');
});
