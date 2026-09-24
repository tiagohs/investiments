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
