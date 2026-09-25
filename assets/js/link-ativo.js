/**
 * link-ativo.js - 25/09/2026: endereço da tela Detalhe do ativo
 * (ativo/index.html?ref=...). Todo lugar do site que mostra um ativo usa
 * isto pra virar link - Início, Carteiras, Proventos, Distribuições e Metas.
 *
 * `ref` é o ticker (ações, FIIs, ações EUA) ou, pra um título de renda
 * fixa, `rf:<nome do título>|<instituição>` - o mesmo par que identifica a
 * posição na Carteira Renda Fixa, no histórico e nas Transações Renda Fixa
 * (ver apps-script/Ativo.gs!montarTelaAtivoRendaFixa_).
 */

import { resolveSiteRootUrl } from './shell.js';

const CLASSES_RF = new Set(['rf', 'rendaFixa', 'renda-fixa']);

/** ref do ativo a partir de um objeto de qualquer tela (ticker ou título de renda fixa). */
export function refAtivo(ativo) {
  if (!ativo) return '';
  if (CLASSES_RF.has(ativo.classe)) {
    const nome = ativo.nomePersonalizado || ativo.nome || ativo.tipoInvestimento || ativo.ticker || '';
    return `rf:${String(nome).trim()}|${String(ativo.instituicao || '').trim()}`;
  }
  return String(ativo.ticker || '').trim().toUpperCase();
}

/** URL absoluta da tela do ativo (funciona de qualquer pasta do site e no GitHub Pages). */
export function urlAtivo(ref, { raizSite = resolveSiteRootUrl() } = {}) {
  return new URL(`ativo/index.html?ref=${encodeURIComponent(ref)}`, raizSite).href;
}

/** Atalho: URL da tela a partir de um ticker de renda variável. */
export function urlAtivoTicker(ticker, opcoes) {
  return urlAtivo(String(ticker || '').trim().toUpperCase(), opcoes);
}

/** Lê o `ref` do endereço da página (?ref=...). */
export function refDaUrl(href) {
  try {
    return new URL(href).searchParams.get('ref') || '';
  } catch (e) {
    return '';
  }
}

// ---------------------------------------------------------------------------
// 25/09/2026 (Tiago: "desktop: inclua esse mecanismo de abrir em uma nova
// aba por esse iconizinho, que só aparece quando passo o mouse. No mobile,
// segue de abrir normalmente e não mostra esse ícone"): ícone ↗ ao lado do
// ticker que abre a tela do ativo em NOVA aba. Só existe com mouse de
// verdade (shell.css: @media (hover:hover) and (pointer:fine)) - e mesmo
// assim fica invisível até passar o mouse na linha/no ticker. Clicar no
// ticker continua abrindo na mesma aba, igual antes.
// ---------------------------------------------------------------------------

const ICONE_NOVA_ABA_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';

function escAttr(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** HTML do ícone "abrir em nova aba" (depois do link do ticker). */
export function linkNovaAbaHtml(href, rotulo = '') {
  const nome = rotulo ? ` ${escAttr(rotulo)}` : '';
  return `<a class="link-ativo-nova-aba" href="${escAttr(href)}" target="_blank" rel="noopener" title="Abrir em nova aba" aria-label="Abrir${nome} em nova aba">${ICONE_NOVA_ABA_SVG}</a>`;
}

/** Link do ticker (mesma aba) + ícone de nova aba, embrulhados juntos. */
export function linkAtivoComNovaAbaHtml(href, textoHtml, rotulo = '') {
  return `<span class="link-ativo-grupo"><a class="link-ativo" href="${escAttr(href)}">${textoHtml}</a>${linkNovaAbaHtml(href, rotulo)}</span>`;
}

/** Mesmo ícone, via DOM (telas que montam a linha com createElement). */
export function criarLinkNovaAba(doc, href, rotulo = '') {
  const tmp = doc.createElement('span');
  tmp.innerHTML = linkNovaAbaHtml(href, rotulo);
  return tmp.firstElementChild;
}
