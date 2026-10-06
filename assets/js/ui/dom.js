/**
 * ui/dom.js — helpers mínimos de DOM dos componentes (05/10/2026, Onda 3). Sem efeito colateral ao importar.
 * Tudo recebe `doc` (padrão: document) pra rodar também em jsdom nos testes.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Cria um elemento: criar(doc, 'button', { class:'btn', type:'button', 'aria-label':'x' }, ['texto', outroNo]). */
export function criar(doc, tag, attrs = {}, filhos = []) {
  const no = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') no.className = v;
    else if (k === 'texto') no.textContent = v;
    else no.setAttribute(k, v === true ? '' : String(v));
  }
  (Array.isArray(filhos) ? filhos : [filhos]).forEach((f) => {
    if (f == null || f === false) return;
    no.append(typeof f === 'string' ? doc.createTextNode(f) : f);
  });
  return no;
}

/** Ícone do sprite (shell.html): <svg class="ico"><use href="#ico-nome"/></svg>. */
export function icone(doc, nome, classe = 'ico') {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', classe);
  svg.setAttribute('aria-hidden', 'true');
  const use = doc.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#ico-${nome}`);
  svg.append(use);
  return svg;
}

let contador = 0;
/** Id único previsível pra ligar rótulo/descrição (aria-labelledby). */
export function novoId(prefixo = 'ui') {
  contador += 1;
  return `${prefixo}-${contador}`;
}

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** Elementos focáveis visíveis dentro de `raiz`. */
export function focaveis(raiz) {
  return Array.from(raiz.querySelectorAll(FOCAVEIS)).filter((e) => !e.hidden && e.getAttribute('aria-hidden') !== 'true');
}

/**
 * Prende o foco do teclado dentro de `raiz` (Tab/Shift+Tab dão a volta). Devolve a função que solta.
 * O foco inicial é decidido por quem chama.
 */
export function prenderFoco(raiz) {
  const doc = raiz.ownerDocument;
  function aoTecla(ev) {
    if (ev.key !== 'Tab') return;
    const lista = focaveis(raiz);
    if (!lista.length) { ev.preventDefault(); return; }
    const primeiro = lista[0];
    const ultimo = lista[lista.length - 1];
    const ativo = doc.activeElement;
    if (ev.shiftKey && (ativo === primeiro || !raiz.contains(ativo))) { ev.preventDefault(); ultimo.focus(); }
    else if (!ev.shiftKey && (ativo === ultimo || !raiz.contains(ativo))) { ev.preventDefault(); primeiro.focus(); }
  }
  doc.addEventListener('keydown', aoTecla, true);
  return () => doc.removeEventListener('keydown', aoTecla, true);
}

/** true se o usuário pediu menos movimento (animações curtas viram instantâneas). */
export function semMovimento(win) {
  try { return !!(win && win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
}
