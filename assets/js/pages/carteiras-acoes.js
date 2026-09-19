/**
 * carteiras-acoes.js — subpágina Carteiras > Ações (action=carteirasAcoes,
 * ver apps-script/CarteirasClasses.gs!montarCarteirasAcoes_).
 */

import { getCarteirasAcoes } from '../api-client.js';
import { formatBRL, formatPercentFromFraction, formatPercentFromPoints, formatNumeroBR } from '../format.js';
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
  logoAtivoHtml,
  notaAtivoHtml,
  statusVies,
} from './carteiras-classe-comum.js';

const CHAVE_CACHE_ACOES = 'carteiras_acoes_v1';

const COLUNAS_ATIVOS_ACOES = [
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
    ajuda: 'Preço médio pago por ação, ponderado por todas as compras feitas.',
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
    ajuda: 'Dividend Yield: proventos pagos nos últimos 12 meses dividido pelo preço atual da ação.',
    formatar: (a) => {
      const cor = typeof a.dyPercentual === 'number' ? (a.dyPercentual >= 0 ? 'good' : 'bad') : '';
      const pct = typeof a.dyPercentual === 'number' ? `<span class="cc-sub ${cor}">${formatPercentFromFraction(a.dyPercentual)}</span>` : '';
      return `${formatBRL(a.dyValor)}${pct}`;
    },
  },
  {
    label: 'P/L', campo: 'pl', ordenarPor: (a) => a.pl,
    ajuda: 'Preço/Lucro: preço da ação dividido pelo lucro por ação dos últimos 12 meses — quantos anos de lucro pagam o preço atual.',
    formatar: (a) => (typeof a.pl === 'number' ? formatNumeroBR(a.pl, 2) : '—'),
  },
  {
    label: 'P/VP', campo: 'pvp', ordenarPor: (a) => a.pvp,
    ajuda: 'Preço/Valor Patrimonial: preço da ação dividido pelo valor patrimonial por ação — compara o preço de mercado com o valor contábil.',
    formatar: (a) => (typeof a.pvp === 'number' ? formatNumeroBR(a.pvp, 2) : '—'),
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

/** Linha de totais no rodapé (19/09/2026 #2 - "você não trouxe os
 * totais") - somada a partir da lista efetivamente exibida (não de
 * dados.resumo direto), pra continuar batendo quando a busca filtra a
 * tabela (19/09/2026 #3) - sem filtro nenhum dá exatamente igual ao
 * resumo, já que é a mesma soma. colspan cobre todas as colunas menos
 * as 2 últimas (Total/Lucro). */
function montarLinhaTotalAtivos_(ativosExibidos) {
  const somaAtualizado = ativosExibidos.reduce((s, a) => s + (a.totalAtualizado || 0), 0);
  const somaComprado = ativosExibidos.reduce((s, a) => s + (a.totalComprado || 0), 0);
  const somaLucro = somaAtualizado - somaComprado;
  const percLucro = somaComprado ? somaLucro / somaComprado : 0;
  const corLucro = somaLucro >= 0 ? 'good' : 'bad';
  const qtd = ativosExibidos.length;
  return `<tr>
    <td colspan="${COLUNAS_ATIVOS_ACOES.length - 2}">Total (${qtd} ${qtd === 1 ? 'ativo' : 'ativos'})</td>
    <td>${formatBRL(somaAtualizado)}<span class="cc-sub">de ${formatNumeroBR(somaComprado, 2)}</span></td>
    <td><span class="${corLucro}">${formatBRL(somaLucro)}</span><span class="cc-sub ${corLucro}">${formatPercentFromFraction(percLucro)}</span></td>
  </tr>`;
}

function desenhar(doc, dados) {
  const conteudoEl = doc.getElementById('acoesConteudo');
  conteudoEl.innerHTML = `
    <div class="area-header"><h2>Ações</h2><span class="hint">renda variável nacional</span></div>
    <div id="acoesResumo"></div>
    <div id="acoesBenchmarks" class="cc-benchmarks"></div>
    <div class="cc-layout-donut-tabela">
      <div class="cc-donut-card">
        <div class="area-header" style="margin-top:0"><h2>Por setor</h2></div>
        <div id="acoesDistribuicao"></div>
      </div>
      <div class="cc-tabela-card">
        <div class="area-header" style="margin-top:0"><h2>Ativos</h2><span class="hint">${dados.resumo.quantidadeAtivos} ${dados.resumo.quantidadeAtivos === 1 ? 'ativo' : 'ativos'}</span></div>
        <div id="acoesFiltros"></div>
        <div id="acoesTabela"></div>
      </div>
    </div>
  `;

  // Tooltips "i" (cabeçalho, nota de ativo, legenda do donut) - ligado
  // 1x no container estável (19/09/2026 #4, ver
  // wirePointerTooltipCarteiras_ em carteiras-classe-comum.js).
  wirePointerTooltipCarteiras_(doc, conteudoEl);

  renderResumoClasseCarteiras(doc, doc.getElementById('acoesResumo'), dados.resumo, {
    corToken: '--acoes',
    extras: [{ label: 'Proventos recebidos', valor: formatBRL(dados.resumo.proventosTotais) }],
  });
  const ibovespaVar = dados.benchmarks?.ibovespa;
  renderBenchmarksClasseCarteiras(doc, doc.getElementById('acoesBenchmarks'), [
    { label: 'Ibovespa hoje', valor: typeof ibovespaVar === 'number' ? formatPercentFromPoints(ibovespaVar) : '—', cor: typeof ibovespaVar === 'number' ? (ibovespaVar >= 0 ? 'good' : 'bad') : undefined },
    { label: 'CDI (a.a.)', valor: formatPercentFromFraction(dados.benchmarks?.cdi) },
  ]);
  renderDistribuicaoGrupoCarteiras(doc, doc.getElementById('acoesDistribuicao'), dados.distribuicaoPorGrupo);

  const totalCarteira = dados.resumo.totalAtualizado || 0;
  const ativosBase = (dados.ativos || []).map((a) => ({
    ...a,
    percentualCarteira: totalCarteira ? (a.totalAtualizado || 0) / totalCarteira : 0,
  }));

  // Ordenação (clique no cabeçalho) e busca (ticker/nome) são estado
  // local deste desenho - resetam a cada carregamento/atualização de
  // página, igual ao padrão já usado no Radar de oportunidades
  // (distribuicoes-metas.js) - 19/09/2026 #3.
  let ordenacao = null;
  let busca = '';

  function renderizarTabela() {
    const exibidos = filtrarAtivosPorBusca(ativosBase, busca);
    renderTabelaAtivosCarteiras(doc, doc.getElementById('acoesTabela'), exibidos, COLUNAS_ATIVOS_ACOES, {
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

  renderFiltrosTabelaCarteiras(doc, doc.getElementById('acoesFiltros'), {
    busca,
    onBuscar: (valor) => { busca = valor; renderizarTabela(); },
  });
  renderizarTabela();
}

export async function montarPaginaCarteirasAcoes(token, { doc = document, getCarteirasAcoesImpl = getCarteirasAcoes } = {}) {
  const loadingEl = doc.getElementById('acoesLoading');
  const erroEl = doc.getElementById('acoesErro');
  const conteudoEl = doc.getElementById('acoesConteudo');
  const refreshControlEl = doc.getElementById('refreshControlAcoes');

  const cache = lerCacheCarteiras(CHAVE_CACHE_ACOES);
  if (cache) {
    desenhar(doc, cache);
    loadingEl.hidden = true;
    conteudoEl.hidden = false;
  }

  async function carregarERedesenhar() {
    const resposta = await getCarteirasAcoesImpl(token);
    loadingEl.hidden = true;

    if (!resposta.ok) {
      erroEl.hidden = false;
      erroEl.textContent = `Não deu pra carregar Ações agora (${resposta.etapa || '?'}): ${resposta.erro || 'erro desconhecido'}.`;
      return;
    }

    erroEl.hidden = true;
    conteudoEl.hidden = false;
    desenhar(doc, resposta.carteira);
    gravarCacheCarteiras(CHAVE_CACHE_ACOES, resposta.carteira);
  }

  await carregarERedesenhar();
  mountRefreshControl(doc, refreshControlEl, carregarERedesenhar).marcarAtualizado();
}
