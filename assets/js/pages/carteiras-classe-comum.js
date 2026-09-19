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

/** Chips de benchmark (ex.: "Ibovespa · 128.430" · "CDI · 13,4% a.a.") —
 * `itens` é `[{ label, valor }]`, já formatado pelo chamador (cada
 * classe tem sua própria mistura de índice/%/câmbio). */
export function renderBenchmarksClasseCarteiras(doc, container, itens) {
  if (!container) return;
  if (!itens || !itens.length) { container.innerHTML = ''; return; }
  container.innerHTML = itens.map((i) => `
    <span class="cc-benchmark-chip"><span class="cc-benchmark-label">${i.label}</span><b>${i.valor}</b></span>
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
 * Tabela de ativos genérica. `colunas` é `[{ label, formatar(ativo) =>
 * string HTML, alinhar?: 'right' }]` — cada page module monta as
 * colunas certas pra sua classe (ver carteiras-acoes.js/carteiras-fiis.js/
 * carteiras-acoes-eua.js/carteiras-renda-fixa.js). Ordenado por Total
 * atualizado (maior primeiro) sempre que o campo existir - mesma
 * hierarquia visual da Home consolidada (maior posição primeiro).
 */
export function renderTabelaAtivosCarteiras(doc, container, ativos, colunas, { campoOrdenacao = 'totalAtualizado' } = {}) {
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
