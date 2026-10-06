/**
 * charts/icones.js - ícones mínimos (Material Symbols Rounded, traçado próprio em viewBox 24) usados DENTRO dos
 * componentes de gráfico (✓ do seletor, "•••", setas de tendência, vazio/erro/info). A biblioteca não depende do
 * sprite do shell; as páginas continuam usando o `<use href="#ico-...">` delas fora do gráfico.
 */
import { NS_SVG } from './base.js';

/** `d` por ícone (preenchidos, como no Material Symbols). */
export const ICONES = {
  check: 'M9.55 17.65 4.6 12.7l1.4-1.4 3.55 3.55 8.45-8.45 1.4 1.4z',
  mais: 'M6 14a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm6 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm6 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z',
  sobe: 'M3.7 17.7 2.3 16.3 9.8 8.8l4 4L20.6 6H16V4h8v8h-2V7.4l-8.2 8.2-4-4z',
  desce: 'M16 20v-2h4.6l-6.8-6.8-4 4-7.5-7.5L3.7 6.3l6.1 6.1 4-4 8.2 8.2V12h2v8z',
  igual: 'M4 11h16v2H4z',
  info: 'M11 17h2v-6h-2zm1-8a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm0 13a10 10 0 1 1 0-20 10 10 0 0 1 0 20zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  vazio: 'M5 21q-.825 0-1.412-.588T3 19V5q0-.825.588-1.412T5 3h14q.825 0 1.413.588T21 5v14q0 .825-.587 1.413T19 21zm0-2h14V5H5zm2-2h2v-5H7zm4 0h2V7h-2zm4 0h2v-3h-2z',
  erro: 'M12 17q.425 0 .713-.288T13 16t-.288-.712T12 15t-.712.288T11 16t.288.713T12 17m-1-4h2V7h-2zm1 9q-2.075 0-3.9-.788t-3.175-2.137T2.788 15.9T2 12t.788-3.9 2.137-3.175T8.1 2.788T12 2t3.9.788 3.175 2.137T21.213 8.1T22 12t-.788 3.9-2.137 3.175-3.175 2.137T12 22m0-2q3.35 0 5.675-2.325T20 12t-2.325-5.675T12 4 6.325 6.325 4 12t2.325 5.675T12 20',
};

/** Cria `<svg>` 24x24 com o ícone (aria-hidden; a cor vem de currentColor). */
export function iconeSvg(doc, nome, tamanho = 20) {
  const s = doc.createElementNS(NS_SVG, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', String(tamanho));
  s.setAttribute('height', String(tamanho));
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  s.setAttribute('class', `chart-ico chart-ico--${nome}`);
  const p = doc.createElementNS(NS_SVG, 'path');
  p.setAttribute('d', ICONES[nome] || ICONES.igual);
  p.setAttribute('fill', 'currentColor');
  s.appendChild(p);
  return s;
}
