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

/** Botão redondo "i" com tooltip nativo (title) - mesmo padrão visual
 * do mockup, usado tanto no cabeçalho das colunas (explicar o que é
 * DY/P-L/P-VP/Status) quanto dentro de uma célula (ex.: equivalente em
 * R\$ de um valor em US$, ou uma observação sobre um ativo específico -
 * ver notaAtivoHtml abaixo). `pequeno` usa o tamanho reduzido que o
 * mockup usa dentro de célula (11px em vez de 12px). Sem texto, não
 * desenha nada (colunas sem ajuda não ganham botão à toa). */
export function botaoInfoHtml(texto, { pequeno = false } = {}) {
  if (!texto) return '';
  const classe = pequeno ? 'cc-th-info cc-th-info-sm' : 'cc-th-info';
  const escapado = String(texto).replace(/"/g, '&quot;');
  return ` <button type="button" class="${classe}" title="${escapado}">i</button>`;
}

/** Observações curtas por ticker específico (19/09/2026 #3, pedido do
 * Tiago: "AXIA15G é uma ação de subscrição, inclua um i na frente,
 * explique o que é"). Mapa fixo, não um padrão automático de sufixo de
 * ticker - o padrão do B3 pra direito/recibo de subscrição (normalmente
 * termina em 1/2/9/10 + uma letra de série) tem exceções demais pra
 * confiar cegamente (ações PNA/PNB, por ex., também podem terminar em
 * 5/6) - arriscaria rotular errado um ativo de verdade. Cresce
 * conforme o Tiago for confirmando outros tickers. */
const NOTAS_ATIVOS = {
  AXIA15G: 'Ação de subscrição: um direito que dá ao acionista a opção de comprar novas ações emitidas pela empresa num aumento de capital, geralmente por um preço menor que o de mercado. Não tem histórico de preço nem fundamentos (P/L, P/VP, DY) como uma ação normal — por isso essas colunas aparecem vazias para este ativo.',
};

/** "i" pequeno antes do ticker quando o ativo tem uma nota conhecida
 * (ver NOTAS_ATIVOS) - '' quando não tem (maioria dos ativos). */
export function notaAtivoHtml(ticker) {
  return botaoInfoHtml(NOTAS_ATIVOS[ticker], { pequeno: true });
}

/** Filtra ativos por ticker/nome (substring, sem diferenciar
 * maiúsculas/minúsculas) - usado pela caixa de busca das 3 subpáginas
 * de renda variável (19/09/2026 #3). Busca vazia devolve a lista
 * inteira sem cópia desnecessária. */
export function filtrarAtivosPorBusca(ativos, busca) {
  const termo = (busca || '').trim().toLowerCase();
  if (!termo) return ativos;
  return (ativos || []).filter((a) => (a.ticker || '').toLowerCase().includes(termo) || (a.nome || '').toLowerCase().includes(termo));
}

/**
 * Barra de busca (+ opcionalmente chips de filtro por grupo, hoje só
 * FIIs usa - "Todos"/"Papel (TVM)"/"Shopping"/etc., vindos dinamicamente
 * de distribuicaoPorGrupo, não hard-coded, pra não ficar errado se o
 * Tiago reclassificar um ativo) acima da tabela de Ativos, igual ao
 * mockup nas 3 subpáginas de renda variável (19/09/2026 #3). Renderiza
 * o HTML só 1x por desenho de página inteiro - re-renderizar a cada
 * tecla digitada tiraria o foco do <input> a cada letra - o page module
 * chama onBuscar/onFiltrarGrupo pra re-renderizar só a TABELA (ver
 * carteiras-fiis.js).
 */
export function renderFiltrosTabelaCarteiras(doc, container, { busca = '', onBuscar, grupos = null, filtroGrupo = null, onFiltrarGrupo } = {}) {
  if (!container) return;
  const chipsHtml = grupos ? `
    <div class="filter-tabs cc-filtro-chips">
      <button type="button" class="filter-tab${filtroGrupo === null ? ' active' : ''}" data-grupo="">Todos</button>
      ${grupos.map((g) => `<button type="button" class="filter-tab${filtroGrupo === g ? ' active' : ''}" data-grupo="${g}">${g}</button>`).join('')}
    </div>
  ` : '';
  container.innerHTML = `
    <div class="cc-filtros-linha">
      ${chipsHtml}
      <label class="cc-busca-caixa">
        <span class="cc-busca-icone" aria-hidden="true">🔍</span>
        <input type="search" class="cc-busca-input" placeholder="Buscar por ticker ou nome">
      </label>
    </div>
    <div class="hint cc-filtros-dica">${grupos ? 'O filtro por segmento também recalcula os totais no rodapé da tabela · ' : ''}Clique no título de uma coluna pra ordenar por ela</div>
  `;
  const inputEl = container.querySelector('.cc-busca-input');
  if (inputEl) {
    inputEl.value = busca;
    if (onBuscar) inputEl.addEventListener('input', (ev) => onBuscar(ev.target.value));
  }
  if (onFiltrarGrupo) {
    container.querySelectorAll('[data-grupo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('[data-grupo]').forEach((b) => b.classList.toggle('active', b === btn));
        onFiltrarGrupo(btn.dataset.grupo || null);
      });
    });
  }
}

/**
 * Tabela de ativos genérica. `colunas` é `[{ label, alinhar?, ajuda?,
 * campo?, ordenarPor?(ativo)=>valor bruto, formatar(ativo)=>string
 * HTML }]` — cada page module monta as colunas certas pra sua classe
 * (ver carteiras-acoes.js/carteiras-fiis.js/carteiras-acoes-eua.js/
 * carteiras-renda-fixa.js). `ajuda` vira um botão "i" com tooltip no
 * cabeçalho (19/09/2026 #3); `campo`+`ordenarPor` deixam a coluna
 * clicável pra ordenar (19/09/2026 #3, pedido do Tiago - "quero poder
 * ordenar clicando no título de cada coluna") - sem `ordenarPor` a
 * coluna não vira clicável. Sem uma ordenação ativa (ou ordenacao=null),
 * cai no padrão de sempre: Total atualizado desc (maior posição
 * primeiro, mesma hierarquia da Home consolidada).
 *
 * `linhaTotalHtml` (opcional) - 1 <tr> pronto (o chamador já sabe quantas
 * colunas tem e quais das últimas são Total/Lucro, então monta o
 * colspan+valores certos sozinho - ver montarLinhaTotalAtivos_ em
 * carteiras-acoes.js) - some quando null/vazio (tabela filtrada por
 * busca com 0 resultado, por ex., não faz sentido mostrar total ali).
 */
export function renderTabelaAtivosCarteiras(doc, container, ativos, colunas, { linhaTotalHtml = '', ordenacao = null, onOrdenar = null } = {}) {
  if (!container) return;
  if (!ativos || !ativos.length) {
    container.innerHTML = '<p class="hint">Nenhum ativo encontrado nesta carteira.</p>';
    return;
  }

  const colunaAtiva = ordenacao ? colunas.find((c) => c.campo === ordenacao.campo && typeof c.ordenarPor === 'function') : null;
  const lista = [...ativos].sort((a, b) => {
    if (colunaAtiva) {
      const va = colunaAtiva.ordenarPor(a);
      const vb = colunaAtiva.ordenarPor(b);
      const cmp = (typeof va === 'string' || typeof vb === 'string')
        ? String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR')
        : (va ?? -Infinity) - (vb ?? -Infinity);
      return ordenacao.direcao === 'asc' ? cmp : -cmp;
    }
    return (b.totalAtualizado || 0) - (a.totalAtualizado || 0);
  });

  const cabecalho = colunas.map((c) => {
    const ordenavel = typeof c.ordenarPor === 'function';
    const ativa = ordenavel && ordenacao && ordenacao.campo === c.campo;
    const classes = [c.alinhar === 'right' ? 'right' : '', ordenavel ? 'cc-th-ordenavel' : ''].filter(Boolean).join(' ');
    const seta = ativa ? ` <span class="cc-th-seta">${ordenacao.direcao === 'asc' ? '▲' : '▼'}</span>` : '';
    const ajuda = c.ajuda ? botaoInfoHtml(c.ajuda) : '';
    return `<th${classes ? ` class="${classes}"` : ''}${ordenavel ? ` data-campo="${c.campo}"` : ''}>${c.label}${ajuda}${seta}</th>`;
  }).join('');
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

  if (onOrdenar) {
    container.querySelectorAll('.cc-th-ordenavel').forEach((th) => {
      th.addEventListener('click', () => onOrdenar(th.dataset.campo));
    });
  }
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
