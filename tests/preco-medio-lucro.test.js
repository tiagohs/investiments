// tests/preco-medio-lucro.test.js - 08/10/2026: quantas cotas comprar pra sair do prejuízo (assets/js/preco-medio-lucro.js).
// Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cotasParaPm, pmAposCompra, simularSaidaPrejuizo, resumoSaidaPrejuizo, pontosGraficoPm, rotuloVariacao, LIMITE_VEZES_POSICAO,
} from '../assets/js/preco-medio-lucro.js';

test('cotasParaPm: q = Q·(PM − T)/(T − c), arredondado PRA CIMA (o PM fica no alvo ou abaixo, nunca acima)', () => {
  // 21,896 cotas a 10,83 -> PM 9,00 comprando a 7,70: 21,896 × 1,83 / 1,30 = 30,82 -> 31
  const r = cotasParaPm({ quantidade: 21.896, precoMedio: 10.83, precoCompra: 7.7, pmAlvo: 9 });
  assert.equal(r.situacao, 'ok');
  assert.equal(r.cotas, 31);
  assert.ok(Math.abs(r.aporte - 238.7) < 1e-9);
  assert.ok(r.novoPm <= 9 && r.novoPm > 8.98);
  // 8,00 -> 9,00: 40,07 vira 41 (40 deixaria o PM em 9,007, acima do alvo)
  const r2 = cotasParaPm({ quantidade: 21.896, precoMedio: 10.83, precoCompra: 8, pmAlvo: 9 });
  assert.equal(r2.cotas, 41);
  assert.ok(pmAposCompra({ quantidade: 21.896, precoMedio: 10.83 }, 40, 8) > 9);
  // conta exata não sobe uma cota à toa: 10 cotas a 10 -> 20 cotas, PM 12 vai a 11
  assert.equal(cotasParaPm({ quantidade: 10, precoMedio: 12, precoCompra: 10, pmAlvo: 11 }).cotas, 10);
});

test('cotasParaPm: alvo no PM ou acima = sem compra; compra no alvo ou acima = impossível; dado faltando = null', () => {
  assert.equal(cotasParaPm({ quantidade: 10, precoMedio: 12, precoCompra: 10, pmAlvo: 12 }).situacao, 'semCompra');
  assert.equal(cotasParaPm({ quantidade: 10, precoMedio: 12, precoCompra: 10, pmAlvo: 13 }).cotas, 0);
  assert.equal(cotasParaPm({ quantidade: 10, precoMedio: 12, precoCompra: 11, pmAlvo: 11 }).situacao, 'impossivel');
  assert.equal(cotasParaPm({ quantidade: 10, precoMedio: 12, precoCompra: 11.5, pmAlvo: 11 }).situacao, 'impossivel');
  assert.equal(cotasParaPm({ quantidade: 0, precoMedio: 12, precoCompra: 10, pmAlvo: 11 }), null);
  assert.equal(cotasParaPm({ quantidade: 10, precoMedio: null, precoCompra: 10, pmAlvo: 11 }), null);
});

test('cotasParaPm: mais de 10x a posição fica marcado como inviável', () => {
  const r = cotasParaPm({ quantidade: 10, precoMedio: 20, precoCompra: 9.9, pmAlvo: 10 });
  assert.ok(r.cotas > 10 * LIMITE_VEZES_POSICAO);
  assert.equal(r.inviavel, true);
});

test('simularSaidaPrejuizo: cotação no PM ou acima = lucro (com a folga até empatar)', () => {
  const s = simularSaidaPrejuizo({ quantidade: 100, precoMedio: 80, precoAtual: 100 });
  assert.equal(s.situacao, 'lucro');
  assert.ok(Math.abs(s.folga - 0.2) < 1e-9);
  assert.equal(simularSaidaPrejuizo({ quantidade: 0, precoMedio: 80, precoAtual: 100 }), null);
});

test('simularSaidaPrejuizo: matriz compra (−20%, −10%, hoje) × lucro (hoje, +10%, +20%) - comprar hoje nunca põe no lucro hoje', () => {
  const s = simularSaidaPrejuizo({ quantidade: 100, precoMedio: 95.8, precoAtual: 71.85 });
  assert.equal(s.situacao, 'prejuizo');
  assert.ok(Math.abs(s.subida - (95.8 / 71.85 - 1)) < 1e-12);
  assert.deepEqual(s.compras.map((c) => c.preco), [57.48, 64.67, 71.85]);
  assert.deepEqual(s.alvos.map((a) => a.preco), [71.85, 79.04, 86.22]);
  const tab = s.matriz.map((l) => l.map((c) => (c.situacao === 'ok' ? c.cotas : c.situacao)));
  assert.equal(tab[2][0], 'impossivel');
  // mais barato = menos cotas; alvo mais alto = menos cotas
  assert.ok(tab[0][0] < tab[1][0]);
  assert.ok(tab[1][2] < tab[1][1] && tab[1][1] < tab[1][0]);
  s.matriz.flat().filter((c) => c.situacao === 'ok').forEach((c) => assert.ok(c.novoPm <= c.alvo.preco + 1e-9, 'PM final no alvo ou abaixo'));
  assert.equal(s.destaque.compra.variacao, 0);
  assert.equal(s.destaque.alvo.variacao, 0.1);
  assert.equal(s.alternativa.compra.variacao, -0.1);
  assert.equal(s.alternativa.alvo.variacao, 0);
});

test('resumoSaidaPrejuizo: linhas curtas pra tabela, frase pra análise e o detalhe', () => {
  const s = simularSaidaPrejuizo({ quantidade: 100, precoMedio: 95.8, precoAtual: 71.85 });
  const r = resumoSaidaPrejuizo(s);
  assert.deepEqual(r.curto, ['Empata com +33,3%', `Lucro em +10%: ${s.destaque.cotas} cotas`]);
  assert.match(r.frase, /^lucro se a cota subir 10%: compre cerca de \d+ cotas \(R\$\s[\d.]+\)$/);
  assert.match(r.dica, /a cota precisa subir 33,3% para você empatar/);
  assert.match(r.dica, /Se cair 10% \(R\$\s64,67\)/);
  // subida até 10%: sem compra pra lucrar com +10%
  const perto = resumoSaidaPrejuizo(simularSaidaPrejuizo({ quantidade: 10, precoMedio: 21, precoAtual: 20 }), { moeda: 'USD' });
  assert.deepEqual(perto.curto, ['Empata com +5,0%']);
  assert.equal(perto.frase, 'a cota precisa subir 5,0% para você empatar');
  assert.match(perto.dica, /US\$\s21,00/);
  assert.equal(resumoSaidaPrejuizo(simularSaidaPrejuizo({ quantidade: 10, precoMedio: 18, precoAtual: 20 })), null);
});

test('pontosGraficoPm: eixo de cotas a partir de 0 e o PM caindo em direção ao preço de cada compra', () => {
  const s = simularSaidaPrejuizo({ quantidade: 100, precoMedio: 95.8, precoAtual: 71.85 });
  const g = pontosGraficoPm(s);
  assert.equal(g.eixo[0], 0);
  assert.equal(g.series.length, 3);
  g.series.forEach((sr) => {
    assert.equal(sr.valores[0], 95.8);
    for (let i = 1; i < sr.valores.length; i++) assert.ok(sr.valores[i] < sr.valores[i - 1]);
    assert.ok(sr.valores[sr.valores.length - 1] > sr.preco, 'nunca abaixo do preço da compra');
  });
  // o eixo chega até onde a compra 10% mais barata cruza a cotação de hoje
  assert.ok(g.eixo[g.eixo.length - 1] >= s.alternativa.cotas);
  assert.equal(pontosGraficoPm(simularSaidaPrejuizo({ quantidade: 10, precoMedio: 18, precoAtual: 20 })), null);
});

test('rotuloVariacao', () => {
  assert.equal(rotuloVariacao(0), 'hoje');
  assert.equal(rotuloVariacao(-0.1), '10% mais barata');
  assert.equal(rotuloVariacao(0.2), '20% mais cara');
});
