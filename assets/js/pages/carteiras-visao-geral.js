/**
 * carteiras-visao-geral.js — página "Visão geral" de Carteiras (a Home
 * consolidada, primeira aba da sidebar). Junta 2 chamadas em paralelo:
 *   - getCarteirasHome() (action=carteirasHome, CarteirasHome.gs) -> os
 *     4 cards de classe + patrimonioTotal.
 *   - getHome() (action=home, Home.gs) -> reaproveitado só pelos campos
 *     patrimonio/historico (índices/câmbio/ativos daquela resposta não
 *     são usados aqui) - os gráficos de Rentabilidade/Evolução desta
 *     tela usam a MESMA série "total" que a Início já usa, decisão
 *     registrada no cabeçalho de CarteirasHome.gs ("confirmado com o
 *     Tiago que dá pra reaproveitar, sem precisar de rota nova").
 *
 * Reaproveita 3 funções já testadas de inicio.js (renderDistribuicao,
 * renderInfoRentabilidade, renderGraficoRentabilidade/
 * wireGraficoRentabilidade com visaoId:'total') em vez de duplicar
 * gráfico - só o gráfico "Evolução do patrimônio" (valor absoluto em
 * R$, não existe em Início) é novo, escrito aqui.
 */

import { getCarteirasHome, getHome } from '../api-client.js';
import { formatBRL, formatDateBR } from '../format.js';
import { mountRefreshControl } from '../shell.js';
import { lerCacheCarteiras, gravarCacheCarteiras } from '../carteiras-cache.js';
import { atualizarBadgesSideNav } from '../carteiras-sidebar.js';
import {
  renderDistribuicao,
  renderInfoRentabilidade,
  wireGraficoRentabilidade,
  filtrarHistoricoPorPeriodo,
} from './inicio.js';

const CHAVE_CACHE_VISAO_GERAL = 'carteiras_visao_geral_v1';

const CORES_CARD = {
  'Ações': '--acoes',
  'FIIs': '--fiis',
  'Ações Internacionais': '--usa',
  'Renda Fixa': '--rf',
};

const COMPACTO_BRL = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

// ============================================================================
// Gráfico "Evolução do patrimônio" — único gráfico novo desta página (os
// outros 2 blocos visuais reaproveitam inicio.js). Linha única (valor de
// mercado da carteira, campo `patrimonio` de HistoricoInicio.gs — mesmo
// campo que a visão "total" da Início já usa e já está validado) — sem
// comparação com "valor investido" por enquanto: essa 2ª série exigiria
// derivar um número novo (aportes acumulados) que ainda não foi
// conferido com o Tiago, e "número confiável" é a prioridade dele.
// ============================================================================
function renderEvolucaoPatrimonio(doc, container, historico, periodoId) {
  const janela = filtrarHistoricoPorPeriodo(historico, periodoId);
  const valores = janela.map((item) => (typeof item.patrimonio === 'number' && Number.isFinite(item.patrimonio) ? item.patrimonio : null));
  const validos = valores.filter((v) => v != null);
  if (validos.length < 2) {
    container.innerHTML = '<p class="hint">Sem histórico suficiente ainda pra desenhar o gráfico nesse período.</p>';
    return;
  }

  const W = Math.max(container.clientWidth || 0, 280);
  const H = 190;
  const padL = 60, padR = 8, padT = 12, padB = 22;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  let minV = Math.min(...validos), maxV = Math.max(...validos);
  const folga = (maxV - minV) * 0.12 || Math.abs(maxV) * 0.05 || 1;
  minV -= folga; maxV += folga;

  const n = valores.length;
  const y = (v) => padT + plotH * (1 - (v - minV) / (maxV - minV));
  const x = (i) => padL + plotW * (n > 1 ? i / (n - 1) : 0);

  const ticks = 4;
  let gridSvg = '';
  for (let t = 0; t <= ticks; t += 1) {
    const v = minV + (maxV - minV) * (t / ticks);
    const yy = y(v);
    gridSvg += `<line class="gridline" x1="${padL}" x2="${W - padR}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/>`;
    gridSvg += `<text class="axislabel" x="${padL - 8}" y="${(yy + 3).toFixed(1)}" text-anchor="end">R$ ${COMPACTO_BRL.format(v)}</text>`;
  }

  const passos = W < 460 ? 3 : (W < 720 ? 4 : 5);
  let xLabelsSvg = '';
  for (let i = 0; i < passos; i += 1) {
    const idx = Math.round((n - 1) * (i / (passos - 1)));
    const xx = padL + plotW * (i / (passos - 1));
    const ancora = i === 0 ? 'start' : (i === passos - 1 ? 'end' : 'middle');
    xLabelsSvg += `<text class="axislabel" x="${xx.toFixed(1)}" y="${H - 7}" text-anchor="${ancora}">${formatDateBR(janela[idx].data)}</text>`;
  }

  let linhaD = '';
  let comecou = false;
  let primeiroIdx = -1, ultimoIdx = -1;
  valores.forEach((v, i) => {
    if (v == null) { comecou = false; return; }
    if (primeiroIdx === -1) primeiroIdx = i;
    ultimoIdx = i;
    const px = x(i), py = y(v);
    linhaD += comecou ? ` L${px.toFixed(1)},${py.toFixed(1)}` : `M${px.toFixed(1)},${py.toFixed(1)}`;
    comecou = true;
  });
  const areaD = `${linhaD} L${x(ultimoIdx).toFixed(1)},${(H - padB).toFixed(1)} L${x(primeiroIdx).toFixed(1)},${(H - padB).toFixed(1)} Z`;

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px;display:block">
      ${gridSvg}${xLabelsSvg}
      <path d="${areaD}" fill="var(--acoes)" fill-opacity="0.1" stroke="none"/>
      <path d="${linhaD}" fill="none" stroke="var(--acoes)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${x(ultimoIdx).toFixed(1)}" cy="${y(valores[ultimoIdx]).toFixed(1)}" r="4" fill="var(--acoes)"/>
    </svg>
  `;
}

function renderCardsClasse(doc, container, cards) {
  container.innerHTML = cards.map((card) => {
    const corToken = CORES_CARD[card.nome] || '--acoes';
    const lucroBom = card.lucroPrejuizo >= 0;
    const subvalorUsd = card.nome === 'Ações Internacionais' && typeof card.totalAtualizadoUsd === 'number'
      ? `<span class="cg-card-usd">US$ ${card.totalAtualizadoUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`
      : '';
    return `
      <button class="cg-card" type="button" data-ir-para="${chaveDaPagina_(card.nome)}" style="--accent:var(${corToken})">
        <div class="cg-card-top">
          <span class="cg-card-dot"></span>
          <span class="cg-card-nome">${card.nome}</span>
          <span class="cg-card-pct">${Math.round(card.percentualDoPatrimonio * 100)}% da carteira</span>
        </div>
        <div class="cg-card-valor">${formatBRL(card.totalAtualizado)}${subvalorUsd}</div>
        <div class="cg-card-linha">
          <span>Investido: <b>${formatBRL(card.totalInvestido)}</b></span>
          <span class="${lucroBom ? 'good' : 'bad'}">${lucroBom ? '+' : ''}${formatBRL(card.lucroPrejuizo)} (${lucroBom ? '+' : ''}${(card.rentabilidade * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)</span>
        </div>
        <div class="cg-card-rodape">${card.quantidadeAtivos} ${card.quantidadeAtivos === 1 ? 'ativo' : 'ativos'}</div>
      </button>
    `;
  }).join('');

  container.querySelectorAll('.cg-card').forEach((botao) => {
    botao.addEventListener('click', () => {
      doc.querySelector(`.side-item[data-page="${botao.dataset.irPara}"]`)?.click();
    });
  });
}

function chaveDaPagina_(nomeCard) {
  const mapa = { 'Ações': 'acoes', 'FIIs': 'fiis', 'Ações Internacionais': 'acoes-eua', 'Renda Fixa': 'renda-fixa' };
  return mapa[nomeCard] || 'visao-geral';
}

function desenhar(doc, { carteiras, home }) {
  doc.getElementById('vgPatrimonioTotal').textContent = formatBRL(carteiras.patrimonioTotal);

  const fatias = carteiras.cards.map((card) => ({
    label: card.nome,
    valor: card.totalAtualizado,
    cor: `var(${CORES_CARD[card.nome] || '--acoes'})`,
    ...(card.nome === 'Ações Internacionais' && typeof card.totalAtualizadoUsd === 'number' ? { valorUsd: card.totalAtualizadoUsd } : {}),
  }));
  renderDistribuicao(doc, doc.getElementById('vgDonut'), fatias);

  renderCardsClasse(doc, doc.getElementById('vgCardsGrid'), carteiras.cards);
  atualizarBadgesSideNav(doc, carteiras.cards);

  if (home?.patrimonio && home?.historico) {
    const periodoTabsContainer = doc.getElementById('vgPeriodoTabs');
    const periodoAtivo = periodoTabsContainer.querySelector('.filter-tab.active')?.dataset.periodo || '12m';

    wireGraficoRentabilidade(doc, {
      patrimonio: home.patrimonio,
      historico: home.historico,
      periodoTabsContainer,
      periodoInicial: periodoAtivo,
      paineis: [{
        visaoId: 'total',
        infoContainer: doc.getElementById('vgInfoRentabilidade'),
        chartContainer: doc.getElementById('vgRentabChart'),
        legendaContainer: doc.getElementById('vgRentabLegenda'),
      }],
    });

    const evolucaoContainer = doc.getElementById('vgEvolucaoChart');
    renderEvolucaoPatrimonio(doc, evolucaoContainer, home.historico, periodoAtivo);

    // Idempotente (mesmo cuidado de wireGraficoRentabilidade!estado, ver
    // inicio.js) - desenhar() roda 1x com o cache e outra com o dado
    // fresco (stale-while-revalidate), então sem essa guarda os
    // listeners abaixo dobrariam a cada mount().
    if (!periodoTabsContainer._evolucaoWired) {
      periodoTabsContainer._evolucaoWired = true;
      periodoTabsContainer.querySelectorAll('.filter-tab').forEach((botao) => {
        botao.addEventListener('click', () => renderEvolucaoPatrimonio(doc, evolucaoContainer, periodoTabsContainer._evolucaoHistorico, botao.dataset.periodo));
      });
      const janela = doc.defaultView;
      if (janela) {
        let timer = null;
        janela.addEventListener('resize', () => {
          if (timer) janela.clearTimeout(timer);
          timer = janela.setTimeout(() => {
            const periodoAgora = periodoTabsContainer.querySelector('.filter-tab.active')?.dataset.periodo || '12m';
            renderEvolucaoPatrimonio(doc, evolucaoContainer, periodoTabsContainer._evolucaoHistorico, periodoAgora);
          }, 150);
        });
      }
    }
    // Guarda o histórico MAIS RECENTE fora do closure dos listeners acima
    // (registrados só na 1ª chamada) - assim o refresh automático de 5 em
    // 5 min (mountRefreshControl) troca de período usando o dado novo,
    // não o da 1ª carga.
    periodoTabsContainer._evolucaoHistorico = home.historico;
  }
}

export async function montarPaginaCarteirasVisaoGeral(token, { doc = document, getCarteirasHomeImpl = getCarteirasHome, getHomeImpl = getHome } = {}) {
  const loadingEl = doc.getElementById('vgLoading');
  const erroEl = doc.getElementById('vgErro');
  const conteudoEl = doc.getElementById('vgConteudo');
  const refreshControlEl = doc.getElementById('refreshControlVisaoGeral');

  const cache = lerCacheCarteiras(CHAVE_CACHE_VISAO_GERAL);
  if (cache) {
    desenhar(doc, cache);
    loadingEl.hidden = true;
    conteudoEl.hidden = false;
  }

  async function carregarERedesenhar() {
    const [respCarteiras, respHome] = await Promise.all([getCarteirasHomeImpl(token), getHomeImpl(token)]);

    loadingEl.hidden = true;

    if (!respCarteiras.ok) {
      erroEl.hidden = false;
      erroEl.textContent = `Não deu pra carregar a Visão geral agora (${respCarteiras.etapa || '?'}): ${respCarteiras.erro || 'erro desconhecido'}.`;
      return;
    }

    erroEl.hidden = true;
    conteudoEl.hidden = false;

    const dados = { carteiras: respCarteiras.carteiras, home: respHome.ok ? respHome : null };
    desenhar(doc, dados);
    gravarCacheCarteiras(CHAVE_CACHE_VISAO_GERAL, dados);

    if (!respHome.ok) {
      doc.getElementById('vgAvisos').hidden = false;
      doc.getElementById('vgAvisos').textContent = 'Os gráficos de Evolução/Rentabilidade não carregaram agora — os 4 cards de carteira acima estão OK.';
    } else {
      doc.getElementById('vgAvisos').hidden = true;
    }
  }

  await carregarERedesenhar();
  mountRefreshControl(doc, refreshControlEl, carregarERedesenhar).marcarAtualizado();
}
