/**
 * organizacao-ui.js - 06/10/2026 (Onda 3): peças de apresentação compartilhadas pelas abas da Organização Financeira
 * (cartão KPI do kit, ícone de info, barras da biblioteca de gráficos montadas a partir de atributos data-*).
 * Só apresentação: nenhuma conta, nenhum número novo.
 */
import { criarBarraProgresso, criarBarraComposicao } from '../charts/index.js';
import { esc } from '../util/html.js';

/** Ícone do sprite (#ico-<nome>) como string (os blocos desta tela são montados em HTML). */
export const icoHtml = (nome, classe = 'ico') => `<svg class="${classe}" aria-hidden="true"><use href="#ico-${nome}"/></svg>`;

/** "(i)" com a explicação no title (acessível: role=img + aria-label). */
export function infoHtml(texto) {
  if (!texto) return '';
  return `<span class="kpi-info" role="img" tabindex="0" title="${esc(texto)}" aria-label="${esc(texto)}">${icoHtml('info')}</span>`;
}

/**
 * Cartão KPI do kit (.card > .kpi). `classe` fica no <article> (os testes e o CSS da tela usam). `valorHtml` e `subHtml` já vêm
 * escapados; `extraHtml` = chip "era ...", barra de progresso etc.
 */
export function kpiHtml({ classe = '', rotulo, rotuloExtraHtml = '', info = '', valorHtml, extraHtml = '', subHtml = '' }) {
  return `<article class="card ${classe}"><div class="kpi">
    <div class="kpi-topo"><span class="kpi-rotulo">${esc(rotulo)}</span>${rotuloExtraHtml}${infoHtml(info)}</div>
    <div class="kpi-valor">${valorHtml}</div>${extraHtml}
    ${subHtml ? `<div class="kpi-sub">${subHtml}</div>` : ''}
  </div></article>`;
}

/** Tendência com ícone (nunca só cor). tom: 'sobe' | 'desce'. */
export const tendenciaHtml = (tom, texto, icone = tom === 'sobe' ? 'north-east' : 'south-east') => `<span class="tendencia ${tom}">${icoHtml(icone)}${texto}</span>`;

/** Chip tonal de estado (bom/ruim/aviso/info) com ícone. */
export const chipHtml = (tom, texto, icone) => `<span class="chip-tonal chip-${tom}">${icone ? icoHtml(icone) : ''}${texto}</span>`;

/**
 * Troca cada `[data-prog-valor]` de `raiz` pela barra de progresso da biblioteca (animada, com aria).
 * Atributos: data-prog-valor (0..1), data-prog-meta (0..1, marca), data-prog-cor ('up' | 'down' | número | 'var(--...)'), data-prog-rotulo.
 */
export function montarBarrasProgresso(raiz) {
  if (!raiz) return [];
  const feitas = [];
  raiz.querySelectorAll('[data-prog-valor]').forEach((el) => {
    const v = Number(el.dataset.progValor);
    const meta = el.dataset.progMeta != null && el.dataset.progMeta !== '' ? Number(el.dataset.progMeta) : undefined;
    const cor = el.dataset.progCor;
    feitas.push(criarBarraProgresso(el, {
      valor: Number.isFinite(v) ? v : 0, meta: Number.isFinite(meta) ? meta : undefined,
      cor: cor === undefined || cor === '' ? 1 : (Number.isFinite(Number(cor)) ? Number(cor) : cor), rotulo: el.dataset.progRotulo || 'Progresso',
    }));
    ['progValor', 'progMeta', 'progCor', 'progRotulo'].forEach((k) => delete el.dataset[k]);
  });
  return feitas;
}

/**
 * Faixa de composição da biblioteca (uma barra fatiada + legenda). `fatias` = [{ id, nome, valor, cor }].
 * Devolve o gráfico ({ atualizar, destruir }).
 */
export function montarComposicao(el, fatias, formatarValor) {
  return criarBarraComposicao(el, { fatias, formatarValor, legenda: false });
}

/**
 * Troca cada `[data-comp]` de `raiz` (JSON: [{ id, nome, valor, cor }]) pela barra de composição da biblioteca.
 * `data-comp-fmt="brl0"` não é necessário: o título de cada fatia usa o `formatarValor` recebido.
 */
export function montarComposicoes(raiz, formatarValor) {
  if (!raiz) return [];
  const feitas = [];
  raiz.querySelectorAll('[data-comp]').forEach((el) => {
    let fatias = null;
    try { fatias = JSON.parse(el.dataset.comp); } catch (e) { fatias = null; }
    el.removeAttribute('data-comp');
    if (!Array.isArray(fatias) || !fatias.length) return;
    feitas.push(criarBarraComposicao(el, { fatias, formatarValor, legenda: false }));
  });
  return feitas;
}

/** Atributo data-comp (JSON escapado) para o marcador de uma barra de composição. */
export const compAttr = (fatias) => `data-comp="${esc(JSON.stringify(fatias.map((f) => ({ id: f.id, nome: f.nome, valor: f.valor, cor: f.cor }))))}"`;

/**
 * 06/10/2026 (Onda 3, A-59/A-64): seções recolhíveis. Cada `seletor` filho de `raiz` com um `cabecalho` direto vira
 * <details><summary>cabeçalho</summary><div class="og-rec-corpo">resto</div></details> DENTRO da própria seção (a seção, os ids e os
 * `hidden` continuam os mesmos). No celular (<= 760px) só as `abertasNoCelular` primeiras ficam abertas; no desktop tudo aberto.
 * Sem matchMedia (testes jsdom) fica tudo aberto. Chame uma vez depois de montar o esqueleto da tela.
 */
export function tornarRecolhiveis(raiz, { seletor, cabecalho, abertasNoCelular = 2, doc } = {}) {
  if (!raiz) return [];
  const d = doc || raiz.ownerDocument;
  const win = d && d.defaultView;
  let celular = false;
  try { celular = !!(win && typeof win.matchMedia === 'function' && win.matchMedia('(max-width: 760px)').matches); } catch (e) { celular = false; }
  const feitas = [];
  let n = 0;
  raiz.querySelectorAll(seletor).forEach((sec) => {
    if (sec.dataset.rec === '1') return;
    const cab = Array.from(sec.children).find((c) => c.matches(cabecalho));
    if (!cab) return;
    sec.dataset.rec = '1';
    const det = d.createElement('details');
    det.className = 'og-rec';
    det.open = !celular || n < abertasNoCelular;
    n += 1;
    const sum = d.createElement('summary');
    sum.className = 'og-rec-sum';
    const corpo = d.createElement('div');
    corpo.className = 'og-rec-corpo';
    Array.from(sec.childNodes).forEach((c) => { if (c !== cab) corpo.appendChild(c); });
    sum.appendChild(cab);
    det.append(sum, corpo);
    sec.appendChild(det);
    feitas.push(det);
  });
  return feitas;
}

/**
 * 06/10/2026 (Onda 3, A-59): como tornarRecolhiveis, mas pra um cartão cujo conteúdo é REDESENHADO (innerHTML) a cada edição:
 * chame depois de cada redesenho - se o <details> sumiu, ele é refeito (cabeçalho = `cabecalho`, filho direto do cartão) e o
 * aberto/fechado que a pessoa escolheu é lembrado em `memoria` (objeto do chamador). No celular começa fechado, salvo `abertoNoCelular`.
 */
export function recolherRedesenhavel(raiz, seletor, { cabecalho = '.lateral-cab', abertoNoCelular = false, memoria = null, doc } = {}) {
  const sec = raiz && raiz.querySelector(seletor);
  if (!sec || sec.querySelector(':scope > details.og-rec')) return null;
  delete sec.dataset.rec;
  const [det] = tornarRecolhiveis(raiz, { seletor, cabecalho, abertasNoCelular: abertoNoCelular ? 1 : 0, doc });
  if (!det) return null;
  if (memoria) {
    if (seletor in memoria) det.open = memoria[seletor];
    det.addEventListener('toggle', () => { memoria[seletor] = det.open; });
  }
  return det;
}
