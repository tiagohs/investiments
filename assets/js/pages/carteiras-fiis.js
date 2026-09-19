/**
 * carteiras-fiis.js — subpágina Carteiras > FIIs (action=carteirasFiis,
 * ver apps-script/CarteirasClasses.gs!montarCarteirasFiis_). Mesmo
 * molde de carteiras-acoes.js — a diferença real é P/VP no lugar de
 * P/L (FIIs não tem P/L) e 3 colunas extra só de FIIs (Liquidez
 * Diária, % em caixa) que Auxiliar_ativos não tem e vêm enriquecidas
 * direto de "Carteira FIIs" no back-end.
 */

import { getCarteirasFiis } from '../api-client.js';
import { formatBRL, formatPercentFromFraction, formatNumeroBR } from '../format.js';
import { mountRefreshControl } from '../shell.js';
import { lerCacheCarteiras, gravarCacheCarteiras } from '../carteiras-cache.js';
import {
  renderResumoClasseCarteiras,
  renderBenchmarksClasseCarteiras,
  renderDistribuicaoGrupoCarteiras,
  renderTabelaAtivosCarteiras,
  statusVies,
} from './carteiras-classe-comum.js';

const CHAVE_CACHE_FIIS = 'carteiras_fiis_v1';

const COLUNAS_ATIVOS_FIIS = [
  {
    label: 'Ativo', formatar: (a) => {
      const status = statusVies(a.vies);
      return `<b>${a.ticker}</b>${a.nome ? `<span class="cc-ativo-nome">${a.nome}</span>` : ''}${status.classe ? `<span class="status-pill ${status.classe}">${status.texto}</span>` : ''}`;
    },
  },
  {
    label: 'Preço atual', alinhar: 'right', formatar: (a) => {
      const cor = typeof a.variacaoDia === 'number' ? (a.variacaoDia >= 0 ? 'good' : 'bad') : '';
      return `${formatBRL(a.precoAtual)}${typeof a.variacaoDia === 'number' ? `<span class="cc-sub ${cor}">${formatPercentFromFraction(a.variacaoDia)}</span>` : ''}`;
    },
  },
  { label: 'Qtd', alinhar: 'right', formatar: (a) => formatNumeroBR(a.quantidade, 0) },
  { label: 'Preço médio', alinhar: 'right', formatar: (a) => formatBRL(a.precoMedio) },
  { label: 'Preço teto', alinhar: 'right', formatar: (a) => formatBRL(a.precoTeto) },
  { label: 'DY', alinhar: 'right', formatar: (a) => formatPercentFromFraction(a.dyPercentual) },
  {
    label: '% em caixa', alinhar: 'right',
    formatar: (a) => (typeof a.percentualEmCaixa === 'number' ? formatPercentFromFraction(a.percentualEmCaixa) : '—'),
  },
  { label: 'Total atualizado', alinhar: 'right', formatar: (a) => formatBRL(a.totalAtualizado) },
  {
    label: 'Lucro / Prejuízo', alinhar: 'right', formatar: (a) => {
      const cor = a.lucroPrejuizo >= 0 ? 'good' : 'bad';
      return `<span class="${cor}">${formatBRL(a.lucroPrejuizo)}</span><span class="cc-sub ${cor}">${formatPercentFromFraction(a.percentualLucroPrejuizo)}</span>`;
    },
  },
];

function desenhar(doc, dados) {
  const conteudoEl = doc.getElementById('fiisConteudo');
  conteudoEl.innerHTML = `
    <div class="area-header"><h2>FIIs</h2><span class="hint">fundos de investimento imobiliário</span></div>
    <div id="fiisResumo"></div>
    <div id="fiisBenchmarks" class="cc-benchmarks"></div>
    <div class="cc-layout-donut-tabela">
      <div class="cc-donut-card">
        <div class="area-header" style="margin-top:0"><h2>Por segmento</h2></div>
        <div id="fiisDistribuicao"></div>
      </div>
      <div class="cc-tabela-card">
        <div class="area-header" style="margin-top:0"><h2>Ativos</h2><span class="hint">${dados.resumo.quantidadeAtivos} ${dados.resumo.quantidadeAtivos === 1 ? 'ativo' : 'ativos'}</span></div>
        <div id="fiisTabela"></div>
      </div>
    </div>
  `;

  renderResumoClasseCarteiras(doc, doc.getElementById('fiisResumo'), dados.resumo, {
    corToken: '--fiis',
    extras: [{ label: 'Proventos recebidos', valor: formatBRL(dados.resumo.proventosTotais) }],
  });
  renderBenchmarksClasseCarteiras(doc, doc.getElementById('fiisBenchmarks'), [
    { label: 'IFIX hoje', valor: formatNumeroBR(dados.benchmarks?.ifix, 0) },
  ]);
  renderDistribuicaoGrupoCarteiras(doc, doc.getElementById('fiisDistribuicao'), dados.distribuicaoPorGrupo);
  renderTabelaAtivosCarteiras(doc, doc.getElementById('fiisTabela'), dados.ativos, COLUNAS_ATIVOS_FIIS);
}

export async function montarPaginaCarteirasFiis(token, { doc = document, getCarteirasFiisImpl = getCarteirasFiis } = {}) {
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
    const resposta = await getCarteirasFiisImpl(token);
    loadingEl.hidden = true;

    if (!resposta.ok) {
      erroEl.hidden = false;
      erroEl.textContent = `Não deu pra carregar FIIs agora (${resposta.etapa || '?'}): ${resposta.erro || 'erro desconhecido'}.`;
      return;
    }

    erroEl.hidden = true;
    conteudoEl.hidden = false;
    desenhar(doc, resposta.carteira);
    gravarCacheCarteiras(CHAVE_CACHE_FIIS, resposta.carteira);
  }

  await carregarERedesenhar();
  mountRefreshControl(doc, refreshControlEl, carregarERedesenhar).marcarAtualizado();
}
