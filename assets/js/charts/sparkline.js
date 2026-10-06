/**
 * charts/sparkline.js - SPARKLINE do kit (card de KPI e célula de tabela): linha fina colorida pela DIREÇÃO
 * (--chart-up / --chart-down), área em degradê opcional, ponto final com halo. Duas formas:
 *   criarSparkline(el, {valores,...})  -> { atualizar(valores|dados), destruir() }  (desenha a linha, morfa ao atualizar, hover opcional)
 *   sparklineHtml(valores, {...})      -> string de <svg> pronta pra templates de tabela/lista (desenho CSS, sem JS).
 * 05/10/2026.
 */
import {
  no, atr, esvaziar, uid, lerp, limitar, ehNum, r1, escalaLinear, caminhoLinha, caminhoSuave,
  EASE_ENTRADA, EASE_PADRAO, DUR, animar, larguraDe, observarLargura, comPadroes,
} from './base.js';
import { reamostrar } from './xy.js';
import { criarTooltip } from './casca.js';
import { escAttr } from '../util/html.js';
import { garantirEstilosCharts } from './estilos.js';

const PADROES = { cor: 'auto', area: true, altura: 40, largura: 0, referencia: 'inicio', pontoFinal: true, hover: false, suave: false, animar: true, aria: '', margem: 4 };

/** 'up' | 'down' | 'flat' pela diferença entre o último valor e a referência (primeiro valor, número ou 0). */
export function direcaoDe(valores, referencia = 'inicio') {
  const v = (valores || []).filter(ehNum);
  if (v.length < 2) return 'flat';
  const ref = referencia === 'inicio' ? v[0] : (referencia === 'zero' ? 0 : (ehNum(referencia) ? referencia : v[0]));
  const d = v[v.length - 1] - ref;
  return Math.abs(d) < 1e-12 ? 'flat' : d > 0 ? 'up' : 'down';
}
const corDaDirecao = (dir) => (dir === 'up' ? 'var(--_up)' : dir === 'down' ? 'var(--_down)' : 'var(--_axis)');
export function corSpark(cor, dir) {
  if (cor === 'auto' || cor == null) return corDaDirecao(dir);
  if (cor === 'up' || cor === 'down') return corDaDirecao(cor);
  if (typeof cor === 'number') return `var(--_c${cor})`;
  return cor;
}

/** Pontos {x,y} (ou null nas lacunas) pra caixa W x H com margem `m`. */
export function pontosSpark(valores, W, H, m = 4) {
  const v = valores.filter(ehNum);
  if (!v.length) return [];
  let min = Math.min(...v); let max = Math.max(...v);
  if (min === max) { min -= 1; max += 1; }
  const y = escalaLinear([min, max], [H - m, m]);
  const n = valores.length;
  return valores.map((q, i) => (ehNum(q) ? { x: n === 1 ? W / 2 : m + (i * (W - 2 * m)) / (n - 1), y: y(q), v: q } : null));
}

export function criarSparkline(el, opcoes = {}) {
  let op = comPadroes(PADROES, opcoes);
  const doc = el.ownerDocument; const win = doc.defaultView;
  garantirEstilosCharts(doc);
  esvaziar(el);
  const raiz = no(doc, ':div', { class: 'chart chart--spark' }, el);
  const svg = no(doc, 'svg', { class: 'chart-svg chart-spark-svg', width: '100%', role: 'img', focusable: 'false' }, raiz);
  const gid = uid('sg');
  const defs = no(doc, 'defs', null, svg);
  const grad = no(doc, 'linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  no(doc, 'stop', { offset: '0', 'stop-color': 'currentColor', 'stop-opacity': '.28' }, grad);
  no(doc, 'stop', { offset: '1', 'stop-color': 'currentColor', 'stop-opacity': '0' }, grad);
  const area = no(doc, 'path', { class: 'chart-spark-area', fill: `url(#${gid})`, stroke: 'none' }, svg);
  const linha = no(doc, 'path', { class: 'chart-spark-linha', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
  const ponto = no(doc, 'g', { class: 'chart-pto is-on chart-spark-ponto', 'aria-hidden': 'true' }, svg);
  const halo = no(doc, 'circle', { class: 'chart-pto-halo', r: 7 }, ponto);
  const core = no(doc, 'circle', { class: 'chart-pto-core', r: 3.5 }, ponto);
  const cruz = no(doc, 'circle', { class: 'chart-spark-hover', r: 4 }, svg);
  cruz.style.display = 'none';
  const tip = op.hover ? criarTooltip(doc, raiz) : null;
  let W = larguraDe(el, op.largura || 120); const H = op.altura;
  let pts = []; let dir = 'flat'; let anim = null; let destruido = false; let primeira = true;
  const ouvintes = [];

  const caminho = (p) => (op.suave ? caminhoSuave(p) : caminhoLinha(p));
  function pintar(p, entrada = 1, cor, alfa = 1) {
    svg.style.color = cor;
    atr(linha, { d: caminho(p), stroke: cor, 'stroke-width': 2, pathLength: entrada < 1 ? 1 : null, 'stroke-dasharray': entrada < 1 ? '1 1' : null, 'stroke-dashoffset': entrada < 1 ? r1((1 - entrada) * 1000) / 1000 : null });
    const validos = p.filter(Boolean);
    if (op.area && validos.length > 1) {
      atr(area, { d: `${caminho(validos)}L${r1(validos[validos.length - 1].x)},${H}L${r1(validos[0].x)},${H}Z`, opacity: r1(alfa * 100) / 100 });
    } else atr(area, { d: '' });
    const u = validos[validos.length - 1];
    ponto.style.setProperty('--cor', cor);
    ponto.style.display = op.pontoFinal && u && entrada >= 1 ? '' : 'none';
    if (u) { atr(halo, { cx: r1(u.x), cy: r1(u.y) }); atr(core, { cx: r1(u.x), cy: r1(u.y) }); }
  }
  function montar({ entrada = false } = {}) {
    if (destruido) return;
    if (anim) { anim.terminar(); anim = null; }
    atr(svg, { viewBox: `0 0 ${W} ${H}`, height: H });
    const antigo = pts;
    const vals = op.valores || [];
    pts = pontosSpark(vals, W, H, op.margem);
    dir = direcaoDe(vals, op.referencia);
    const cor = corSpark(op.cor, dir);
    svg.setAttribute('aria-label', op.aria || (vals.length ? `Tendência de ${vals.length} pontos: ${dir === 'up' ? 'alta' : dir === 'down' ? 'queda' : 'estável'}` : 'Sem dados')); /* 06/10/2026: aria-label, não <title> (tooltip nativo duplicado) */
    raiz.setAttribute('data-dir', dir);
    const ok = op.animar !== false;
    if (entrada && ok) {
      anim = animar(win, { duracao: DUR.linha, aoQuadro: (t) => pintar(pts, EASE_ENTRADA(t), cor, EASE_ENTRADA(limitar((t * DUR.linha) / DUR.area, 0, 1))), aoFim: () => { anim = null; pintar(pts, 1, cor); } });
    } else if (ok && antigo.length > 1 && pts.length > 1 && antigo.every(Boolean) && pts.every(Boolean)) {
      const m = Math.max(antigo.length, pts.length); const a = reamostrar(antigo, m); const b = reamostrar(pts, m);
      anim = animar(win, { duracao: DUR.morfar, aoQuadro: (t) => { const e = EASE_PADRAO(t); pintar(a.map((p, i) => ({ x: lerp(p.x, b[i].x, e), y: lerp(p.y, b[i].y, e) })), 1, cor); }, aoFim: () => { anim = null; pintar(pts, 1, cor); } });
    } else pintar(pts, 1, cor);
  }
  if (op.hover) {
    const mover = (e) => {
      const r = svg.getBoundingClientRect(); const px = (e.clientX - r.left) * (r.width ? W / r.width : 1);
      let melhor = -1; let d = Infinity;
      pts.forEach((p, i) => { if (p && Math.abs(p.x - px) < d) { d = Math.abs(p.x - px); melhor = i; } });
      if (melhor < 0) return;
      const p = pts[melhor];
      atr(cruz, { cx: r1(p.x), cy: r1(p.y) }); cruz.style.display = '';
      const f = op.formatar || String; const rot = op.rotulos && op.rotulos[melhor];
      tip.mostrar({ titulo: rot || null, linhas: [{ valor: f(p.v), forte: true }] }, p.x, p.y, { largura: W });
    };
    const sair = () => { cruz.style.display = 'none'; tip.ocultar(); };
    svg.addEventListener('pointermove', mover); svg.addEventListener('pointerleave', sair);
    ouvintes.push([svg, 'pointermove', mover], [svg, 'pointerleave', sair]);
  }
  const pararObs = observarLargura(el, (w) => { W = Math.round(w); montar({}); });
  montar({ entrada: primeira }); primeira = false;
  return {
    el, get direcao() { return dir; },
    /** `atualizar([..valores])` ou `atualizar({ valores, cor, ... })`. */
    atualizar(d) { if (destruido) return; op = comPadroes(op, Array.isArray(d) ? { valores: d } : d); W = larguraDe(el, op.largura || 120); montar({}); },
    destruir() { destruido = true; if (anim) anim.cancelar(); pararObs(); for (const [a, t, f] of ouvintes) a.removeEventListener(t, f); if (raiz.parentNode) raiz.parentNode.removeChild(raiz); },
  };
}

/**
 * String de <svg> estática (tamanho fixo em px) pra células de tabela e listas montadas por template. A linha se
 * desenha por CSS (animação desligada com prefers-reduced-motion). `aria` descreve (vira aria-label); sem ele fica aria-hidden.
 * Cor: 'auto' (direção), 'up'/'down', número 1..8 ou CSS. `referencia` como em direcaoDe.
 */
export function sparklineHtml(valores, { largura = 96, altura = 28, cor = 'auto', referencia = 'inicio', area = true, pontoFinal = true, aria = '', margem = 3, animar: an = true } = {}) {
  const vals = (valores || []).filter(ehNum);
  if (vals.length < 2) return `<svg class="chart-spark chart-spark--vazio" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}" aria-hidden="true"><line x1="${margem}" x2="${largura - margem}" y1="${altura / 2}" y2="${altura / 2}"/></svg>`;
  const p = pontosSpark(vals, largura, altura, margem);
  const dir = direcaoDe(vals, referencia); const c = corSpark(cor, dir);
  const d = caminhoLinha(p);
  const u = p[p.length - 1];
  const a11y = aria ? `role="img" aria-label="${escAttr(aria)}"` : 'aria-hidden="true"';
  return `<svg class="chart-spark${an ? ' chart-spark--anima' : ''}" data-dir="${dir}" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}" ${a11y} style="color:${escAttr(c)}">`
    + (area ? `<path class="chart-spark-area" d="${d}L${r1(u.x)},${altura}L${r1(p[0].x)},${altura}Z"/>` : '')
    + `<path class="chart-spark-linha" d="${d}" pathLength="1"/>`
    + (pontoFinal ? `<circle class="chart-spark-fim" cx="${r1(u.x)}" cy="${r1(u.y)}" r="2.5"/>` : '')
    + '</svg>';
}
