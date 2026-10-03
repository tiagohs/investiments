/**
 * metas-card.js - 02/10/2026: pedaços da tela Metas e Objetivos que aparecem
 * em OUTRAS telas (Tiago: "algumas metas aparecem em outras telas, ex. meta de
 * renda passiva em Carteiras com link pro detalhe da meta"), mais os ícones e
 * formatos que a própria pages/metas.js usa.
 *
 * Pra ligar numa tela (ex. Carteiras):
 *
 *   import { carregarMetasParaCard, cardMetaRendaPassiva } from '../metas-card.js';
 *   const r = await carregarMetasParaCard(token);       // GET action=metas + contas
 *   if (r.ok && r.rendaPassiva) el.innerHTML = cardMetaRendaPassiva(r.rendaPassiva);
 *
 * carregarMetasParaCard já injeta assets/css/metas.css na página (o card usa
 * as classes .mt-*). Sem meta de renda passiva, `rendaPassiva` vem null - a
 * tela decide se mostra um convite ("Criar meta" -> urlMetas()).
 */

import { getMetas } from './api-client.js';
import { formatBRL } from './format.js';
import { resolveSiteRootUrl } from './shell.js';
import { calcularMeta, aparenciaMeta, rotuloMes, STATUS_META } from './pages/metas-calc.js';

/** Ícones (traço 1.8, viewBox 24) - um por tipo/categoria de meta. */
const ICONES = {
  renda: '<path d="M4 19h16"/><path d="M6 15l4-4 3 3 5-6"/><path d="M15 8h3v3"/>',
  escudo: '<path d="M12 3.5l7 2.6v5.2c0 4.3-2.9 7.9-7 9.2-4.1-1.3-7-4.9-7-9.2V6.1z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  ampulheta: '<path d="M7 3.5h10M7 20.5h10"/><path d="M8 3.5c0 4 8 5 8 8.5s-8 4.5-8 8.5M16 3.5c0 4-8 5-8 8.5s8 4.5 8 8.5"/>',
  aviao: '<path d="M10.5 13.5L4 11l1.3-1.6 6.4.7 4.6-5.2a1.8 1.8 0 0 1 2.6 2.6L13.7 12l.7 6.4L12.8 20l-2.3-6.5z"/>',
  mala: '<rect x="4" y="7.5" width="16" height="12" rx="2"/><path d="M9 7.5V5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5v2M9 11v5M15 11v5"/>',
  casa: '<path d="M4 11.5L12 4l8 7.5"/><path d="M6 10v9.5h12V10"/><path d="M10 19.5v-5h4v5"/>',
  carro: '<path d="M5 16.5V12l2-5h10l2 5v4.5"/><path d="M3.5 12h17v4.5h-17z"/><circle cx="7.5" cy="17.5" r="1.6"/><circle cx="16.5" cy="17.5" r="1.6"/>',
  alvo: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.3"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  obra: '<path d="M3.5 20h17"/><path d="M5 20V11l7-5 7 5v9"/><path d="M9.5 20v-5h5v5"/><path d="M4 8.5L12 3l8 5.5"/>',
  livro: '<path d="M4.5 5.5A2 2 0 0 1 6.5 4H19v13H6.5a2 2 0 0 0-2 2z"/><path d="M4.5 19A2 2 0 0 0 6.5 21H19v-4"/><path d="M8.5 8h6"/>',
  chip: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/><path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3"/>',
  loja: '<path d="M4 9.5L5.5 4.5h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 11.5v8h13v-8"/><path d="M10 19.5v-4.5h4v4.5"/>',
  estrela: '<path d="M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z"/>',
  pata: '<circle cx="7" cy="10" r="1.8"/><circle cx="10.5" cy="6.5" r="1.8"/><circle cx="14.5" cy="6.5" r="1.8"/><circle cx="18" cy="10" r="1.8"/><path d="M12.5 12c-2.6 0-5 3-5 5.2 0 1.6 1.3 2.3 2.7 2.3 1 0 1.6-.4 2.3-.4s1.3.4 2.3.4c1.4 0 2.7-.7 2.7-2.3 0-2.2-2.4-5.2-5-5.2z"/>',
  calendario: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/><path d="M8 14h3"/>',
  recibo: '<path d="M6 3.5h12v17l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2-2 1.2z"/><path d="M9 8.5h6M9 12h6M9 15.5h3.5"/>',
  coracao: '<path d="M12 19.5s-7.5-4.4-7.5-10A4 4 0 0 1 12 7.2a4 4 0 0 1 7.5 2.3c0 5.6-7.5 10-7.5 10z"/>',
  globo: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.7 5.3 3.7 8.5s-1.3 6.2-3.7 8.5c-2.4-2.3-3.7-5.3-3.7-8.5S9.6 5.8 12 3.5Z"/>',
  anel: '<circle cx="12" cy="14.5" r="5.5"/><path d="M9.5 4.5h5l1.5 2.5-4 2.5-4-2.5z"/>',
  barco: '<path d="M3.5 17.5c1.5 1.5 3 1.5 4.3 0 1.4 1.5 2.9 1.5 4.2 0 1.4 1.5 2.9 1.5 4.3 0 1.3 1.5 2.8 1.5 4.2 0"/><path d="M5 15l-1-3h16l-2 3"/><path d="M11.5 12V4l5.5 6h-5.5"/>',
};

/** <svg> do ícone de uma meta (chave de aparenciaMeta().icone). */
export function iconeMetaSvg(chave, { tamanho = 18 } = {}) {
  const corpo = ICONES[chave] || ICONES.alvo;
  return `<svg viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${corpo}</svg>`;
}

/** Bolinha colorida com o ícone (cor = token do tipo: acoes, fiis, rf, usa, bad). */
export function seloMetaHtml(meta, { tamanho = 38 } = {}) {
  const ap = aparenciaMeta(meta);
  return `<span class="mt-selo" style="--mt-cor:var(--${ap.cor});--mt-cor-soft:var(--${ap.cor}-soft);width:${tamanho}px;height:${tamanho}px">${iconeMetaSvg(ap.icone, { tamanho: Math.round(tamanho * 0.5) })}</span>`;
}

export function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const FORMATADORES_MOEDA = new Map();
/** "€ 5.000,00" / "R$ 1.234,56" (qualquer moeda, em pt-BR). */
export function formatMoeda(valor, moeda = 'BRL', { casas = 2 } = {}) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return '—';
  if (moeda === 'BRL' && casas === 2) return formatBRL(valor);
  const chave = `${moeda}|${casas}`;
  if (!FORMATADORES_MOEDA.has(chave)) {
    FORMATADORES_MOEDA.set(chave, new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda, minimumFractionDigits: casas, maximumFractionDigits: casas }));
  }
  return FORMATADORES_MOEDA.get(chave).format(valor);
}

/** Valor com os centavos menores ("R$ 9.891<small>,81</small>"), como os heróis do site. */
export function valorGrandeHtml(valor, moeda = 'BRL') {
  const txt = formatMoeda(valor, moeda);
  const m = txt.match(/^(.*?)(,\d{2})(\D*)$/);
  return m ? `${escHtml(m[1])}<span class="mt-dec">${m[2]}</span>${escHtml(m[3])}` : escHtml(txt);
}

/** "37%" */
export function pct(fracao, casas = 0) {
  if (typeof fracao !== 'number' || !Number.isFinite(fracao)) return '—';
  return `${(fracao * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

export function statusPillHtml(status) {
  const s = STATUS_META[status] || STATUS_META['sem-prazo'];
  return `<span class="mt-status ${s.classe}">${s.rotulo}</span>`;
}

/** Endereço do detalhe de uma meta (funciona de qualquer pasta do site). */
export function urlMetas(id = '', { raizSite = resolveSiteRootUrl() } = {}) {
  return new URL(`metas.html${id ? `#meta=${encodeURIComponent(id)}` : ''}`, raizSite).href;
}

/** Põe assets/css/metas.css na página uma vez só (telas que não carregam a folha). */
export function garantirEstiloMetas(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || !doc.head) return;
  if (doc.querySelector('link[data-metas-css]') || [...doc.querySelectorAll('link[rel="stylesheet"]')].some((l) => /metas\.css(\?|$)/.test(l.getAttribute('href') || '') && !/distribuicoes-metas/.test(l.getAttribute('href') || ''))) return;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../css/metas.css', import.meta.url).href;
  link.setAttribute('data-metas-css', '');
  doc.head.appendChild(link);
}

/** Contexto de cálculo a partir da resposta do GET metas. */
export function contextoMetas(resposta) {
  return {
    ativos: resposta.ativos || [], cambio: resposta.cambio || {}, referencias: resposta.referencias || {},
    proventos12m: resposta.proventos12m || {}, hoje: resposta.hoje,
  };
}

/**
 * Busca as metas e já devolve cada uma com `calc` (metas-calc!calcularMeta).
 * `{ ok, metas, rendaPassiva, resposta }` - rendaPassiva = a meta de renda
 * passiva marcada "mostrar em Carteiras" (ou a 1ª de renda passiva).
 */
export async function carregarMetasParaCard(token, { getMetasImpl = getMetas, doc } = {}) {
  garantirEstiloMetas(doc);
  const resposta = await getMetasImpl(token);
  if (!resposta || !resposta.ok) return { ok: false, erro: resposta ? resposta.erro : 'sem resposta', metas: [], rendaPassiva: null };
  const ctx = contextoMetas(resposta);
  const metas = (resposta.metas || []).map((m) => ({ ...m, calc: calcularMeta(m, ctx) }));
  const rps = metas.filter((m) => m.tipo === 'rendaPassiva');
  return { ok: true, metas, rendaPassiva: rps.find((m) => m.exibirNaCarteira) || rps[0] || null, resposta };
}

/**
 * Card da meta de renda passiva (pra Carteiras). `meta` vem de
 * carregarMetasParaCard (com `calc`). Devolve HTML (string vazia se não dá).
 */
export function cardMetaRendaPassiva(meta, { raizSite } = {}) {
  if (!meta || !meta.calc || !meta.calc.renda) return '';
  const c = meta.calc;
  const r = c.renda;
  const p = Math.max(0, Math.min(1, r.percentual || 0));
  const url = urlMetas(meta.id, raizSite ? { raizSite } : undefined);
  const falta = Math.max(0, (r.alvo || 0) - (r.atual || 0));
  return `<article class="mt-card-rp" aria-label="Meta de renda passiva">
  <header class="mt-card-rp-cab">
    ${seloMetaHtml(meta, { tamanho: 32 })}
    <div class="mt-card-rp-tit"><span class="mt-eyebrow">Meta de renda passiva</span><strong>${escHtml(meta.nome)}</strong></div>
    ${statusPillHtml(c.status)}
  </header>
  <div class="mt-card-rp-numeros">
    <div><span class="mt-rot">Renda média (12 meses)</span><span class="mt-num">${valorGrandeHtml(r.atual)}<small>/mês</small></span></div>
    <div class="mt-dir"><span class="mt-rot">Meta</span><span class="mt-num mt-num-sm">${formatMoeda(r.alvo)}<small>/mês</small></span></div>
  </div>
  <div class="mt-barra ${p >= 1 ? 'good' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p * 100)}"><span style="width:${(p * 100).toFixed(1)}%"></span></div>
  <p class="mt-card-rp-sub"><b>${pct(r.percentual)}</b> da meta${falta > 0 ? ` · faltam <b>${formatMoeda(falta)}</b>/mês` : ''}${c.alvoBRL ? ` · patrimônio necessário <b>${formatMoeda(c.alvoBRL, 'BRL', { casas: 0 })}</b>` : ''}${c.dataAlvo ? ` até ${rotuloMes(c.dataAlvo)}` : ''}</p>
  <a class="mt-card-rp-link" href="${escHtml(url)}">Ver meta <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></a>
</article>`;
}
