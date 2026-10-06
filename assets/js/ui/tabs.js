/**
 * ui/tabs.js — abas do kit (05/10/2026, Onda 3): hierarquia de navegação interna das páginas.
 *   variante 'pilula'     = subpáginas da seção (segmentadas):  Carteiras: Visão geral | Ações | FIIs | Renda Fixa | EUA
 *   variante 'sublinhada' = recortes/filtros dentro da subpágina:  Technology | Crypto | ...
 * (e o breadcrumb, ui/breadcrumb.js, nas telas de detalhe). Acessível: role=tablist/tab, aria-selected, tabindex "roving",
 * setas ←/→, Home/End (ativação automática; { ativacao:'manual' } pede Enter/Espaço). Itens com `href` viram LINKS
 * (aria-current="page") - use quando cada aba é uma página/endereço. Rola na horizontal no celular e mantém a aba ativa à vista.
 *
 *   const abas = criarTabs(el, { rotulo: 'Carteiras', variante: 'pilula', ativo: 'acoes',
 *     itens: [{ id: 'visao', rotulo: 'Visão geral' }, { id: 'acoes', rotulo: 'Ações', contagem: 12 }],
 *     aoMudar: (id) => mostrarPainel(id) });
 *   abas.selecionar('fiis');  abas.atualizarItem('acoes', { contagem: 3 });
 */
import { criar, icone } from './dom.js';

export function criarTabs(container, { itens = [], ativo, aoMudar, variante = 'pilula', rotulo = 'Abas', idBase, painel = false, ativacao = 'auto', doc } = {}) {
  const d = doc || container.ownerDocument;
  const sublinhada = variante === 'sublinhada' || variante === 'sub';
  const comLinks = itens.some((i) => i.href);
  container.textContent = '';
  container.classList.add('tabs', sublinhada ? 'tabs-sub' : 'tabs-pilula');
  if (comLinks) { container.setAttribute('role', 'navigation'); container.removeAttribute('aria-orientation'); }
  else { container.setAttribute('role', 'tablist'); container.setAttribute('aria-orientation', 'horizontal'); }
  container.setAttribute('aria-label', rotulo);
  const base = idBase || container.id || `tabs-${Math.random().toString(36).slice(2, 7)}`;
  let atual = ativo != null && itens.some((i) => i.id === ativo) ? ativo : (itens.find((i) => !i.desabilitado) || {}).id;
  const botoes = new Map();

  function rotuloDe(item) {
    const partes = [];
    if (item.icone) partes.push(icone(d, item.icone, 'ico'));
    partes.push(criar(d, 'span', { class: 'tab-rotulo', texto: item.rotulo }));
    if (item.contagem != null && item.contagem !== '') partes.push(criar(d, 'span', { class: 'tab-n', texto: String(item.contagem) }));
    return partes;
  }
  itens.forEach((item) => {
    const attrs = { class: 'tab', 'data-tab': item.id };
    let el;
    if (item.href) {
      el = criar(d, 'a', { ...attrs, href: item.href }, rotuloDe(item));
    } else {
      el = criar(d, 'button', { ...attrs, type: 'button', role: 'tab', id: `${base}-tab-${item.id}`, 'aria-controls': painel ? `${base}-painel-${item.id}` : null, disabled: item.desabilitado || null }, rotuloDe(item));
    }
    botoes.set(item.id, el);
    el.addEventListener('click', (ev) => {
      if (item.desabilitado) { ev.preventDefault(); return; }
      if (item.href && !item.interceptar) return; // link normal: o navegador navega
      if (item.href) ev.preventDefault();
      selecionar(item.id, { emitir: true });
    });
    el.addEventListener('keydown', (ev) => aoTecla(ev, item));
    container.append(el);
  });

  function visiveis() { return itens.filter((i) => !i.desabilitado); }
  function aoTecla(ev, item) {
    const lista = visiveis();
    const i = lista.findIndex((x) => x.id === item.id);
    let alvo = null;
    if (ev.key === 'ArrowRight') alvo = lista[(i + 1) % lista.length];
    else if (ev.key === 'ArrowLeft') alvo = lista[(i - 1 + lista.length) % lista.length];
    else if (ev.key === 'Home') alvo = lista[0];
    else if (ev.key === 'End') alvo = lista[lista.length - 1];
    else if ((ev.key === 'Enter' || ev.key === ' ') && ativacao === 'manual' && !item.href) { ev.preventDefault(); selecionar(item.id, { emitir: true }); return; }
    if (!alvo) return;
    ev.preventDefault();
    botoes.get(alvo.id).focus();
    if (ativacao !== 'manual' && !alvo.href) selecionar(alvo.id, { emitir: true });
  }

  function pintar() {
    itens.forEach((item) => {
      const el = botoes.get(item.id);
      const on = item.id === atual;
      if (item.href) { if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); el.classList.toggle('on', on); }
      else { el.setAttribute('aria-selected', on ? 'true' : 'false'); el.tabIndex = on ? 0 : -1; }
    });
    if (!comLinks && !botoes.get(atual) && botoes.size) botoes.values().next().value.tabIndex = 0;
  }
  function trazerParaVista(el) {
    // 06/10/2026 (o3p-inicio): rola só a faixa de abas na horizontal (scrollIntoView também rolava a PÁGINA até as abas ao montar)
    try {
      if (!el || container.scrollWidth <= container.clientWidth) return;
      const c = container.getBoundingClientRect(); const r = el.getBoundingClientRect();
      container.scrollLeft += (r.left + r.width / 2) - (c.left + c.width / 2);
    } catch (e) { /* jsdom/navegador antigo */ }
  }
  function selecionar(id, { emitir = false } = {}) {
    if (!botoes.has(id)) return;
    const mudou = id !== atual;
    atual = id;
    pintar();
    trazerParaVista(botoes.get(id));
    if (emitir && mudou && typeof aoMudar === 'function') aoMudar(id);
  }
  function atualizarItem(id, { rotulo: novo, contagem } = {}) {
    const item = itens.find((i) => i.id === id);
    const el = botoes.get(id);
    if (!item || !el) return;
    if (novo != null) item.rotulo = novo;
    if (contagem !== undefined) item.contagem = contagem;
    el.textContent = '';
    el.append(...rotuloDe(item));
  }
  pintar();
  if (atual != null) trazerParaVista(botoes.get(atual));
  return { el: container, selecionar, atualizarItem, obterAtivo: () => atual, botao: (id) => botoes.get(id), idPainel: (id) => `${base}-painel-${id}`, destruir() { container.textContent = ''; container.classList.remove('tabs', 'tabs-pilula', 'tabs-sub'); } };
}
