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
  logoAtivoHtml,
  statusVies,
} from './carteiras-classe-comum.js';

const CHAVE_CACHE_ACOES = 'carteiras_acoes_v1';

const COLUNAS_ATIVOS_ACOES = [
  {
    label: 'Ativo', formatar: (a) => {
      const nomeGrupo = [a.nome, a.grupo].filter(Boolean).join(' · ');
      return `<div class="cc-ativo-cel">${logoAtivoHtml(a.ticker)}<div><b>${a.ticker}</b>${nomeGrupo ? `<span class="cc-ativo-nome">${nomeGrupo}</span>` : ''}</div></div>`;
    },
  },
  {
    label: 'Preço / dia', alinhar: 'right', formatar: (a) => {
      const cor = typeof a.variacaoDia === 'number' ? (a.variacaoDia >= 0 ? 'good' : 'bad') : '';
      return `${formatBRL(a.precoAtual)}${typeof a.variacaoDia === 'number' ? `<span class="cc-sub ${cor}">${formatPercentFromFraction(a.variacaoDia)}</span>` : ''}`;
    },
  },
  { label: 'Qtd', alinhar: 'right', formatar: (a) => formatNumeroBR(a.quantidade, 0) },
  { label: 'Pr. médio', alinhar: 'right', formatar: (a) => formatBRL(a.precoMedio) },
  {
    label: 'Status', formatar: (a) => {
      const status = statusVies(a.vies);
      const badge = status.classe ? `<span class="status-pill ${status.classe}">${status.texto}</span>` : (status.texto || '—');
      const teto = typeof a.precoTeto === 'number' ? `<span class="cc-sub">teto ${formatBRL(a.precoTeto)}</span>` : '';
      return `${badge}${teto}`;
    },
  },
  {
    label: 'DY', alinhar: 'right', formatar: (a) => {
      const cor = typeof a.dyPercentual === 'number' ? (a.dyPercentual >= 0 ? 'good' : 'bad') : '';
      const pct = typeof a.dyPercentual === 'number' ? `<span class="cc-sub ${cor}">${formatPercentFromFraction(a.dyPercentual)}</span>` : '';
      return `${formatBRL(a.dyValor)}${pct}`;
    },
  },
  { label: 'P/L', alinhar: 'right', formatar: (a) => (typeof a.pl === 'number' ? formatNumeroBR(a.pl, 2) : '—') },
  { label: 'P/VP', alinhar: 'right', formatar: (a) => (typeof a.pvp === 'number' ? formatNumeroBR(a.pvp, 2) : '—') },
  { label: '% cart.', alinhar: 'right', formatar: (a) => formatPercentFromFraction(a.percentualCarteira, 1) },
  {
    label: 'Total', alinhar: 'right', formatar: (a) => `${formatBRL(a.totalAtualizado)}<span class="cc-sub">de ${formatNumeroBR(a.totalComprado, 2)}</span>`,
  },
  {
    label: 'Lucro / Prejuízo', alinhar: 'right', formatar: (a) => {
      const cor = a.lucroPrejuizo >= 0 ? 'good' : 'bad';
      return `<span class="${cor}">${formatBRL(a.lucroPrejuizo)}</span><span class="cc-sub ${cor}">${formatPercentFromFraction(a.percentualLucroPrejuizo)}</span>`;
    },
  },
];

/** Linha de totais no rodapé (19/09/2026 #2 - "você não trouxe os
 * totais") - colspan cobre todas as colunas menos as 2 últimas
 * (Total/Lucro), que mostram a soma vinda do resumo (já reflete a
 * carteira inteira, não só os ativos individuais listados). */
function montarLinhaTotalAtivos_(dados) {
  const resumo = dados.resumo;
  const qtd = dados.resumo.quantidadeAtivos;
  const corLucro = resumo.lucroPrejuizo >= 0 ? 'good' : 'bad';
  return `<tr>
    <td colspan="${COLUNAS_ATIVOS_ACOES.length - 2}">Total (${qtd} ${qtd === 1 ? 'ativo' : 'ativos'})</td>
    <td class="right">${formatBRL(resumo.totalAtualizado)}<span class="cc-sub">de ${formatNumeroBR(resumo.totalInvestido, 2)}</span></td>
    <td class="right"><span class="${corLucro}">${formatBRL(resumo.lucroPrejuizo)}</span><span class="cc-sub ${corLucro}">${formatPercentFromFraction(resumo.percentualLucroPrejuizo)}</span></td>
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
        <div id="acoesTabela"></div>
      </div>
    </div>
  `;

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
  const ativos = (dados.ativos || []).map((a) => ({
    ...a,
    percentualCarteira: totalCarteira ? (a.totalAtualizado || 0) / totalCarteira : 0,
  }));
  renderTabelaAtivosCarteiras(doc, doc.getElementById('acoesTabela'), ativos, COLUNAS_ATIVOS_ACOES, {
    linhaTotalHtml: montarLinhaTotalAtivos_(dados),
  });
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
