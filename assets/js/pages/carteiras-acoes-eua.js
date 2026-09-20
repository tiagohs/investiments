/**
 * carteiras-acoes-eua.js — subpágina Carteiras > Ações Internacionais
 * (action=carteirasAcoesEua, ver
 * apps-script/CarteirasClasses.gs!montarCarteirasAcoesEua_). Resumo e
 * ativos vêm nativamente em US$ (comentário no .gs) — página inteira
 * formata em dólar, com o equivalente em R$ do lado (formatComConversao,
 * câmbio de hoje vindo de dados.benchmarks.dolar) nos valores grandes
 * (Total/Lucro), e um botão "i" com o equivalente nos valores menores
 * (Pr. médio/teto) — mesma distinção do mockup (19/09/2026 #3, pedido
 * do Tiago: "lembre-se dos valores em dólar e reais na tabela EUA").
 */

import { getCarteirasAcoesEua, getHome } from '../api-client.js';
import { formatUSD, formatComConversao, formatPercentFromFraction, formatNumeroBR, formatPercentFromPoints } from '../format.js';
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
  equivalenteBrlHtml_,
  statusVies,
  contarVies_,
} from './carteiras-classe-comum.js';

const CHAVE_CACHE_ACOES_EUA = 'carteiras_acoes_eua_v1';

function montarColunas_(cambio) {
  return [
    {
      label: 'Ativo', campo: 'ticker', ordenarPor: (a) => a.ticker, alinharEsquerda: true, formatar: (a) => {
        const nomeGrupo = [a.nome, a.grupo].filter(Boolean).join(' · ');
        return `<div class="cc-ativo-cel">${logoAtivoHtml(a.ticker)}<div><b>${notaAtivoHtml(a.ticker)}${a.ticker}</b>${nomeGrupo ? `<span class="cc-ativo-nome">${nomeGrupo}</span>` : ''}</div></div>`;
      },
    },
    {
      // 19/09/2026 #6 (pedido do Tiago, print da coluna sem conversão nenhuma:
      // "inclua o i com a conversao em reais (coluna preço/dia)") - mesmo
      // padrão de equivalenteBrlHtml_ já usado em Pr. médio/teto logo abaixo.
      label: 'Preço / dia', campo: 'precoAtual', ordenarPor: (a) => a.precoAtual, formatar: (a) => {
        const cor = typeof a.variacaoDia === 'number' ? (a.variacaoDia >= 0 ? 'good' : 'bad') : '';
        return `${formatUSD(a.precoAtual)}${equivalenteBrlHtml_(a.precoAtual, cambio)}${typeof a.variacaoDia === 'number' ? `<span class="cc-sub ${cor}">${formatPercentFromFraction(a.variacaoDia)}</span>` : ''}`;
      },
    },
    { label: 'Qtd', campo: 'quantidade', ordenarPor: (a) => a.quantidade, formatar: (a) => formatNumeroBR(a.quantidade, 0) },
    {
      label: 'Pr. médio', campo: 'precoMedio', ordenarPor: (a) => a.precoMedio,
      formatar: (a) => `${formatUSD(a.precoMedio)}${equivalenteBrlHtml_(a.precoMedio, cambio)}`,
    },
    {
      label: 'Status', campo: 'vies', ordenarPor: (a) => statusVies(a.vies).texto,
      ajuda: 'Compara o preço atual com o preço-teto definido por você: abaixo do teto = Comprar, acima = Aguardar.',
      formatar: (a) => {
        const status = statusVies(a.vies);
        const badge = status.classe ? `<span class="status-pill ${status.classe}">${status.texto}</span>` : (status.texto || '—');
        const teto = typeof a.precoTeto === 'number' ? `<span class="cc-sub">teto ${formatUSD(a.precoTeto)}${equivalenteBrlHtml_(a.precoTeto, cambio)}</span>` : '';
        return `${badge}${teto}`;
      },
    },
    {
      label: 'DY', campo: 'dyPercentual', ordenarPor: (a) => a.dyPercentual,
      ajuda: 'Dividend Yield: proventos pagos nos últimos 12 meses dividido pelo preço atual da ação.',
      formatar: (a) => {
        const cor = typeof a.dyPercentual === 'number' ? (a.dyPercentual >= 0 ? 'good' : 'bad') : '';
        const pct = typeof a.dyPercentual === 'number' ? `<span class="cc-sub ${cor}">${formatPercentFromFraction(a.dyPercentual)}</span>` : '';
        return `${formatUSD(a.dyValor)}${pct}`;
      },
    },
    {
      label: 'P/VP', campo: 'pvp', ordenarPor: (a) => a.pvp,
      ajuda: 'Preço/Valor Patrimonial: preço da ação dividido pelo valor patrimonial por ação.',
      formatar: (a) => (typeof a.pvp === 'number' ? formatNumeroBR(a.pvp, 2) : '—'),
    },
    { label: '% cart.', campo: 'percentualCarteira', ordenarPor: (a) => a.percentualCarteira, formatar: (a) => formatPercentFromFraction(a.percentualCarteira, 1) },
    {
      label: 'Total', campo: 'totalAtualizado', ordenarPor: (a) => a.totalAtualizado,
      formatar: (a) => {
        const principal = formatComConversao(a.totalAtualizado, typeof cambio === 'number' ? a.totalAtualizado * cambio : null, formatUSD);
        const investidoBrl = typeof cambio === 'number' ? a.totalComprado * cambio : null;
        return `${principal}<span class="cc-sub">de ${formatComConversao(a.totalComprado, investidoBrl, formatUSD)}</span>`;
      },
    },
    {
      label: 'Lucro / Prejuízo', campo: 'lucroPrejuizo', ordenarPor: (a) => a.lucroPrejuizo,
      formatar: (a) => {
        const cor = a.lucroPrejuizo >= 0 ? 'good' : 'bad';
        const brl = typeof cambio === 'number' ? a.lucroPrejuizo * cambio : null;
        return `<span class="${cor}">${formatComConversao(a.lucroPrejuizo, brl, formatUSD)}</span><span class="cc-sub ${cor}">${formatPercentFromFraction(a.percentualLucroPrejuizo)}</span>`;
      },
    },
  ];
}

/** Linha de totais no rodapé - somada a partir da lista efetivamente
 * exibida (não do resumo direto), pra continuar batendo quando a busca
 * filtra a tabela (mesmo padrão de carteiras-acoes.js/carteiras-fiis.js,
 * 19/09/2026 #3). */
function montarLinhaTotalAtivos_(ativosExibidos, colunas, cambio) {
  const somaAtualizado = ativosExibidos.reduce((s, a) => s + (a.totalAtualizado || 0), 0);
  const somaComprado = ativosExibidos.reduce((s, a) => s + (a.totalComprado || 0), 0);
  const somaLucro = somaAtualizado - somaComprado;
  const percLucro = somaComprado ? somaLucro / somaComprado : 0;
  const corLucro = somaLucro >= 0 ? 'good' : 'bad';
  const qtd = ativosExibidos.length;
  const totalHtml = formatComConversao(somaAtualizado, typeof cambio === 'number' ? somaAtualizado * cambio : null, formatUSD);
  const investidoHtml = formatComConversao(somaComprado, typeof cambio === 'number' ? somaComprado * cambio : null, formatUSD);
  const lucroHtml = formatComConversao(somaLucro, typeof cambio === 'number' ? somaLucro * cambio : null, formatUSD);
  return `<tr>
    <td colspan="${colunas.length - 2}">Total (${qtd} ${qtd === 1 ? 'ativo' : 'ativos'})</td>
    <td data-label="Total atualizado">${totalHtml}<span class="cc-sub">de ${investidoHtml}</span></td>
    <td data-label="Lucro / Prejuízo"><span class="${corLucro}">${lucroHtml}</span><span class="cc-sub ${corLucro}">${formatPercentFromFraction(percLucro)}</span></td>
  </tr>`;
}

/** Filtro de período + os 2 gráficos (Rentabilidade acumulada/Evolução
 * do patrimônio) - ver o comentário grande no equivalente de
 * carteiras-acoes.js (mesmo motivo/posição no HTML, cópia deliberada).
 * Os 2 gráficos ficam em R$ (o histórico diário de "acoesEua" já soma o
 * valor da carteira convertido pra reais dia a dia, HistoricoInicio.gs -
 * mesmo padrão do resumo em destaque, que mostra US$ como valor
 * principal com o "i" de conversão do lado, não os 2 gráficos que
 * comparam evolução no tempo). */
function montarBlocoGraficosHtml_() {
  return `
    <div class="area-header" style="margin-top:22px"><h2>Rentabilidade acumulada</h2></div>
    <div class="filter-tabs" id="acoesEuaPeriodoTabs" style="margin-bottom:12px">
      <button class="filter-tab" type="button" data-periodo="30d">30 dias</button>
      <button class="filter-tab" type="button" data-periodo="6m">6 meses</button>
      <button class="filter-tab active" type="button" data-periodo="12m">12 meses</button>
      <button class="filter-tab" type="button" data-periodo="3a">3 anos</button>
      <button class="filter-tab" type="button" data-periodo="tudo">Desde o início</button>
    </div>
    <div class="cg-chart-card">
      <div id="acoesEuaRentabChart"></div>
      <div class="chart-legend2" id="acoesEuaRentabLegenda"></div>
    </div>

    <div class="area-header" style="margin-top:22px"><h2>Evolução do patrimônio</h2></div>
    <div class="cg-chart-card">
      <div id="acoesEuaEvolucaoChart"></div>
      <div class="chart-legend2" id="acoesEuaEvolucaoLegenda"></div>
    </div>
  `;
}

function desenhar(doc, dados) {
  const conteudoEl = doc.getElementById('acoesEuaConteudo');
  conteudoEl.innerHTML = `
    <div class="area-header"><h2>Ações Internacionais</h2><span class="hint">renda variável nos EUA — valores em US$</span></div>
    <div id="acoesEuaResumo"></div>
    <div id="acoesEuaBenchmarks" class="cc-benchmarks"></div>
    ${montarBlocoGraficosHtml_()}
    <div class="cc-layout-donut-tabela">
      <div class="cc-donut-card">
        <div class="area-header" style="margin-top:0"><h2>Por setor</h2></div>
        <div id="acoesEuaDistribuicao"></div>
      </div>
      <div class="cc-tabela-card">
        <div class="area-header" style="margin-top:0"><h2>Ativos</h2><span class="hint">${dados.resumo.quantidadeAtivos} ${dados.resumo.quantidadeAtivos === 1 ? 'ativo' : 'ativos'}</span></div>
        <div id="acoesEuaFiltros"></div>
        <div id="acoesEuaTabela"></div>
      </div>
    </div>
  `;

  // Tooltips "i" (cabeçalho, nota de ativo, equivalente em R$, legenda do
  // donut) - ligado 1x no container estável (19/09/2026 #4, ver
  // wirePointerTooltipCarteiras_ em carteiras-classe-comum.js).
  wirePointerTooltipCarteiras_(doc, conteudoEl);

  // Câmbio de hoje (USD->BRL) - precisa vir antes do resumo porque
  // 19/09/2026 #6 (pedido do Tiago: "coloque um i com a conversao
  // nesses tres valores em dolar") também usa pra desenhar o "i" com o
  // equivalente em reais no Total atualizado/Investido/Lucro-Prejuízo.
  const cambio = dados.benchmarks?.dolar;

  // Resumo em destaque, igual Ações/FIIs - mas em US$ (formatarValor:
  // formatUSD), sem "Proventos recebidos" (Ações EUA não traz esse dado
  // separado do back-end, 19/09/2026 #4). `cambio` acrescenta o "i" com
  // o equivalente em reais nos 3 valores em dólar (19/09/2026 #6).
  renderResumoClasseCarteiras(doc, doc.getElementById('acoesEuaResumo'), dados.resumo, {
    corToken: '--usa',
    formatarValor: formatUSD,
    vies: contarVies_(dados.ativos),
    cambio,
  });

  // 19/09/2026 #2 (correção do Tiago, fiel ao mockup): Ibovespa/S&P 500
  // em variação do dia (coloridos) - Dólar continua cotação (R$), sem
  // cor, não é "ganho/perda do dia".
  const ibovespaVar = dados.benchmarks?.ibovespa;
  const spxVar = dados.benchmarks?.spx;
  renderBenchmarksClasseCarteiras(doc, doc.getElementById('acoesEuaBenchmarks'), [
    { label: 'Dólar hoje', valor: typeof cambio === 'number' ? `R$ ${formatNumeroBR(cambio, 2)}` : '—' },
    { label: 'Ibovespa hoje', valor: typeof ibovespaVar === 'number' ? formatPercentFromPoints(ibovespaVar) : '—', cor: typeof ibovespaVar === 'number' ? (ibovespaVar >= 0 ? 'good' : 'bad') : undefined },
    { label: 'S&P 500 hoje', valor: typeof spxVar === 'number' ? formatPercentFromPoints(spxVar) : '—', cor: typeof spxVar === 'number' ? (spxVar >= 0 ? 'good' : 'bad') : undefined },
  ]);
  // 19/09/2026 #6 (pedido do Tiago, print com "Financeiro/Bancário R$
  // 312,48" quando o valor real já era em US$ - bug de rótulo, não só
  // de preferência: "por default, mostra em dolar aqui, e no i, mantenha
  // a versao em reais") - `cambio` faz a legenda mostrar US$ (o valor
  // como ele já É) com o "i" trazendo o equivalente em reais.
  renderDistribuicaoGrupoCarteiras(doc, doc.getElementById('acoesEuaDistribuicao'), dados.distribuicaoPorGrupo, { cambio });

  const totalCarteira = dados.resumo.totalAtualizado || 0;
  const ativosBase = (dados.ativos || []).map((a) => ({
    ...a,
    percentualCarteira: totalCarteira ? (a.totalAtualizado || 0) / totalCarteira : 0,
  }));
  const colunas = montarColunas_(cambio);

  let ordenacao = null;
  let busca = '';

  function renderizarTabela() {
    const exibidos = filtrarAtivosPorBusca(ativosBase, busca);
    renderTabelaAtivosCarteiras(doc, doc.getElementById('acoesEuaTabela'), exibidos, colunas, {
      linhaTotalHtml: exibidos.length ? montarLinhaTotalAtivos_(exibidos, colunas, cambio) : '',
      ordenacao,
      onOrdenar: (campo) => {
        ordenacao = ordenacao && ordenacao.campo === campo
          ? { campo, direcao: ordenacao.direcao === 'asc' ? 'desc' : 'asc' }
          : { campo, direcao: 'asc' };
        renderizarTabela();
      },
    });
  }

  renderFiltrosTabelaCarteiras(doc, doc.getElementById('acoesEuaFiltros'), {
    busca,
    onBuscar: (valor) => { busca = valor; renderizarTabela(); },
  });
  renderizarTabela();

  if (dados.historico && dados.historico.length) {
    wireGraficosClasseCarteiras(doc, {
      historico: dados.historico,
      periodoTabsContainer: doc.getElementById('acoesEuaPeriodoTabs'),
      paineis: [{
        visaoId: 'carteiraAcoesEua',
        rentabChartContainer: doc.getElementById('acoesEuaRentabChart'),
        rentabLegendaContainer: doc.getElementById('acoesEuaRentabLegenda'),
        evolucaoChartContainer: doc.getElementById('acoesEuaEvolucaoChart'),
        evolucaoLegendaContainer: doc.getElementById('acoesEuaEvolucaoLegenda'),
        corToken: '--usa',
      }],
    });
  } else {
    const semHistoricoHtml = '<p class="hint">Não deu pra carregar os gráficos agora - o resto da página continua normal.</p>';
    doc.getElementById('acoesEuaRentabChart').innerHTML = semHistoricoHtml;
    doc.getElementById('acoesEuaEvolucaoChart').innerHTML = semHistoricoHtml;
  }
}

export async function montarPaginaCarteirasAcoesEua(token, { doc = document, getCarteirasAcoesEuaImpl = getCarteirasAcoesEua, getHomeImpl = getHome } = {}) {
  const loadingEl = doc.getElementById('acoesEuaLoading');
  const erroEl = doc.getElementById('acoesEuaErro');
  const conteudoEl = doc.getElementById('acoesEuaConteudo');
  const refreshControlEl = doc.getElementById('refreshControlAcoesEua');

  const cache = lerCacheCarteiras(CHAVE_CACHE_ACOES_EUA);
  if (cache) {
    desenhar(doc, cache);
    loadingEl.hidden = true;
    conteudoEl.hidden = false;
  }

  async function carregarERedesenhar() {
    const [resposta, respostaHome] = await Promise.all([getCarteirasAcoesEuaImpl(token), getHomeImpl(token)]);
    loadingEl.hidden = true;

    if (!resposta.ok) {
      erroEl.hidden = false;
      erroEl.textContent = `Não deu pra carregar Ações Internacionais agora (${resposta.etapa || '?'}): ${resposta.erro || 'erro desconhecido'}.`;
      return;
    }

    erroEl.hidden = true;
    conteudoEl.hidden = false;
    const dados = { ...resposta.carteira, historico: respostaHome.ok ? respostaHome.historico : null };
    desenhar(doc, dados);
    gravarCacheCarteiras(CHAVE_CACHE_ACOES_EUA, dados);
  }

  await carregarERedesenhar();
  mountRefreshControl(doc, refreshControlEl, carregarERedesenhar).marcarAtualizado();
}
