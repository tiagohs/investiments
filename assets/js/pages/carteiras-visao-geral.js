/**
 * carteiras-visao-geral.js — página "Visão geral" de Carteiras (a Home
 * consolidada, primeira aba da sidebar). Junta 2 chamadas em paralelo:
 *   - getCarteirasHome() (action=carteirasHome, CarteirasHome.gs) -> os
 *     4 cards de classe + patrimonioTotal + benchmarks.cdi.
 *   - getHome() (action=home, Home.gs) -> reaproveitado pelos campos
 *     patrimonio/historico/indices (índices/câmbio/ativos daquela
 *     resposta não são usados aqui, exceto indices.ibovespa.variacaoDia
 *     pro benchmark "Ibovespa hoje" do hero) - os gráficos de
 *     Rentabilidade/Evolução desta tela usam a MESMA série "total" que a
 *     Início já usa, decisão registrada no cabeçalho de CarteirasHome.gs
 *     ("confirmado com o Tiago que dá pra reaproveitar, sem precisar de
 *     rota nova").
 *
 * Reaproveita 3 funções já testadas de inicio.js (renderDistribuicao,
 * renderInfoRentabilidade, renderGraficoRentabilidade/
 * wireGraficoRentabilidade com visaoId:'total') em vez de duplicar
 * gráfico - só o gráfico "Evolução do patrimônio" (valor absoluto em
 * R$, não existe em Início) é novo, escrito aqui.
 *
 * 19/09/2026 (revisão pós-teste do Tiago): mudanças grandes nesta
 * rodada -
 *   - hero virou 2 cartões separados (era 1 só, duplicava o "Patrimônio
 *     total" com renderInfoRentabilidade - ver comentário em
 *     carteiras.css) - vgInfoRentabilidade foi pro cartão de
 *     "Rentabilidade acumulada" (onde o gráfico dele mora de verdade) e
 *     o hero ganhou renderHeroStats_ (Investido/Lucro-Prejuízo/
 *     Rentabilidade) + benchmarks (Ibovespa hoje/CDI a.a.).
 *   - renderEvolucaoPatrimonio ganhou uma 2ª linha ("quanto investi",
 *     acumulando historico[i].fluxoCaixaPatrimonio dia a dia - dado que
 *     a própria tela já busca, sem rota nova) + legenda + hover/touch
 *     (mesma técnica de ligarInteracaoGrafico_ em inicio.js, reaproveita
 *     as classes .rentab-* já existentes em vez de duplicar CSS).
 *   - renderCardsClasse ganhou o badge de rentabilidade e a barra
 *     "comprar/aguardar" (só quando card.comprar/card.aguardar vêm da
 *     API - Renda Fixa não tem Vies) + "Ver detalhes →". O benchmark por
 *     card (Ibovespa/CDI/IFIX/Selic/S&P 500 de CADA classe) ficou FORA
 *     desta rodada de propósito - replicaria o que CarteirasClasses.gs
 *     já busca pra cada subpágina (IFIX/Selic pra FIIs/Renda Fixa ainda
 *     nem existem nessa consolidação), e já está a 1 clique em "Ver
 *     detalhes" - sinalizado ao Tiago junto da entrega.
 */

import { getCarteirasHome, getHome } from '../api-client.js';
import { formatBRL, formatDateBR, formatNumeroBR, formatPercentFromFraction, formatPercentFromPoints } from '../format.js';
import { mountRefreshControl } from '../shell.js';
import { lerCacheCarteiras, gravarCacheCarteiras } from '../carteiras-cache.js';
import {
  renderDistribuicao,
  renderInfoRentabilidade,
  wireGraficoRentabilidade,
  filtrarHistoricoPorPeriodo,
  calcularResumoRentabilidade,
  renderInfoEvolucao,
} from './inicio.js';
import { renderBenchmarksClasseCarteiras } from './carteiras-classe-comum.js';

const CHAVE_CACHE_VISAO_GERAL = 'carteiras_visao_geral_v1';

const CORES_CARD = {
  'Ações': '--acoes',
  'FIIs': '--fiis',
  'Ações Internacionais': '--usa',
  'Renda Fixa': '--rf',
};

const COMPACTO_BRL = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

/**
 * 19/09/2026 #2 (correção do Tiago - "cada carteira tem seus índices",
 * não os mesmos 2 globais repetidos nos 4 cards): mapa campo -> como
 * mostrar, usado por formatarBenchmarksCard_ abaixo. 19/09/2026 #3
 * (correção do Tiago, fiel ao mockup de design) - Ibovespa/IFIX/S&P 500
 * viraram VARIAÇÃO DO DIA em pontos percentuais (mesma escala do chip
 * "Ibovespa hoje" do hero, formatPercentFromPoints - GOOGLEFINANCE
 * changepct), coloridos verde/vermelho conforme o sinal: são índices de
 * mercado, "hoje" É uma variação, faz sentido ter viés de alta/baixa.
 * CDI/Selic/IPCA continuam em fração (formatPercentFromFraction) e SEM
 * cor - são taxa/inflação de referência, não "ganho ou perda do dia".
 */
const CAMPO_BENCHMARK_CARD = {
  ibovespa: { label: 'Ibovespa', sufixo: 'hoje', formatar: (v) => formatPercentFromPoints(v), colorir: true },
  ifix: { label: 'IFIX', sufixo: 'hoje', formatar: (v) => formatPercentFromPoints(v), colorir: true },
  spx: { label: 'S&P 500', sufixo: 'hoje', formatar: (v) => formatPercentFromPoints(v), colorir: true },
  cdi: { label: 'CDI', sufixo: 'a.a.', formatar: (v) => formatPercentFromFraction(v) },
  selic: { label: 'Selic', sufixo: 'a.a.', formatar: (v) => formatPercentFromFraction(v) },
  ipca: { label: 'IPCA', sufixo: '12m', formatar: (v) => formatPercentFromFraction(v) },
};

/**
 * Rodapé de benchmarks de UM card de classe - os índices que essa
 * classe específica usa (Ações: Ibovespa/CDI; FIIs: IFIX/Ibovespa/CDI;
 * Ações Internacionais: S&P 500/Ibovespa; Renda Fixa: CDI/Selic/IPCA -
 * exatamente a mesma lista que CarteirasHome.gs manda em card.benchmarks
 * e que cada subpágina de "Ver detalhes" já mostra), na ordem em que o
 * backend manda os campos.
 */
function formatarBenchmarksCard_(benchmarks) {
  if (!benchmarks) return '';
  const partes = Object.keys(benchmarks).map((chave) => {
    const meta = CAMPO_BENCHMARK_CARD[chave];
    if (!meta) return null;
    const valor = benchmarks[chave];
    const texto = typeof valor === 'number' ? meta.formatar(valor) : '—';
    const corClasse = meta.colorir && typeof valor === 'number' ? (valor >= 0 ? ' good' : ' bad') : '';
    return `${meta.label} <b class="${corClasse.trim()}">${texto}</b> ${meta.sufixo}`;
  }).filter(Boolean);
  if (!partes.length) return '';
  return `<div class="cg-card-benchmarks">${partes.join(' · ')}</div>`;
}

/**
 * Linha "Investido / Resultado (desde o início) / Rentabilidade" do hero.
 *
 * 19/09/2026 (bug relatado pelo Tiago pós-teste, comparando com o
 * Gorila): a 1ª versão somava card.totalInvestido/lucroPrejuizo dos 4
 * cards de classe (validado só contra o "Investido" do mockup - ver
 * histórico do commit) - mas isso é só a posição ATUAL (custo de
 * aquisição do que está em carteira hoje), sem nenhum ganho/perda
 * REALIZADO (venda) nem provento recebido ao longo do tempo. Por isso
 * saía uma fração (em R$ e em %) do "desde o início" de verdade (o do
 * Gorila e o do próprio gráfico de "Rentabilidade acumulada" desta mesma
 * tela, com o período "Desde o início" selecionado - a pequena diferença
 * entre esses dois é
 * só a defasagem normal de 1 dia do histórico, ver comentário em
 * comHistoricoInvestidoAcumulado_ mais abaixo) ficava MUITO menor.
 *
 * Trocado pra reaproveitar calcularResumoRentabilidade (inicio.js,
 * extraída desta correção - mesma conta TWR já validada contra o Gorila
 * pelo Tiago em 13/09/2026) com periodoId:'tudo' - a MESMA fonte que
 * alimenta "Rentabilidade acumulada" logo abaixo, nunca dois cálculos de
 * "desde o início" podendo divergir entre si.
 *
 * "Investido" = valorAtual - resultado (o que sobra depois de tirar o
 * ganho líquido de tudo que está na carteira hoje) - consistente por
 * construção com "Resultado" ao lado, e deve ficar PRÓXIMO (não
 * idêntico, por arredondamento dia a dia) da linha tracejada "Quanto
 * investi" do gráfico de Evolução logo abaixo, que soma o mesmo fluxo de
 * caixa por um caminho um pouco diferente.
 *
 * Sem `home` (getHome falhou - ver montarPaginaCarteirasVisaoGeral), cai
 * de volta pro método antigo (só posição atual) - os 4 cards de classe
 * não dependem de getHome, só esse cálculo "desde o início" depende.
 */
function renderHeroStats_(doc, container, cards, home) {
  let investido = null, resultado = null, rentabilidade = null;

  if (home && home.patrimonio && home.historico) {
    const resumo = calcularResumoRentabilidade(home.patrimonio, home.historico, { visaoId: 'total', periodoId: 'tudo' });
    if (typeof resumo.valorAtual === 'number' && typeof resumo.ganhoReais === 'number') {
      resultado = resumo.ganhoReais;
      rentabilidade = typeof resumo.percentual === 'number' ? resumo.percentual / 100 : null;
      // 23/09/2026 (Tiago: "Valor aplicado" em todo o site, sem subtrair
      // provento): o MESMO número do fim da linha tracejada "Valor
      // aplicado" do gráfico de Evolução logo abaixo (soma de
      // fluxoAplicadoPatrimonio - custo de tudo que está investido, ver
      // FluxoCaixaInicio.gs). Antes era "patrimônio − resultado", que é
      // outra coisa (desconta provento recebido) e não batia com o gráfico
      // da mesma tela. Assim como no Gorila, Valor aplicado + Resultado
      // não precisa dar o Patrimônio: o Resultado inclui provento já
      // recebido e lucro já realizado, que não estão mais "aplicados".
      const temAplicado = home.historico.some((item) => typeof item.fluxoAplicadoPatrimonio === 'number');
      investido = temAplicado
        ? home.historico.reduce((soma, item) => soma + (Number.isFinite(item.fluxoAplicadoPatrimonio) ? item.fluxoAplicadoPatrimonio : 0), 0)
        : resumo.valorAtual - resumo.ganhoReais;
    }
  }

  if (investido == null) {
    // fallback (ver comentário acima) - só posição atual, sem realizado/proventos.
    investido = cards.reduce((soma, c) => soma + (c.totalInvestido || 0), 0);
    resultado = cards.reduce((soma, c) => soma + (c.lucroPrejuizo || 0), 0);
    rentabilidade = investido !== 0 ? resultado / investido : 0;
  }

  const bom = resultado >= 0;
  container.innerHTML = `
    <span>Valor aplicado: <b>${formatBRL(investido)}</b></span>
    <span>Resultado (desde o início): <b class="${bom ? 'good' : 'bad'}">${bom ? '+' : ''}${formatBRL(resultado)}</b></span>
    <span>Rentabilidade: <b class="${bom ? 'good' : 'bad'}">${typeof rentabilidade === 'number' ? formatPercentFromFraction(rentabilidade) : '—'}</b></span>
  `;
}

/**
 * Acumula historico[i].fluxoCaixaPatrimonio (aporte/retirada líquido do
 * dia, já usado pelo gráfico de Rentabilidade - CAMPO_FLUXO_POR_VISAO em
 * inicio.js) num "quanto investi até aqui" por dia, pra plotar junto do
 * "quanto tenho" (patrimonio) na Evolução. Roda sobre o historico
 * INTEIRO (não a janela já filtrada por período) - o acumulado tem que
 * começar do dia 1 de verdade, senão o recorte de "30 dias" mostraria só
 * o aporte DENTRO desses 30 dias, não o total investido até então.
 */
function comHistoricoInvestidoAcumulado_(historico) {
  let acumulado = 0;
  // 21/09/2026 (pedido do Tiago): fluxoAplicadoPatrimonio, NÃO
  // fluxoCaixaPatrimonio - "Valor aplicado" é capital líquido de
  // Compra/Venda + Renda Fixa, nunca reduzido por provento recebido (ver
  // FluxoCaixaInicio.gs!porDiaAplicado* / inicio.js!CAMPO_FLUXO_APLICADO_POR_VISAO).
  return historico.map((item) => {
    const fluxo = typeof item.fluxoAplicadoPatrimonio === 'number' && Number.isFinite(item.fluxoAplicadoPatrimonio) ? item.fluxoAplicadoPatrimonio : 0;
    acumulado += fluxo;
    return { ...item, investidoAcumulado: acumulado };
  });
}

// ============================================================================
// Gráfico "Evolução do patrimônio" — único gráfico novo desta página (os
// outros 2 blocos visuais reaproveitam inicio.js). 2 linhas - "quanto
// tenho" (patrimonio) e "quanto investi" (investidoAcumulado, ver
// comHistoricoInvestidoAcumulado_ acima) - com legenda e hover/touch
// (mesma técnica de ligarInteracaoGrafico_ em inicio.js, reaproveitando
// as classes .rentab-hitarea/.rentab-hover*/.rentab-tooltip* já
// definidas em inicio.css em vez de duplicar CSS novo).
// ============================================================================
function renderEvolucaoPatrimonio(doc, container, historico, periodoId, legendaContainer) {
  // 20/09/2026: passa 'patrimonio' como campo de corte de "Desde o início"
  // (ver filtrarHistoricoPorPeriodo, inicio.js) só por consistência com as
  // 4 subpáginas de Carteiras - na prática nunca corta nada aqui, porque
  // o patrimônio TOTAL já existe desde o 1º dia do historico (22/12/2020).
  const janela = filtrarHistoricoPorPeriodo(historico, periodoId, 'patrimonio');
  const valoresPatrimonio = janela.map((item) => (typeof item.patrimonio === 'number' && Number.isFinite(item.patrimonio) ? item.patrimonio : null));
  const valoresInvestido = janela.map((item) => (typeof item.investidoAcumulado === 'number' && Number.isFinite(item.investidoAcumulado) ? item.investidoAcumulado : null));
  // 23/09/2026 #8: valor + variação no período em cima do gráfico (mesmas 2 linhas)
  renderInfoEvolucao(doc, doc.getElementById('vgInfoEvolucao'), { label: 'Patrimônio total', valores: valoresPatrimonio, investidos: valoresInvestido });
  const validos = valoresPatrimonio.filter((v) => v != null);
  if (validos.length < 2) {
    container.innerHTML = '<p class="hint">Sem histórico suficiente ainda pra desenhar o gráfico nesse período.</p>';
    if (legendaContainer) legendaContainer.innerHTML = '';
    return;
  }

  const W = Math.max(container.clientWidth || 0, 280);
  const H = 190;
  const padL = 60, padR = 8, padT = 12, padB = 22;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const todosValores = [...valoresPatrimonio, ...valoresInvestido].filter((v) => v != null);
  let minV = Math.min(...todosValores), maxV = Math.max(...todosValores);
  const folga = (maxV - minV) * 0.12 || Math.abs(maxV) * 0.05 || 1;
  minV -= folga; maxV += folga;

  const n = valoresPatrimonio.length;
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

  function pathD_(valores) {
    let d = '';
    let comecou = false;
    valores.forEach((v, i) => {
      if (v == null) { comecou = false; return; }
      const px = x(i), py = y(v);
      d += comecou ? ` L${px.toFixed(1)},${py.toFixed(1)}` : `M${px.toFixed(1)},${py.toFixed(1)}`;
      comecou = true;
    });
    return d;
  }

  let primeiroIdx = -1, ultimoIdx = -1;
  valoresPatrimonio.forEach((v, i) => { if (v != null) { if (primeiroIdx === -1) primeiroIdx = i; ultimoIdx = i; } });
  const linhaPatrimonioD = pathD_(valoresPatrimonio);
  const linhaInvestidoD = pathD_(valoresInvestido);
  const areaD = `${linhaPatrimonioD} L${x(ultimoIdx).toFixed(1)},${(H - padB).toFixed(1)} L${x(primeiroIdx).toFixed(1)},${(H - padB).toFixed(1)} Z`;

  container.innerHTML = `
    <svg class="rentab-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px">
      ${gridSvg}${xLabelsSvg}
      <path d="${areaD}" fill="var(--acoes)" fill-opacity="0.1" stroke="none"/>
      <path d="${linhaInvestidoD}" fill="none" stroke="var(--ink-muted)" stroke-width="2" stroke-dasharray="6 4"/>
      <path d="${linhaPatrimonioD}" fill="none" stroke="var(--acoes)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      <g class="rentab-hover" hidden>
        <line class="rentab-hover-linha" x1="0" x2="0" y1="${padT}" y2="${H - padB}"/>
        <circle class="rentab-hover-ponto" data-serie="patrimonio" r="3.6" fill="var(--acoes)" hidden/>
        <circle class="rentab-hover-ponto" data-serie="investido" r="3.2" fill="var(--ink-muted)" hidden/>
      </g>
      <rect class="rentab-hitarea" x="${padL}" y="${padT}" width="${Math.max(plotW, 0)}" height="${Math.max(plotH, 0)}" fill="transparent" pointer-events="all"/>
    </svg>
    <div class="rentab-tooltip" hidden></div>
  `;

  ligarInteracaoEvolucao_(container, { janela, valoresPatrimonio, valoresInvestido, x, y, padL, plotW, W });

  if (legendaContainer) {
    legendaContainer.innerHTML = `
      <span class="li"><span class="swline" style="border-color:var(--acoes)"></span>Quanto tenho hoje</span>
      <span class="li"><span class="swline dash" style="border-color:var(--ink-muted)"></span>Valor aplicado</span>
    `;
  }
}

/** Hover/touch do gráfico de Evolução — adaptado de ligarInteracaoGrafico_
 * (inicio.js, gráfico de Rentabilidade), mesma técnica de Pointer Events
 * sobre um <rect> transparente, com 2 séries (patrimônio/investido) em
 * vez de portfólio+benchmarks. */
function ligarInteracaoEvolucao_(container, { janela, valoresPatrimonio, valoresInvestido, x, y, padL, plotW, W }) {
  const svgEl = container.querySelector('svg.rentab-chart');
  const hitarea = container.querySelector('.rentab-hitarea');
  const hoverGroup = container.querySelector('.rentab-hover');
  const linhaHover = container.querySelector('.rentab-hover-linha');
  const pontoPatrimonio = container.querySelector('.rentab-hover-ponto[data-serie="patrimonio"]');
  const pontoInvestido = container.querySelector('.rentab-hover-ponto[data-serie="investido"]');
  const tooltip = container.querySelector('.rentab-tooltip');
  if (!svgEl || !hitarea || !hoverGroup || !linhaHover || !tooltip) return;

  function indiceNoClientX_(clientX) {
    const rect = svgEl.getBoundingClientRect();
    const svgX = clientX - rect.left;
    const fracao = plotW > 0 ? (svgX - padL) / plotW : 0;
    return Math.min(janela.length - 1, Math.max(0, Math.round(fracao * (janela.length - 1))));
  }

  function posicionarPonto_(el, valor, i) {
    if (!el) return;
    if (typeof valor !== 'number') { el.setAttribute('hidden', ''); return; }
    el.removeAttribute('hidden');
    el.setAttribute('cx', x(i).toFixed(1));
    el.setAttribute('cy', y(valor).toFixed(1));
  }

  function mostrar_(clientX) {
    const i = indiceNoClientX_(clientX);
    const xx = x(i);

    linhaHover.setAttribute('x1', xx.toFixed(1));
    linhaHover.setAttribute('x2', xx.toFixed(1));
    posicionarPonto_(pontoPatrimonio, valoresPatrimonio[i], i);
    posicionarPonto_(pontoInvestido, valoresInvestido[i], i);
    hoverGroup.removeAttribute('hidden');

    const linhasTooltip = [
      { label: 'Quanto tenho hoje', cor: 'var(--acoes)', valor: valoresPatrimonio[i] },
      { label: 'Valor aplicado', cor: 'var(--ink-muted)', valor: valoresInvestido[i] },
    ].map((linha) => `
      <div class="rentab-tooltip-item">
        <span class="dot" style="background:${linha.cor}"></span>${linha.label}
        <b>${typeof linha.valor === 'number' ? formatBRL(linha.valor) : '—'}</b>
      </div>
    `).join('');
    tooltip.innerHTML = `<div class="rentab-tooltip-data">${formatDateBR(janela[i].data)}</div>${linhasTooltip}`;
    tooltip.hidden = false;

    const larguraTooltip = tooltip.offsetWidth || 170;
    const esquerda = Math.min(Math.max(xx - larguraTooltip / 2, 4), Math.max(W - larguraTooltip - 4, 4));
    tooltip.style.left = `${esquerda}px`;
  }

  function esconder_() {
    hoverGroup.setAttribute('hidden', '');
    tooltip.hidden = true;
  }

  hitarea.addEventListener('pointermove', (ev) => mostrar_(ev.clientX));
  hitarea.addEventListener('pointerdown', (ev) => mostrar_(ev.clientX));
  hitarea.addEventListener('pointerleave', esconder_);
}

function renderCardsClasse(doc, container, cards) {
  container.innerHTML = cards.map((card) => {
    const corToken = CORES_CARD[card.nome] || '--acoes';
    const lucroBom = card.lucroPrejuizo >= 0;
    const subvalorUsd = card.nome === 'Ações Internacionais' && typeof card.totalAtualizadoUsd === 'number'
      ? `<span class="cg-card-usd">US$ ${card.totalAtualizadoUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`
      : '';

    // Barra "comprar/aguardar" (19/09/2026) - só quando a API manda os 2
    // campos (Ações/FIIs/Ações Internacionais); Renda Fixa não tem Vies).
    // 19/09/2026 #3 (pedido do Tiago): Renda Fixa não tem Vies mesmo,
    // mas pra manter o mesmo "peso" visual dos outros 3 cards, ganha uma
    // faixa cinza sólida (sem proporção nenhuma - "não tem viés nem
    // nada", só decorativa) em vez de ficar sem faixa.
    let viesHtml = '';
    if (typeof card.comprar === 'number' && typeof card.aguardar === 'number' && (card.comprar + card.aguardar) > 0) {
      const totalVies = card.comprar + card.aguardar;
      const pctComprar = (card.comprar / totalVies) * 100;
      const pctAguardar = 100 - pctComprar;
      viesHtml = `
        <div class="cg-card-vies">
          <div class="cg-card-vies-bar">
            <span class="comprar" style="width:${pctComprar.toFixed(1)}%"></span>
            <span class="aguardar" style="width:${pctAguardar.toFixed(1)}%"></span>
          </div>
          <span class="cg-card-vies-legenda">${card.comprar} comprar · ${card.aguardar} aguardar</span>
        </div>
      `;
    } else {
      viesHtml = `
        <div class="cg-card-vies">
          <div class="cg-card-vies-bar"><span class="neutro" style="width:100%"></span></div>
        </div>
      `;
    }

    // 19/09/2026 #2 (correção do Tiago - a 1ª versão repetia Ibovespa/CDI
    // globais nos 4 cards; o certo é cada card mostrar os índices DA SUA
    // classe) - vem pronto em card.benchmarks (CarteirasHome.gs), ver
    // formatarBenchmarksCard_ acima.
    const benchmarksHtml = formatarBenchmarksCard_(card.benchmarks);

    return `
      <button class="cg-card" type="button" data-ir-para="${chaveDaPagina_(card.nome)}" style="--accent:var(${corToken})">
        <div class="cg-card-top">
          <span class="cg-card-dot"></span>
          <span class="cg-card-nome">${card.nome}</span>
          <span class="cg-card-top-right">
            <span class="cg-card-pct">${Math.round(card.percentualDoPatrimonio * 100)}% da carteira</span>
            <span class="cg-card-rentab ${lucroBom ? 'good' : 'bad'}">${formatPercentFromFraction(card.rentabilidade)}</span>
          </span>
        </div>
        <div class="cg-card-valor">${formatBRL(card.totalAtualizado)}${subvalorUsd}</div>
        <div class="cg-card-linha">
          <span>Valor aplicado: <b>${formatBRL(card.totalInvestido)}</b></span>
          <span class="${lucroBom ? 'good' : 'bad'}">${lucroBom ? '+' : ''}${formatBRL(card.lucroPrejuizo)}</span>
        </div>
        ${viesHtml}
        ${benchmarksHtml}
        <div class="cg-card-rodape">
          <span>${card.quantidadeAtivos} ${card.quantidadeAtivos === 1 ? 'ativo' : 'ativos'}</span>
          <span class="cg-card-ver-detalhes">Ver detalhes →</span>
        </div>
      </button>
    `;
  }).join('');

  container.querySelectorAll('.cg-card').forEach((botao) => {
    botao.addEventListener('click', () => {
      doc.querySelector(`.side-item[data-page="${botao.dataset.irPara}"]`)?.click();
    });
  });
}

/** 23/09/2026 #3 (Controle 8 - o card de Renda Fixa mostrava a coluna
 * manual "Valor Investido" enquanto a subpágina já mostrava o custo PEPS,
 * e o de Ações Internacionais usava o custo em US$ × câmbio de HOJE, não o
 * fim da linha "Valor aplicado" do gráfico): quando o histórico está
 * disponível, o Valor aplicado de cada card sai da MESMA fonte do hero e
 * das subpáginas - soma de fluxoAplicado<Classe> (custo médio de Ações/
 * FIIs, câmbio de cada compra em Ações EUA, PEPS em Renda Fixa - ver
 * FluxoCaixaInicio.gs). Lucro = valor de hoje − valor aplicado; % =
 * lucro / valor aplicado, sem arredondar pra 2 casas antes (a API
 * arredondava a fração e o % perdia as decimais). Assim os 4 cards somam
 * exatamente o "Valor aplicado" do hero. Sem histórico, o card fica como
 * a API mandou. */
const CAMPO_APLICADO_POR_CARD = {
  'Ações': 'fluxoAplicadoAcoes',
  'FIIs': 'fluxoAplicadoFiis',
  'Ações Internacionais': 'fluxoAplicadoAcoesEua',
  'Renda Fixa': 'fluxoAplicadoRendaFixaTotal',
};
export function alinharCardsComHistorico_(cards, historico) {
  if (!Array.isArray(cards)) return cards;
  const temHistorico = Array.isArray(historico) && historico.length > 0;
  return cards.map((card) => {
    const campo = CAMPO_APLICADO_POR_CARD[card.nome];
    let totalInvestido = card.totalInvestido;
    if (temHistorico && campo && historico.some((item) => typeof item[campo] === 'number')) {
      totalInvestido = historico.reduce((soma, item) => soma + (Number.isFinite(item[campo]) ? item[campo] : 0), 0);
    }
    const lucroPrejuizo = card.totalAtualizado - totalInvestido;
    return {
      ...card,
      totalInvestido,
      lucroPrejuizo,
      rentabilidade: totalInvestido ? lucroPrejuizo / totalInvestido : 0,
    };
  });
}

function chaveDaPagina_(nomeCard) {
  const mapa = { 'Ações': 'acoes', 'FIIs': 'fiis', 'Ações Internacionais': 'acoes-eua', 'Renda Fixa': 'renda-fixa' };
  return mapa[nomeCard] || 'visao-geral';
}

function desenhar(doc, { carteiras: carteirasApi, home }) {
  const carteiras = { ...carteirasApi, cards: alinharCardsComHistorico_(carteirasApi.cards, home?.historico) };
  doc.getElementById('vgPatrimonioTotal').textContent = formatBRL(carteiras.patrimonioTotal);
  renderHeroStats_(doc, doc.getElementById('vgResumo'), carteiras.cards, home);

  // Calculados 1 vez só e reaproveitados no hero E no rodapé de cada card
  // de classe (ver comentário em renderCardsClasse) - nunca dois textos
  // pra "Ibovespa hoje"/"CDI (a.a.)" podendo divergir na mesma tela.
  const ibovespaVariacaoDia = home?.indices?.ibovespa?.variacaoDia;
  const ibovespaHojeTexto = typeof ibovespaVariacaoDia === 'number' ? formatPercentFromPoints(ibovespaVariacaoDia) : '—';
  const cdiAnualTexto = formatPercentFromFraction(carteiras.benchmarks?.cdi);
  renderBenchmarksClasseCarteiras(doc, doc.getElementById('vgBenchmarks'), [
    { label: 'Ibovespa hoje', valor: ibovespaHojeTexto, cor: typeof ibovespaVariacaoDia === 'number' ? (ibovespaVariacaoDia >= 0 ? 'good' : 'bad') : undefined },
    { label: 'CDI (a.a.)', valor: cdiAnualTexto },
  ]);

  const fatias = carteiras.cards.map((card) => ({
    label: card.nome,
    valor: card.totalAtualizado,
    cor: `var(${CORES_CARD[card.nome] || '--acoes'})`,
    ...(card.nome === 'Ações Internacionais' && typeof card.totalAtualizadoUsd === 'number' ? { valorUsd: card.totalAtualizadoUsd } : {}),
  }));
  renderDistribuicao(doc, doc.getElementById('vgDonut'), fatias);

  renderCardsClasse(doc, doc.getElementById('vgCardsGrid'), carteiras.cards);

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

    const historicoComInvestido = comHistoricoInvestidoAcumulado_(home.historico);
    const evolucaoContainer = doc.getElementById('vgEvolucaoChart');
    const evolucaoLegendaContainer = doc.getElementById('vgEvolucaoLegenda');
    renderEvolucaoPatrimonio(doc, evolucaoContainer, historicoComInvestido, periodoAtivo, evolucaoLegendaContainer);

    // Idempotente (mesmo cuidado de wireGraficoRentabilidade!estado, ver
    // inicio.js) - desenhar() roda 1x com o cache e outra com o dado
    // fresco (stale-while-revalidate), então sem essa guarda os
    // listeners abaixo dobrariam a cada mount().
    if (!periodoTabsContainer._evolucaoWired) {
      periodoTabsContainer._evolucaoWired = true;
      periodoTabsContainer.querySelectorAll('.filter-tab').forEach((botao) => {
        botao.addEventListener('click', () => renderEvolucaoPatrimonio(doc, evolucaoContainer, periodoTabsContainer._evolucaoHistorico, botao.dataset.periodo, evolucaoLegendaContainer));
      });
      const janela = doc.defaultView;
      if (janela) {
        let timer = null;
        janela.addEventListener('resize', () => {
          if (timer) janela.clearTimeout(timer);
          timer = janela.setTimeout(() => {
            const periodoAgora = periodoTabsContainer.querySelector('.filter-tab.active')?.dataset.periodo || '12m';
            renderEvolucaoPatrimonio(doc, evolucaoContainer, periodoTabsContainer._evolucaoHistorico, periodoAgora, evolucaoLegendaContainer);
          }, 150);
        });
      }
    }
    // Guarda o histórico MAIS RECENTE (já com investidoAcumulado) fora do
    // closure dos listeners acima (registrados só na 1ª chamada) - assim
    // o refresh automático de 5 em 5 min (mountRefreshControl) troca de
    // período usando o dado novo, não o da 1ª carga.
    periodoTabsContainer._evolucaoHistorico = historicoComInvestido;
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
