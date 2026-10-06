/**
 * charts/progresso.js - barras HTML finas do kit: BARRA DE PROGRESSO (trilho + preenchimento + marca de meta) e BARRA DE
 * COMPOSIÇÃO (uma faixa dividida em fatias com espaço, pílula). Largura animada por transição CSS (300ms standard na
 * troca de valor; crescem da esquerda na entrada) - desligada por prefers-reduced-motion em charts.css. 05/10/2026.
 */
import { no, esvaziar, corSerie, corRampa, ehNum, limitar, reconciliador } from './base.js';
import { formatPct } from '../format.js';
import { garantirEstilosCharts } from './estilos.js';
import { criarTooltip } from './casca.js';

const pct = (v) => `${Math.round(limitar(v, 0, 1) * 10000) / 100}%`;

/** op: { valor 0..1, meta 0..1?, cor, rotulo (aria), tom: 'auto'|'up'|'down' }. -> { atualizar({valor, meta, cor}), destruir() } */
export function criarBarraProgresso(el, op = {}) {
  const doc = el.ownerDocument; garantirEstilosCharts(doc); esvaziar(el);
  const raiz = no(doc, ':div', { class: 'chart chart--prog'
  , role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, el);
  const trilho = no(doc, ':div', { class: 'chart-prog-trilho' }, raiz);
  const fill = no(doc, ':div', { class: 'chart-prog-fill is-entrando' }, trilho);
  const marca = no(doc, ':i', { class: 'chart-prog-meta', hidden: true }, trilho);
  let estado = { ...op };
  function pintar(entrar) {
    const v = ehNum(estado.valor) ? estado.valor : 0;
    fill.style.background = estado.cor === 'up' ? 'var(--_up)' : estado.cor === 'down' ? 'var(--_down)' : corSerie(estado.cor ?? 1, 0);
    fill.style.width = entrar ? '0%' : pct(v);
    raiz.setAttribute('aria-valuenow', String(Math.round(v * 100)));
    raiz.setAttribute('aria-valuetext', `${formatPct(v, 0)}${ehNum(estado.meta) ? ` (meta ${formatPct(estado.meta, 0)})` : ''}`);
    if (estado.rotulo) raiz.setAttribute('aria-label', estado.rotulo);
    marca.hidden = !ehNum(estado.meta);
    if (ehNum(estado.meta)) marca.style.left = pct(estado.meta);
  }
  pintar(true);
  const win = doc.defaultView;
  const depois = (fn) => (win && win.requestAnimationFrame ? win.requestAnimationFrame(() => win.requestAnimationFrame(fn)) : fn());
  depois(() => { fill.classList.remove('is-entrando'); pintar(false); });
  return { el: raiz, atualizar(d = {}) { estado = { ...estado, ...d }; fill.classList.remove('is-entrando'); pintar(false); }, destruir() { if (raiz.parentNode) raiz.parentNode.removeChild(raiz); } };
}

/**
 * Faixa de composição: fatias [{ id, nome, valor, cor? }] lado a lado, pontas arredondadas, 2px de espaço, hover com `title`
 * e legenda opcional (bolinhas). -> { atualizar({fatias}), destruir() }
 */
export function criarBarraComposicao(el, op = {}) {
  const doc = el.ownerDocument; garantirEstilosCharts(doc); esvaziar(el);
  const raiz = no(doc, ':div', { class: 'chart chart--comp' }, el);
  const faixa = no(doc, ':div', { class: 'chart-comp', role: 'img' }, raiz);
  const leg = op.legenda === false ? null : no(doc, ':div', { class: 'chart-legenda', role: 'group', 'aria-label': 'Legenda' }, raiz);
  const rec = reconciliador(faixa, () => no(doc, ':span', { class: 'chart-comp-seg' }));
  const fmt = op.formatarValor || ((v) => String(v));
  /* 06/10/2026: nosso tooltip em vez do atributo title nativo (o navegador mostrava os dois). */
  raiz.style.position = 'relative';
  const tip = criarTooltip(doc, raiz);
  const mostrarTip = (s) => {
    const nome = s.getAttribute('data-nome'); if (!nome) return;
    const r = raiz.getBoundingClientRect(); const q = s.getBoundingClientRect();
    tip.mostrar({ titulo: nome, linhas: [{ valor: s.getAttribute('data-valor') || '', forte: true }] }, q.left - r.left + q.width / 2, q.top - r.top, { largura: r.width });
  };
  faixa.addEventListener('pointerover', (e) => { const s = e.target.closest && e.target.closest('.chart-comp-seg'); if (s) mostrarTip(s); });
  faixa.addEventListener('pointerleave', () => tip.ocultar());
  function pintar(fatias, entrar) {
    const lista = (fatias || []).filter((f) => ehNum(f.valor) && f.valor > 0);
    const total = lista.reduce((s, f) => s + f.valor, 0);
    lista.forEach((f, i) => {
      const s = rec.obter(String(f.id ?? i));
      s.style.width = entrar ? '0%' : pct(total ? f.valor / total : 0);
      s.style.background = typeof f.cor === 'string' ? f.cor : (op.tons === 'rampa' ? corRampa(i, lista.length) : corSerie(f.cor, i));
      s.style.transitionDelay = entrar ? '' : `${i * 20}ms`;
      s.setAttribute('data-nome', String(f.nome));
      s.setAttribute('data-valor', `${fmt(f.valor)} (${formatPct(total ? f.valor / total : 0, 1)})`);
    });
    rec.limpar();
    faixa.setAttribute('aria-label', lista.map((f) => `${f.nome} ${formatPct(total ? f.valor / total : 0, 1)}`).join(', ') || 'Sem dados');
    if (leg) {
      esvaziar(leg);
      lista.forEach((f, i) => {
        const it = no(doc, ':span', { class: 'chart-leg-item' }, leg);
        no(doc, ':i', { class: 'chart-leg-dot', style: `--cor:${typeof f.cor === 'string' ? f.cor : (op.tons === 'rampa' ? corRampa(i, lista.length) : corSerie(f.cor, i))}` }, it);
        no(doc, ':span', { class: 'chart-leg-nome', texto: f.nome }, it);
        no(doc, ':b', { class: 'chart-leg-val', texto: formatPct(total ? f.valor / total : 0, 1) }, it);
      });
    }
  }
  pintar(op.fatias, true);
  const win = doc.defaultView;
  const depois = (fn) => (win && win.requestAnimationFrame ? win.requestAnimationFrame(() => win.requestAnimationFrame(fn)) : fn());
  depois(() => pintar(op.fatias, false));
  let atual = op.fatias;
  return { el: raiz, atualizar(d = {}) { atual = d.fatias ?? atual; pintar(atual, false); }, destruir() { if (raiz.parentNode) raiz.parentNode.removeChild(raiz); } };
}
