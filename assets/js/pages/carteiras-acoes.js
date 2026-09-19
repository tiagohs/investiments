/**
 * carteiras-acoes.js — subpágina Carteiras > Ações (action=carteirasAcoes,
 * ver apps-script/CarteirasClasses.gs!montarCarteirasAcoes_).
 */

import { getCarteirasAcoes } from '../api-client.js';
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

const CHAVE_CACHE_ACOES = 'carteiras_acoes_v1';

const COLUNAS_ATIVOS_ACOES = [
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
  { label: 'Total atualizado', alinhar: 'right', formatar: (a) => formatBRL(a.totalAtualizado) },
  {
    label: 'Lucro / Prejuízo', alinhar: 'right', formatar: (a) => {
      const cor = a.lucroPrejuizo >= 0 ? 'good' : 'bad';
      return `<span class="${cor}">${formatBRL(a.lucroPrejuizo)}</span><span class="cc-sub ${cor}">${formatPercentFromFraction(a.percentualLucroPrejuizo)}</span>`;
    },
  },
];

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
        <div id="acoesTabela"></div>
      </div>
    </div>
  `;

  renderResumoClasseCarteiras(doc, doc.getElementById('acoesResumo'), dados.resumo, {
    corToken: '--acoes',
    extras: [{ label: 'Proventos recebidos', valor: formatBRL(dados.resumo.proventosTotais) }],
  });
  renderBenchmarksClasseCarteiras(doc, doc.getElementById('acoesBenchmarks'), [
    { label: 'Ibovespa hoje', valor: formatNumeroBR(dados.benchmarks?.ibovespa, 0) },
    { label: 'CDI (a.a.)', valor: formatPercentFromFraction(dados.benchmarks?.cdi) },
  ]);
  renderDistribuicaoGrupoCarteiras(doc, doc.getElementById('acoesDistribuicao'), dados.distribuicaoPorGrupo);
  renderTabelaAtivosCarteiras(doc, doc.getElementById('acoesTabela'), dados.ativos, COLUNAS_ATIVOS_ACOES);
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
