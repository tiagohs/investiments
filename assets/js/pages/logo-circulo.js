/**
 * pages/logo-circulo.js - 06/10/2026 (Onda 3, kit Figma): logo do ativo num círculo (.logo-circulo, components.css) com as
 * iniciais por baixo (aparecem se a imagem não existir/falhar). Usado na Início (favoritos, Meus ativos) e no Radar de
 * Acompanhamento de Ativos. A imagem vem de LOGOS_ATIVOS (por ticker); o caminho é resolvido a partir da raiz do site
 * (funciona de dentro de subpastas). Sem handler inline novo: `onerror="this.remove()"` é o mesmo da CSP já liberada.
 */
import { LOGOS_ATIVOS } from '../logos-ativos.js';
import { resolveSiteRootUrl } from '../shell.js';
import { esc } from '../util/html.js';

/** Iniciais de um ticker/nome (2 letras). */
export function iniciaisDe(texto, padrao = '?') {
  const t = String(texto || '').replace(/[^A-Za-z0-9]/g, '');
  return (t.slice(0, 2) || padrao).toUpperCase();
}

/** HTML do círculo com o logo do `ticker` (ou só as iniciais). `extra` = classes a mais; `iniciais` força o texto de fallback. */
export function logoCirculoHtml(ticker, { extra = '', iniciais = null, imagem = null } = {}) {
  const ini = esc(iniciais || iniciaisDe(ticker));
  const caminho = imagem || LOGOS_ATIVOS[ticker];
  const cls = `logo-circulo${extra ? ` ${extra}` : ''}`;
  if (!caminho) return `<span class="${cls}" aria-hidden="true">${ini}</span>`;
  let url = caminho;
  try { url = new URL(caminho, resolveSiteRootUrl()).href; } catch (e) { /* mantém o caminho relativo */ }
  return `<span class="${cls}" aria-hidden="true">${ini}<img src="${esc(url)}" alt="" loading="lazy" onerror="this.remove()"></span>`;
}
