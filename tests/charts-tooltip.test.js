// tests/charts-tooltip.test.js - interação: crosshair + tooltip escuro multilinha, ponto com halo, destaque de série,
// teclado (setas/Home/End/Esc), aria-live, barras (coluna inteira) e anel (fatia + centro). Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarAmbiente, MESES, SERIES_LINHA } from './charts-helper.mjs';
import { criarGraficoLinha, criarGraficoArea, criarGraficoBarras, criarAnel, criarSparkline } from '../assets/js/charts/index.js';

const nbsp = (t) => t.replace(/ /g, ' ');

function linha(opcoes = {}) {
  const a = criarAmbiente({ reduzido: true });
  const g = criarGraficoLinha(a.novo(), { series: SERIES_LINHA, eixoX: MESES, formatarY: (v) => `${v}`, formatarValor: (v) => `R$ ${v}`, ...opcoes });
  const svg = a.raiz.querySelector('svg.chart-svg');
  a.caixa(svg, { width: 640, height: 240 });
  return { a, g, svg };
}

test('hover: o crosshair gruda no ponto mais próximo e a tooltip lista TODAS as séries (valor forte, nome secundário)', () => {
  const { a, g, svg } = linha();
  const xs = g.casca.svg.querySelectorAll('.chart-grade-x');
  assert.ok(xs.length >= 1);
  a.evento(svg, 'pointermove', { clientX: 330, clientY: 100 });
  const tip = a.raiz.querySelector('.chart-tip');
  assert.ok(tip.classList.contains('is-on'));
  const t = nbsp(tip.textContent);
  assert.ok(t.includes('R$ 11') && t.includes('R$ 12'), t);
  assert.equal(tip.querySelectorAll('.chart-tip-lin').length, 2, 'uma linha por série');
  assert.equal(tip.querySelector('.chart-tip-tit').textContent, MESES[2], 'ponto 2 (x≈330 de 640) = mar');
  assert.ok(tip.querySelector('.chart-tip-val') && tip.querySelector('.chart-tip-nome'));
  const cruz = a.raiz.querySelector('.chart-cruz');
  assert.ok(cruz.classList.contains('is-on'));
  assert.equal(cruz.getAttribute('x1'), cruz.getAttribute('x2'));
  assert.equal(a.raiz.querySelectorAll('.chart-pto.is-on').length, 2, 'ponto com halo por série');
  assert.ok(a.raiz.querySelector('.chart-pto circle.chart-pto-halo') && a.raiz.querySelector('.chart-pto circle.chart-pto-core'));
  a.evento(svg, 'pointerleave');
  assert.equal(tip.classList.contains('is-on'), false);
  assert.equal(cruz.classList.contains('is-on'), false);
  g.destruir();
});

test('hover perto de uma série destaca ela (data-destaque) e esmaece as outras; longe, limpa', () => {
  const { a, g, svg } = linha({ altura: 240 });
  const y0 = g.casca.svg.querySelector('.chart-linha[data-id="a"]');
  // pega o y real do ponto 2 da série "a" no modelo (via path) e passa o ponteiro por cima dele
  const ponto = y0.getAttribute('d').split(/[ML]/).filter(Boolean)[2].split(',').map(Number);
  a.evento(svg, 'pointermove', { clientX: ponto[0], clientY: ponto[1] });
  assert.equal(a.raiz.querySelector('.chart').getAttribute('data-destaque'), 'a');
  assert.ok(y0.classList.contains('is-destaque'));
  assert.equal(a.raiz.querySelector('.chart-linha[data-id="b"]').classList.contains('is-destaque'), false);
  assert.ok(a.raiz.querySelector('.chart-tip-lin.is-forte'), 'a linha da série destacada fica em negrito na tooltip');
  a.evento(svg, 'pointerleave');
  assert.equal(a.raiz.querySelector('.chart').hasAttribute('data-destaque'), false);
  g.destruir();
});

test('hover na legenda destaca a série; sair limpa', () => {
  const { a, g } = linha();
  const item = a.raiz.querySelectorAll('.chart-leg-item')[1];
  a.evento(item, 'pointerover');
  assert.equal(a.raiz.querySelector('.chart').getAttribute('data-destaque'), 'b');
  assert.ok(a.raiz.querySelector('.chart-linha[data-id="b"]').classList.contains('is-destaque'));
  a.evento(a.raiz.querySelector('.chart-legenda'), 'pointerleave');
  assert.equal(a.raiz.querySelector('.chart').hasAttribute('data-destaque'), false);
  g.destruir();
});

test('teclado: setas percorrem os pontos, Home/End vão às pontas, Esc fecha; aria-live anuncia o ponto', () => {
  const { a, g, svg } = linha();
  assert.equal(svg.getAttribute('tabindex'), '0');
  const tit = () => a.raiz.querySelector('.chart-tip-tit').textContent;
  a.tecla(svg, 'ArrowRight'); assert.equal(tit(), 'jan');
  a.tecla(svg, 'ArrowRight'); a.tecla(svg, 'ArrowRight'); assert.equal(tit(), 'mar');
  a.tecla(svg, 'ArrowLeft'); assert.equal(tit(), 'fev');
  a.tecla(svg, 'End'); assert.equal(tit(), 'jun');
  a.tecla(svg, 'ArrowRight'); assert.equal(tit(), 'jun', 'não passa do último');
  a.tecla(svg, 'Home'); assert.equal(tit(), 'jan');
  assert.match(nbsp(a.raiz.querySelector('.chart-sr[aria-live]').textContent), /^jan: Carteira R\$ 10; CDI R\$ 10$/);
  a.tecla(svg, 'Escape');
  assert.equal(a.raiz.querySelector('.chart-tip').classList.contains('is-on'), false);
  g.destruir();
});

test('selecionar(i) mostra o ponto por API e chama aoSelecionar', () => {
  const vistos = [];
  const { a, g } = linha({ aoSelecionar: (i) => vistos.push(i) });
  g.selecionar(4);
  assert.equal(a.raiz.querySelector('.chart-tip-tit').textContent, 'mai');
  assert.deepEqual(vistos, [4]);
  g.selecionar(null);
  assert.equal(a.raiz.querySelector('.chart-tip').classList.contains('is-on'), false);
});

test('tooltip da área empilhada traz o total; lacuna (null) some da lista', () => {
  const a = criarAmbiente({ reduzido: true });
  const g = criarGraficoArea(a.novo(), { series: [{ id: 'a', nome: 'A', valores: [3, 4] }, { id: 'b', nome: 'B', valores: [1, 2] }], eixoX: ['x', 'y'], total: true, formatarValor: (v) => `${v} u` });
  g.selecionar(1);
  const lin = [...a.raiz.querySelectorAll('.chart-tip-lin')].map((l) => nbsp(l.textContent));
  assert.equal(lin.length, 3);
  assert.ok(lin[2].includes('6 u') && lin[2].includes('Total'));
  const b = criarAmbiente({ reduzido: true });
  const g2 = criarGraficoLinha(b.novo(), { series: [{ id: 'a', nome: 'A', valores: [1, null, 3] }, { id: 'b', nome: 'B', valores: [2, 2, 2] }], eixoX: ['x', 'y', 'z'], formatarValor: (v) => `${v}` });
  g2.selecionar(1);
  assert.equal(b.raiz.querySelectorAll('.chart-tip-lin').length, 1, 'só B tem valor em y');
});

test('barras: o alvo é a coluna inteira; tooltip com todas as séries (+ total nas empilhadas); a coluna levanta e as outras esmaecem', () => {
  const a = criarAmbiente({ reduzido: true });
  const g = criarGraficoBarras(a.novo(), { modo: 'empilhadas', categorias: ['x', 'y', 'z'], series: [{ id: 'a', nome: 'A', valores: [1, 2, 3] }, { id: 'b', nome: 'B', valores: [4, 5, 6] }], formatarValor: (v) => `${v} u` });
  const svg = a.raiz.querySelector('svg.chart-svg'); a.caixa(svg);
  // y no alto (acima das barras) mas dentro da área do gráfico: ainda é a coluna certa
  a.evento(svg, 'pointermove', { clientX: 340, clientY: 30 });
  const tip = a.raiz.querySelector('.chart-tip');
  assert.ok(tip.classList.contains('is-on'));
  const t = nbsp(tip.textContent);
  assert.ok(t.includes('y') && t.includes('2 u') && t.includes('5 u') && t.includes('7 u') && t.includes('Total'), t);
  assert.equal(a.raiz.querySelectorAll('.chart-barra.is-hover').length, 2);
  assert.equal(a.raiz.querySelectorAll('.chart-barra.is-fora:not(.is-hover)').length, 4);
  a.evento(svg, 'pointerleave');
  assert.equal(a.raiz.querySelectorAll('.chart-barra.is-hover').length, 0);
  g.selecionar(2); assert.equal(a.raiz.querySelector('.chart-tip-tit').textContent, 'z');
  a.tecla(svg, 'ArrowLeft'); assert.equal(a.raiz.querySelector('.chart-tip-tit').textContent, 'y');
  g.destruir();
});

test('barras agrupadas: hover numa barra destaca a série (data-destaque) e deixa a linha dela em negrito', () => {
  const a = criarAmbiente({ reduzido: true });
  const g = criarGraficoBarras(a.novo(), { modo: 'agrupadas', categorias: ['x', 'y'], series: [{ id: 'a', nome: 'A', valores: [1, 2] }, { id: 'b', nome: 'B', valores: [2, 1] }] });
  const svg = a.raiz.querySelector('svg.chart-svg'); a.caixa(svg);
  const r = a.raiz.querySelector('.chart-barra[data-sid="b"]').getAttribute('d');
  const x = Number(r.match(/^M([\d.]+)/)[1]) + 3;
  a.evento(svg, 'pointermove', { clientX: x, clientY: 100 });
  assert.equal(a.raiz.querySelector('.chart').getAttribute('data-destaque'), 'b');
  assert.equal(a.raiz.querySelector('.chart-tip-lin.is-forte .chart-tip-nome').textContent, 'B');
  g.destruir();
});

test('anel: hover numa fatia troca o centro (% + nome) e mostra tooltip; setas percorrem; sair volta ao total', () => {
  const a = criarAmbiente({ reduzido: true });
  const g = criarAnel(a.novo(), { fatias: [{ id: 'a', nome: 'Ações', valor: 750 }, { id: 'b', nome: 'FIIs', valor: 250 }], tamanho: 200, centro: { rotulo: 'Total' } });
  const svg = a.raiz.querySelector('svg.chart-svg'); a.caixa(svg, { width: 200, height: 200 });
  const total = a.raiz.querySelector('.chart-anel-valor').textContent;
  // a fatia A ocupa 0..270° (horário a partir de 12h): ponto às 3h (direita) está nela; às 10h30 (270..360) é a B
  a.evento(svg, 'pointermove', { clientX: 100 + 80, clientY: 100 });
  assert.equal(a.raiz.querySelector('.chart-anel-valor').textContent, '75,0%');
  assert.equal(a.raiz.querySelector('.chart-anel-rot').textContent, 'Ações');
  assert.ok(a.raiz.querySelector('.chart-fatia[data-id="a"]').classList.contains('is-hover'));
  assert.ok(a.raiz.querySelector('.chart-fatia[data-id="b"]').classList.contains('is-fora'));
  a.evento(svg, 'pointermove', { clientX: 100 - 60, clientY: 100 - 60 });
  assert.equal(a.raiz.querySelector('.chart-anel-rot').textContent, 'FIIs');
  assert.ok(nbsp(a.raiz.querySelector('.chart-tip').textContent).includes('FIIs'));
  a.evento(svg, 'pointerleave');
  assert.equal(a.raiz.querySelector('.chart-anel-valor').textContent, total);
  assert.equal(a.raiz.querySelector('.chart-anel-rot').textContent, 'Total');
  a.tecla(svg, 'ArrowRight'); assert.equal(a.raiz.querySelector('.chart-anel-rot').textContent, 'Ações');
  a.tecla(svg, 'ArrowRight'); assert.equal(a.raiz.querySelector('.chart-anel-rot').textContent, 'FIIs');
  g.destruir();
});

test('sparkline com hover: ponto + tooltip com o valor formatado', () => {
  const a = criarAmbiente({ reduzido: true });
  const s = criarSparkline(a.novo(), { valores: [1, 2, 3, 4], hover: true, formatar: (v) => `v${v}`, rotulos: ['a', 'b', 'c', 'd'] });
  const svg = a.raiz.querySelector('svg.chart-svg'); a.caixa(svg, { width: 120, height: 40 });
  a.evento(svg, 'pointermove', { clientX: 118, clientY: 10 });
  assert.equal(a.raiz.querySelector('.chart-tip-val').textContent, 'v4');
  assert.equal(a.raiz.querySelector('.chart-tip-tit').textContent, 'd');
  s.destruir();
});
