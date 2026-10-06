// tests/carrinho-global.test.js
//
// 05/10/2026: contas puras do carrinho que o header de todas as telas também
// usa (carrinho-global.js): horários de fechamento (B3, EUA, Tesouro) com o
// horário de verão dos EUA, expiração do carrinho e o que fica guardado.
// Ativos e valores inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  carrinhoVazio, carrinhoValido, definirQuantidade, definirValorRf, totaisCarrinho, usaHorarioVeraoEUA, fechamentoMercado,
  situacaoCarrinho, dataBRT, minutosBRT, horaTxt, itensDoCarrinho,
} from '../assets/js/carrinho-global.js';

// "agora" em Brasília (UTC-3) a partir de 'aaaa-mm-dd hh:mm'
const brt = (s) => new Date(`${s.replace(' ', 'T')}:00-03:00`);

test('horário de verão dos EUA 2026: de 08/03 (2º domingo de março) até 01/11 (1º domingo de novembro)', () => {
  assert.equal(usaHorarioVeraoEUA('2026-03-07'), false);
  assert.equal(usaHorarioVeraoEUA('2026-03-08'), true);
  assert.equal(usaHorarioVeraoEUA('2026-10-05'), true);
  assert.equal(usaHorarioVeraoEUA('2026-10-31'), true);
  assert.equal(usaHorarioVeraoEUA('2026-11-01'), false);
  assert.equal(usaHorarioVeraoEUA('2026-12-15'), false);
  assert.equal(usaHorarioVeraoEUA('2027-03-14'), true, '2027: 2º domingo de março é 14');
});

test('fechamento: B3 e EUA 17h no horário de verão americano e 18h fora dele; Tesouro 18h; CDB só o dia', () => {
  const b3 = { classe: 'acoes', ativo: 'ABCD3' };
  const eua = { classe: 'acoesEua', ativo: 'AAA' };
  assert.equal(fechamentoMercado(b3, '2026-10-05'), 17 * 60);
  assert.equal(fechamentoMercado(eua, '2026-10-05'), 17 * 60, '16h de Nova York (EDT) = 17h de Brasília');
  assert.equal(fechamentoMercado(b3, '2026-11-02'), 18 * 60);
  assert.equal(fechamentoMercado(eua, '2026-11-02'), 18 * 60, '16h de Nova York (EST) = 18h de Brasília');
  assert.equal(fechamentoMercado({ classe: 'fiis', ativo: 'TEST11' }, '2026-10-05'), 17 * 60);
  assert.equal(fechamentoMercado({ classe: 'rendaFixa', ativo: '\t\nTesouro Selic 2029' }, '2026-10-05'), 18 * 60);
  assert.equal(fechamentoMercado({ classe: 'rendaFixa', ativo: 'CDB Banco X' }, '2026-10-05'), 24 * 60);
  assert.equal(horaTxt(17 * 60), '17h');
  assert.equal(horaTxt(17 * 60 + 55), '17h55');
});

test('data e hora em Brasília a partir do instante (sem depender do fuso da máquina)', () => {
  const d = new Date('2026-10-06T01:30:00Z'); // 22h30 de 05/10 em Brasília
  assert.equal(dataBRT(d), '2026-10-05');
  assert.equal(minutosBRT(d), 22 * 60 + 30);
});

function carrinhoComItens(data, itens) {
  let c = carrinhoVazio(data);
  itens.forEach((i) => {
    if (i.classe === 'rendaFixa') c = definirValorRf(c, { ativo: i.ativo, instituicao: 'XP' }, i.valor);
    else c = definirQuantidade(c, { classe: i.classe, ativo: i.ativo, moeda: i.classe === 'acoesEua' ? 'USD' : 'BRL', preco: 10 }, i.qtd);
  });
  return c;
}

test('expiração: carrinho do dia vale até o fechamento; dia anterior sempre expirou; vazio nunca', () => {
  const acoes = carrinhoComItens('2026-10-05', [{ classe: 'acoes', ativo: 'ABCD3', qtd: 2 }]);
  assert.equal(situacaoCarrinho(acoes, brt('2026-10-05 16:59')).expirado, false);
  const s = situacaoCarrinho(acoes, brt('2026-10-05 17:00'));
  assert.deepEqual([s.expirado, s.motivo, s.fechamento, s.mercado], [true, 'horario', 17 * 60, 'a B3']);
  assert.equal(situacaoCarrinho(acoes, brt('2026-10-06 09:00')).motivo, 'dia');
  assert.equal(situacaoCarrinho(acoes, brt('2026-10-04 20:00')).expirado, false, 'carrinho de uma data futura');
  assert.equal(situacaoCarrinho(carrinhoVazio('2026-10-05'), brt('2026-10-09 12:00')).vazio, true);
  // depois do fim do horário de verão americano a B3 fecha 18h
  const nov = carrinhoComItens('2026-11-03', [{ classe: 'acoes', ativo: 'ABCD3', qtd: 2 }]);
  assert.equal(situacaoCarrinho(nov, brt('2026-11-03 17:30')).expirado, false);
  assert.equal(situacaoCarrinho(nov, brt('2026-11-03 18:00')).expirado, true);
});

test('expiração: com mercados diferentes, só expira quando o último fecha (Tesouro 18h segura o carrinho misto)', () => {
  const misto = carrinhoComItens('2026-10-05', [{ classe: 'acoes', ativo: 'ABCD3', qtd: 2 }, { classe: 'rendaFixa', ativo: 'Tesouro Selic 2029', valor: 300 }]);
  assert.equal(situacaoCarrinho(misto, brt('2026-10-05 17:30')).expirado, false);
  const s = situacaoCarrinho(misto, brt('2026-10-05 18:00'));
  assert.deepEqual([s.expirado, s.fechamento, s.mercado], [true, 18 * 60, 'o Tesouro Direto']);
  const cdb = carrinhoComItens('2026-10-05', [{ classe: 'rendaFixa', ativo: 'CDB Banco X', valor: 300 }]);
  assert.equal(situacaoCarrinho(cdb, brt('2026-10-05 23:30')).expirado, false, 'CDB não tem pregão: só vira de dia');
  assert.equal(situacaoCarrinho(cdb, brt('2026-10-06 00:10')).motivo, 'dia');
});

test('perguntado: o "Sim" de hoje não volta a perguntar hoje, mas amanhã pergunta de novo', () => {
  const c = { ...carrinhoComItens('2026-10-03', [{ classe: 'acoes', ativo: 'ABCD3', qtd: 2 }]), perguntadoEm: '2026-10-05' };
  assert.equal(situacaoCarrinho(c, brt('2026-10-05 10:00')).perguntado, true);
  assert.equal(situacaoCarrinho(c, brt('2026-10-06 10:00')).perguntado, false);
});

test('carrinho guardado: mantém o dólar da hora e o "perguntado"; renda fixa do Tesouro guarda quantidade e PU', () => {
  let c = carrinhoVazio('2026-10-05');
  c = definirValorRf(c, { ativo: 'Tesouro Selic 2029', instituicao: 'XP' }, 399.6, { qtd: 0.02, pu: 19980 });
  c = definirValorRf(c, { ativo: 'CDB Banco X', instituicao: 'Banco X' }, 100, { qtd: 0, pu: 0 });
  assert.deepEqual(c.itens['rendaFixa:Tesouro Selic 2029|XP'], { classe: 'rendaFixa', ativo: 'Tesouro Selic 2029', instituicao: 'XP', moeda: 'BRL', valor: 399.6, qtd: 0.02, pu: 19980 });
  assert.equal(c.itens['rendaFixa:CDB Banco X|Banco X'].qtd, undefined, 'não-Tesouro fica só com o valor');
  const guardado = JSON.parse(JSON.stringify({ ...c, cambio: 5.2, perguntadoEm: '2026-10-05', lixo: 1 }));
  const v = carrinhoValido(guardado, '2026-10-05');
  assert.equal(v.cambio, 5.2);
  assert.equal(v.perguntadoEm, '2026-10-05');
  assert.equal(v.lixo, undefined);
  assert.equal(v.itens['rendaFixa:Tesouro Selic 2029|XP'].pu, 19980);
  assert.deepEqual(carrinhoValido({ itens: 'x' }, '2026-10-05'), carrinhoVazio('2026-10-05'));
  const t = totaisCarrinho(carrinhoComItens('2026-10-05', [{ classe: 'acoesEua', ativo: 'AAA', qtd: 2 }]), 5);
  assert.deepEqual([t.totalUsd, t.totalBrl, t.n], [20, 100, 1]);
});

test('A-23: quantidade fracionada trunca em 4 casas com tolerância (0,29 não vira 0,2899) e o subtotal fecha ao centavo', () => {
  let c = carrinhoVazio('2026-10-05');
  c = definirQuantidade(c, { classe: 'acoesEua', ativo: 'AAA', moeda: 'USD', preco: 10 }, 0.29);
  assert.equal(c.itens['acoesEua:AAA'].qtd, 0.29, '0,29 × 10000 = 2899,999… em ponto flutuante');
  c = definirQuantidade(c, { classe: 'acoesEua', ativo: 'AAA', moeda: 'USD', preco: 10 }, 1.1);
  assert.equal(c.itens['acoesEua:AAA'].qtd, 1.1);
  c = definirQuantidade(c, { classe: 'acoesEua', ativo: 'AAA', moeda: 'USD', preco: 10 }, 0.12345);
  assert.equal(c.itens['acoesEua:AAA'].qtd, 0.1234, 'o que passa da 4ª casa continua sendo cortado');
  // dois itens fracionados: o total é a soma dos subtotais em centavos (nada de 0,0001 sobrando)
  let d = carrinhoVazio('2026-10-05');
  d = definirQuantidade(d, { classe: 'acoesEua', ativo: 'AAA', moeda: 'USD', preco: 33.33 }, 0.3333);
  d = definirQuantidade(d, { classe: 'acoesEua', ativo: 'BBB', moeda: 'USD', preco: 12.34 }, 0.7777);
  const t = totaisCarrinho(d, 5);
  assert.deepEqual(itensDoCarrinho(d).map((i) => i.subtotal), [11.11, 9.6]);
  assert.equal(t.totalUsd, 20.71);
});
