// tests/charts-movimento.test.js - prefers-reduced-motion: tudo vai direto ao estado final (sem pedir quadro, sem
// resíduo de animação) e o CSS tem a regra equivalente. Também trava a regra "cores SÓ por variável CSS".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { criarAmbiente, MESES, SERIES_LINHA } from './charts-helper.mjs';
import { criarGraficoLinha, criarGraficoArea, criarGraficoBarras, criarAnel, criarAnelProgresso, criarKpi, animarNumero, criarSparkline, criarCardGrafico } from '../assets/js/charts/index.js';
import { animar, movimentoReduzido, DUR } from '../assets/js/charts/base.js';

const raizRepo = join(dirname(fileURLToPath(import.meta.url)), '..');

test('movimentoReduzido lê prefers-reduced-motion do matchMedia da janela', () => {
  assert.equal(movimentoReduzido(criarAmbiente({ reduzido: true }).win), true);
  assert.equal(movimentoReduzido(criarAmbiente({ reduzido: false }).win), false);
});

test('animar(): reduzido = síncrono, estado final (t=1), sem pedir quadro', () => {
  const a = criarAmbiente({ reduzido: true });
  const t = []; let fim = 0;
  animar(a.win, { duracao: 700, aoQuadro: (x) => t.push(x), aoFim: () => { fim++; } });
  assert.deepEqual(t, [1]);
  assert.equal(fim, 1);
  assert.equal(a.pedidos, 0);
});

test('animar(): sem reduzido percorre 0→1 em quadros e chama aoFim uma vez; terminar() salta ao fim', () => {
  const a = criarAmbiente();
  const t = []; let fim = 0;
  animar(a.win, { duracao: 700, aoQuadro: (x) => t.push(x), aoFim: () => { fim++; } });
  assert.equal(t[0], 0);
  a.avancar(400);
  assert.ok(t.at(-1) > 0 && t.at(-1) < 1);
  a.avancar(600);
  assert.equal(t.at(-1), 1); assert.equal(fim, 1);
  const b = criarAmbiente(); let u = null;
  const h = animar(b.win, { duracao: 700, aoQuadro: (x) => { u = x; } });
  h.terminar(); assert.equal(u, 1); assert.equal(b.pendentes(), 0);
});

test('animar(): sem requestAnimationFrame cai direto no estado final (não trava)', () => {
  const a = criarAmbiente({ comRaf: false });
  a.win.requestAnimationFrame = undefined;
  let u = null;
  assert.doesNotThrow(() => animar(a.win, { duracao: 700, aoQuadro: (x) => { u = x; } }));
  assert.equal(u, 1);
});

test('durações do plano: linha 700, área 500, anel 600, KPI 400, morfar 300, tooltip 150, stagger 25', () => {
  assert.equal(DUR.linha, 700); assert.equal(DUR.area, 500); assert.equal(DUR.anel, 600);
  assert.equal(DUR.kpi, 400); assert.equal(DUR.morfar, 300); assert.equal(DUR.tooltip, 150);
  assert.ok(DUR.barraEscalonamento >= 20 && DUR.barraEscalonamento <= 30);
});

test('reduzido: nenhum gráfico pede quadro (rAF) ao montar nem ao atualizar', () => {
  const a = criarAmbiente({ reduzido: true });
  const gs = [
    criarGraficoLinha(a.novo(), { series: SERIES_LINHA, eixoX: MESES, area: true }),
    criarGraficoArea(a.novo(), { series: SERIES_LINHA, eixoX: MESES, empilhado: true }),
    criarGraficoBarras(a.novo(), { categorias: ['a', 'b', 'c'], series: [{ id: 's', nome: 'S', valores: [1, 3, 2] }] }),
    criarAnel(a.novo(), { fatias: [{ id: 'x', nome: 'X', valor: 3 }, { id: 'y', nome: 'Y', valor: 1 }] }),
    criarSparkline(a.novo(), { valores: [1, 3, 2, 5] }),
  ];
  criarAnelProgresso(a.novo(), { valor: 0.6 });
  criarKpi(a.novo(), { rotulo: 'k', valor: 10, spark: { valores: [1, 2, 3] } });
  for (const g of gs) if (g.atualizar) g.atualizar(g === gs[3] ? { fatias: [{ id: 'x', nome: 'X', valor: 1 }, { id: 'z', nome: 'Z', valor: 5 }] } : undefined);
  assert.equal(a.pedidos, 0);
  assert.equal(a.pendentes(), 0);
});

test('reduzido: linha nasce JÁ desenhada (sem stroke-dashoffset/clip residual) e barras sem escala parcial', () => {
  const a = criarAmbiente({ reduzido: true });
  criarGraficoLinha(a.novo(), { series: SERIES_LINHA, eixoX: MESES, area: true });
  for (const p of a.raiz.querySelectorAll('.chart-linha:not(.is-trac)')) {
    const off = p.style.strokeDashoffset || p.getAttribute('stroke-dashoffset');
    assert.ok(!off || Number(off) === 0, `dashoffset ${off}`);
  }
  for (const p of a.raiz.querySelectorAll('.chart-area')) assert.ok(!p.style.opacity || Number(p.style.opacity) === 1 || p.style.opacity === '');
  criarGraficoBarras(a.novo(), { categorias: ['a', 'b'], series: [{ id: 's', nome: 'S', valores: [2, 4] }] });
  const barras = a.raiz.querySelectorAll('.chart-barra');
  assert.ok(barras.length >= 2);
  for (const b of barras) { const h = Number(b.getAttribute('height')); const d = b.getAttribute('d'); assert.ok(h > 0 || (d && d.length > 4), 'barra com altura final'); }
});

test('reduzido: animarNumero e KPI mostram o valor final na hora', () => {
  const a = criarAmbiente({ reduzido: true });
  const el = a.novo();
  animarNumero(el, { de: 0, para: 98.7, formatar: (v) => v.toFixed(1) });
  assert.equal(el.textContent, '98.7');
  const k = a.novo();
  criarKpi(k, { rotulo: 'Total', valor: 4321, formatar: (v) => `${Math.round(v)} u` });
  assert.equal(k.querySelector('.chart-kpi-val').textContent, '4321 u');
});

test('reduzido: o anel já abre com as fatias completas e o card troca de estado sem transição', () => {
  const a = criarAmbiente({ reduzido: true });
  const el = a.novo();
  criarAnel(el, { fatias: [{ id: 'x', nome: 'X', valor: 1 }, { id: 'y', nome: 'Y', valor: 1 }] });
  const ds = [...el.querySelectorAll('.chart-fatia')].map((p) => p.getAttribute('d'));
  assert.equal(ds.length, 2);
  assert.ok(ds.every((d) => d && d.length > 20));
  const c = criarCardGrafico(a.novo(), { rotulo: 'r' });
  c.definirEstado('carregando'); c.definirEstado('ok');
  assert.equal(a.pedidos, 0);
});

test('com movimento: o mesmo gráfico PEDE quadros (garante que o teste de reduzido não é vácuo)', () => {
  const a = criarAmbiente();
  criarGraficoLinha(a.novo(), { series: SERIES_LINHA, eixoX: MESES });
  assert.ok(a.pedidos > 0);
  a.avancar(900);
  assert.equal(a.pendentes(), 0);
});

test('charts.css: regra prefers-reduced-motion desliga transition/animation do gráfico', () => {
  const css = readFileSync(join(raizRepo, 'assets/css/charts.css'), 'utf8');
  const m = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([^}]*)\}/);
  assert.ok(m, 'bloco existe');
  assert.match(m[1], /animation:\s*none/);
  assert.match(m[1], /transition:\s*none/);
});

/* ------------------------------------------------------- cores só por variável CSS */
const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const semVar = (t) => { let o = t; for (let i = 0; i < 6; i++) o = o.replace(/var\([^()]*\)/g, ''); return o; };
const HEX = /#[0-9a-fA-F]{3,8}\b/;

test('charts.css: fora dos blocos de variáveis (claro/escuro), nenhuma cor literal sem var(--…, fallback)', () => {
  const css = semComentarios(readFileSync(join(raizRepo, 'assets/css/charts.css'), 'utf8'));
  const ini = css.indexOf('.chart-svg'); // 1º seletor de estilo depois dos blocos de variáveis
  assert.ok(ini > 0);
  const resto = semVar(css.slice(ini));
  const achou = resto.match(new RegExp(HEX.source, 'g'));
  assert.equal(achou, null, `hex solto em charts.css: ${achou}`);
});

test('assets/js/charts/*.js: nenhuma cor hex/rgb literal (cores vêm de var(--…) via corSerie/corRampa)', () => {
  const dir = join(raizRepo, 'assets/js/charts');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = semVar(semComentarios(readFileSync(join(dir, f), 'utf8')));
    assert.doesNotMatch(src, HEX, `${f}: hex literal`);
    assert.doesNotMatch(src, /\brgba?\(\s*\d/, `${f}: rgb() literal`);
  }
});

test('assets/js/charts/*.js: sem Intl/toLocale (formatação só via format.js) e sem innerHTML com dado', () => {
  const dir = join(raizRepo, 'assets/js/charts');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = semComentarios(readFileSync(join(dir, f), 'utf8'));
    assert.doesNotMatch(src, /Intl\.|toLocale(String|DateString)/, `${f}: formatação local`);
    if (f !== 'sparkline.js') assert.doesNotMatch(src, /innerHTML\s*=/, `${f}: innerHTML`);
  }
});
