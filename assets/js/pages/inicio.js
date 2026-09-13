/**
 * pages/inicio.js — renderização da página Início, Fase 2 completa:
 * cards de Índices & Câmbio, hero de Patrimônio (3 visões: Total /
 * Longo Prazo / Renda Emergencial), gráfico de Rentabilidade (com
 * filtro de período contextual, próprio desta página - o filtro global
 * do topbar saiu de shell.html em 13/09/2026, ver docs/plano-
 * implementacao.html Fase 2) e a grade "Meus Ativos" (cartão inteiro
 * clicável pro Detalhe do Ativo, ainda não construído - ver "ativo.html"
 * em docs/plano-implementacao.html, ativo.html?ref=&classe=).
 *
 * Mesmo padrão de shell.js/auth-ui.js: funções puras de renderização
 * (recebem doc + elemento + dado já pronto, nunca buscam nada sozinhas)
 * e um único orquestrador real (montarPaginaInicio) que busca de
 * verdade via api-client.js!getHome e liga tudo. Os testes exercitam as
 * funções puras contra um jsdom, sem precisar de fetch de verdade nem
 * de um token real.
 *
 * "avisos" (falha parcial de uma seção só) é tratado exatamente como o
 * back-end trata (ver Home.gs) - cada pedaço (índices/câmbio, hero,
 * gráfico, ativos) aparece se veio, e falta silenciosamente (com um
 * aviso) se não veio, em vez de uma falha em uma seção derrubar a
 * página inteira.
 *
 * Rentabilidade (13/09/2026): historico (HistoricoInicio.gs) já vem com
 * uma linha por dia corrido - patrimonio/longoPrazo/rendaEmergencial em
 * R$, indiceCdi/indiceSelic como curva composta base 100, ibovespa em
 * pontos brutos (pode vir null antes do 1º pregão da janela). O gráfico
 * nunca compara valores brutos entre si (R$ vs pontos de índice não faz
 * sentido) - normaliza tudo pra "% desde o início do período" a partir
 * do primeiro valor válido da janela (normalizarSerieRentabilidade),
 * mesma ideia por trás de qualquer gráfico de rentabilidade comparada.
 * Os benchmarks mudam por visão, seguindo a decisão já registrada em
 * docs/plano-implementacao.html: Total/Longo Prazo contra Ibovespa+CDI,
 * Renda Emergencial contra CDI+Selic (não faz sentido comparar reserva
 * de emergência com bolsa).
 */

import { getHome } from '../api-client.js';
import { formatBRL, formatUSD, formatNumeroBR, formatPercentFromFraction, formatPercentFromPoints, formatDateBR } from '../format.js';

const ARROW_UP_PATH = 'M12 19V5M5 12l7-7 7 7';
const ARROW_DOWN_PATH = 'M12 5v14M5 12l7 7 7-7';

/**
 * Cria o elemento-base de um widget-tile: <a> (cartão inteiro clicável,
 * indo direto pra cotação) quando há extLinkHref, ou <div> normal quando
 * não há (nunca um link vazio) - mesmo padrão do .ativo-card discutido em
 * docs/direcao-visual.html pra Meus Ativos, aplicado aqui em 13/09/2026 a
 * pedido do Tiago (antes cada tile tinha um "G. Finance ↗" escrito solto
 * dentro do rótulo em vez do cartão inteiro ser o link).
 */
function criarElementoTile(doc, extLinkHref) {
  if (!extLinkHref) return doc.createElement('div');
  const tile = doc.createElement('a');
  tile.href = extLinkHref;
  tile.target = '_blank';
  tile.rel = 'noopener';
  return tile;
}

/**
 * Separa um valor já formatado ("R$ 5,09", "185.600,00") na parte
 * principal + a última "quebra" (vírgula decimal, ou o último separador
 * de milhar quando não há decimal visível) - reproduz o efeito de dois
 * tamanhos de fonte do mockup (docs/direcao-visual.html, classe .dec)
 * sem precisar de um formatador dedicado por campo.
 */
export function splitValorExibicao(formatted) {
  const idx = Math.max(formatted.lastIndexOf(','), formatted.lastIndexOf('.'));
  if (idx === -1) return { principal: formatted, dec: '' };
  return { principal: formatted.slice(0, idx), dec: formatted.slice(idx) };
}

function setValorComDec(el, formatted) {
  const { principal, dec } = splitValorExibicao(formatted);
  el.textContent = '';
  el.appendChild(el.ownerDocument.createTextNode(principal));
  if (dec) {
    const span = el.ownerDocument.createElement('span');
    span.className = 'dec';
    span.textContent = dec;
    el.appendChild(span);
  }
}

function arrowSvg(good) {
  return `<svg viewBox="0 0 24 24"><path d="${good ? ARROW_UP_PATH : ARROW_DOWN_PATH}"/></svg>`;
}

/**
 * Widget-tile de índice (Ibovespa/IFIX/S&P 500) - têm variação do dia
 * em PONTOS PERCENTUAIS (ver format.js!formatPercentFromPoints, e o
 * risco de escala documentado lá - nunca passar isso pra
 * formatPercentFromFraction).
 */
export function criarTileIndice(doc, { label, valor, variacaoDia, extLinkHref }) {
  const tile = criarElementoTile(doc, extLinkHref);
  tile.className = 'widget-tile';

  const temVariacao = typeof variacaoDia === 'number' && Number.isFinite(variacaoDia);
  const good = temVariacao && variacaoDia >= 0;
  const arrowHtml = temVariacao ? `<span class="arrow-badge ${good ? 'good' : 'bad'}">${arrowSvg(good)}</span>` : '';

  tile.innerHTML = `
    <div class="widget-tile-top">
      <div>
        <div class="widget-value"></div>
        <div class="widget-label">${label}</div>
      </div>
      ${arrowHtml}
    </div>
    <div class="widget-delta"></div>
  `;

  setValorComDec(tile.querySelector('.widget-value'), formatNumeroBR(valor));
  const deltaEl = tile.querySelector('.widget-delta');
  if (temVariacao) {
    deltaEl.textContent = `${formatPercentFromPoints(variacaoDia)} hoje`;
    deltaEl.style.color = good ? 'var(--good-ink)' : 'var(--bad-ink)';
  } else {
    deltaEl.textContent = '—';
    deltaEl.style.color = 'var(--ink-faint)';
  }
  return tile;
}

/** Widget-tile de câmbio (USD/EUR) - só valor; a API de hoje não devolve variação do dia pra esses dois (ver Home.gs!montarHome_). */
export function criarTileCambio(doc, { label, valor, extLinkHref }) {
  const tile = criarElementoTile(doc, extLinkHref);
  tile.className = 'widget-tile';

  tile.innerHTML = `
    <div class="widget-tile-top">
      <div>
        <div class="widget-value"></div>
        <div class="widget-label">${label}</div>
      </div>
    </div>
    <div class="widget-delta" style="color:var(--ink-faint)">câmbio</div>
  `;
  setValorComDec(tile.querySelector('.widget-value'), formatBRL(valor));
  return tile;
}

/** Renderiza os cards de Índices & Câmbio dentro de `container` (esvazia antes). Cada campo ausente (ver "avisos") simplesmente não gera um tile - nunca quebra os outros. */
export function renderIndicesCambio(doc, container, { indices, cambio } = {}) {
  container.innerHTML = '';

  if (indices?.ibovespa) {
    container.appendChild(criarTileIndice(doc, {
      label: 'Ibovespa',
      valor: indices.ibovespa.valor,
      variacaoDia: indices.ibovespa.variacaoDia,
      extLinkHref: 'https://www.google.com/finance/quote/IBOV:INDEXBVMF',
    }));
  }
  if (indices?.ifix) {
    container.appendChild(criarTileIndice(doc, {
      label: 'IFIX',
      valor: indices.ifix.valor,
      variacaoDia: indices.ifix.variacaoDia,
      extLinkHref: 'https://www.google.com/finance/quote/IFIX:INDEXBVMF',
    }));
  }
  if (indices?.spx) {
    container.appendChild(criarTileIndice(doc, {
      label: 'S&P 500',
      valor: indices.spx.valor,
      variacaoDia: indices.spx.variacaoDia,
      extLinkHref: 'https://www.google.com/finance/quote/.INX:INDEXSP',
    }));
  }
  if (typeof cambio?.usd === 'number') {
    container.appendChild(criarTileCambio(doc, {
      label: 'Dólar (USD/BRL)',
      valor: cambio.usd,
      extLinkHref: 'https://www.google.com/finance/quote/USD-BRL',
    }));
  }
  if (typeof cambio?.eur === 'number') {
    container.appendChild(criarTileCambio(doc, {
      label: 'Euro (EUR/BRL)',
      valor: cambio.eur,
      extLinkHref: 'https://www.google.com/finance/quote/EUR-BRL',
    }));
  }

  if (!container.children.length) {
    container.innerHTML = '<p class="hint">Sem dado de índices/câmbio nesta chamada.</p>';
  }
}

/**
 * As 3 visões de patrimônio que a Home.gs devolve hoje. porClasse
 * (Ações/FIIs/Renda Fixa/Ações EUA) só existe pro total - não é um
 * recorte por classe dentro de Longo Prazo ou Renda Emergencial, então
 * só aparece na visão "total" (ver renderHero).
 */
const VISOES = {
  total: { chave: 'total', label: 'Patrimônio total · Ações + FIIs + Renda Fixa + Ações EUA' },
  longoPrazo: { chave: 'longoPrazo', label: 'Patrimônio de Longo Prazo · total menos Renda Emergencial' },
  rendaEmergencial: { chave: 'rendaEmergencial', label: 'Renda Emergencial · reserva em Tesouro Selic' },
};

/** {valor, label} pra visão pedida - cai em "total" se o id não for reconhecido. */
export function resolverVisao(patrimonio, visaoId) {
  const visao = VISOES[visaoId] || VISOES.total;
  return { valor: patrimonio ? patrimonio[visao.chave] : undefined, label: visao.label };
}

/** Renderiza o hero de patrimônio pra visão dada dentro de `container` (esvazia antes). */
export function renderHero(doc, container, patrimonio, visaoId = 'total') {
  container.innerHTML = '';
  if (!patrimonio) {
    container.innerHTML = '<p class="hint">Sem dado de patrimônio nesta chamada.</p>';
    return;
  }

  const { valor, label } = resolverVisao(patrimonio, visaoId);

  const hero = doc.createElement('div');
  hero.className = 'hero';
  hero.innerHTML = `
    <div class="hero-top">
      <div>
        <div class="hero-value"></div>
        <div class="hero-label"></div>
      </div>
    </div>
    <div class="hero-note">Veja a variação no período no gráfico de Rentabilidade, logo abaixo.</div>
  `;
  setValorComDec(hero.querySelector('.hero-value'), formatBRL(valor));
  hero.querySelector('.hero-label').textContent = label;

  if (visaoId === 'total' && patrimonio.porClasse) {
    const classes = doc.createElement('div');
    classes.className = 'hero-classes';
    [
      ['acoes', 'Ações', patrimonio.porClasse.acoes],
      ['fiis', 'FIIs', patrimonio.porClasse.fiis],
      ['rf', 'Renda Fixa', patrimonio.porClasse.rendaFixa],
      ['usa', 'Ações EUA', patrimonio.porClasse.acoesEua],
    ].forEach(([classe, nome, val]) => {
      const item = doc.createElement('div');
      item.className = `hero-class ${classe}`;
      item.innerHTML = `<div class="k">${nome}</div><div class="v"></div>`;
      setValorComDec(item.querySelector('.v'), formatBRL(val));
      classes.appendChild(item);
    });
    hero.appendChild(classes);
  }

  container.appendChild(hero);
}

/** Liga os botões .filter-tab de visão (Total/Longo Prazo/Renda Emergencial) à re-renderização do hero, sem precisar buscar nada de novo - patrimonio já veio inteiro na primeira chamada. */
export function wireVisaoTabs(doc, tabsContainer, heroContainer, patrimonio) {
  const botoes = Array.from(tabsContainer.querySelectorAll('.filter-tab'));
  botoes.forEach((botao) => {
    botao.addEventListener('click', () => {
      botoes.forEach((b) => b.classList.toggle('active', b === botao));
      renderHero(doc, heroContainer, patrimonio, botao.dataset.visao);
    });
  });
}

// ============================================================================
// Gráfico de Rentabilidade
// ============================================================================

/** dias corridos de cada preset - historico tem 1 linha por dia corrido (ver
 * cabeçalho), então cortar os últimos N itens do array já é a janela certa,
 * sem precisar comparar datas. */
const DIAS_POR_PERIODO = { '30d': 30, '6m': 182, '12m': 365, '3a': 365 * 3 };

/** Recorta historico pro período pedido - 'tudo' (ou um id desconhecido que
 * não seja 'tudo') devolve o array inteiro. */
export function filtrarHistoricoPorPeriodo(historico, periodoId = '12m') {
  if (!historico || !historico.length) return [];
  const dias = DIAS_POR_PERIODO[periodoId];
  if (!dias) return historico;
  return historico.slice(-dias);
}

const CAMPO_PRINCIPAL_POR_VISAO = { total: 'patrimonio', longoPrazo: 'longoPrazo', rendaEmergencial: 'rendaEmergencial' };

/** Benchmarks por visão - Total/Longo Prazo contra Ibovespa+CDI, Renda
 * Emergencial contra CDI+Selic (decisão registrada em
 * docs/plano-implementacao.html - não compara reserva de emergência com bolsa). */
const BENCHMARKS_POR_VISAO = {
  total: [
    { campo: 'ibovespa', label: 'Ibovespa', cor: '--fiis', dash: '1.5 4.5' },
    { campo: 'indiceCdi', label: 'CDI', cor: '--usa', dash: '6 4' },
  ],
  longoPrazo: [
    { campo: 'ibovespa', label: 'Ibovespa', cor: '--fiis', dash: '1.5 4.5' },
    { campo: 'indiceCdi', label: 'CDI', cor: '--usa', dash: '6 4' },
  ],
  rendaEmergencial: [
    { campo: 'indiceCdi', label: 'CDI', cor: '--usa', dash: '6 4' },
    { campo: 'indiceSelic', label: 'Selic', cor: '--fiis', dash: '1.5 4.5' },
  ],
};

/** Primeiro valor numérico válido (não-nulo, finito) e diferente de zero de
 * `campo` em `historico` - zero como base de "% desde o início" dividiria por
 * zero; ibovespa também pode vir null antes do 1º pregão da janela. */
function primeiroValorValidoInicio_(historico, campo) {
  for (const item of historico) {
    const v = item[campo];
    if (typeof v === 'number' && Number.isFinite(v) && v !== 0) return v;
  }
  return null;
}

/**
 * Normaliza a série de `campo` (dentro de `historico`, já recortado pro
 * período) pra "% desde o início do período" - único jeito de comparar
 * patrimônio (R$) com um índice (pontos ou curva base 100) na mesma escala.
 * Sem base válida (tudo zero/null na janela), devolve todo mundo null em vez
 * de inventar 0% - renderGraficoRentabilidade trata isso mostrando um aviso.
 */
export function normalizarSerieRentabilidade(historico, campo) {
  const base = primeiroValorValidoInicio_(historico, campo);
  if (base == null) return historico.map(() => null);
  return historico.map((item) => {
    const v = item[campo];
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    return ((v / base) - 1) * 100;
  });
}

/** Monta o "d" de um <path> a partir de uma série normalizada, pulando nulos
 * à toa (só existem no começo, antes do 1º valor válido - ver acima) sem
 * quebrar o desenho do resto da linha. */
function pathDRentabilidade_(valores, x, y) {
  let d = '';
  let comecou = false;
  valores.forEach((v, i) => {
    if (v == null) return;
    d += `${comecou ? 'L' : 'M'}${x(i, valores.length).toFixed(1)} ${y(v).toFixed(1)} `;
    comecou = true;
  });
  return d.trim();
}

/**
 * Desenha o gráfico de Rentabilidade (Portfólio vs benchmarks da visão) em
 * `container` - SVG desenhado à mão (mesma técnica/proporções validadas em
 * docs/direcao-visual.html!renderChart, sem depender de biblioteca nenhuma,
 * mesma convenção "no-build" do resto do projeto). Some com um aviso, sem
 * lançar, quando não há histórico (ou histórico de menos de 2 dias, onde uma
 * linha não diz nada).
 */
export function renderGraficoRentabilidade(doc, container, { historico, visaoId = 'total', periodoId = '12m', legendaContainer } = {}) {
  const janela = filtrarHistoricoPorPeriodo(historico, periodoId);
  if (janela.length < 2) {
    container.innerHTML = '<p class="hint">Sem histórico suficiente ainda pra desenhar o gráfico nesse período.</p>';
    if (legendaContainer) legendaContainer.innerHTML = '';
    return;
  }

  const campoPrincipal = CAMPO_PRINCIPAL_POR_VISAO[visaoId] || CAMPO_PRINCIPAL_POR_VISAO.total;
  const benchmarks = BENCHMARKS_POR_VISAO[visaoId] || BENCHMARKS_POR_VISAO.total;

  const seriePrincipal = normalizarSerieRentabilidade(janela, campoPrincipal);
  const seriesBenchmark = benchmarks.map((b) => ({ ...b, valores: normalizarSerieRentabilidade(janela, b.campo) }));

  const W = 1000, H = 220, padL = 52, padR = 10, padT = 14, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const todosValores = [seriePrincipal, ...seriesBenchmark.map((b) => b.valores)].flat().filter((v) => v != null);
  let minV = Math.min(0, ...todosValores);
  let maxV = Math.max(0, ...todosValores);
  const folga = (maxV - minV) * 0.15 || 1;
  minV -= folga; maxV += folga;

  const y = (v) => padT + plotH * (1 - (v - minV) / (maxV - minV));
  const x = (i, n) => padL + plotW * (n > 1 ? i / (n - 1) : 0);

  const ticks = 4;
  let gridSvg = '';
  for (let t = 0; t <= ticks; t += 1) {
    const v = minV + (maxV - minV) * (t / ticks);
    const yy = y(v);
    gridSvg += `<line class="gridline" x1="${padL}" x2="${W - padR}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/>`;
    gridSvg += `<text class="axislabel" x="${padL - 8}" y="${(yy + 3).toFixed(1)}" text-anchor="end">${formatNumeroBR(v, 1)}%</text>`;
  }

  const passos = 4;
  let xLabelsSvg = '';
  for (let i = 0; i < passos; i += 1) {
    const idx = Math.round((janela.length - 1) * (i / (passos - 1)));
    const xx = padL + plotW * (i / (passos - 1));
    const ancora = i === 0 ? 'start' : (i === passos - 1 ? 'end' : 'middle');
    xLabelsSvg += `<text class="axislabel" x="${xx.toFixed(1)}" y="${H - 8}" text-anchor="${ancora}">${formatDateBR(janela[idx].data)}</text>`;
  }

  const benchmarkPathsSvg = seriesBenchmark
    .map((b) => `<path d="${pathDRentabilidade_(b.valores, x, y)}" fill="none" stroke="var(${b.cor})" stroke-width="2" stroke-dasharray="${b.dash}"/>`)
    .join('');
  const principalPathSvg = `<path d="${pathDRentabilidade_(seriePrincipal, x, y)}" fill="none" stroke="var(--acoes)" stroke-width="2.6"/>`;

  container.innerHTML = `<svg class="rentab-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${gridSvg}${xLabelsSvg}${benchmarkPathsSvg}${principalPathSvg}</svg>`;

  if (legendaContainer) {
    legendaContainer.innerHTML = `
      <span class="li"><span class="swline" style="border-color:var(--acoes)"></span>Portfólio</span>
      ${benchmarks.map((b) => `<span class="li"><span class="swline ${b.dash.startsWith('1.5') ? 'dot' : 'dash'}" style="border-color:var(${b.cor})"></span>${b.label}</span>`).join('')}
    `;
  }
}

const LABEL_POR_VISAO_RENTABILIDADE = {
  total: 'Patrimônio total',
  longoPrazo: 'Patrimônio de Longo Prazo',
  rendaEmergencial: 'Renda Emergencial',
};

/**
 * Renderiza o bloco de info (rótulo + valor atual + variação no período)
 * de UM cartão de Rentabilidade - fica dentro do MESMO cartão do gráfico
 * (não mais separado, a pedido do Tiago em 13/09/2026), reaproveitando o
 * ÚLTIMO ponto da mesma série normalizada que alimenta a linha do
 * gráfico (normalizarSerieRentabilidade) como a "variação no período" -
 * uma fonte só pro número e pro desenho, nunca dois cálculos podendo
 * divergir.
 */
export function renderInfoRentabilidade(doc, container, { patrimonio, historico, visaoId = 'total', periodoId = '12m' } = {}) {
  if (!container) return;
  // campo (nomes de HistoricoInicio.gs: patrimonio/longoPrazo/rendaEmergencial) só
  // vale pro historico - o objeto `patrimonio` (Home.gs) usa 'total' pra visão
  // "total", daí reaproveitar resolverVisao (já usado pelo hero) pro valor atual.
  const campo = CAMPO_PRINCIPAL_POR_VISAO[visaoId] || CAMPO_PRINCIPAL_POR_VISAO.total;
  const valorAtual = resolverVisao(patrimonio, visaoId).valor;
  const janela = filtrarHistoricoPorPeriodo(historico, periodoId);
  const serieNormalizada = janela.length >= 2 ? normalizarSerieRentabilidade(janela, campo) : [];
  let ultimoValido = null;
  for (let i = serieNormalizada.length - 1; i >= 0; i -= 1) {
    if (serieNormalizada[i] != null) { ultimoValido = serieNormalizada[i]; break; }
  }

  container.innerHTML = `
    <div class="rentab-card-label">${LABEL_POR_VISAO_RENTABILIDADE[visaoId] || LABEL_POR_VISAO_RENTABILIDADE.total}</div>
    <div class="rentab-card-value"></div>
    <div class="rentab-card-delta"></div>
  `;
  setValorComDec(container.querySelector('.rentab-card-value'), formatBRL(valorAtual));

  const deltaEl = container.querySelector('.rentab-card-delta');
  if (typeof ultimoValido === 'number') {
    const good = ultimoValido >= 0;
    deltaEl.className = `rentab-card-delta ${good ? 'good' : 'bad'}`;
    deltaEl.textContent = `${formatPercentFromPoints(ultimoValido)} no período`;
  } else {
    deltaEl.className = 'rentab-card-delta na';
    deltaEl.textContent = 'sem histórico suficiente no período';
  }
}

/**
 * Liga os pills de período (#periodoTabs) - um filtro só, compartilhado
 * pelos 3 cartões de Rentabilidade (Total/Longo Prazo/Renda Emergencial),
 * que agora ficam sempre visíveis ao mesmo tempo em vez de alternar por
 * aba (mudança de 13/09/2026, a pedido do Tiago: "quero visualizar os
 * três gráficos"). `paineis` é um array com um item por visão -
 * { visaoId, chartContainer, legendaContainer, infoContainer } - cada um
 * é atualizado (info + gráfico) no mesmo clique de período, sem buscar
 * nada de novo (historico/patrimonio já vieram inteiros na 1ª chamada).
 * periodoInicial deve bater com o pill marcado "active" no HTML.
 */
export function wireGraficoRentabilidade(doc, { patrimonio, historico, periodoTabsContainer, paineis = [], periodoInicial = '12m' } = {}) {
  let periodoAtual = periodoInicial;

  function atualizar() {
    paineis.forEach(({ visaoId, chartContainer, legendaContainer, infoContainer }) => {
      renderInfoRentabilidade(doc, infoContainer, { patrimonio, historico, visaoId, periodoId: periodoAtual });
      if (chartContainer) {
        renderGraficoRentabilidade(doc, chartContainer, { historico, visaoId, periodoId: periodoAtual, legendaContainer });
      }
    });
  }

  if (periodoTabsContainer) {
    const botoesPeriodo = Array.from(periodoTabsContainer.querySelectorAll('.filter-tab'));
    botoesPeriodo.forEach((botao) => {
      botao.addEventListener('click', () => {
        botoesPeriodo.forEach((b) => b.classList.toggle('active', b === botao));
        periodoAtual = botao.dataset.periodo;
        atualizar();
      });
    });
  }

  atualizar();
}

// ============================================================================
// Grade "Meus Ativos"
// ============================================================================

const CLASSE_LABEL_ATIVO = { acoes: 'Ação', fiis: 'FII', usa: 'EUA', rf: 'RF' };

/** ref pra ativo.html?ref=&classe= (docs/plano-implementacao.html) - Renda
 * Fixa é identificada por Código, não por ticker de bolsa (o "ticker" de RF
 * aqui já é um rótulo composto - tipo + vencimento - não um identificador). */
function refDoAtivo_(ativo) {
  return ativo.classe === 'rf' ? (ativo.codigo || ativo.ticker) : ativo.ticker;
}

/**
 * Cria um .ativo-card - cartão inteiro é o link pro Detalhe do Ativo
 * (ativo.html, ainda não construído - próxima parte), sem link externo
 * separado, mesmo padrão já aplicado aos widget-tiles de índices/câmbio.
 * Renda Fixa não tem preço-teto (não existe preço-teto pra título de renda
 * fixa) nem viés - mostra o saldo atualizado no lugar do preço, e o
 * indexador/vencimento no lugar do desconto sobre P/VP ou P/L.
 */
export function criarAtivoCard(doc, ativo) {
  const card = doc.createElement('a');
  card.className = `ativo-card ${ativo.classe}`;
  card.href = `ativo.html?ref=${encodeURIComponent(refDoAtivo_(ativo))}&classe=${encodeURIComponent(ativo.classe)}`;

  const viesHtml = ativo.vies
    ? `<span class="vies-badge ${ativo.vies}">${ativo.vies === 'comprar' ? 'Comprar' : 'Aguardar'}</span>`
    : '';

  let precoHtml;
  let deltaHtml;
  let detalheHtml;

  if (ativo.classe === 'rf') {
    precoHtml = `<div class="ativo-price"></div>`;
    const temVariacao = typeof ativo.variacaoDia === 'number' && Number.isFinite(ativo.variacaoDia);
    const good = temVariacao && ativo.variacaoDia >= 0;
    deltaHtml = temVariacao
      ? `<div class="ativo-delta ${good ? 'good' : 'bad'}">${formatPercentFromFraction(ativo.variacaoDia)} <span class="dim">hoje</span></div>`
      : '';
    detalheHtml = `<div class="ativo-detalhe">${[ativo.indexador, ativo.vencimento ? `vence ${ativo.vencimento}` : null].filter(Boolean).join(' · ')}</div>`;
  } else {
    const temVariacao = typeof ativo.variacaoDia === 'number' && Number.isFinite(ativo.variacaoDia);
    const good = temVariacao && ativo.variacaoDia >= 0;
    precoHtml = `<div class="ativo-price"></div>`;
    deltaHtml = temVariacao
      ? `<div class="ativo-delta ${good ? 'good' : 'bad'}">${formatPercentFromFraction(ativo.variacaoDia)} <span class="dim">hoje</span></div>`
      : '<div class="ativo-delta na">—</div>';
    const desconto = ativo.classe === 'usa' || ativo.classe === 'acoes' ? ativo.descontoPL : ativo.descontoPVp;
    detalheHtml = desconto ? `<div class="ativo-detalhe">Desconto: ${desconto}</div>` : '';
  }

  card.innerHTML = `
    <div class="ativo-card-top">
      <div class="ativo-id">
        <span class="ativo-ticker">${ativo.ticker}</span>
        <span class="ativo-classe ${ativo.classe}">${CLASSE_LABEL_ATIVO[ativo.classe] || ativo.classe}</span>
      </div>
      ${viesHtml}
    </div>
    ${precoHtml}
    ${deltaHtml}
    ${detalheHtml}
  `;

  const precoEl = card.querySelector('.ativo-price');
  if (ativo.classe === 'rf') {
    setValorComDec(precoEl, formatBRL(ativo.valorAtualizado));
  } else if (ativo.classe === 'usa') {
    setValorComDec(precoEl, formatUSD(ativo.precoAtual));
    if (typeof ativo.precoAtualBRL === 'number') {
      const conv = doc.createElement('span');
      conv.className = 'ativo-price-conv';
      conv.textContent = ` (${formatBRL(ativo.precoAtualBRL)})`;
      precoEl.appendChild(conv);
    }
  } else {
    setValorComDec(precoEl, formatBRL(ativo.precoAtual));
  }

  return card;
}

/** Renderiza a grade de Meus Ativos, filtrando por classe ('todos' mostra tudo). Esvazia `container` antes. */
export function renderMeusAtivos(doc, container, ativos, filtroClasse = 'todos') {
  container.innerHTML = '';
  const lista = (ativos || []).filter((a) => filtroClasse === 'todos' || a.classe === filtroClasse);

  if (!lista.length) {
    container.innerHTML = '<p class="hint">Nenhum ativo nessa categoria.</p>';
    return;
  }

  lista.forEach((ativo) => container.appendChild(criarAtivoCard(doc, ativo)));
}

/** Liga as abas de categoria (#filtroAtivosTabs) à re-renderização da grade - ativos já veio inteiro na primeira chamada, nunca busca de novo. */
export function wireFiltroAtivos(doc, tabsContainer, gridContainer, ativos) {
  const botoes = Array.from(tabsContainer.querySelectorAll('.filter-tab'));
  botoes.forEach((botao) => {
    botao.addEventListener('click', () => {
      botoes.forEach((b) => b.classList.toggle('active', b === botao));
      renderMeusAtivos(doc, gridContainer, ativos, botao.dataset.classe);
    });
  });
}

/** Banner de avisos (falha parcial de alguma seção) - some quando não há nenhum. */
export function renderAvisos(container, avisos) {
  if (!avisos || Object.keys(avisos).length === 0) {
    container.innerHTML = '';
    container.hidden = true;
    return;
  }
  container.innerHTML = `Algumas seções não carregaram agora: ${Object.entries(avisos)
    .map(([secao, erro]) => `<b>${secao}</b>: ${erro}`)
    .join(' · ')}`;
  container.hidden = false;
}

/**
 * Orquestrador real: busca action=home com o token e liga tudo - chamado
 * pelo index.html assim que o login é confirmado (mountShell!onAuthenticated,
 * ver shell.js). getHomeImpl é injetável pra teste (sem precisar de
 * fetch/token reais).
 */
export async function montarPaginaInicio(token, { doc = document, getHomeImpl = getHome } = {}) {
  const loadingEl = doc.getElementById('inicioLoading');
  const erroEl = doc.getElementById('inicioErro');
  const conteudoEl = doc.getElementById('inicioConteudo');

  const resposta = await getHomeImpl(token);

  if (loadingEl) loadingEl.hidden = true;

  if (!resposta.ok) {
    if (erroEl) {
      erroEl.hidden = false;
      erroEl.textContent = `Não deu pra carregar a Início agora (${resposta.etapa || '?'}): ${resposta.erro || 'erro desconhecido'}.`;
    }
    return;
  }

  if (conteudoEl) conteudoEl.hidden = false;

  renderAvisos(doc.getElementById('inicioAvisos'), resposta.avisos);
  renderIndicesCambio(doc, doc.getElementById('indicesCambioGrid'), { indices: resposta.indices, cambio: resposta.cambio });
  renderHero(doc, doc.getElementById('heroPatrimonio'), resposta.patrimonio, 'total');
  wireVisaoTabs(doc, doc.getElementById('visaoTabs'), doc.getElementById('heroPatrimonio'), resposta.patrimonio);

  const PAINEIS_RENTABILIDADE = [
    { visaoId: 'total', sufixo: 'Total' },
    { visaoId: 'longoPrazo', sufixo: 'LongoPrazo' },
    { visaoId: 'rendaEmergencial', sufixo: 'RendaEmergencial' },
  ];
  wireGraficoRentabilidade(doc, {
    patrimonio: resposta.patrimonio,
    historico: resposta.historico,
    periodoTabsContainer: doc.getElementById('periodoTabs'),
    paineis: PAINEIS_RENTABILIDADE.map(({ visaoId, sufixo }) => ({
      visaoId,
      infoContainer: doc.getElementById(`rentabInfo${sufixo}`),
      chartContainer: doc.getElementById(`rentabChart${sufixo}`),
      legendaContainer: doc.getElementById(`rentabLegenda${sufixo}`),
    })),
  });

  renderMeusAtivos(doc, doc.getElementById('meusAtivosGrid'), resposta.ativos, 'todos');
  wireFiltroAtivos(doc, doc.getElementById('filtroAtivosTabs'), doc.getElementById('meusAtivosGrid'), resposta.ativos);
}
