/**
 * charts/kpi.js - números dos KPIs com CONTAGEM rápida (400ms, emphasized-decelerate) e o card de KPI do kit
 * (rótulo pequeno + número grande + tendência com ícone + sparkline no rodapé). 05/10/2026.
 */
import { no, esvaziar, lerp, ehNum, EASE_ENTRADA, DUR, animar, uid } from './base.js';
import { iconeSvg } from './icones.js';
import { criarSparkline } from './sparkline.js';
import { garantirEstilosCharts } from './estilos.js';

/**
 * Anima o texto de `el` de `de` até `para` formatando com `formatar(n)`. Sem movimento (reduced-motion/sem rAF) escreve o
 * final na hora. Devolve { cancelar(), terminar() }. O texto final é SEMPRE `formatar(para)` exato.
 */
export function animarNumero(el, { de = 0, para, formatar = String, duracao = DUR.kpi } = {}) {
  const win = el.ownerDocument.defaultView;
  if (!ehNum(para)) { el.textContent = formatar(para); return { cancelar() {}, terminar() {} }; }
  const base = ehNum(de) ? de : 0;
  return animar(win, {
    duracao, aoQuadro: (t) => { el.textContent = formatar(t >= 1 ? para : lerp(base, para, EASE_ENTRADA(t))); },
  });
}

/**
 * Card de KPI. op: { rotulo, valor:number, formatar, delta:{texto,sinal}, info:'texto de ajuda', spark:{valores,...} }.
 * `atualizar({valor, delta, spark})` conta do valor atual até o novo e morfa a sparkline.
 */
export function criarKpi(el, op = {}) {
  const doc = el.ownerDocument; esvaziar(el);
  garantirEstilosCharts(doc);
  const id = uid('kpi');
  const raiz = no(doc, ':article', { class: 'chart-kpi', 'aria-labelledby': `${id}r` }, el);
  const topo = no(doc, ':div', { class: 'chart-kpi-topo' }, raiz);
  no(doc, ':span', { class: 'chart-kpi-rot', id: `${id}r`, texto: op.rotulo || '' }, topo);
  if (op.info) { const i = no(doc, ':span', { class: 'chart-kpi-info', 'data-info': op.info, role: 'img', 'aria-label': op.info, tabindex: '0' }, topo); i.appendChild(iconeSvg(doc, 'info', 18)); }
  const valorEl = no(doc, ':div', { class: 'chart-kpi-val' }, raiz);
  const deltaEl = no(doc, ':div', { class: 'chart-kpi-delta', hidden: true }, raiz);
  const sparkEl = op.spark ? no(doc, ':div', { class: 'chart-kpi-spark' }, raiz) : null;
  let atual = null; let anim = null; let spark = null; let destruido = false;
  const formatar = (v) => (op.formatar ? op.formatar(v) : String(v));

  function pintarDelta(d) {
    esvaziar(deltaEl); deltaEl.hidden = !d;
    if (!d) return;
    const s = d.sinal > 0 ? 'up' : d.sinal < 0 ? 'down' : 'flat';
    deltaEl.className = `chart-kpi-delta is-${s}`;
    deltaEl.appendChild(iconeSvg(doc, s === 'up' ? 'sobe' : s === 'down' ? 'desce' : 'igual', 16));
    no(doc, ':span', { texto: d.texto }, deltaEl);
  }
  function contar(para, de) {
    if (anim) { anim.terminar(); anim = null; }
    anim = animarNumero(valorEl, { de, para, formatar });
    atual = para;
  }
  if (ehNum(op.valor)) contar(op.valor, 0); else valorEl.textContent = op.valor == null ? '—' : String(op.valor);
  pintarDelta(op.delta);
  if (sparkEl) spark = criarSparkline(sparkEl, { altura: 36, ...op.spark });
  return {
    el: raiz,
    atualizar(d = {}) {
      if (destruido) return;
      if (d.rotulo != null) raiz.querySelector('.chart-kpi-rot').textContent = d.rotulo;
      if (d.valor !== undefined) { if (ehNum(d.valor)) contar(d.valor, ehNum(atual) ? atual : 0); else { valorEl.textContent = d.valor == null ? '—' : String(d.valor); atual = null; } }
      if (d.delta !== undefined) pintarDelta(d.delta);
      if (d.spark && spark) spark.atualizar(d.spark);
    },
    destruir() { destruido = true; if (anim) anim.cancelar(); if (spark) spark.destruir(); if (raiz.parentNode) raiz.parentNode.removeChild(raiz); },
  };
}
