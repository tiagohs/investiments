/**
 * ui/menu.js — menu flutuante (o "•••" de linha de tabela/cartão do kit) (05/10/2026).
 *
 *   ligarMenu(botao, () => [{ rotulo: 'Editar', icone: 'edit', aoClicar: editar }, { separador: true }, { rotulo: 'Excluir', icone: 'delete', perigo: true, aoClicar: excluir }]);
 *   const m = abrirMenu(botao, itens);  m.fechar();
 *
 * Posicionado junto ao gatilho (vira pra cima se não couber), fecha com Esc / clique fora / rolagem / redimensionar; ↑ ↓ Home End
 * navegam, Enter/Espaço ativam, Tab fecha. O foco volta pro gatilho. Itens com `href` são links. Só um menu aberto por vez.
 */
import { criar, icone } from './dom.js';

let aberto = null;

export function abrirMenu(ancora, itens = [], { alinhar = 'fim', rotulo = 'Ações', doc } = {}) {
  const d = doc || ancora.ownerDocument;
  const win = d.defaultView;
  if (aberto) aberto.fechar(false);
  const menu = criar(d, 'div', { class: 'menu', role: 'menu', 'aria-label': rotulo });
  const opcoes = [];
  itens.forEach((item) => {
    if (item.separador) { menu.append(criar(d, 'hr', { class: 'menu-sep', role: 'separator' })); return; }
    const attrs = { class: `menu-item${item.perigo ? ' perigo' : ''}`, role: 'menuitem', tabindex: '-1', 'aria-disabled': item.desabilitado ? 'true' : null };
    const filhos = [];
    if (item.icone) filhos.push(icone(d, item.icone, 'ico'));
    filhos.push(criar(d, 'span', { texto: item.rotulo }));
    const el = item.href ? criar(d, 'a', { ...attrs, href: item.href, target: item.novaAba ? '_blank' : null, rel: item.novaAba ? 'noopener' : null }, filhos) : criar(d, 'button', { ...attrs, type: 'button' }, filhos);
    el.addEventListener('click', (ev) => {
      if (item.desabilitado) { ev.preventDefault(); return; }
      fechar(true);
      if (typeof item.aoClicar === 'function') item.aoClicar(ev);
    });
    opcoes.push(el);
    menu.append(el);
  });
  d.body.append(menu);
  ancora.setAttribute('aria-haspopup', 'menu');
  ancora.setAttribute('aria-expanded', 'true');

  // posição (fixed): abaixo do gatilho, alinhado ao fim (direita); vira pra cima se faltar espaço
  const r = ancora.getBoundingClientRect();
  const vw = (win && win.innerWidth) || 1024;
  const vh = (win && win.innerHeight) || 768;
  const w = menu.offsetWidth || 200;
  const h = menu.offsetHeight || 200;
  let left = alinhar === 'inicio' ? r.left : r.right - w;
  left = Math.max(8, Math.min(left, vw - w - 8));
  let top = r.bottom + 4;
  if (top + h > vh - 8 && r.top - 4 - h >= 8) { top = r.top - 4 - h; menu.style.transformOrigin = 'bottom right'; }
  top = Math.max(8, Math.min(top, vh - h - 8));
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;

  function ativos() { return opcoes.filter((o) => o.getAttribute('aria-disabled') !== 'true'); }
  function mover(delta, absoluto) {
    const lista = ativos();
    if (!lista.length) return;
    const i = lista.indexOf(d.activeElement);
    const alvo = absoluto != null ? (absoluto < 0 ? lista[lista.length - 1] : lista[absoluto]) : lista[(i + delta + lista.length) % lista.length];
    alvo.focus();
  }
  function aoTecla(ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); fechar(true); }
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); mover(1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); mover(-1); }
    else if (ev.key === 'Home') { ev.preventDefault(); mover(0, 0); }
    else if (ev.key === 'End') { ev.preventDefault(); mover(0, -1); }
    else if (ev.key === 'Tab') fechar(false);
  }
  function aoPonteiroFora(ev) { if (!menu.contains(ev.target) && !ancora.contains(ev.target)) fechar(false); }
  const aoRolar = (ev) => { if (!menu.contains(ev.target)) fechar(false); };
  const aoRedimensionar = () => fechar(false);
  d.addEventListener('keydown', aoTecla, true);
  d.addEventListener('pointerdown', aoPonteiroFora, true);
  d.addEventListener('scroll', aoRolar, true);
  if (win) win.addEventListener('resize', aoRedimensionar);

  let fechado = false;
  function fechar(devolverFoco = true) {
    if (fechado) return;
    fechado = true;
    d.removeEventListener('keydown', aoTecla, true);
    d.removeEventListener('pointerdown', aoPonteiroFora, true);
    d.removeEventListener('scroll', aoRolar, true);
    if (win) win.removeEventListener('resize', aoRedimensionar);
    menu.remove();
    ancora.setAttribute('aria-expanded', 'false');
    if (aberto && aberto.menu === menu) aberto = null;
    if (devolverFoco) { try { ancora.focus(); } catch (e) { /* segue */ } }
  }
  const primeiro = ativos()[0];
  if (primeiro) primeiro.focus();
  aberto = { menu, fechar };
  return { el: menu, fechar };
}

/** Liga o clique do botão a um menu. `itens` pode ser um array ou uma função (calculada na hora de abrir). */
export function ligarMenu(botao, itens, opcoes = {}) {
  botao.setAttribute('aria-haspopup', 'menu');
  botao.setAttribute('aria-expanded', 'false');
  const abrir = (ev) => {
    ev.preventDefault();
    if (botao.getAttribute('aria-expanded') === 'true' && aberto) { aberto.fechar(true); return; }
    abrirMenu(botao, typeof itens === 'function' ? itens() : itens, opcoes);
  };
  botao.addEventListener('click', abrir);
  return () => botao.removeEventListener('click', abrir);
}
