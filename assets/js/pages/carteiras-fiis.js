/**
 * carteiras-fiis.js — subpágina Carteiras > FIIs (action=carteirasFiis,
 * ver apps-script/CarteirasClasses.gs!montarCarteirasFiis_). Mesmo
 * molde de carteiras-acoes.js — a diferença real é P/VP no lugar de
 * P/L (FIIs não tem P/L) e Patrimônio do fundo no lugar de %/P-L, além
 * dos chips de filtro por segmento (Papel/Shopping/etc.), que só FIIs
 * tem (19/09/2026 #3, fiel ao mockup + pedido do Tiago: "lembre-se dos
 * filtros dos FIIS por tipo").
 */

import { getCarteirasFiis, getHome } from '../api-client.js';
import { formatBRL, formatBRLCompacto, formatPercentFromFraction, formatPercentFromPoints, formatNumeroBR } from '../format.js';
import { mountRefreshControl } from '../shell.js';
import { lerCacheCarteiras, gravarCacheCarteiras } from '../carteiras-cache.js';
import {
  renderResumoClasseCarteiras,
  renderBenchmarksClasseCarteiras,
  renderDistribuicaoGrupoCarteiras,
  renderTabelaAtivosCarteiras,
  renderFiltrosTabelaCarteiras,
  filtrarAtivosPorBusca,
  wirePointerTooltipCarteiras_,
  wireGraficosClasseCarteiras,
  logoAtivoHtml,
  notaAtivoHtml,
  statusVies,
  contarVies_,
} from './carteiras-classe-comum.js';

const CHAVE_CACHE_FIIS = 'carteiras_fiis_v1';

const COLUNAS_ATIVOS_FIIS = [
  {
    label: 'Ativo', campo: 'ticker', ordenarPor: (a) => a.ticker, alinharEsquerda: true, formatar: (a) => {
      const nomeGrupo = [a.nome, a.grupo].filter(Boolean).join(' · ');
      return `<div class="cc-ativo-cel">${logoAtivoHtml(a.ticker)}<div><b>${notaAtivoHtml(a.ticker)}${a.ticker}</b>${nomeGrupo ? `<span class="cc-ativo-nome">${nomeGrupo}</span>` : ''}</div></div>`;
    },
  },
  {
    label: 'Preço / dia', campo: 'precoAtual', ordenarPor: (a) => a.precoAtual, formatar: (a) => {
      const cor = typeof a.variacaoDia === 'number' ? (a.variacaoDia >= 0 ? 'good' : 'bad') : '';
      return `${formatBRL(a.precoAtual)}${typeof a.variacaoDia === 'number' ? `<span class="cc-sub ${cor}">${formatPercentFromFraction(a.variacaoDia)}</span>` : ''}`;
    },
  },
  { label: 'Qtd', campo: 'quantidade', ordenarPor: (a) => a.quantidade, formatar: (a) => formatNumeroBR(a.quantidade, 0) },
  {
    label: 'Pr. médio', campo: 'precoMedio', ordenarPor: (a) => a.precoMedio,
    ajuda: 'Preço médio pago por cota, ponderado por todas as compras feitas.',
    formatar: (a) => formatBRL(a.precoMedio),
  },
  {
    label: 'Status', campo: 'vies', ordenarPor: (a) => statusVies(a.vies).texto,
    ajuda: 'Compara o preço atual com o preço-teto definido por você: abaixo do teto = Comprar, acima = Aguardar.',
    formatar: (a) => {
      const status = statusVies(a.vies);
      const badge = status.classe ? `<span class="status-pill ${status.classe}">${status.texto}</span>` : (status.texto || '—');
      const teto = typeof a.precoTeto === 'number' ? `<span class="cc-sub">teto ${formatBRL(a.precoTeto)}</span>` : '';
      return `${badge}${teto}`;
    },
  },
  {
    label: 'DY', campo: 'dyPercentual', ordenarPor: (a) => a.dyPercentual,
    ajuda: 'Dividend Yield: proventos pagos nos últimos 12 meses dividido pelo preço atual da cota.',
    formatar: (a) => {
      const cor = typeof a.dyPercentual === 'number' ? (a.dyPercentual >= 0 ? 'good' : 'bad') : '';
      const pct = typeof a.dyPercentual === 'number' ? `<span class="cc-sub ${cor}">${formatPercentFromFraction(a.dyPercentual)}</span>` : '';
      return `${formatBRL(a.dyValor)}${pct}`;
    },
  },
  {
    label: 'P/VP', campo: 'pvp', ordenarPor: (a) => a.pvp,
    ajuda: 'Preço/Valor Patrimonial: preço da cota dividido pelo valor patrimonial por cota do fundo.',
    formatar: (a) => (typeof a.pvp === 'number' ? formatNumeroBR(a.pvp, 2) : '—'),
  },
  {
    label: 'Patrim. fundo', campo: 'patrimonio', ordenarPor: (a) => a.patrimonio,
    formatar: (a) => (typeof a.patrimonio === 'number' ? formatBRLCompacto(a.patrimonio) : '—'),
  },
  { label: '% cart.', campo: 'percentualCarteira', ordenarPor: (a) => a.percentualCarteira, formatar: (a) => formatPercentFromFraction(a.percentualCarteira, 1) },
  {
    label: 'Total', campo: 'totalAtualizado', ordenarPor: (a) => a.totalAtualizado,
    formatar: (a) => `${formatBRL(a.totalAtualizado)}<span class="cc-sub">de ${formatNumeroBR(a.totalComprado, 2)}</span>`,
  },
  {
    label: 'Lucro / Prejuízo', campo: 'lucroPrejuizo', ordenarPor: (a) => a.lucroPrejuizo,
    formatar: (a) => {
      const cor = a.lucroPrejuizo >= 0 ? 'good' : 'bad';
      return `<span class="${cor}">${formatBRL(a.lucroPrejuizo)}</span><span class="cc-sub ${cor}">${formatPercentFromFraction(a.percentualLucroPrejuizo)}</span>`;
    },
  },
];

/** Linha de totais no rodapé - somada a partir da lista efetivamente
 * exibida (não de dados.resumo direto), pra continuar batendo com o
 * filtro de segmento OU a busca aplicados (19/09/2026 #3: "o filtro
 * por segmento também recalcula os totais no rodapé da tabela",
 * dica do próprio mockup). Sem filtro nenhum dá exatamente igual ao
 * resumo, já que é a mesma soma. */
function montarLinhaTotalAtivos_(ativosExibidos) {
  const somaAtualizado = ativosExibidos.reduce((s, a) => s + (a.totalAtualizado || 0), 0);
  const somaComprado = ativosExibidos.reduce((s, a) => s + (a.totalComprado || 0), 0);
  const somaLucro = somaAtualizado - somaComprado;
  const percLucro = somaComprado ? somaLucro / somaComprado : 0;
  const corLucro = somaLucro >= 0 ? 'good' : 'bad';
  const qtd = ativosExibidos.length;
  return `<tr>
    <td colspan="${COLUNAS_ATIVOS_FIIS.length - 2}">Total (${qtd} ${qtd === 1 ? 'ativo' : 'ativos'})</td>
    <td data-label="Total atualizado">${formatBRL(somaAtualizado)}<span class="cc-sub">de ${formatNumeroBR(somaComprado, 2)}</span></td>
    <td data-label="Lucro / Prejuízo"><span class="${corLucro}">${formatBRL(somaLucro)}</span><span class="cc-sub ${corLucro}">${formatPercentFromFraction(percLucro)}</span></td>
  </tr>`;
}

/** Filtro de período + os 2 gráficos (Rentabilidade acumulada/Evolução
 * do patrimônio) - ver o comentário grande no equivalente de
 * carteiras-acoes.js (mesmo motivo/posição no HTML, cópia deliberada). */
function montarBlocoGraficosHtml_() {
  return `
    <div class="area-header" style="margin-top:22px"><h2>Rentabilidade acumulada</h2></div>
    <div class="filter-tabs" id="fiisPeriodoTabs" style="margin-bottom:12px">
      <button class="filter-tab" type="button" data-periodo="30d">30 dias</button>
      <button class="filter-tab" type="button" data-periodo="6m">6 meses</button>
      <button class="filter-tab active" type="button" data-periodo="12m">12 meses</button>
      <button class="filter-tab" type="button" data-periodo="3a">3 anos</button>
      <button class="filter-tab" type="button" data-periodo="tudo">Desde o início</button>
    </div>
    <div class="cg-chart-card">
      <div id="fiisRentabChart"></div>
      <div class="chart-legend2" id="fiisRentabLegenda"></div>
    </div>

    <div class="area-header" style="margin-top:22px"><h2>Evolução do patrimônio</h2></div>
    <div class="cg-chart-card">
      <div id="fiisEvolucaoChart"></div>
      <div class="chart-legend2" id="fiisEvolucaoLegenda"></div>
    </div>
  `;
}

function desenhar(doc, dados) {
  const conteudoEl = doc.getElementById('fiisConteudo');
  conteudoEl.innerHTML = `
    <div class="area-header"><h2>FIIs</h2><span class="hint">fundos de investimento imobiliário</span></div>
    <div id="fiisResumo"></div>
    <div id="fiisBenchmarks" class="cc-benchmarks"></div>
    ${montarBlocoGraficosHtml_()}
    <div class="cc-layout-donut-tabela">
      <div class="cc-donut-card">
        <div class="area-header" style="margin-top:0"><h2>Por tipo</h2></div>
        <div id="fiisDistribuicao"></div>
      </div>
      <div class="cc-tabela-card">
        <div class="area-header" style="margin-top:0"><h2>Ativos</h2><span class="hint">${dados.resumo.quantidadeAtivos} ${dados.resumo.quantidadeAtivos === 1 ? 'ativo' : 'ativos'}</span></div>
        <div id="fiisFiltros"></div>
        <div id="fiisTabela"></div>
      </div>
    </div>
  `;

  // Tooltips "i" (cabeçalho, nota de ativo, legenda do donut) - ligado
  // 1x no container estável (19/09/2026 #4, ver
  // wirePointerTooltipCarteiras_ em carteiras-classe-comum.js).
  wirePointerTooltipCarteiras_(doc, conteudoEl);

  renderResumoClasseCarteiras(doc, doc.getElementById('fiisResumo'), dados.resumo, {
    corToken: '--fiis',
    extras: [{ label: 'Proventos recebidos', valor: formatBRL(dados.resumo.proventosTotais) }],
    vies: contarVies_(dados.ativos),
  });
  // 19/09/2026 #2 (pedido do Tiago - FIIs ganhou Ibovespa/CDI junto do
  // IFIX, igual às outras 3 subpáginas já tinham (só IFIX ficava
  // sozinho antes). IFIX/Ibovespa em variação do dia (coloridos), CDI
  // em fração a.a. (sem cor).
  const ifixVar = dados.benchmarks?.ifix;
  const ibovespaVar = dados.benchmarks?.ibovespa;
  renderBenchmarksClasseCarteiras(doc, doc.getElementById('fiisBenchmarks'), [
    { label: 'IFIX hoje', valor: typeof ifixVar === 'number' ? formatPercentFromPoints(ifixVar) : '—', cor: typeof ifixVar === 'number' ? (ifixVar >= 0 ? 'good' : 'bad') : undefined },
    { label: 'Ibovespa hoje', valor: typeof ibovespaVar === 'number' ? formatPercentFromPoints(ibovespaVar) : '—', cor: typeof ibovespaVar === 'number' ? (ibovespaVar >= 0 ? 'good' : 'bad') : undefined },
    { label: 'CDI (a.a.)', valor: formatPercentFromFraction(dados.benchmarks?.cdi) },
  ]);
  renderDistribuicaoGrupoCarteiras(doc, doc.getElementById('fiisDistribuicao'), dados.distribuicaoPorGrupo);

  const totalCarteira = dados.resumo.totalAtualizado || 0;
  const ativosBase = (dados.ativos || []).map((a) => ({
    ...a,
    percentualCarteira: totalCarteira ? (a.totalAtualizado || 0) / totalCarteira : 0,
  }));
  // Chips "Todos"/segmento vêm de distribuicaoPorGrupo (já ordenada por
  // totalAtualizado desc) - dinâmico, nunca hard-coded (se o Tiago
  // reclassificar um FII de segmento na planilha, os chips já
  // acompanham sem precisar mexer em código).
  const grupos = (dados.distribuicaoPorGrupo || []).map((d) => d.grupo);

  let ordenacao = null;
  let busca = '';
  let filtroGrupo = null;

  function renderizarTabela() {
    let exibidos = filtroGrupo ? ativosBase.filter((a) => a.grupo === filtroGrupo) : ativosBase;
    exibidos = filtrarAtivosPorBusca(exibidos, busca);
    renderTabelaAtivosCarteiras(doc, doc.getElementById('fiisTabela'), exibidos, COLUNAS_ATIVOS_FIIS, {
      linhaTotalHtml: exibidos.length ? montarLinhaTotalAtivos_(exibidos) : '',
      ordenacao,
      onOrdenar: (campo) => {
        ordenacao = ordenacao && ordenacao.campo === campo
          ? { campo, direcao: ordenacao.direcao === 'asc' ? 'desc' : 'asc' }
          : { campo, direcao: 'asc' };
        renderizarTabela();
      },
    });
  }

  renderFiltrosTabelaCarteiras(doc, doc.getElementById('fiisFiltros'), {
    busca,
    onBuscar: (valor) => { busca = valor; renderizarTabela(); },
    grupos,
    filtroGrupo,
    onFiltrarGrupo: (grupo) => { filtroGrupo = grupo; renderizarTabela(); },
  });
  renderizarTabela();

  if (dados.historico && dados.historico.length) {
    wireGraficosClasseCarteiras(doc, {
      historico: dados.historico,
      periodoTabsContainer: doc.getElementById('fiisPeriodoTabs'),
      paineis: [{
        visaoId: 'carteiraFiis',
        rentabChartContainer: doc.getElementById('fiisRentabChart'),
        rentabLegendaContainer: doc.getElementById('fiisRentabLegenda'),
        evolucaoChartContainer: doc.getElementById('fiisEvolucaoChart'),
        evolucaoLegendaContainer: doc.getElementById('fiisEvolucaoLegenda'),
        corToken: '--fiis',
      }],
    });
  } else {
    const semHistoricoHtml = '<p class="hint">Não deu pra carregar os gráficos agora - o resto da página continua normal.</p>';
    doc.getElementById('fiisRentabChart').innerHTML = semHistoricoHtml;
    doc.getElementById('fiisEvolucaoChart').innerHTML = semHistoricoHtml;
  }
}

export async function montarPaginaCarteirasFiis(token, { doc = document, getCarteirasFiisImpl = getCarteirasFiis, getHomeImpl = getHome } = {}) {
  const loadingEl = doc.getElementById('fiisLoading');
  const erroEl = doc.getElementById('fiisErro');
  const conteudoEl = doc.getElementById('fiisConteudo');
  const refreshControlEl = doc.getElementById('refreshControlFiis');

  const cache = lerCacheCarteiras(CHAVE_CACHE_FIIS);
  if (cache) {
    desenhar(doc, cache);
    loadingEl.hidden = true;
    conteudoEl.hidden = false;
  }

  async function carregarERedesenhar() {
    const [resposta, respostaHome] = await Promise.all([getCarteirasFiisImpl(token), getHomeImpl(token)]);
    loadingEl.hidden = true;

    if (!resposta.ok) {
      erroEl.hidden = false;
      erroEl.textContent = `Não deu pra carregar FIIs agora (${resposta.etapa || '?'}): ${resposta.erro || 'erro desconhecido'}.`;
      return;
    }

    erroEl.hidden = true;
    conteudoEl.hidden = false;
    const dados = { ...resposta.carteira, historico: respostaHome.ok ? respostaHome.historico : null };
    desenhar(doc, dados);
    gravarCacheCarteiras(CHAVE_CACHE_FIIS, dados);
  }

  await carregarERedesenhar();
  mountRefreshControl(doc, refreshControlEl, carregarERedesenhar).marcarAtualizado();
}
