/**
 * carteiras-acoes-eua.js — subpágina Carteiras > Ações Internacionais
 * (action=carteirasAcoesEua, ver
 * apps-script/CarteirasClasses.gs!montarCarteirasAcoesEua_). Resumo e
 * ativos vêm nativamente em US$ (comentário no .gs) — página inteira
 * formata em dólar, sem conversão pra BRL (o card da Visão geral já
 * mostra o equivalente em R$ pra quem quiser esse resumo).
 */

import { getCarteirasAcoesEua } from '../api-client.js';
import { formatUSD, formatPercentFromFraction, formatNumeroBR } from '../format.js';
import { mountRefreshControl } from '../shell.js';
import { lerCacheCarteiras, gravarCacheCarteiras } from '../carteiras-cache.js';
import {
  renderBenchmarksClasseCarteiras,
  renderDistribuicaoGrupoCarteiras,
  renderTabelaAtivosCarteiras,
  statusVies,
} from './carteiras-classe-comum.js';

const CHAVE_CACHE_ACOES_EUA = 'carteiras_acoes_eua_v1';

const COLUNAS_ATIVOS_ACOES_EUA = [
  {
    label: 'Ativo', formatar: (a) => {
      const status = statusVies(a.vies);
      return `<b>${a.ticker}</b>${a.nome ? `<span class="cc-ativo-nome">${a.nome}</span>` : ''}${status.classe ? `<span class="status-pill ${status.classe}">${status.texto}</span>` : ''}`;
    },
  },
  {
    label: 'Preço atual', alinhar: 'right', formatar: (a) => {
      const cor = typeof a.variacaoDia === 'number' ? (a.variacaoDia >= 0 ? 'good' : 'bad') : '';
      return `${formatUSD(a.precoAtual)}${typeof a.variacaoDia === 'number' ? `<span class="cc-sub ${cor}">${formatPercentFromFraction(a.variacaoDia)}</span>` : ''}`;
    },
  },
  { label: 'Qtd', alinhar: 'right', formatar: (a) => formatNumeroBR(a.quantidade, 0) },
  { label: 'Preço médio', alinhar: 'right', formatar: (a) => formatUSD(a.precoMedio) },
  { label: 'P/VP', alinhar: 'right', formatar: (a) => (typeof a.pvp === 'number' ? `${formatNumeroBR(a.pvp, 2)}x` : '—') },
  { label: 'DY', alinhar: 'right', formatar: (a) => formatPercentFromFraction(a.dyPercentual) },
  { label: 'Total atualizado', alinhar: 'right', formatar: (a) => formatUSD(a.totalAtualizado) },
  {
    label: 'Lucro / Prejuízo', alinhar: 'right', formatar: (a) => {
      const cor = a.lucroPrejuizo >= 0 ? 'good' : 'bad';
      return `<span class="${cor}">${formatUSD(a.lucroPrejuizo)}</span><span class="cc-sub ${cor}">${formatPercentFromFraction(a.percentualLucroPrejuizo)}</span>`;
    },
  },
];

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
        <div id="acoesEuaTabela"></div>
      </div>
    </div>
  `;

  renderBenchmarksClasseCarteiras(doc, doc.getElementById('acoesEuaBenchmarks'), [
    { label: 'Dólar hoje', valor: typeof dados.benchmarks?.dolar === 'number' ? `R$ ${formatNumeroBR(dados.benchmarks.dolar, 2)}` : '—' },
    { label: 'Ibovespa hoje', valor: formatNumeroBR(dados.benchmarks?.ibovespa, 0) },
    { label: 'S&P 500 hoje', valor: formatNumeroBR(dados.benchmarks?.spx, 0) },
  ]);
  renderDistribuicaoGrupoCarteiras(doc, doc.getElementById('acoesEuaDistribuicao'), dados.distribuicaoPorGrupo);
  renderTabelaAtivosCarteiras(doc, doc.getElementById('acoesEuaTabela'), dados.ativos, COLUNAS_ATIVOS_ACOES_EUA);
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
