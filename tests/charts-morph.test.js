// tests/charts-morph.test.js - atualizar()/morph: termina igual a um desenho novo, não vaza nós nem rAF/ouvintes,
// aguenta atualizar no meio da animação, alternar série na legenda, estados do card e contagem do KPI. Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarAmbiente, MESES, SERIES_LINHA } from './charts-helper.mjs';
import { criarGraficoLinha, criarGraficoArea, criarGraficoBarras, criarAnel, criarCardGrafico, criarKpi, animarNumero, criarSparkline } from '../assets/js/charts/index.js';

const A = { series: [{ id: 'a', nome: 'Carteira', valores: [10, 12, 11, 15, 14, 18] }, { id: 'b', nome: 'CDI', valores: [10, 11, 12, 12.5, 13, 13.5], pontilhada: true }], eixoX: MESES };
const B = { series: [{ id: 'a', nome: 'Carteira', valores: [20, 18, 22, 19, 25, 30, 28, 33] }, { id: 'b', nome: 'CDI', valores: [20, 20.5, 21, 21.5, 22, 22.5, 23, 23.5], pontilhada: true }], eixoX: ['1', '2', '3', '4', '5', '6', '7', '8'] };

const trajetos = (el) => [...el.querySelectorAll('path')].map((p) => p.getAttribute('d')).sort().join('|');
const rotulosX = (el) => [...el.querySelectorAll('.chart-eixo-x text')].map((t) => t.textContent).join(',');

test('morph de linha: ao fim da animação o desenho é idêntico a um gráfico novo com os mesmos dados', () => {
  const a = criarAmbiente();
  const g = criarGraficoLinha(a.novo(), { ...A, formatarY: String });
  a.avancar(900);
  g.atualizar(B);
  a.avancar(80);
  assert.ok(a.pendentes() > 0, 'ainda animando no meio');
  a.avancar(600);
  assert.equal(a.pendentes(), 0, 'animação acabou');
  const novo = criarAmbiente({ reduzido: true });
  criarGraficoLinha(novo.novo(), { ...B, formatarY: String });
  const [x, y] = [a.raiz.querySelector('.chart-svg'), novo.raiz.querySelector('.chart-svg')];
  assert.equal(trajetos(x), trajetos(y));
  assert.equal(rotulosX(x), rotulosX(y));
  g.destruir();
});

test('atualizar() em loop não vaza nós: a contagem de elementos estabiliza', () => {
  const a = criarAmbiente({ reduzido: true });
  const el = a.novo();
  const g = criarGraficoLinha(el, { ...A, formatarY: String });
  g.atualizar(B); g.atualizar(A);
  const base = a.contarNos(el);
  for (let i = 0; i < 25; i++) g.atualizar(i % 2 ? A : B);
  g.atualizar(A);
  assert.equal(a.contarNos(el), base, 'mesmo dado, mesma quantidade de nós');
  assert.equal(el.querySelectorAll('.chart').length, 1);
  g.destruir();
});

test('atualizar() sem reduzido também não vaza (nem deixa o eixo antigo para trás ao terminar)', () => {
  const a = criarAmbiente();
  const el = a.novo();
  const g = criarGraficoLinha(el, { ...A, formatarY: String });
  a.avancar(900);
  g.atualizar(B); a.avancar(500);
  const base = a.contarNos(el);
  for (let i = 0; i < 10; i++) { g.atualizar(i % 2 ? B : A); a.avancar(500); }
  g.atualizar(B); a.avancar(500);
  assert.equal(a.contarNos(el), base);
  assert.equal(el.querySelectorAll('.chart-eixos').length, 1, 'só um grupo de eixos (o antigo some ao terminar)');
  g.destruir();
});

test('atualizar() no meio da animação reinicia do estado atual e termina no dado novo', () => {
  const a = criarAmbiente();
  const g = criarGraficoLinha(a.novo(), { ...A, formatarY: String });
  a.avancar(900);
  g.atualizar(B); a.avancar(100);
  g.atualizar(A); a.avancar(100);
  g.atualizar(B); a.avancar(800);
  assert.equal(a.pendentes(), 0);
  const novo = criarAmbiente({ reduzido: true });
  criarGraficoLinha(novo.novo(), { ...B, formatarY: String });
  assert.equal(trajetos(a.raiz), trajetos(novo.raiz));
  g.destruir();
});

test('atualizar({animar:false}) pula a animação (sem pedir quadro)', () => {
  const a = criarAmbiente();
  const g = criarGraficoLinha(a.novo(), { ...A, formatarY: String, animar: false });
  const antes = a.pedidos;
  g.atualizar({ ...B, animar: false });
  assert.equal(a.pedidos, antes);
  g.destruir();
});

test('destruir(): remove o DOM, solta ouvintes, cancela rAF e desconecta o ResizeObserver', () => {
  const a = criarAmbiente();
  const el = a.novo();
  const g = criarGraficoArea(el, { ...A, empilhado: true, formatarY: String });
  a.avancar(100);
  g.atualizar(B);
  g.destruir();
  assert.equal(el.children.length, 0, 'nada sobra no contêiner');
  assert.equal(a.pendentes(), 0, 'sem quadro pendente');
  assert.ok(a.observadores.desconectados >= a.observadores.criados, 'RO desconectado');
  g.destruir(); // idempotente
});

test('barras: atualizar entre categorias diferentes termina igual a um desenho novo e não vaza', () => {
  const a = criarAmbiente();
  const el = a.novo();
  const d1 = { categorias: ['a', 'b', 'c'], series: [{ id: 's', nome: 'S', valores: [3, 5, 2] }] };
  const d2 = { categorias: ['a', 'b', 'c', 'd', 'e'], series: [{ id: 's', nome: 'S', valores: [4, 1, 6, 2, 9] }] };
  const g = criarGraficoBarras(el, { ...d1, formatarY: String });
  a.avancar(900);
  g.atualizar(d2); a.avancar(800);
  const n2 = a.contarNos(el);
  const novo = criarAmbiente({ reduzido: true });
  const elN = novo.novo();
  criarGraficoBarras(elN, { ...d2, formatarY: String });
  assert.equal(n2, novo.contarNos(elN));
  for (let i = 0; i < 8; i++) { g.atualizar(i % 2 ? d1 : d2); a.avancar(600); }
  g.atualizar(d2); a.avancar(600);
  assert.equal(a.contarNos(el), n2);
  g.destruir();
});

test('anel: atualizar troca fatias (entra/sai por id) sem vazar', () => {
  const a = criarAmbiente();
  const el = a.novo();
  const f1 = [{ id: 'x', nome: 'X', valor: 60 }, { id: 'y', nome: 'Y', valor: 40 }];
  const f2 = [{ id: 'x', nome: 'X', valor: 30 }, { id: 'y', nome: 'Y', valor: 30 }, { id: 'z', nome: 'Z', valor: 40 }];
  const g = criarAnel(el, { fatias: f1, formatarValor: String });
  a.avancar(900);
  g.atualizar({ fatias: f2 }); a.avancar(900);
  const n = a.contarNos(el);
  assert.equal(el.querySelectorAll('.chart-fatia').length, 3);
  for (let i = 0; i < 6; i++) { g.atualizar({ fatias: i % 2 ? f1 : f2 }); a.avancar(700); }
  g.atualizar({ fatias: f2 }); a.avancar(700);
  assert.equal(a.contarNos(el), n);
  g.destruir();
});

test('legenda alternável: ocultar uma série refaz o desenho (sem a série) e mostrar volta ao original', () => {
  const a = criarAmbiente({ reduzido: true });
  const el = a.novo();
  const g = criarGraficoLinha(el, { ...A, formatarY: String, alternarSeries: true });
  const inicial = trajetos(el);
  const itens = el.querySelectorAll('.chart-leg-item');
  assert.equal(itens.length, 2);
  a.evento(itens[1], 'click');
  assert.equal(el.querySelector('.chart-leg-item[data-id="b"]').getAttribute('aria-pressed'), 'false');
  assert.notEqual(trajetos(el), inicial);
  a.evento(el.querySelector('.chart-leg-item[data-id="b"]'), 'click');
  assert.equal(trajetos(el), inicial);
  g.destruir();
});

test('card: transições de estado (skeleton, vazio, erro, ok) sem sobrar nó e com retry', () => {
  const a = criarAmbiente({ reduzido: true });
  let tentou = 0;
  const c = criarCardGrafico(a.novo(), { rotulo: 'Evolução', valor: 'R$ 1', altura: 180, periodos: [{ id: '1m', rotulo: '1M' }, { id: '1a', rotulo: '1A' }], periodo: '1m', aoTentarNovamente: () => { tentou++; } });
  c.definirEstado('carregando');
  assert.equal(c.raiz.getAttribute('aria-busy'), 'true');
  assert.equal(c.raiz.querySelectorAll('.chart-sk-barra').length, 6);
  c.definirEstado('vazio');
  assert.equal(c.raiz.querySelectorAll('.chart-sk-barra').length, 0);
  assert.equal(c.raiz.hasAttribute('aria-busy'), false);
  c.definirEstado('erro', 'Falhou');
  assert.equal(c.raiz.querySelector('[role="alert"]').textContent.includes('Falhou'), true);
  a.evento(c.raiz.querySelector('.chart-card-retry'), 'click');
  assert.equal(tentou, 1);
  c.definirEstado('ok');
  assert.equal(c.corpo.hidden, false);
  assert.equal(c.raiz.querySelector('.chart-card-estado').hidden, true);
  c.recarregando(true);
  assert.ok(c.raiz.classList.contains('is-recarregando'));
  c.recarregando(false);
  assert.equal(c.raiz.classList.contains('is-recarregando'), false);
  c.destruir();
  assert.equal(a.raiz.querySelectorAll('.chart-card').length, 0);
});

test('card: seletor de período marca ✓ no ativo (aria-pressed) e avisa o gráfico', () => {
  const a = criarAmbiente({ reduzido: true });
  const visto = [];
  const c = criarCardGrafico(a.novo(), { rotulo: 'x', periodos: [{ id: '1m', rotulo: '1M' }, { id: '1a', rotulo: '1A' }], periodo: '1m', aoMudarPeriodo: (id) => visto.push(id) });
  const bs = c.raiz.querySelectorAll('.chart-seg-btn');
  assert.equal(bs[0].getAttribute('aria-pressed'), 'true');
  assert.ok(bs[0].querySelector('.chart-seg-ck'), 'ícone ✓ presente');
  a.evento(bs[1], 'click');
  assert.deepEqual(visto, ['1a']);
  assert.equal(bs[1].getAttribute('aria-pressed'), 'true');
  assert.equal(bs[0].getAttribute('aria-pressed'), 'false');
  a.evento(bs[1], 'click');
  assert.deepEqual(visto, ['1a'], 'clicar no ativo não repete');
  c.destruir();
});

test('animarNumero: termina exatamente no texto final formatado, mesmo pulando quadros', () => {
  const a = criarAmbiente();
  const el = a.novo();
  const f = (v) => `R$ ${Math.round(v)}`;
  animarNumero(el, { de: 0, para: 1234, formatar: f });
  a.avancar(100);
  const meio = Number(el.textContent.replace(/\D/g, ''));
  assert.ok(meio > 0 && meio < 1234, el.textContent);
  a.avancar(500);
  assert.equal(el.textContent, 'R$ 1234');
});

test('kpi: atualizar conta até o valor novo e a sparkline interna morfa; destruir limpa', () => {
  const a = criarAmbiente();
  const el = a.novo();
  const k = criarKpi(el, { rotulo: 'Total', valor: 100, formatar: (v) => `${Math.round(v)} u`, spark: { valores: [1, 2, 3, 2, 4] } });
  a.avancar(600);
  assert.equal(el.querySelector('.chart-kpi-val').textContent, '100 u');
  k.atualizar({ valor: 250, spark: { valores: [4, 3, 5, 7] } });
  a.avancar(600);
  assert.equal(el.querySelector('.chart-kpi-val').textContent, '250 u');
  k.destruir();
  assert.equal(a.pendentes(), 0);
});

test('sparkline: atualizar mantém um único svg e destruir remove', () => {
  const a = criarAmbiente({ reduzido: true });
  const el = a.novo();
  const s = criarSparkline(el, { valores: [1, 3, 2, 5] });
  s.atualizar([5, 4, 3, 1]);
  assert.equal(el.querySelectorAll('svg').length, 1);
  s.destruir();
  assert.equal(el.querySelectorAll('svg').length, 0);
});
