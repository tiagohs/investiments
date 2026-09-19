/**
 * carteiras-classe-comum.js — pedaços de renderização compartilhados
 * pelas 4 subpáginas de classe de Carteiras (Ações/FIIs/Ações
 * Internacionais/Renda Fixa). As 4 têm o mesmo formato de resposta na
 * raiz (resumo/benchmarks + uma lista de ativos + uma distribuição por
 * grupo — ver apps-script/CarteirasClasses.gs e CarteirasRendaFixa.gs),
 * só o detalhe de CADA ativo muda de classe pra classe — por isso o
 * resumo/benchmarks/donut são genéricos aqui, e a tabela de ativos é
 * genérica também, parametrizada por uma lista de colunas que cada
 * page module (carteiras-acoes.js etc.) passa com seus próprios campos
 * e formatadores.
 */

import { formatBRL, formatPercentFromFraction } from '../format.js';
import { renderDistribuicao } from './inicio.js';
import { LOGOS_ATIVOS } from '../logos-ativos.js';
import { resolveSiteRootUrl } from '../shell.js';

/**
 * 4-5 "tiles" com os números do resumo (mesmo padrão visual de
 * .resumo-card, mas mais simples - sem distribuição interna). `extras`
 * é uma lista opcional de tiles a mais (ex.: Proventos totais, só nas
 * 3 classes de renda variável).
 */
export function renderResumoClasseCarteiras(doc, container, resumo, { corToken = '--acoes', extras = [] } = {}) {
  if (!container || !resumo) return;
  const lucroBom = resumo.lucroPrejuizo >= 0;
  const tiles = [
    { label: 'Total investido', valor: formatBRL(resumo.totalInvestido) },
    { label: 'Total atualizado', valor: formatBRL(resumo.totalAtualizado) },
    {
      label: 'Lucro / Prejuízo',
      valor: `${formatBRL(resumo.lucroPrejuizo)} <span class="cc-tile-sub ${lucroBom ? 'good' : 'bad'}">${formatPercentFromFraction(resumo.percentualLucroPrejuizo)}</span>`,
      classe: lucroBom ? 'good' : 'bad',
    },
    { label: 'Ativos na carteira', valor: String(resumo.quantidadeAtivos) },
    ...extras,
  ];

  container.innerHTML = `
    <div class="cc-tiles" style="--tile-accent:var(${corToken})">
      ${tiles.map((t) => `
        <div class="cc-tile${t.classe ? ` ${t.classe}` : ''}">
          <span class="cc-tile-label">${t.label}</span>
          <span class="cc-tile-valor">${t.valor}</span>
        </div>
      `).join('')}
    </div>
  `;
}

/** Chips de benchmark (ex.: "Ibovespa hoje · +0,54%" · "CDI (a.a.) ·
 * 13,4%") — `itens` é `[{ label, valor, cor? }]`, já formatado pelo
 * chamador (cada classe tem sua própria mistura de índice/%/câmbio).
 * `cor` é opcional ('good'/'bad') - só pros índices que representam
 * variação do dia (Ibovespa/IFIX/S&P 500), igual ao mockup (verde/
 * vermelho); CDI/Selic/IPCA/Dólar são taxas/cotação de referência, sem
 * viés de alta/baixa, ficam sem cor (neutro). */
export function renderBenchmarksClasseCarteiras(doc, container, itens) {
  if (!container) return;
  if (!itens || !itens.length) { container.innerHTML = ''; return; }
  container.innerHTML = itens.map((i) => `
    <span class="cc-benchmark-chip"><span class="cc-benchmark-label">${i.label}</span><b${i.cor ? ` class="${i.cor}"` : ''}>${i.valor}</b></span>
  `).join('');
}

/** Donut "por grupo" (Setor/Segmento pra RV, Indexador pra Renda Fixa) —
 * reaproveita renderDistribuicao (inicio.js) sem cor fixa por fatia (a
 * própria função cicla pela paleta de fallback quando `cor` não vem). */
export function renderDistribuicaoGrupoCarteiras(doc, container, distribuicao) {
  if (!container) return;
  const fatias = (distribuicao || []).map((d) => ({ label: d.grupo, valor: d.totalAtualizado }));
  renderDistribuicao(doc, container, fatias);
}

/**
 * Logo redondo do ativo (LOGOS_ATIVOS, gerado por
 * scripts/gerar-logos-ativos.mjs a partir de assets/imgs/acoes|fiis/ que
 * o Tiago organizou por ticker) - mesmo padrão visual/fallback que a
 * grade "Radar de oportunidades" já usa
 * (distribuicoes-metas.js!criarLogoAtivo_), só que como HTML-string (as
 * tabelas de Carteiras montam a linha inteira via innerHTML, não
 * createElement) - a <img> tem onerror inline que remove ela mesma se a
 * imagem falhar, revelando o fallback de iniciais que já está por baixo
 * no HTML (não depende de religar listener depois de um re-render).
 * new URL(caminho, resolveSiteRootUrl()) resolve certo mesmo de dentro
 * de carteiras/index.html (1 nível mais fundo que a raiz do site - ver
 * o comentário de resolveSiteRootUrl em shell.js).
 */
export function logoAtivoHtml(ticker) {
  const iniciais = (ticker || '?').slice(0, 2).toUpperCase();
  const caminho = LOGOS_ATIVOS[ticker];
  if (!caminho) return `<span class="cc-logo cc-logo-fallback">${iniciais}</span>`;
  const url = new URL(caminho, resolveSiteRootUrl()).href;
  return `<span class="cc-logo"><img src="${url}" alt="" loading="lazy" onerror="this.remove()"><span class="cc-logo-fallback">${iniciais}</span></span>`;
}

/**
 * Tabela de ativos genérica. `colunas` é `[{ label, formatar(ativo) =>
 * string HTML, alinhar?: 'right' }]` — cada page module monta as
 * colunas certas pra sua classe (ver carteiras-acoes.js/carteiras-fiis.js/
 * carteiras-acoes-eua.js/carteiras-renda-fixa.js). Ordenado por Total
 * atualizado (maior primeiro) sempre que o campo existir - mesma
 * hierarquia visual da Home consolidada (maior posição primeiro).
 *
 * `linhaTotalHtml` (opcional) - 1 <tr> pronto (o chamador já sabe quantas
 * colunas tem e quais das últimas são Total/Lucro, então monta o
 * colspan+valores certos sozinho - ver montarLinhaTotalAtivos_ em
 * carteiras-acoes.js) - some quando null/vazio (tabela filtrada por
 * busca com 0 resultado, por ex., não faz sentido mostrar total ali).
 */
export function renderTabelaAtivosCarteiras(doc, container, ativos, colunas, { campoOrdenacao = 'totalAtualizado', linhaTotalHtml = '' } = {}) {
  if (!container) return;
  if (!ativos || !ativos.length) {
    container.innerHTML = '<p class="hint">Nenhum ativo encontrado nesta carteira.</p>';
    return;
  }
  const lista = [...ativos].sort((a, b) => (b[campoOrdenacao] || 0) - (a[campoOrdenacao] || 0));

  const cabecalho = colunas.map((c) => `<th${c.alinhar === 'right' ? ' class="right"' : ''}>${c.label}</th>`).join('');
  const linhas = lista.map((ativo) => {
    const celulas = colunas.map((c) => `<td${c.alinhar === 'right' ? ' class="right"' : ''}>${c.formatar(ativo)}</td>`).join('');
    return `<tr>${celulas}</tr>`;
  }).join('');

  container.innerHTML = `
    <div class="cc-tabela-wrap">
      <table class="cc-tabela">
        <thead><tr>${cabecalho}</tr></thead>
        <tbody>${linhas}</tbody>
        ${linhaTotalHtml ? `<tfoot>${linhaTotalHtml}</tfoot>` : ''}
      </table>
    </div>
  `;
}

/** "Comprar" (good) / "Aguardar" (warn) / sem dado (—) — Auxiliar_ativos
 * guarda o texto bruto (não normalizado como em MeusAtivos.gs), então
 * compara sem diferenciar maiúsculas. */
export function statusVies(vies) {
  const v = (vies || '').toLowerCase();
  if (v === 'comprar') return { texto: 'Comprar', classe: 'good' };
  if (v === 'aguardar') return { texto: 'Aguardar', classe: 'warn' };
  return { texto: '—', classe: '' };
}
