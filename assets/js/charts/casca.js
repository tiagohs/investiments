/**
 * charts/casca.js - a "casca" comum de todo gráfico: contêiner (.chart) com área do SVG, tooltip escuro multilinha,
 * legenda com bolinhas (hover destaca a série; clique alterna), região aria-live, tabela acessível alternativa e o
 * registro de ouvintes (destruir() solta tudo). Cada tipo (linha, barras, anel...) só desenha o SVG e pede
 * `casca.tip.mostrar(...)`, `casca.legenda.definir(...)` etc. 05/10/2026 (kit Figma).
 */
import { no, esvaziar, atr, limitar, uid } from './base.js';
import { garantirEstilosCharts } from './estilos.js';

/** Tooltip escuro (pílula multilinha): título pequeno, linhas "chave de cor + valor forte + nome secundário". */
export function criarTooltip(doc, pai) {
  const ext = no(doc, ':div', { class: 'chart-tip', role: 'tooltip', 'aria-hidden': 'true' }, pai);
  const dentro = no(doc, ':div', { class: 'chart-tip-in' }, ext);
  let ligado = false;
  return {
    el: ext,
    get visivel() { return ligado; },
    /**
     * `conteudo` = { titulo?, linhas:[{ cor?, nome?, valor, tracejado?, forte? }] }; (x, y) = ponto-âncora em px dentro do
     * contêiner (a tooltip fica ACIMA dele, ou abaixo se não couber). Textos entram por textContent (dado não confiável).
     */
    mostrar(conteudo, x, y, { largura = 0 } = {}) {
      esvaziar(dentro);
      if (conteudo.titulo) no(doc, ':div', { class: 'chart-tip-tit', texto: conteudo.titulo }, dentro);
      for (const l of conteudo.linhas || []) {
        const linha = no(doc, ':div', { class: `chart-tip-lin${l.forte ? ' is-forte' : ''}` }, dentro);
        if (l.cor) no(doc, ':i', { class: `chart-tip-chave${l.tracejado ? ' is-trac' : ''}`, style: `--cor:${l.cor}` }, linha);
        no(doc, ':b', { class: 'chart-tip-val', texto: l.valor }, linha);
        if (l.nome) no(doc, ':span', { class: 'chart-tip-nome', texto: l.nome }, linha);
      }
      const w = ext.offsetWidth || 0; const h = ext.offsetHeight || 0;
      const W = largura || (pai.clientWidth || 0);
      let left = x - w / 2;
      if (W) left = limitar(left, 0, Math.max(0, W - w));
      let top = y - h - 14;
      const abaixo = top < 0 && h > 0;
      if (abaixo) top = y + 14;
      ext.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
      ext.classList.add('is-on');
      ext.classList.toggle('is-abaixo', abaixo);
      ligado = true;
    },
    ocultar() { ext.classList.remove('is-on'); ligado = false; },
  };
}

/**
 * Cria a casca dentro de `el` (esvazia antes). Devolve a API interna usada pelos tipos de gráfico.
 * @param {Element} el contêiner do gráfico
 * @param {object} cfg { tipo: 'linha'|..., altura, aria, legenda: 'baixo'|'direita'|false }
 */
export function criarCasca(el, cfg = {}) {
  const doc = el.ownerDocument;
  const win = doc.defaultView;
  garantirEstilosCharts(doc);
  esvaziar(el);
  const id = uid('chart');
  const raiz = no(doc, ':div', { class: `chart chart--${cfg.tipo || 'generico'}${cfg.legenda === 'direita' ? ' chart--leg-dir' : ''}`, 'data-chart': cfg.tipo || '' }, el);
  const corpo = no(doc, ':div', { class: 'chart-corpo' }, raiz);
  const wrap = no(doc, ':div', { class: 'chart-wrap' }, corpo);
  const svg = no(doc, 'svg', { class: 'chart-svg', width: '100%', role: 'img', 'aria-label': cfg.aria || 'Gráfico', 'aria-describedby': `${id}-tab`, tabindex: cfg.focavel === false ? null : '0', focusable: 'true' }, wrap);
  /* 06/10/2026: sem <title> no SVG (o navegador mostrava um tooltip nativo junto com o nosso): nome em aria-label e dados em aria-describedby. */
  const tip = criarTooltip(doc, wrap);
  const legendaEl = cfg.legenda === false ? null : no(doc, ':div', { class: 'chart-legenda', role: 'group', 'aria-label': 'Legenda' }, cfg.legenda === 'direita' ? corpo : raiz);
  const live = no(doc, ':div', { class: 'chart-sr', 'aria-live': 'polite', 'aria-atomic': 'true' }, raiz);
  const tabelaEl = no(doc, ':div', { class: 'chart-tabela chart-sr', id: `${id}-tab` }, raiz);
  let tabelaVisivel = false;

  const ouvintes = [];
  const parar = [];
  const ouvir = (alvo, tipo, fn, opc) => { alvo.addEventListener(tipo, fn, opc); ouvintes.push([alvo, tipo, fn, opc]); };

  /* ---- destaque de série (hover na legenda/no gráfico): marca o contêiner e avisa o desenho ---- */
  let destaqueId = null;
  const aoDestacar = [];
  const destacar = (sid) => {
    if (sid === destaqueId) return;
    destaqueId = sid;
    if (sid == null) raiz.removeAttribute('data-destaque'); else raiz.setAttribute('data-destaque', String(sid));
    for (const fn of aoDestacar) fn(sid);
  };

  /* ---- legenda ---- */
  const legenda = {
    el: legendaEl,
    alternavel: false,
    aoAlternar: null,
    itens: [],
    definir(itens, { alternavel = false, ocultos = new Set() } = {}) {
      if (!legendaEl) return;
      this.itens = itens; this.alternavel = alternavel;
      esvaziar(legendaEl);
      legendaEl.hidden = itens.length < 1;
      for (const it of itens) {
        const b = no(doc, alternavel ? ':button' : ':span', {
          class: `chart-leg-item${ocultos.has(it.id) ? ' is-off' : ''}`, 'data-id': it.id, type: alternavel ? 'button' : null,
          'aria-pressed': alternavel ? (ocultos.has(it.id) ? 'false' : 'true') : null, tabindex: alternavel ? null : '0',
        }, legendaEl);
        no(doc, ':i', { class: `chart-leg-dot${it.tracejado ? ' is-trac' : ''}`, style: `--cor:${it.cor}` }, b);
        no(doc, ':span', { class: 'chart-leg-nome', texto: it.nome }, b);
        if (it.valor != null) no(doc, ':b', { class: `chart-leg-val${it.tom ? ` is-${it.tom}` : ''}`, texto: it.valor }, b);
      }
    },
  };
  if (legendaEl) {
    const itemDe = (e) => (e.target && e.target.closest ? e.target.closest('.chart-leg-item') : null);
    ouvir(legendaEl, 'pointerover', (e) => { const it = itemDe(e); if (it) destacar(it.getAttribute('data-id')); });
    ouvir(legendaEl, 'pointerleave', () => destacar(null));
    ouvir(legendaEl, 'focusin', (e) => { const it = itemDe(e); if (it) destacar(it.getAttribute('data-id')); });
    ouvir(legendaEl, 'focusout', () => destacar(null));
    ouvir(legendaEl, 'click', (e) => { const it = itemDe(e); if (it && legenda.alternavel && legenda.aoAlternar) legenda.aoAlternar(it.getAttribute('data-id')); });
  }

  /* ---- tabela acessível ---- */
  const tabela = {
    el: tabelaEl,
    get visivel() { return tabelaVisivel; },
    /** spec = { legenda, colunas:[...], linhas:[[...]], max } */
    definir(spec) {
      esvaziar(tabelaEl);
      if (!spec) return;
      const max = spec.max || 400;
      let linhas = spec.linhas;
      let nota = '';
      if (linhas.length > max) { const k = Math.ceil(linhas.length / max); linhas = linhas.filter((_, i) => i % k === 0 || i === spec.linhas.length - 1); nota = ` (amostra: 1 a cada ${k} pontos)`; }
      const t = no(doc, ':table', null, tabelaEl);
      no(doc, ':caption', { texto: `${spec.legenda || cfg.aria || 'Dados do gráfico'}${nota}` }, t);
      const th = no(doc, ':thead', null, t); const trh = no(doc, ':tr', null, th);
      for (const c of spec.colunas) no(doc, ':th', { scope: 'col', texto: c }, trh);
      const tb = no(doc, ':tbody', null, t);
      for (const l of linhas) {
        const tr = no(doc, ':tr', null, tb);
        l.forEach((cel, i) => no(doc, i === 0 ? ':th' : ':td', { scope: i === 0 ? 'row' : null, texto: cel }, tr));
      }
    },
    alternar(forcar) {
      tabelaVisivel = typeof forcar === 'boolean' ? forcar : !tabelaVisivel;
      tabelaEl.classList.toggle('chart-sr', !tabelaVisivel);
      corpo.hidden = tabelaVisivel;
      raiz.classList.toggle('is-tabela', tabelaVisivel);
      return tabelaVisivel;
    },
  };

  return {
    doc, win, raiz, corpo, wrap, svg, tip, legenda, tabela, live, ouvir, destacar,
    get destaque() { return destaqueId; },
    aoDestacar(fn) { aoDestacar.push(fn); },
    aoParar(fn) { parar.push(fn); },
    definirAria(texto) { svg.setAttribute('aria-label', texto); },
    anunciar(texto) { live.textContent = texto; },
    /** Estado de tamanho do SVG (viewBox em pixels reais: texto sem distorção). */
    dimensionar(W, H) { atr(svg, { viewBox: `0 0 ${W} ${H}`, height: H }); svg.style.maxWidth = '100%'; },
    destruir() {
      for (const [a, t, f, o] of ouvintes) a.removeEventListener(t, f, o);
      ouvintes.length = 0;
      for (const f of parar) { try { f(); } catch { /* ignora */ } }
      parar.length = 0;
      if (raiz.parentNode) raiz.parentNode.removeChild(raiz);
    },
  };
}

/**
 * Teclado comum (setas/Home/End/Esc) sobre o SVG: `n` itens; `ir(i)` mostra o item; `sair()` esconde.
 * `horizontal` = setas esquerda/direita (padrão); `vertical` = cima/baixo (barras horizontais).
 */
export function ligarTeclado(casca, { n, ir, sair, atual, vertical = false }) {
  const { svg } = casca;
  let i = -1;
  const vai = (k) => { const m = n(); if (!m) return; i = limitar(k, 0, m - 1); ir(i); };
  casca.ouvir(svg, 'keydown', (e) => {
    const prox = vertical ? 'ArrowDown' : 'ArrowRight'; const ant = vertical ? 'ArrowUp' : 'ArrowLeft';
    const cur = i >= 0 ? i : (atual ? atual() : -1);
    if (e.key === prox || (!vertical && e.key === 'ArrowDown')) { e.preventDefault(); vai(cur < 0 ? 0 : cur + 1); }
    else if (e.key === ant || (!vertical && e.key === 'ArrowUp')) { e.preventDefault(); vai(cur < 0 ? n() - 1 : cur - 1); }
    else if (e.key === 'Home') { e.preventDefault(); vai(0); }
    else if (e.key === 'End') { e.preventDefault(); vai(n() - 1); }
    else if (e.key === 'Escape') { i = -1; sair(); }
  });
  casca.ouvir(svg, 'blur', () => { i = -1; sair(); });
  return { definir(k) { i = k; }, get indice() { return i; } };
}
