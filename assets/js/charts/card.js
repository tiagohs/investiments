/**
 * charts/card.js - card padrão de gráfico do kit Figma (surface-container-low, raio ~24px): rótulo pequeno muted +
 * valor/título, botão "•••" circular tonal (menu flutuante), seletor de período SEGMENTADO com ✓ no ativo, e os estados
 * vazio / carregando (skeleton) / erro. O gráfico entra em `card.corpo`. "Refetch mantém o quadro": `recarregando(true)`
 * só esmaece o corpo (sem pular layout). 05/10/2026.
 */
import { no, esvaziar, uid, ehNum } from './base.js';
import { ICONES, iconeSvg } from './icones.js';
import { garantirEstilosCharts } from './estilos.js';

/**
 * @param {Element} el onde montar o card
 * @param {object} op
 *   rotulo       texto pequeno em cima ("Evolução")
 *   valor        texto grande (ou número + formatarValor)
 *   formatarValor (n)=>string, usado se `valor` for número
 *   delta        { texto, sinal: 1|-1|0 } -> chip de tendência (ícone + cor); opcional
 *   icone        elemento/ícone à esquerda do título (logo do ativo): string de HTML NÃO aceita; passe um Node
 *   menu         [{ rotulo, aoClicar }] itens do menu "•••" (se vazio e sem tabela, o botão não aparece)
 *   periodos     [{ id, rotulo }] seletor segmentado; `periodo` = id ativo
 *   aoMudarPeriodo (id)=>void
 *   estado       'ok' | 'carregando' | 'vazio' | 'erro'; mensagemVazio / mensagemErro; aoTentarNovamente
 *   altura       altura mínima do corpo (evita pulo entre skeleton e gráfico)
 */
export function criarCardGrafico(el, op = {}) {
  const doc = el.ownerDocument;
  const id = uid('cc');
  garantirEstilosCharts(doc);
  const raiz = no(doc, ':section', { class: 'chart-card', 'aria-labelledby': `${id}-r` }, el);
  const cab = no(doc, ':header', { class: 'chart-card-cab' }, raiz);
  const tit = no(doc, ':div', { class: 'chart-card-tit' }, cab);
  const iconeBox = no(doc, ':span', { class: 'chart-card-ico', hidden: true }, tit);
  const txt = no(doc, ':div', { class: 'chart-card-txt' }, tit);
  const rotuloEl = no(doc, ':div', { class: 'chart-card-rot', id: `${id}-r` }, txt);
  const valorEl = no(doc, ':div', { class: 'chart-card-val' }, txt);
  const deltaEl = no(doc, ':div', { class: 'chart-card-delta', hidden: true }, txt);
  const segBox = no(doc, ':div', { class: 'chart-card-seg', hidden: true }, cab);
  const acoes = no(doc, ':div', { class: 'chart-card-acoes' }, cab);
  const corpo = no(doc, ':div', { class: 'chart-card-corpo' }, raiz);
  const estadoEl = no(doc, ':div', { class: 'chart-card-estado', hidden: true }, raiz);

  const ouvintes = [];
  const ouvir = (a, t, f, o) => { a.addEventListener(t, f, o); ouvintes.push([a, t, f, o]); };

  let menuItens = op.menu ? [...op.menu] : [];
  let periodoAtual = op.periodo;
  let periodos = op.periodos || [];
  let seg = null; let btnMenu = null; let menuEl = null; let menuAberto = false;
  const api = { raiz, corpo, el: raiz };

  /* ---- cabeçalho ---- */
  function definirCabecalho(c = {}) {
    if (c.rotulo !== undefined) rotuloEl.textContent = c.rotulo || '';
    rotuloEl.hidden = !rotuloEl.textContent;
    if (c.valor !== undefined) {
      const f = c.formatarValor || op.formatarValor;
      valorEl.textContent = ehNum(c.valor) && f ? f(c.valor) : (c.valor == null ? '' : String(c.valor));
    }
    valorEl.hidden = !valorEl.textContent;
    if (c.delta !== undefined) {
      esvaziar(deltaEl);
      const d = c.delta;
      deltaEl.hidden = !d;
      if (d) {
        const s = d.sinal > 0 ? 'up' : d.sinal < 0 ? 'down' : 'flat';
        deltaEl.className = `chart-card-delta is-${s}`;
        deltaEl.appendChild(iconeSvg(doc, s === 'up' ? 'sobe' : s === 'down' ? 'desce' : 'igual', 16));
        no(doc, ':span', { texto: d.texto }, deltaEl);
      }
    }
    if (c.icone !== undefined) {
      esvaziar(iconeBox);
      iconeBox.hidden = !c.icone;
      if (c.icone) iconeBox.appendChild(c.icone);
    }
  }

  /* ---- menu "•••" ---- */
  function fecharMenu(devolverFoco = false) {
    if (!menuEl) return;
    menuAberto = false; menuEl.hidden = true; btnMenu.setAttribute('aria-expanded', 'false');
    if (devolverFoco) btnMenu.focus();
  }
  function montarMenu() {
    if (btnMenu) { btnMenu.remove(); btnMenu = null; }
    if (menuEl) { menuEl.remove(); menuEl = null; }
    if (!menuItens.length) return;
    const mid = `${id}-m`;
    btnMenu = no(doc, ':button', { type: 'button', class: 'chart-card-mais', 'aria-label': 'Mais opções do gráfico', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': mid }, acoes);
    btnMenu.appendChild(iconeSvg(doc, 'mais', 20));
    menuEl = no(doc, ':div', { class: 'chart-card-menu', role: 'menu', id: mid, hidden: true }, acoes);
    for (const it of menuItens) {
      const b = no(doc, ':button', { type: 'button', role: 'menuitem', class: 'chart-card-menu-item', texto: it.rotulo }, menuEl);
      b.addEventListener('click', () => { fecharMenu(true); if (it.aoClicar) it.aoClicar(api); });
    }
  }
  ouvir(acoes, 'click', (e) => {
    if (!btnMenu || !e.target.closest || !e.target.closest('.chart-card-mais')) return;
    menuAberto = !menuAberto; menuEl.hidden = !menuAberto; btnMenu.setAttribute('aria-expanded', String(menuAberto));
    if (menuAberto) { const p = menuEl.querySelector('button'); if (p) p.focus(); }
  });
  ouvir(doc, 'click', (e) => { if (menuAberto && !acoes.contains(e.target)) fecharMenu(); });
  ouvir(raiz, 'keydown', (e) => {
    if (!menuAberto) return;
    if (e.key === 'Escape') { e.stopPropagation(); fecharMenu(true); return; }
    const itens = [...menuEl.querySelectorAll('button')];
    const i = itens.indexOf(doc.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); itens[(i + 1) % itens.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); itens[(i - 1 + itens.length) % itens.length].focus(); }
  });

  /* ---- seletor de período segmentado (✓ no ativo) ---- */
  function montarPeriodos() {
    if (seg) { seg.remove(); seg = null; }
    segBox.hidden = !periodos.length;
    if (!periodos.length) return;
    seg = no(doc, ':div', { class: 'chart-seg', role: 'group', 'aria-label': 'Período' }, segBox);
    for (const p of periodos) {
      const b = no(doc, ':button', { type: 'button', class: 'chart-seg-btn', 'data-id': p.id, 'aria-pressed': String(p.id === periodoAtual) }, seg);
      const ck = iconeSvg(doc, 'check', 16); ck.classList.add('chart-seg-ck'); b.appendChild(ck);
      no(doc, ':span', { texto: p.rotulo }, b);
    }
  }
  ouvir(segBox, 'click', (e) => {
    const b = e.target.closest && e.target.closest('.chart-seg-btn');
    if (!b) return;
    const idp = b.getAttribute('data-id');
    if (idp === periodoAtual) return;
    api.definirPeriodo(idp);
    if (op.aoMudarPeriodo) op.aoMudarPeriodo(idp, api.grafico || api);
  });
  ouvir(segBox, 'keydown', (e) => {
    if (!seg || !e.target.closest || !e.target.closest('.chart-seg')) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const bs = [...seg.querySelectorAll('button')];
    const i = bs.indexOf(e.target.closest('button'));
    const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + bs.length) % bs.length;
    e.preventDefault(); bs[j].focus();
  });

  /* ---- estados ---- */
  api.definirEstado = (estado = 'ok', mensagem) => {
    esvaziar(estadoEl); estadoEl.style.height = '';
    raiz.setAttribute('data-estado', estado);
    raiz.removeAttribute('aria-busy');
    if (estado === 'ok') { estadoEl.hidden = true; corpo.hidden = false; return; }
    corpo.hidden = true; estadoEl.hidden = false;
    if (estado === 'carregando') {
      raiz.setAttribute('aria-busy', 'true');
      estadoEl.className = 'chart-card-estado is-skeleton';
      estadoEl.setAttribute('role', 'status');
      estadoEl.setAttribute('aria-label', 'Carregando gráfico');
      estadoEl.style.minHeight = `${op.altura || 200}px`; estadoEl.style.height = `${op.altura || 200}px`;
      for (let i = 0; i < 6; i++) no(doc, ':span', { class: 'chart-sk-barra', style: `--h:${[48, 70, 56, 84, 62, 76][i]}%` }, estadoEl);
    } else {
      estadoEl.className = `chart-card-estado is-${estado}`;
      estadoEl.setAttribute('role', estado === 'erro' ? 'alert' : 'status');
      estadoEl.removeAttribute('aria-label');
      estadoEl.style.minHeight = `${op.altura || 200}px`;
      estadoEl.appendChild(iconeSvg(doc, estado === 'erro' ? 'erro' : 'vazio', 40));
      no(doc, ':p', { class: 'chart-card-estado-txt', texto: mensagem || (estado === 'erro' ? (op.mensagemErro || 'Não deu pra carregar este gráfico.') : (op.mensagemVazio || 'Sem dados neste período.')) }, estadoEl);
      if (estado === 'erro' && op.aoTentarNovamente) {
        const b = no(doc, ':button', { type: 'button', class: 'chart-card-retry', texto: 'Tentar de novo' }, estadoEl);
        b.addEventListener('click', () => op.aoTentarNovamente(api));
      }
    }
  };
  /** Mantém o gráfico anterior à vista (esmaecido) enquanto recarrega - sem skeleton, sem pulo de layout. */
  api.recarregando = (sim = true) => { raiz.classList.toggle('is-recarregando', !!sim); if (sim) raiz.setAttribute('aria-busy', 'true'); else raiz.removeAttribute('aria-busy'); };
  api.definirPeriodo = (idp) => {
    periodoAtual = idp;
    if (seg) for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.getAttribute('data-id') === idp));
  };
  api.definirPeriodos = (lista, ativo) => { periodos = lista || []; periodoAtual = ativo; montarPeriodos(); };
  api.definirMenu = (itens) => { menuItens = itens ? [...itens] : []; montarMenu(); };
  /** Acrescenta um item no fim do menu (ex.: "Ver como tabela" do gráfico). */
  api.adicionarItemMenu = (item) => { menuItens.push(item); montarMenu(); };
  api.definirCabecalho = definirCabecalho;
  api.destruir = () => {
    for (const [a, t, f, o] of ouvintes) a.removeEventListener(t, f, o);
    ouvintes.length = 0;
    if (raiz.parentNode) raiz.parentNode.removeChild(raiz);
  };

  definirCabecalho({ rotulo: op.rotulo || '', valor: op.valor, formatarValor: op.formatarValor, delta: op.delta, icone: op.icone });
  montarPeriodos();
  montarMenu();
  api.definirEstado(op.estado || 'ok');
  if (op.altura) corpo.style.minHeight = `${op.altura}px`;
  return api;
}

export { ICONES };
