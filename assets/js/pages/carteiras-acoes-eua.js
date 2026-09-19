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

import { getCarteirasAcoesEua } from '../api-client.js';
import { formatBRL, formatUSD, formatComConversao, formatPercentFromFraction, formatNumeroBR, formatPercentFromPoints } from '../format.js';
import { mountRefreshControl } from '../shell.js';
import { lerCacheCarteiras, gravarCacheCarteiras } from '../carteiras-cache.js';
import {
  renderBenchmarksClasseCarteiras,
  renderDistribuicaoGrupoCarteiras,
  renderTabelaAtivosCarteiras,
  renderFiltrosTabelaCarteiras,
  filtrarAtivosPorBusca,
  logoAtivoHtml,
  notaAtivoHtml,
  botaoInfoHtml,
  statusVies,
} from './carteiras-classe-comum.js';

const CHAVE_CACHE_ACOES_EUA = 'carteiras_acoes_eua_v1';

/** "i" com o equivalente em reais de um valor em US$ (câmbio de hoje) -
 * usado nos valores menores da tabela (Pr. médio, teto), que no mockup
 * ganham só um botão de ajuda em vez do "(R\$ ...)" por extenso que os
 * valores grandes (Total/Lucro) usam via formatComConversao. '' quando
 * não há câmbio disponível (sem quebrar a tabela). */
function equivalenteBrlHtml_(valorUsd, cambio) {
  if (typeof valorUsd !== 'number' || typeof cambio !== 'number') return '';
  return botaoInfoHtml(`Equivalente em reais: ${formatBRL(valorUsd * cambio)} (câmbio de hoje).`, { pequeno: true });
}

function montarColunas_(cambio) {
  return [
    {
      label: 'Ativo', campo: 'ticker', ordenarPor: (a) => a.ticker, formatar: (a) => {
        const nomeGrupo = [a.nome, a.grupo].filter(Boolean).join(' · ');
        return `<div class="cc-ativo-cel">${logoAtivoHtml(a.ticker)}<div><b>${notaAtivoHtml(a.ticker)}${a.ticker}</b>${nomeGrupo ? `<span class="cc-ativo-nome">${nomeGrupo}</span>` : ''}</div></div>`;
      },
    },
    {
      label: 'Preço / dia', alinhar: 'right', campo: 'precoAtual', ordenarPor: (a) => a.precoAtual, formatar: (a) => {
        const cor = typeof a.variacaoDia === 'number' ? (a.variacaoDia >= 0 ? 'good' : 'bad') : '';
        return `${formatUSD(a.precoAtual)}${typeof a.variacaoDia === 'number' ? `<span class="cc-sub ${cor}">${formatPercentFromFraction(a.variacaoDia)}</span>` : ''}`;
      },
    },
    { label: 'Qtd', alinhar: 'right', campo: 'quantidade', ordenarPor: (a) => a.quantidade, formatar: (a) => formatNumeroBR(a.quantidade, 0) },
    {
      label: 'Pr. médio', alinhar: 'right', campo: 'precoMedio', ordenarPor: (a) => a.precoMedio,
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
      label: 'DY', alinhar: 'right', campo: 'dyPercentual', ordenarPor: (a) => a.dyPercentual,
      ajuda: 'Dividend Yield: proventos pagos nos últimos 12 meses dividido pelo preço atual da ação.',
      formatar: (a) => {
        const cor = typeof a.dyPercentual === 'number' ? (a.dyPercentual >= 0 ? 'good' : 'bad') : '';
        const pct = typeof a.dyPercentual === 'number' ? `<span class="cc-sub ${cor}">${formatPercentFromFraction(a.dyPercentual)}</span>` : '';
        return `${formatUSD(a.dyValor)}${pct}`;
      },
    },
    {
      label: 'P/VP', alinhar: 'right', campo: 'pvp', ordenarPor: (a) => a.pvp,
      ajuda: 'Preço/Valor Patrimonial: preço da ação dividido pelo valor patrimonial por ação.',
      formatar: (a) => (typeof a.pvp === 'number' ? formatNumeroBR(a.pvp, 2) : '—'),
    },
    { label: '% cart.', alinhar: 'right', campo: 'percentualCarteira', ordenarPor: (a) => a.percentualCarteira, formatar: (a) => formatPercentFromFraction(a.percentualCarteira, 1) },
    {
      label: 'Total', alinhar: 'right', campo: 'totalAtualizado', ordenarPor: (a) => a.totalAtualizado,
      formatar: (a) => {
        const principal = formatComConversao(a.totalAtualizado, typeof cambio === 'number' ? a.totalAtualizado * cambio : null, formatUSD);
        const investidoBrl = typeof cambio === 'number' ? a.totalComprado * cambio : null;
        return `${principal}<span class="cc-sub">de ${formatComConversao(a.totalComprado, investidoBrl, formatUSD)}</span>`;
      },
    },
    {
      label: 'Lucro / Prejuízo', alinhar: 'right', campo: 'lucroPrejuizo', ordenarPor: (a) => a.lucroPrejuizo,
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
    <td class="right">${totalHtml}<span class="cc-sub">de ${investidoHtml}</span></td>
    <td class="right"><span class="${corLucro}">${lucroHtml}</span><span class="cc-sub ${corLucro}">${formatPercentFromFraction(percLucro)}</span></td>
  </tr>`;
}

function desenhar(doc, dados) {
  const conteudoEl = doc.getElementById('acoesEuaConteudo');
  const lucroBom = dados.resumo.lucroPrejuizo >= 0;
  conteudoEl.innerHTML = `
    <div class="area-header"><h2>Ações Internacionais</h2><span class="hint">renda variável nos EUA — valores em US$</span></div>
    <div class="cc-tiles" style="--tile-accent:var(--usa)">
      <div class="cc-tile"><span class="cc-tile-label">Total investido</span><span class="cc-tile-valor">${formatUSD(dados.resumo.totalInvestido)}</span></div>
      <div class="cc-tile"><span class="cc-tile-label">Total atualizado</span><span class="cc-tile-valor">${formatUSD(dados.resumo.totalAtualizado)}</span></div>
      <div class="cc-tile ${lucroBom ? 'good' : 'bad'}"><span class="cc-tile-label">Lucro / Prejuízo</span><span class="cc-tile-valor">${formatUSD(dados.resumo.lucroPrejuizo)} <span class="cc-tile-sub ${lucroBom ? 'good' : 'bad'}">${formatPercentFromFraction(dados.resumo.percentualLucroPrejuizo)}</span></span></div>
      <div class="cc-tile"><span class="cc-tile-label">Ativos na carteira</span><span class="cc-tile-valor">${dados.resumo.quantidadeAtivos}</span></div>
    </div>
    <div id="acoesEuaBenchmarks" class="cc-benchmarks"></div>
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

  // 19/09/2026 #2 (correção do Tiago, fiel ao mockup): Ibovespa/S&P 500
  // em variação do dia (coloridos) - Dólar continua cotação (R$), sem
  // cor, não é "ganho/perda do dia".
  const ibovespaVar = dados.benchmarks?.ibovespa;
  const spxVar = dados.benchmarks?.spx;
  const cambio = dados.benchmarks?.dolar;
  renderBenchmarksClasseCarteiras(doc, doc.getElementById('acoesEuaBenchmarks'), [
    { label: 'Dólar hoje', valor: typeof cambio === 'number' ? `R$ ${formatNumeroBR(cambio, 2)}` : '—' },
    { label: 'Ibovespa hoje', valor: typeof ibovespaVar === 'number' ? formatPercentFromPoints(ibovespaVar) : '—', cor: typeof ibovespaVar === 'number' ? (ibovespaVar >= 0 ? 'good' : 'bad') : undefined },
    { label: 'S&P 500 hoje', valor: typeof spxVar === 'number' ? formatPercentFromPoints(spxVar) : '—', cor: typeof spxVar === 'number' ? (spxVar >= 0 ? 'good' : 'bad') : undefined },
  ]);
  renderDistribuicaoGrupoCarteiras(doc, doc.getElementById('acoesEuaDistribuicao'), dados.distribuicaoPorGrupo);

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
}

export async function montarPaginaCarteirasAcoesEua(token, { doc = document, getCarteirasAcoesEuaImpl = getCarteirasAcoesEua } = {}) {
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
    const resposta = await getCarteirasAcoesEuaImpl(token);
    loadingEl.hidden = true;

    if (!resposta.ok) {
      erroEl.hidden = false;
      erroEl.textContent = `Não deu pra carregar Ações Internacionais agora (${resposta.etapa || '?'}): ${resposta.erro || 'erro desconhecido'}.`;
      return;
    }

    erroEl.hidden = true;
    conteudoEl.hidden = false;
    desenhar(doc, resposta.carteira);
    gravarCacheCarteiras(CHAVE_CACHE_ACOES_EUA, resposta.carteira);
  }

  await carregarERedesenhar();
  mountRefreshControl(doc, refreshControlEl, carregarERedesenhar).marcarAtualizado();
}
