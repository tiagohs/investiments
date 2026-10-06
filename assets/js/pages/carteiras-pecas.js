/**
 * carteiras-pecas.js - 06/10/2026 (A-42/A-76): peças pequenas e sem gráfico das tabelas de carteira (logo do ativo, logo de renda fixa,
 * status do viés de compra). Proventos, Transações e Ativo importam só isto, em vez de carteiras-classe-comum.js (+ gráficos +
 * cálculo de rentabilidade). carteiras-classe-comum.js reexporta (compatibilidade).
 */

import { LOGOS_ATIVOS } from '../logos-ativos.js';
import { resolveSiteRootUrl } from '../shell.js';
import { esc } from '../util/html.js';

// ---------------------------------------------------------------------------
// Logos
// ---------------------------------------------------------------------------
/**
 * Logo redondo do ativo (LOGOS_ATIVOS, gerado por scripts/gerar-logos-ativos.mjs). HTML-string porque as listas montam a linha
 * inteira via innerHTML: a <img> tem onerror inline que remove ela mesma se a imagem falhar, revelando o fallback de iniciais
 * que já está por baixo. (Versão `.cc-logo`, usada por Aportes/Lançamentos/Proventos; a tabela de Carteiras usa `.logo-circulo`.)
 */
export function logoAtivoHtml(ticker) {
  const iniciais = (ticker || '?').slice(0, 2).toUpperCase();
  const caminho = LOGOS_ATIVOS[ticker];
  if (!caminho) return `<span class="cc-logo cc-logo-fallback">${iniciais}</span>`;
  const url = new URL(caminho, resolveSiteRootUrl()).href;
  return `<span class="cc-logo"><img src="${url}" alt="" loading="lazy" onerror="this.remove()"><span class="cc-logo-fallback">${iniciais}</span></span>`;
}

// 25/09/2026 (Tiago, ponto 6): 3 imagens genéricas pra renda fixa, por tipo de título (não por ticker).
function imagemRendaFixa_(a) {
  const indexador = String(a.indexador || '').toUpperCase();
  const tipo = String(a.tipoInvestimento || '').toUpperCase();
  const instituicao = String(a.instituicao || '').toUpperCase();
  if (indexador.includes('SELIC')) return 'assets/imgs/tesouro-selic.webp';
  if (indexador.includes('IPCA')) return 'assets/imgs/tesouro-direto.webp';
  if (tipo.includes('LCI') && instituicao.includes('INTER')) return 'assets/imgs/banco-inter.png';
  return null;
}

const iniciaisRendaFixa_ = (a) => String(a.instituicao || '').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'RF';

export function logoRendaFixaHtml(a) {
  const imagem = imagemRendaFixa_(a);
  const iniciais = iniciaisRendaFixa_(a);
  if (!imagem) return `<span class="cc-logo cc-logo-fallback">${iniciais}</span>`;
  const url = new URL(imagem, resolveSiteRootUrl()).href;
  return `<span class="cc-logo"><img src="${url}" alt="" loading="lazy" onerror="this.remove()"><span class="cc-logo-fallback">${iniciais}</span></span>`;
}

/** Logo no formato do kit (`.logo-circulo`, 40px) - ação/FII/ETF por ticker. */
export function logoCirculoHtml(ticker) {
  const iniciais = esc((ticker || '?').slice(0, 2).toUpperCase());
  const caminho = LOGOS_ATIVOS[ticker];
  if (!caminho) return `<span class="logo-circulo" aria-hidden="true">${iniciais}</span>`;
  const url = new URL(caminho, resolveSiteRootUrl()).href;
  return `<span class="logo-circulo" aria-hidden="true"><img src="${esc(url)}" alt="" loading="lazy" onerror="this.remove()">${iniciais}</span>`;
}

/** Logo `.logo-circulo` de um título de renda fixa. */
export function logoCirculoRendaFixaHtml(a) {
  const imagem = imagemRendaFixa_(a);
  const iniciais = esc(iniciaisRendaFixa_(a));
  if (!imagem) return `<span class="logo-circulo" aria-hidden="true">${iniciais}</span>`;
  const url = new URL(imagem, resolveSiteRootUrl()).href;
  return `<span class="logo-circulo" aria-hidden="true"><img src="${esc(url)}" alt="" loading="lazy" onerror="this.remove()">${iniciais}</span>`;
}

/** "Comprar" (good) / "Aguardar" (warn) / sem dado (—) — Auxiliar_ativos guarda o texto bruto, então compara sem diferenciar maiúsculas. */
export function statusVies(vies) {
  const v = (vies || '').toLowerCase();
  if (v === 'comprar') return { texto: 'Comprar', classe: 'good' };
  if (v === 'aguardar') return { texto: 'Aguardar', classe: 'warn' };
  return { texto: '—', classe: '' };
}
