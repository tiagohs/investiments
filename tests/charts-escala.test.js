// tests/charts-escala.test.js - escalas, ticks, caminhos, easings e geometria pura da biblioteca de gráficos
// (assets/js/charts). Sem DOM. Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escalaLinear, escalaBanda, passoAgradavel, ticksAgradaveis, indicesDeRotulos, caminhoLinha, caminhoSuave, caminhoArea,
  retanguloArredondado, bezier, EASE_ENTRADA, EASE_PADRAO, corSerie, corRampa, limitar, lerp,
} from '../assets/js/charts/base.js';
import { reamostrar, interpolarSeries, construirModelo } from '../assets/js/charts/xy.js';
import { construirModeloBarras, raiosDaBarra } from '../assets/js/charts/barras.js';
import { caminhoSetor, angulos } from '../assets/js/charts/anel.js';
import { direcaoDe, pontosSpark } from '../assets/js/charts/sparkline.js';

test('escalaLinear mapeia o domínio no intervalo e inverte; domínio sem largura vira o meio', () => {
  const e = escalaLinear([0, 100], [200, 0]);
  assert.equal(e(0), 200); assert.equal(e(100), 0); assert.equal(e(50), 100);
  assert.equal(e.inverter(100), 50);
  const c = escalaLinear([5, 5], [0, 10]);
  assert.equal(c(5), 5);
});

test('escalaBanda: passo, início/centro e categoria sob o ponteiro (limitada às pontas)', () => {
  const b = escalaBanda(4, [10, 90]);
  assert.equal(b.passo, 20); assert.equal(b.inicio(1), 30); assert.equal(b.centro(1), 40);
  assert.equal(b.indiceDe(5), 0); assert.equal(b.indiceDe(55), 2); assert.equal(b.indiceDe(500), 3);
  assert.equal(escalaBanda(0, [0, 10]).indiceDe(3), -1);
});

test('passoAgradavel e ticksAgradaveis devolvem números redondos que cobrem os dados', () => {
  assert.equal(passoAgradavel(100, 4), 25, 'faixa 100 em ~4 intervalos -> passo 25');
  assert.equal(passoAgradavel(80, 4), 20);
  const t = ticksAgradaveis(3, 97, 4);
  assert.deepEqual(t.ticks, [0, 25, 50, 75, 100]);
  assert.ok(t.min <= 3 && t.max >= 97);
  const z = ticksAgradaveis(120, 480, 4, { zero: true });
  assert.equal(z.ticks[0], 0); assert.ok(z.max >= 480);
  const neg = ticksAgradaveis(-2.1, 3.1, 4, { zero: true });
  assert.ok(neg.ticks.includes(0) && neg.min <= -2.1 && neg.max >= 3.1);
  const cte = ticksAgradaveis(7, 7, 4);
  assert.ok(cte.max > cte.min, 'série constante ganha folga');
  assert.equal(ticksAgradaveis(NaN, 3).ticks.length, 5, 'entrada inválida não quebra');
  for (const v of ticksAgradaveis(0, 1, 4).ticks) assert.ok(Number.isInteger(v * 100), 'sem lixo de ponto flutuante');
});

test('indicesDeRotulos: no máximo `max`, começa no 0, espalhado', () => {
  assert.deepEqual(indicesDeRotulos(3, 5), [0, 1, 2]);
  const r = indicesDeRotulos(12, 4);
  assert.ok(r.length <= 4 && r[0] === 0);
  assert.deepEqual(indicesDeRotulos(0, 4), []);
});

test('caminhoLinha quebra nas lacunas (null) e arredonda; caminhoSuave não ultrapassa os dados (monotônica)', () => {
  assert.equal(caminhoLinha([{ x: 0, y: 10 }, { x: 10, y: 20 }, null, { x: 30, y: 5 }]), 'M0,10L10,20M30,5');
  const pts = [{ x: 0, y: 100 }, { x: 10, y: 20 }, { x: 20, y: 20 }, { x: 30, y: 90 }];
  const d = caminhoSuave(pts);
  assert.match(d, /^M0,100C/);
  const ys = [...d.matchAll(/C([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+)/g)].flatMap((m) => [Number(m[2]), Number(m[4])]);
  for (const y of ys) assert.ok(y >= 20 - 0.01 && y <= 100 + 0.01, `controle ${y} fora do intervalo dos dados (overshoot)`);
  assert.equal(caminhoSuave([{ x: 5, y: 5 }]), 'M5,5');
  assert.equal(caminhoSuave([]), '');
});

test('caminhoArea fecha o polígono entre topo e base', () => {
  const d = caminhoArea([{ x: 0, y: 10 }, { x: 10, y: 5 }], [{ x: 0, y: 50 }, { x: 10, y: 50 }]);
  assert.equal(d, 'M0,10L10,5L10,50L0,50Z');
  assert.equal(caminhoArea([], []), '');
});

test('retanguloArredondado: raio limitado à metade do menor lado (pílula) e tamanho 0 vira vazio', () => {
  assert.equal(retanguloArredondado(0, 0, 0, 10), '');
  const pil = retanguloArredondado(0, 0, 10, 40, [50, 50, 50, 50]);
  assert.match(pil, /A5,5/, 'raio 50 limitado a 5 (metade da largura)');
  const topo = retanguloArredondado(0, 0, 20, 20, [4, 4, 0, 0]);
  assert.equal((topo.match(/A/g) || []).length, 2);
});

test('bezier: extremos, monotonia e easings M3 (emphasized-decelerate sai rápido; standard é suave)', () => {
  const f = bezier(0.2, 0, 0, 1);
  assert.equal(f(0), 0); assert.equal(f(1), 1);
  let ant = -1;
  for (let i = 0; i <= 20; i++) { const v = f(i / 20); assert.ok(v >= ant - 1e-9); ant = v; }
  assert.ok(EASE_ENTRADA(0.1) > 0.35, 'decelerate: já avançou bastante em 10% do tempo');
  assert.ok(EASE_PADRAO(0.5) > 0.5 && EASE_PADRAO(0.5) < 1);
});

test('corSerie/corRampa: só variáveis CSS, ordem fixa e nunca cicla além de 8', () => {
  assert.equal(corSerie(undefined, 0), 'var(--_c1)');
  assert.equal(corSerie(undefined, 7), 'var(--_c8)');
  assert.equal(corSerie(undefined, 8), 'var(--_cn)', '9ª série cai no neutro, não gera matiz');
  assert.equal(corSerie(3, 0), 'var(--_c3)');
  assert.equal(corSerie('var(--chart-down)', 0), 'var(--chart-down)');
  assert.equal(corRampa(0, 3), 'var(--_t1)'); assert.equal(corRampa(2, 3), 'var(--_t5)'); assert.equal(corRampa(9, 3), 'var(--_t5)');
  assert.equal(limitar(5, 0, 3), 3); assert.equal(lerp(0, 10, 0.25), 2.5);
});

test('reamostrar e interpolarSeries: morfar séries de tamanhos diferentes sem pular; série nova surge da base, a que sai esmaece', () => {
  const a = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
  const r = reamostrar(a, 3);
  assert.equal(r.length, 3); assert.deepEqual(r[1], { x: 5, y: 5 });
  const base = { baseY: 100 };
  const A = { ...base, series: [{ id: 'x', pts: [{ x: 0, y: 40 }, { x: 10, y: 60 }] }, { id: 'sai', pts: [{ x: 0, y: 1 }, { x: 10, y: 1 }] }] };
  const B = { ...base, series: [{ id: 'x', pts: [{ x: 0, y: 20 }, { x: 5, y: 30 }, { x: 10, y: 40 }] }, { id: 'nova', pts: [{ x: 0, y: 10 }, { x: 10, y: 10 }] }] };
  const meio = interpolarSeries(A, B, 0.5);
  const x = meio.find((s) => s.id === 'x');
  assert.equal(x.pts.length, 3); assert.ok(Math.abs(x.pts[0].y - 30) < 1e-9);
  assert.equal(meio.find((s) => s.id === 'nova').alfa, 0.5);
  assert.equal(meio.find((s) => s.id === 'sai').alfa, 0.5);
  assert.equal(interpolarSeries(A, B, 1).find((s) => s.id === 'x').pts[2].y, 40);
  assert.equal(interpolarSeries(A, B, 1).some((s) => s.id === 'sai' && s.alfa > 0), false);
});

test('construirModelo (linha): ticks Y redondos, ticks X só entre rótulos com texto, séries ocultas fora do domínio', () => {
  const op = { tipo: 'linha', altura: 240, ticksY: 4, series: [{ id: 'a', nome: 'A', valores: [10, 20, 30, 40] }, { id: 'b', nome: 'B', valores: [1000, 2000, 3000, 4000] }], eixoX: ['a', '', '', 'd'], formatarY: (v) => String(v), maxRotulosX: 0 };
  const m = construirModelo(op, 640, new Set(['b']));
  assert.ok(m.ticksY.every((t) => Number.isInteger(t.v)));
  assert.equal(Math.max(...m.ticksY.map((t) => t.v)) <= 50, true, 'a série B oculta não estica o eixo');
  assert.deepEqual(m.ticksX.map((t) => t.rotulo), ['a', 'd']);
  assert.equal(m.ticksX[0].ancora, 'start'); assert.equal(m.ticksX[1].ancora, 'end');
  assert.equal(m.series.length, 1);
  assert.ok(m.xs[0] < m.xs[3]);
});

test('construirModelo (linha): eixo X numérico (valor) espaça pelo valor, não pelo índice', () => {
  const op = { tipo: 'linha', altura: 200, ticksY: 3, series: [{ id: 'a', nome: 'A', valores: [1, 2, 3] }], eixoX: [{ rotulo: 'a', valor: 0 }, { rotulo: 'b', valor: 1 }, { rotulo: 'c', valor: 10 }], formatarY: String };
  const m = construirModelo(op, 640);
  const d1 = m.xs[1] - m.xs[0]; const d2 = m.xs[2] - m.xs[1];
  assert.ok(d2 > d1 * 8, 'o 3º ponto está 9x mais longe');
});

test('construirModelo (área empilhada): topo da pilha = soma e domínio começa no 0', () => {
  const op = { tipo: 'area', empilhado: true, altura: 240, ticksY: 4, series: [{ id: 'a', nome: 'A', valores: [3, 4] }, { id: 'b', nome: 'B', valores: [2, 2] }], eixoX: ['x', 'y'], formatarY: String };
  const m = construirModelo(op, 640);
  assert.equal(m.ticksY[0].v, 0);
  const [a, b] = m.series;
  assert.ok(b.top[0].y < a.top[0].y, 'a camada de cima fica acima');
  assert.equal(b.base[0].y, a.top[0].y, 'base de uma camada = topo da anterior');
});

test('construirModeloBarras: empilhadas somam, 2px de ar entre segmentos, horizontais trocam eixos; negativas descem da linha zero', () => {
  const op = { orientacao: 'vertical', modo: 'empilhadas', altura: 240, ticksY: 4, categorias: ['a', 'b'], series: [{ id: 's1', nome: 'S1', valores: [10, 5], cor: 'x' }, { id: 's2', nome: 'S2', valores: [10, 5], cor: 'y' }], formatarY: String };
  const m = construirModeloBarras(op, 640);
  const s1 = m.barras.find((b) => b.key === 's1|0'); const s2 = m.barras.find((b) => b.key === 's2|0');
  assert.equal(m.barras.length, 4);
  assert.ok(s2.rect.y + s2.rect.h <= s1.rect.y + 0.01, 'segmento de cima termina onde o de baixo começa (com o ar de 2px)');
  assert.ok(s1.rect.y - (s2.rect.y + s2.rect.h) >= 1.9, 'ar de ~2px entre os segmentos');
  const h = construirModeloBarras({ ...op, orientacao: 'horizontal', modo: 'simples', series: [op.series[0]] }, 640);
  assert.ok(h.horizontal && h.barras[0].rect.w > h.barras[0].rect.h);
  const neg = construirModeloBarras({ ...op, modo: 'simples', series: [{ id: 'n', nome: 'N', valores: [-5, 8], cor: 'x' }] }, 640);
  const b0 = neg.barras[0];
  assert.ok(Math.abs(b0.rect.y - neg.zeroPx) < 0.01, 'barra negativa começa na linha zero e desce');
  assert.deepEqual(raiosDaBarra(neg, b0, { modo: 'simples' }).slice(0, 2), [0, 0]);
});

test('anel: ângulos somam 360°, fatias ocultas saem; setor com espaço fica dentro do arco e dos raios', () => {
  const { total, itens } = angulos([{ id: 'a', valor: 50 }, { id: 'b', valor: 30 }, { id: 'c', valor: 20 }, { id: 'z', valor: 0 }], new Set(['c']));
  assert.equal(total, 80); assert.equal(itens.length, 2);
  assert.ok(Math.abs(itens[1].a1 - Math.PI * 2) < 1e-9);
  assert.equal(caminhoSetor(100, 100, 50, 80, 0, 0.01, 4, 4), '', 'fatia fina demais pro espaço some');
  assert.match(caminhoSetor(100, 100, 50, 80, 0, 1.5, 4, 4), /^M[\d.,-]+A[\d.]+,[\d.]+ 0 0 1/);
});

test('sparkline: direção pela referência e pontos dentro da caixa', () => {
  assert.equal(direcaoDe([1, 2, 3]), 'up'); assert.equal(direcaoDe([3, 2, 1]), 'down'); assert.equal(direcaoDe([2, 2]), 'flat'); assert.equal(direcaoDe([5]), 'flat');
  assert.equal(direcaoDe([5, 4], 3), 'up', 'referência numérica');
  const p = pontosSpark([1, null, 3, 2], 100, 40, 4);
  assert.equal(p[1], null);
  for (const q of p.filter(Boolean)) { assert.ok(q.x >= 4 && q.x <= 96 && q.y >= 4 && q.y <= 36); }
});
