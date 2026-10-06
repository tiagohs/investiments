// tests/charts-helper.mjs - ambiente jsdom com rAF falso (tempo controlado), matchMedia (movimento reduzido) e ResizeObserver
// contado, pros testes da biblioteca de gráficos (assets/js/charts). Dados dos testes: 100% inventados.
import { JSDOM } from 'jsdom';

export function criarAmbiente({ reduzido = false, comRaf = true } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="raiz"></div></body></html>', { url: 'https://exemplo.test/' });
  const win = dom.window;
  const doc = win.document;
  win.matchMedia = (q) => ({ matches: reduzido && /prefers-reduced-motion/.test(q), media: q, addEventListener() {}, removeEventListener() {} });
  const amb = { dom, win, doc, raiz: doc.getElementById('raiz'), relogio: 1000, pedidos: 0, cancelados: 0, observadores: { criados: 0, observando: 0, desconectados: 0 } };
  let fila = []; let prox = 1;
  if (comRaf) {
    win.requestAnimationFrame = (cb) => { amb.pedidos++; const id = prox++; fila.push({ id, cb }); return id; };
    win.cancelAnimationFrame = (id) => { amb.cancelados++; fila = fila.filter((q) => q.id !== id); };
  }
  win.ResizeObserver = class {
    constructor() { amb.observadores.criados++; }
    observe() { amb.observadores.observando++; }
    disconnect() { amb.observadores.desconectados++; }
  };
  /** Avança `ms` de relógio em quadros de 16ms, rodando os callbacks de rAF pendentes. */
  amb.avancar = (ms, passo = 16) => {
    for (let t = 0; t < ms; t += passo) {
      amb.relogio += passo;
      const rodar = fila; fila = [];
      for (const q of rodar) q.cb(amb.relogio);
    }
  };
  amb.pendentes = () => fila.length;
  /** Faz o getBoundingClientRect do elemento devolver essa caixa (jsdom não tem layout). */
  amb.caixa = (el, { left = 0, top = 0, width = 640, height = 240 } = {}) => { el.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }); };
  amb.evento = (el, tipo, init = {}) => el.dispatchEvent(new win.MouseEvent(tipo, { bubbles: true, cancelable: true, ...init }));
  amb.tecla = (el, key) => el.dispatchEvent(new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  amb.novo = () => { const d = doc.createElement('div'); amb.raiz.appendChild(d); return d; };
  amb.contarNos = (el) => el.querySelectorAll('*').length;
  // a biblioteca lê globalThis? Não: tudo vem de el.ownerDocument.defaultView.
  return amb;
}

export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun'];
export const SERIES_LINHA = [
  { id: 'a', nome: 'Carteira', valores: [10, 12, 11, 15, 14, 18] },
  { id: 'b', nome: 'CDI', valores: [10, 11, 12, 12.5, 13, 13.5], pontilhada: true },
];
