/**
 * pages/inicio.js — renderização da página Início, Fase 2 / Parte 1:
 * cards de Índices & Câmbio + hero de Patrimônio (3 visões: Total /
 * Longo Prazo / Renda Emergencial). O gráfico de Rentabilidade (com
 * seletor de período) e a grade "Meus Ativos" ficam pras próximas
 * partes (ver docs/plano-implementacao.html, Fase 2, e o combinado
 * registrado em docs/historico-projeto.md).
 *
 * Mesmo padrão de shell.js/auth-ui.js: funções puras de renderização
 * (recebem doc + elemento + dado já pronto, nunca buscam nada sozinhas)
 * e um único orquestrador real (montarPaginaInicio) que busca de
 * verdade via api-client.js!getHome e liga tudo. Os testes exercitam as
 * funções puras contra um jsdom, sem precisar de fetch de verdade nem
 * de um token real.
 *
 * "avisos" (falha parcial de uma seção só) é tratado exatamente como o
 * back-end trata (ver Home.gs) - cada pedaço (índices/câmbio, hero)
 * aparece se veio, e falta silenciosamente (com um aviso) se não veio,
 * em vez de uma falha em uma seção derrubar a página inteira.
 */

import { getHome } from '../api-client.js';
import { formatBRL, formatNumeroBR, formatPercentFromPoints } from '../format.js';

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
    <div class="hero-note">A variação no período chega com o gráfico de Rentabilidade, na próxima parte.</div>
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
}
