/**
 * carteiras-renda-fixa.js — subpágina Carteiras > Renda Fixa
 * (action=carteirasRendaFixa, ver
 * apps-script/CarteirasRendaFixa.gs!montarCarteirasRendaFixa_). Formato
 * de resposta é parecido com as 3 classes de renda variável (resumo +
 * distribuição + ativos), mas cada ativo tem campos bem diferentes
 * (indexador/vencimento/rentabilidade contratada/IR) — por isso não usa
 * o mesmo molde de colunas das outras 3, mas reaproveita os mesmos
 * blocos genéricos de carteiras-classe-comum.js (resumo/donut/tabela).
 */

import { getCarteirasRendaFixa } from '../api-client.js';
import { formatBRL, formatPercentFromFraction } from '../format.js';
import { mountRefreshControl } from '../shell.js';
import { lerCacheCarteiras, gravarCacheCarteiras } from '../carteiras-cache.js';
import {
  renderResumoClasseCarteiras,
  renderBenchmarksClasseCarteiras,
  renderDistribuicaoGrupoCarteiras,
  renderTabelaAtivosCarteiras,
} from './carteiras-classe-comum.js';

const CHAVE_CACHE_RENDA_FIXA = 'carteiras_renda_fixa_v1';

const COLUNAS_ATIVOS_RENDA_FIXA = [
  {
    label: 'Título', formatar: (a) => {
      const nome = a.nomePersonalizado || a.tipoInvestimento || a.codigo || '—';
      const carteiraPill = a.tipoCarteira === 'emergencial'
        ? '<span class="status-pill warn">Reserva de emergência</span>'
        : '<span class="status-pill" style="background:var(--surface-3);color:var(--ink-muted)">Longo prazo</span>';
      return `<b>${nome}</b>${a.instituicao ? `<span class="cc-ativo-nome">${a.instituicao}</span>` : ''}${carteiraPill}`;
    },
  },
  { label: 'Indexador', formatar: (a) => a.indexador || '—' },
  { label: 'Vencimento', alinhar: 'right', formatar: (a) => a.vencimento || '—' },
  { label: 'Total investido', alinhar: 'right', formatar: (a) => formatBRL(a.totalInvestido) },
  { label: 'Total atualizado', alinhar: 'right', formatar: (a) => formatBRL(a.totalAtualizado) },
  {
    label: 'Rentabilidade contratada', formatar: (a) => a.rentabilidadeContratada?.texto || '—',
  },
  {
    label: 'IR se resgatasse hoje', alinhar: 'right', formatar: (a) => {
      const ir = a.irSeResgatasseHoje;
      if (!ir || typeof ir.valorLiquidoSeResgatasseHoje !== 'number') return '—';
      return `${formatBRL(ir.valorLiquidoSeResgatasseHoje)}<span class="cc-sub">líquido${typeof ir.impostoSeResgatasseHoje === 'number' ? ` · IR ${formatBRL(ir.impostoSeResgatasseHoje)}` : ''}</span>`;
    },
  },
];

function desenhar(doc, dados) {
  const conteudoEl = doc.getElementById('rendaFixaConteudo');
  conteudoEl.innerHTML = `
    <div class="area-header"><h2>Renda Fixa</h2><span class="hint">longo prazo + reserva de emergência</span></div>
    <div id="rendaFixaResumo"></div>
    <div id="rendaFixaBenchmarks" class="cc-benchmarks"></div>
    <div class="cc-layout-donut-tabela">
      <div class="cc-donut-card">
        <div class="area-header" style="margin-top:0"><h2>Por indexador</h2></div>
        <div id="rendaFixaDistribuicao"></div>
      </div>
      <div class="cc-tabela-card">
        <div class="area-header" style="margin-top:0"><h2>Posições</h2><span class="hint">${dados.resumo.quantidadeAtivos} ${dados.resumo.quantidadeAtivos === 1 ? 'posição' : 'posições'}</span></div>
        <div id="rendaFixaTabela"></div>
      </div>
    </div>
  `;

  renderResumoClasseCarteiras(doc, doc.getElementById('rendaFixaResumo'), dados.resumo, { corToken: '--rf' });
  renderBenchmarksClasseCarteiras(doc, doc.getElementById('rendaFixaBenchmarks'), [
    { label: 'CDI (a.a.)', valor: formatPercentFromFraction(dados.benchmarks?.cdi) },
    { label: 'Selic (a.a.)', valor: formatPercentFromFraction(dados.benchmarks?.selic) },
    { label: 'IPCA (12m)', valor: formatPercentFromFraction(dados.benchmarks?.ipca) },
  ]);
  renderDistribuicaoGrupoCarteiras(doc, doc.getElementById('rendaFixaDistribuicao'), dados.distribuicaoPorIndexador);
  renderTabelaAtivosCarteiras(doc, doc.getElementById('rendaFixaTabela'), dados.ativos, COLUNAS_ATIVOS_RENDA_FIXA);
}

export async function montarPaginaCarteirasRendaFixa(token, { doc = document, getCarteirasRendaFixaImpl = getCarteirasRendaFixa } = {}) {
  const loadingEl = doc.getElementById('rendaFixaLoading');
  const erroEl = doc.getElementById('rendaFixaErro');
  const conteudoEl = doc.getElementById('rendaFixaConteudo');
  const refreshControlEl = doc.getElementById('refreshControlRendaFixa');

  const cache = lerCacheCarteiras(CHAVE_CACHE_RENDA_FIXA);
  if (cache) {
    desenhar(doc, cache);
    loadingEl.hidden = true;
    conteudoEl.hidden = false;
  }

  async function carregarERedesenhar() {
    const resposta = await getCarteirasRendaFixaImpl(token);
    loadingEl.hidden = true;

    if (!resposta.ok) {
      erroEl.hidden = false;
      erroEl.textContent = `Não deu pra carregar Renda Fixa agora (${resposta.etapa || '?'}): ${resposta.erro || 'erro desconhecido'}.`;
      return;
    }

    erroEl.hidden = true;
    conteudoEl.hidden = false;
    desenhar(doc, resposta.carteira);
    gravarCacheCarteiras(CHAVE_CACHE_RENDA_FIXA, resposta.carteira);
  }

  await carregarERedesenhar();
  mountRefreshControl(doc, refreshControlEl, carregarERedesenhar).marcarAtualizado();
}
