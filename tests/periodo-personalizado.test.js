// Testes de assets/js/periodo-personalizado.js (02/10/2026 - "Escolher
// período", pedido A do Tiago). Datas e séries inventadas.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  ligarFiltroPeriodo, recortarPorIntervalo, rotuloIntervalo, descricaoIntervalo, diasNoIntervalo,
  atalhosPeriodo, ehPeriodoPersonalizado, somarDiasIso,
} from '../assets/js/periodo-personalizado.js';

let store;
beforeEach(() => {
  store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
});
afterEach(() => { delete globalThis.localStorage; });

function makeDom(largura = 1200) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div class="filter-tabs" id="tabs">
      <button class="filter-tab active" type="button" data-periodo="mes">Mês atual</button>
      <button class="filter-tab" type="button" data-periodo="30d">30 dias</button>
      <button class="filter-tab" type="button" data-periodo="tudo">Desde o início</button>
    </div></body></html>`, { pretendToBeVisual: true });
  Object.defineProperty(dom.window, 'innerWidth', { value: largura, configurable: true });
  return dom.window.document;
}
const clicar = (doc, el) => el.dispatchEvent(new doc.defaultView.MouseEvent('click', { bubbles: true }));
const teclar = (doc, el, key, extra = {}) => el.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key, bubbles: true, ...extra }));
const LIM = { min: '2025-03-10', max: '2026-10-02' };

// --- utilitários puros -------------------------------------------------------

test('rotuloIntervalo(): mesmo mês, meses diferentes no ano, anos diferentes e 1 dia', () => {
  assert.equal(rotuloIntervalo({ inicio: '2026-10-02', fim: '2026-10-24' }), '02–24 out');
  assert.equal(rotuloIntervalo({ inicio: '2026-09-02', fim: '2026-10-24' }), '02 set–24 out');
  assert.equal(rotuloIntervalo({ inicio: '2025-03-01', fim: '2026-09-30' }), 'mar/25–set/26');
  assert.equal(rotuloIntervalo({ inicio: '2026-10-02', fim: '2026-10-02' }), '02 out');
  assert.equal(rotuloIntervalo({ inicio: '2026-10-24', fim: '2026-10-02' }), '02–24 out', 'inverte se vier ao contrário');
  assert.equal(rotuloIntervalo(null), 'Escolher período');
});

test('descricaoIntervalo(), diasNoIntervalo(), ehPeriodoPersonalizado(), somarDiasIso()', () => {
  assert.equal(descricaoIntervalo({ inicio: '2026-10-02', fim: '2026-10-24' }), '02/10/2026 a 24/10/2026');
  assert.equal(diasNoIntervalo({ inicio: '2026-10-02', fim: '2026-10-24' }), 23);
  assert.equal(diasNoIntervalo({ inicio: '2024-02-28', fim: '2024-03-01' }), 3, 'ano bissexto');
  assert.equal(ehPeriodoPersonalizado('mes'), false);
  assert.equal(ehPeriodoPersonalizado({ inicio: '2026-01-01', fim: 'x' }), false);
  assert.equal(ehPeriodoPersonalizado({ inicio: '2026-01-01', fim: '2026-01-31' }), true);
  assert.equal(somarDiasIso('2026-12-31', 1), '2027-01-01');
});

test('recortarPorIntervalo(): dias do intervalo + o ponto anterior como base; sem base quando pedido', () => {
  const serie = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'].map((data, i) => ({ data, v: i }));
  assert.deepEqual(recortarPorIntervalo(serie, { inicio: '2026-10-01', fim: '2026-10-02' }).map((p) => p.data), ['2026-09-30', '2026-10-01', '2026-10-02']);
  assert.deepEqual(recortarPorIntervalo(serie, { inicio: '2026-10-01', fim: '2026-10-02' }, { comBase: false }).map((p) => p.data), ['2026-10-01', '2026-10-02']);
  assert.deepEqual(recortarPorIntervalo(serie, { inicio: '2026-01-01', fim: '2026-01-31' }), [], 'nada no intervalo');
  assert.equal(recortarPorIntervalo(serie, { inicio: '2026-09-01', fim: '2026-09-29' })[0].data, '2026-09-29', 'início da série: sem base antes');
});

test('atalhosPeriodo(): relativos ao último dia com dado, presos ao 1º dia do histórico', () => {
  const a = Object.fromEntries(atalhosPeriodo({ min: '2026-02-15', max: '2026-10-02' }).map((x) => [x.id, x]));
  assert.deepEqual([a['este-mes'].inicio, a['este-mes'].fim], ['2026-10-01', '2026-10-02']);
  assert.deepEqual([a['mes-passado'].inicio, a['mes-passado'].fim], ['2026-09-01', '2026-09-30']);
  assert.equal(a['3-meses'].inicio, '2026-07-03');
  assert.equal(a['este-ano'].inicio, '2026-02-15', 'preso ao min');
  assert.equal(a['12-meses'].inicio, '2026-02-15');
  assert.equal(a['este-mes'].desabilitado, false);
  const curto = Object.fromEntries(atalhosPeriodo({ min: '2026-10-01', max: '2026-10-02' }).map((x) => [x.id, x]));
  assert.equal(curto['mes-passado'].desabilitado, true, 'mês passado inteiro fora do histórico');
});

// --- controlador ---------------------------------------------------------------

test('ligarFiltroPeriodo(): acrescenta o chip, troca de preset, avisa e lembra no localStorage', () => {
  const doc = makeDom();
  const tabs = doc.getElementById('tabs');
  const recebidos = [];
  const f = ligarFiltroPeriodo(doc, tabs, { chave: 'teste', limites: LIM, aoMudar: (p) => recebidos.push(p) });
  const chip = tabs.querySelector('.fp-chip');
  assert.ok(chip, 'chip "Escolher período" no fim do filtro');
  assert.equal(tabs.lastElementChild, chip);
  assert.match(chip.textContent, /Escolher período/);
  assert.equal(f.periodo, 'mes');

  let evento = null;
  tabs.addEventListener('periodochange', (ev) => { evento = ev.detail.periodo; });
  clicar(doc, tabs.querySelector('[data-periodo="30d"]'));
  assert.deepEqual(recebidos, ['30d']);
  assert.equal(evento, '30d');
  assert.ok(tabs.querySelector('[data-periodo="30d"]').classList.contains('active'));
  assert.ok(!tabs.querySelector('[data-periodo="mes"]').classList.contains('active'));
  assert.deepEqual(JSON.parse(store.get('periodo:teste')), { p: '30d' });
});

test('ligarFiltroPeriodo(): calendário - datas fora do histórico desabilitadas, escolhe intervalo, aplica, chip mostra o intervalo', () => {
  const doc = makeDom();
  const tabs = doc.getElementById('tabs');
  const recebidos = [];
  ligarFiltroPeriodo(doc, tabs, { chave: 'teste', limites: { min: '2026-09-05', max: '2026-10-02' }, aoMudar: (p) => recebidos.push(p) });
  clicar(doc, tabs.querySelector('.fp-chip'));
  const pop = doc.querySelector('.fp-camada .fp-pop[role="dialog"]');
  assert.ok(pop, 'abre o diálogo');
  assert.equal(tabs.querySelector('.fp-chip').getAttribute('aria-expanded'), 'true');
  assert.equal(pop.querySelectorAll('.fp-mes').length, 2, 'dois meses lado a lado no computador');
  assert.match(pop.querySelector('.fp-mes:last-child .fp-mes-titulo').textContent, /outubro/);
  assert.equal(pop.querySelector('[data-dia="2026-09-04"]').getAttribute('aria-disabled'), 'true', 'antes do histórico');
  assert.equal(pop.querySelector('[data-dia="2026-10-03"]').getAttribute('aria-disabled'), 'true', 'depois do último dia');
  assert.ok(pop.querySelector('[data-acao="aplicar"]').disabled, 'Aplicar só com os 2 dias');

  clicar(doc, pop.querySelector('[data-dia="2026-09-24"]'));
  clicar(doc, doc.querySelector('[data-dia="2026-09-02"]')); // fora: ignorado
  clicar(doc, doc.querySelector('[data-dia="2026-09-10"]')); // antes do início: inverte
  assert.ok(doc.querySelector('[data-dia="2026-09-10"]').classList.contains('fp-ini'));
  assert.ok(doc.querySelector('[data-dia="2026-09-24"]').classList.contains('fp-fim'));
  assert.ok(doc.querySelector('[data-dia="2026-09-15"]').classList.contains('fp-meio'));
  assert.match(doc.querySelector('.fp-resumo').textContent, /10\/09\/2026 a 24\/09\/2026 · 15 dias/);
  clicar(doc, doc.querySelector('[data-acao="aplicar"]'));

  assert.equal(doc.querySelector('.fp-camada'), null, 'fecha');
  assert.deepEqual(recebidos, [{ inicio: '2026-09-10', fim: '2026-09-24' }]);
  const chip = tabs.querySelector('.fp-chip');
  assert.equal(chip.textContent.trim(), '10–24 set');
  assert.ok(chip.classList.contains('active'));
  assert.equal(tabs.querySelectorAll('.filter-tab.active').length, 1, 'presets desmarcados');
  assert.deepEqual(JSON.parse(store.get('periodo:teste')), { p: { inicio: '2026-09-10', fim: '2026-09-24' } });
});

test('ligarFiltroPeriodo(): atalho, navegação por mês/ano, teclado e Esc/Cancelar', () => {
  const doc = makeDom();
  const tabs = doc.getElementById('tabs');
  const recebidos = [];
  ligarFiltroPeriodo(doc, tabs, { limites: LIM, aoMudar: (p) => recebidos.push(p) });
  clicar(doc, tabs.querySelector('.fp-chip'));
  // atalho "Mês passado" preenche o rascunho
  clicar(doc, [...doc.querySelectorAll('.fp-atalho')].find((b) => b.textContent.includes('Mês passado')));
  assert.match(doc.querySelector('.fp-resumo').textContent, /01\/09\/2026 a 30\/09\/2026/);
  // grade de meses: clicar no título, voltar 1 ano, escolher março
  clicar(doc, doc.querySelector('.fp-mes-titulo'));
  assert.ok(doc.querySelector('.fp-meses-grade'));
  clicar(doc, doc.querySelector('[data-acao="ano-ant"]'));
  assert.equal(doc.querySelector('.fp-ano-titulo').textContent, '2025');
  assert.ok(doc.querySelector('[data-mes="2025-02-01"]').disabled, 'fevereiro/25 é antes do histórico');
  clicar(doc, doc.querySelector('[data-mes="2025-03-01"]'));
  assert.match(doc.querySelector('.fp-mes .fp-mes-titulo').textContent, /março/);
  // teclado: foco anda com as setas e Enter escolhe
  const foco = doc.querySelector('.fp-dia[tabindex="0"]');
  assert.equal(foco.dataset.dia, '2025-03-10');
  foco.focus();
  teclar(doc, foco, 'ArrowRight');
  assert.equal(doc.activeElement.dataset.dia, '2025-03-11');
  teclar(doc, doc.activeElement, 'ArrowDown');
  assert.equal(doc.activeElement.dataset.dia, '2025-03-18');
  teclar(doc, doc.activeElement, 'Enter');
  teclar(doc, doc.activeElement, 'PageDown');
  assert.equal(doc.activeElement.dataset.dia, '2025-04-18');
  teclar(doc, doc.activeElement, ' ');
  assert.match(doc.querySelector('.fp-resumo').textContent, /18\/03\/2025 a 18\/04\/2025/);
  // Esc fecha sem aplicar
  teclar(doc, doc.activeElement, 'Escape');
  assert.equal(doc.querySelector('.fp-camada'), null);
  assert.deepEqual(recebidos, []);
  assert.equal(doc.activeElement, tabs.querySelector('.fp-chip'), 'foco volta pro chip');
});

test('ligarFiltroPeriodo(): celular (≤560px) abre como folha com 1 mês', () => {
  const doc = makeDom(390);
  const tabs = doc.getElementById('tabs');
  ligarFiltroPeriodo(doc, tabs, { limites: LIM });
  clicar(doc, tabs.querySelector('.fp-chip'));
  assert.ok(doc.querySelector('.fp-camada.fp-folha'));
  assert.equal(doc.querySelectorAll('.fp-mes').length, 1);
  clicar(doc, doc.querySelector('[data-acao="cancelar"]'));
  assert.equal(doc.querySelector('.fp-camada'), null);
});

test('ligarFiltroPeriodo(): idempotente, restaura o salvo e descarta período fora dos limites novos', () => {
  store.set('periodo:x', JSON.stringify({ p: { inicio: '2026-09-02', fim: '2026-09-24' } }));
  const doc = makeDom();
  const tabs = doc.getElementById('tabs');
  const f1 = ligarFiltroPeriodo(doc, tabs, { chave: 'x', limites: LIM });
  assert.deepEqual(f1.periodo, { inicio: '2026-09-02', fim: '2026-09-24' });
  assert.equal(tabs.querySelector('.fp-chip').textContent.trim(), '02–24 set');
  const f2 = ligarFiltroPeriodo(doc, tabs, { chave: 'x', limites: LIM });
  assert.equal(f2, f1);
  assert.equal(tabs.querySelectorAll('.fp-chip').length, 1);
  f1.definirLimites({ min: '2026-09-10', max: '2026-10-02' });
  assert.deepEqual(f1.periodo, { inicio: '2026-09-10', fim: '2026-09-24' }, 'recorta pro histórico');
  f1.definirLimites({ min: '2026-10-01', max: '2026-10-02' });
  assert.equal(f1.periodo, 'mes', 'sem interseção: volta pro padrão');
  assert.ok(tabs.querySelector('[data-periodo="mes"]').classList.contains('active'));
});

test('ligarFiltroPeriodo(): sem comChip só cuida dos presets; inscrever() soma ouvintes; localStorage quebrado não derruba', () => {
  globalThis.localStorage = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
  const doc = makeDom();
  const tabs = doc.getElementById('tabs');
  const f = ligarFiltroPeriodo(doc, tabs, { chave: 'y', comChip: false, periodoInicial: 'tudo' });
  assert.equal(tabs.querySelector('.fp-chip'), null);
  assert.ok(tabs.querySelector('[data-periodo="tudo"]').classList.contains('active'));
  const a = [];
  const cancelar = f.inscrever((p) => a.push(p));
  clicar(doc, tabs.querySelector('[data-periodo="30d"]'));
  cancelar();
  clicar(doc, tabs.querySelector('[data-periodo="mes"]'));
  assert.deepEqual(a, ['30d']);
});
