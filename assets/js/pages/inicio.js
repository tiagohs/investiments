/**
 * pages/inicio.js — renderização da página Início, Fase 2 completa:
 * cards de Índices & Câmbio, resumo de Patrimônio (Total / Longo Prazo /
 * Renda Emergencial, os 3 sempre visíveis, sem precisar clicar em nada -
 * ver renderResumoPatrimonio), gráfico de Rentabilidade (com filtro de
 * período contextual, próprio desta página) e a grade "Meus Ativos"
 * (cartão inteiro clicável pro Detalhe do Ativo, ainda não construído -
 * ver "ativo.html" em docs/plano-implementacao.html, ativo.html?ref=&classe=).
 *
 * Mesmo padrão de shell.js/auth-ui.js: funções puras de renderização
 * (recebem doc + elemento + dado já pronto, nunca buscam nada sozinhas)
 * e um único orquestrador real (montarPaginaInicio) que busca de
 * verdade via api-client.js!getHome e liga tudo. Os testes exercitam as
 * funções puras contra um jsdom, sem precisar de fetch de verdade nem
 * de um token real.
 *
 * "avisos" (falha parcial de uma seção só) é tratado exatamente como o
 * back-end trata (ver Home.gs) - cada pedaço (índices/câmbio, resumo,
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
 *
 * Ajuste do mesmo dia (feedback do Tiago com print): três mudanças na
 * mesma leva, todas interligadas -
 *  1) o resumo de patrimônio (antes um "hero" com abas Total/Longo
 *     Prazo/Renda Emergencial, só uma visão por vez) virou
 *     renderResumoPatrimonio - as 3 divisões aparecem juntas, sem clique;
 *  2) cada gráfico de Rentabilidade agora desenha seu <svg> na LARGURA
 *     REAL do próprio cartão (medida via clientWidth), em vez de um
 *     viewBox fixo (0 0 1000 220) esticado por preserveAspectRatio="none".
 *     Esse viewBox fixo era o motivo da fonte do eixo (font-size em
 *     unidade do SVG) renderizar menor nos 2 cartões lado a lado
 *     (Longo Prazo/Renda Emergencial, mais estreitos) do que no cartão
 *     Total (largura cheia) - a mesma unidade de viewBox virava menos
 *     pixels de tela quanto mais estreito o cartão. Com viewBox largura
 *     = largura real do cartão em px, 1 unidade de SVG = 1px de tela
 *     sempre, não importa a largura do cartão - fonte sempre no mesmo
 *     tamanho visual. wireGraficoRentabilidade também escuta "resize" da
 *     janela (com debounce) e redesenha, pra não ficar com a medida
 *     antiga se a janela mudar de tamanho depois do primeiro desenho;
 *  3) a % de cada benchmark no período (CDI/Ibovespa/Selic) passou a
 *     aparecer junto do próprio nome dele na legenda de cada gráfico
 *     (em vez de um elemento novo na página) - é o lugar onde o olho já
 *     vai pra identificar qual linha é qual, então é ali que o número
 *     faz sentido, sem inflar o total de texto da página.
 *
 * Correção do mesmo dia, 2ª rodada (Tiago viu o resultado e apontou 2
 * problemas):
 *  a) a % de cada benchmark na legenda estava mostrando o retorno
 *     ABSOLUTO do próprio benchmark (ex.: "Ibovespa +12,03%"), não
 *     "quanto minha carteira ganhou ou perdeu" EM RELAÇÃO a ele (o que
 *     Tiago pediu desde o início - ver o exemplo dele "+15% CDI, -2%
 *     Ibovespa"). Se o portfólio subiu 5% e o Ibovespa subiu 12%, o
 *     portfólio está ATRÁS do Ibovespa (deveria aparecer negativo), não
 *     "+12,03%" em verde do lado. Corrigido: a % agora é a DIFERENÇA
 *     (retorno do portfólio − retorno do benchmark, mesma unidade "%
 *     desde o início do período" que já alimenta os dois), positiva
 *     quando o portfólio bate o benchmark, negativa quando fica atrás;
 *  b) o detalhamento por classe (antes um texto corrido só no cartão
 *     Total) virou um "donut" (SVG simples, técnica de
 *     stroke-dasharray sobre um círculo, sem biblioteca nenhuma) +
 *     legenda com nome/%, replicado nos 3 cartões do resumo:
 *     Total (Ações/FIIs/Renda Fixa/Ações EUA), Longo Prazo (as mesmas 4
 *     classes, mas excluindo a reserva de emergência de dentro de Renda
 *     Fixa - por isso a fatia de Renda Fixa é menor que a do Total) e
 *     Renda Emergencial (que é 100% Renda Fixa, então em vez de
 *     classe, mostra por TIPO de investimento - Tesouro Selic, Tesouro
 *     IPCA, CDB, LCI/LCA etc., via o campo tipoInvestimento que já vem
 *     em cada ativo de Renda Fixa). Total e Longo Prazo são calculados
 *     a partir do array `ativos` (não de patrimonio.porClasse, que só
 *     cobre o total combinado) - ver calcularDistribuicaoPorClasse /
 *     calcularDistribuicaoRendaEmergencial.
 *
 * Correção do mesmo dia, 3ª rodada (Tiago testou de novo):
 *  a) passar o mouse (ou tocar, no celular) no gráfico de Rentabilidade
 *     não mostrava nada - não havia NENHUMA interação ligada ao <svg>,
 *     só o desenho estático. Agora um <rect> transparente
 *     (.rentab-hitarea) escuta Pointer Events (mesma API pra mouse e
 *     touch) e liga uma linha-guia + um ponto por série + uma tooltip
 *     (HTML normal, fora do SVG - ver ligarInteracaoGrafico_) com a data
 *     e o valor de cada linha naquele ponto;
 *  b) o "no período" só mostrava a % - Tiago também quer o valor em R$
 *     ganho/perdido (renderInfoRentabilidade agora calcula os dois a
 *     partir do MESMO par de pontos brutos, pra nunca divergir).
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
 * recorte por classe dentro de Longo Prazo ou Renda Emergencial.
 */
const VISOES = {
  total: { chave: 'total', label: 'Patrimônio total' },
  longoPrazo: { chave: 'longoPrazo', label: 'Longo Prazo' },
  rendaEmergencial: { chave: 'rendaEmergencial', label: 'Renda Emergencial' },
};

/** {valor, label} pra visão pedida - cai em "total" se o id não for reconhecido. */
export function resolverVisao(patrimonio, visaoId) {
  const visao = VISOES[visaoId] || VISOES.total;
  return { valor: patrimonio ? patrimonio[visao.chave] : undefined, label: visao.label };
}

const ORDEM_RESUMO = ['total', 'longoPrazo', 'rendaEmergencial'];

const CLASSE_LABEL_DISTRIB = { acoes: 'Ações', fiis: 'FIIs', rf: 'Renda Fixa', usa: 'Ações EUA' };
const CLASSE_COR_DISTRIB = { acoes: '--acoes', fiis: '--fiis', rf: '--rf', usa: '--usa' };
const ORDEM_CLASSE_DISTRIB = ['acoes', 'fiis', 'rf', 'usa'];

/** Valor de posição (BRL) de UM ativo - Renda Fixa já vem como saldo
 * (valorAtualizado), Ações/FIIs são preço unitário × quantidade, Ações
 * EUA preferem o preço unitário já convertido (precoAtualBRL, calculado
 * pelo back-end - ver MeusAtivos.gs) e só caem pro câmbio manual
 * (precoAtual × cambioUsd) se por algum motivo esse campo não vier. */
function valorPosicaoAtivo_(ativo, cambioUsd) {
  if (ativo.classe === 'rf') return typeof ativo.valorAtualizado === 'number' ? ativo.valorAtualizado : 0;
  const qtd = typeof ativo.quantidade === 'number' ? ativo.quantidade : 0;
  if (ativo.classe === 'usa') {
    if (typeof ativo.precoAtualBRL === 'number') return ativo.precoAtualBRL * qtd;
    if (typeof cambioUsd === 'number' && typeof ativo.precoAtual === 'number') return ativo.precoAtual * qtd * cambioUsd;
    return 0;
  }
  return typeof ativo.precoAtual === 'number' ? ativo.precoAtual * qtd : 0;
}

/**
 * Soma o valor de posição (BRL) de cada classe (Ações/FIIs/Renda
 * Fixa/Ações EUA) dentro de `ativos` - usado pra desenhar a distribuição
 * do Total e da divisão Longo Prazo. `excluirEmergencial` tira as
 * posições de Renda Fixa marcadas "Renda Emergencial" (marca==='emergencial')
 * da soma - é assim que a distribuição de Longo Prazo difere da do
 * Total (mesmas 4 classes, só que a fatia de Renda Fixa fica menor,
 * já que a reserva de emergência saiu). Calculado a partir do array
 * `ativos` (não de patrimonio.porClasse, que só existe pro total
 * combinado - ver Home.gs) - classes com valor zero/ausente não entram.
 */
export function calcularDistribuicaoPorClasse(ativos, { cambioUsd, excluirEmergencial = false } = {}) {
  const somas = { acoes: 0, fiis: 0, rf: 0, usa: 0 };
  (ativos || []).forEach((ativo) => {
    if (excluirEmergencial && ativo.classe === 'rf' && ativo.marca === 'emergencial') return;
    if (!(ativo.classe in somas)) return;
    somas[ativo.classe] += valorPosicaoAtivo_(ativo, cambioUsd);
  });
  return ORDEM_CLASSE_DISTRIB
    .filter((classe) => somas[classe] > 0)
    .map((classe) => ({ label: CLASSE_LABEL_DISTRIB[classe], cor: `var(${CLASSE_COR_DISTRIB[classe]})`, valor: somas[classe] }));
}

/**
 * Distribuição da Renda Emergencial por TIPO de investimento (Tesouro
 * Selic, Tesouro IPCA, CDB, LCI/LCA etc., via o campo tipoInvestimento
 * que cada ativo de Renda Fixa já traz) - a pedido do Tiago, já que
 * Renda Emergencial é 100% Renda Fixa (uma distribuição por CLASSE, como
 * as outras 2 divisões, não diria nada de novo aqui). Ordenado do maior
 * pro menor valor.
 */
export function calcularDistribuicaoRendaEmergencial(ativos) {
  const somas = new Map();
  (ativos || []).forEach((ativo) => {
    if (ativo.classe !== 'rf' || ativo.marca !== 'emergencial') return;
    const tipo = ativo.tipoInvestimento || 'Outro';
    const valor = typeof ativo.valorAtualizado === 'number' ? ativo.valorAtualizado : 0;
    somas.set(tipo, (somas.get(tipo) || 0) + valor);
  });
  return Array.from(somas.entries())
    .filter(([, valor]) => valor > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([tipo, valor]) => ({ label: tipo, valor }));
}

/** Paleta de cores pra fatias sem token dedicado (caso da Renda
 * Emergencial, que não tem uma cor fixa por tipo de investimento) -
 * cicla pelos mesmos tokens categóricos já usados no resto do app. */
const PALETA_DISTRIB_FALLBACK = ['--rf', '--fiis', '--usa', '--acoes', '--warn', '--na'];

/**
 * Desenha um "donut" (SVG simples - um círculo com stroke-dasharray por
 * fatia, técnica que não depende de biblioteca nenhuma, mesma convenção
 * do resto do projeto) + a legenda (nome e %) dentro de `container`
 * (esvazia antes). Ao contrário do gráfico de Rentabilidade, os textos
 * aqui (nome/%) ficam em HTML normal FORA do SVG - um donut não precisa
 * de rótulo desenhado dentro do próprio desenho, então não corre o
 * mesmo risco de fonte minúscula que o gráfico de linha teve (ver
 * renderGraficoRentabilidade). `fatias` é `[{ label, valor, cor? }]` -
 * `cor` é opcional (cai na paleta PALETA_DISTRIB_FALLBACK quando não
 * vem, caso da Renda Emergencial).
 */
export function renderDistribuicao(doc, container, fatias) {
  container.innerHTML = '';
  const total = (fatias || []).reduce((soma, f) => soma + f.valor, 0);
  if (!fatias || !fatias.length || total <= 0) {
    container.innerHTML = '<p class="hint">Sem dado suficiente pra montar a distribuição.</p>';
    return;
  }

  const R = 15.9155; // raio cuja circunferência (2πR) dá ~100 - 1 unidade de dasharray = 1% da volta.
  let acumulado = 0;
  const arcosSvg = fatias.map((f, i) => {
    const pct = (f.valor / total) * 100;
    const cor = f.cor || `var(${PALETA_DISTRIB_FALLBACK[i % PALETA_DISTRIB_FALLBACK.length]})`;
    const dashoffset = (25 - acumulado).toFixed(2);
    acumulado += pct;
    return `<circle class="distrib-arco" cx="21" cy="21" r="${R}" fill="none" stroke="${cor}" stroke-width="7" stroke-dasharray="${pct.toFixed(2)} ${(100 - pct).toFixed(2)}" stroke-dashoffset="${dashoffset}"/>`;
  }).join('');

  const wrap = doc.createElement('div');
  wrap.className = 'distrib';
  wrap.innerHTML = `
    <svg class="distrib-donut" viewBox="0 0 42 42" aria-hidden="true">${arcosSvg}</svg>
    <div class="distrib-legenda"></div>
  `;

  const legenda = wrap.querySelector('.distrib-legenda');
  fatias.forEach((f, i) => {
    const pct = (f.valor / total) * 100;
    const cor = f.cor || `var(${PALETA_DISTRIB_FALLBACK[i % PALETA_DISTRIB_FALLBACK.length]})`;
    const item = doc.createElement('div');
    item.className = 'distrib-item';
    item.innerHTML = `
      <span class="distrib-dot" style="background:${cor}"></span>
      <span class="distrib-nome">${f.label}</span>
      <span class="distrib-pct"></span>
    `;
    item.querySelector('.distrib-pct').textContent = `${formatNumeroBR(pct, 1)}%`;
    legenda.appendChild(item);
  });

  container.appendChild(wrap);
}

/**
 * Renderiza o resumo de patrimônio (Total / Longo Prazo / Renda
 * Emergencial) dentro de `container` (esvazia antes) - as 3 divisões
 * lado a lado, sempre visíveis de cara, sem aba/clique nenhum (mudança
 * de 13/09/2026 a pedido do Tiago: "mostre também os números das três
 * divisões, sem eu precisar clicar em botão"). Cada cartão traz também
 * a distribuição (donut) da própria divisão - Total e Longo Prazo por
 * classe, Renda Emergencial por tipo de investimento (ver
 * calcularDistribuicaoPorClasse/calcularDistribuicaoRendaEmergencial).
 */
export function renderResumoPatrimonio(doc, container, { patrimonio, ativos, cambio } = {}) {
  container.innerHTML = '';
  if (!patrimonio) {
    container.innerHTML = '<p class="hint">Sem dado de patrimônio nesta chamada.</p>';
    return;
  }

  const cambioUsd = cambio?.usd;
  const grid = doc.createElement('div');
  grid.className = 'resumo-grid';

  ORDEM_RESUMO.forEach((visaoId) => {
    const { valor, label } = resolverVisao(patrimonio, visaoId);
    const card = doc.createElement('div');
    card.className = `resumo-card${visaoId === 'total' ? ' resumo-card-total' : ''}`;
    card.innerHTML = `
      <div class="resumo-label">${label}</div>
      <div class="resumo-value"></div>
      <div class="resumo-distrib"></div>
    `;
    setValorComDec(card.querySelector('.resumo-value'), formatBRL(valor));

    const distribContainer = card.querySelector('.resumo-distrib');
    if (visaoId === 'rendaEmergencial') {
      renderDistribuicao(doc, distribContainer, calcularDistribuicaoRendaEmergencial(ativos));
    } else {
      renderDistribuicao(doc, distribContainer, calcularDistribuicaoPorClasse(ativos, {
        cambioUsd,
        excluirEmergencial: visaoId === 'longoPrazo',
      }));
    }

    grid.appendChild(card);
  });

  container.appendChild(grid);
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

/** Último valor não-nulo de uma série já normalizada ("% desde o início do
 * período") - usado tanto pro delta do portfólio (renderInfoRentabilidade)
 * quanto pro delta de cada benchmark na legenda (renderGraficoRentabilidade),
 * uma implementação só pros dois nunca divergirem. */
function ultimoValidoDe_(serieNormalizada) {
  for (let i = serieNormalizada.length - 1; i >= 0; i -= 1) {
    if (serieNormalizada[i] != null) return serieNormalizada[i];
  }
  return null;
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

/** Largura real (em px) de `container` - clientWidth/getBoundingClientRect
 * num navegador de verdade já refletem o layout (grid de 1 ou 2 colunas,
 * `.wrap` etc.) no momento em que o gráfico é desenhado. Em ambiente sem
 * layout de verdade (jsdom dos testes) essas leituras vêm 0 - cai num valor
 * fixo só pra ter uma medida determinística nos testes. */
function larguraReal_(container) {
  const w = container.clientWidth || (container.getBoundingClientRect && container.getBoundingClientRect().width) || 0;
  return w > 40 ? Math.round(w) : 640;
}

/**
 * Liga o hover (mouse) e o touch do gráfico de Rentabilidade - Pointer
 * Events cobre os dois com a mesma API, sem precisar de handlers
 * separados de mouse/touch. `.rentab-hitarea` é um <rect> transparente
 * cobrindo a área de plotagem; como o viewBox do SVG já usa a largura
 * REAL do cartão (W - ver o cabeçalho do arquivo), 1 unidade de SVG =
 * 1px de tela, então dá pra converter clientX direto pra coordenada do
 * gráfico sem nenhuma conta de escala - só subtrair a borda esquerda do
 * próprio <svg> (svgEl.getBoundingClientRect().left).
 */
function ligarInteracaoGrafico_(container, { janela, seriePrincipal, seriesBenchmark, x, y, padL, plotW, W }) {
  const svgEl = container.querySelector('svg.rentab-chart');
  const hitarea = container.querySelector('.rentab-hitarea');
  const hoverGroup = container.querySelector('.rentab-hover');
  const linhaHover = container.querySelector('.rentab-hover-linha');
  const tooltip = container.querySelector('.rentab-tooltip');
  if (!svgEl || !hitarea || !hoverGroup || !linhaHover || !tooltip) return;

  const pontoPrincipal = container.querySelector('.rentab-hover-ponto[data-serie="principal"]');
  const pontosBenchmark = seriesBenchmark.map((b) => container.querySelector(`.rentab-hover-ponto[data-serie="${b.campo}"]`));

  function indiceNoClientX_(clientX) {
    const rect = svgEl.getBoundingClientRect();
    const svgX = clientX - rect.left;
    const fracao = plotW > 0 ? (svgX - padL) / plotW : 0;
    return Math.min(janela.length - 1, Math.max(0, Math.round(fracao * (janela.length - 1))));
  }

  function posicionarPonto_(el, valor, i) {
    if (!el) return;
    if (typeof valor !== 'number') {
      el.setAttribute('hidden', '');
      return;
    }
    el.removeAttribute('hidden');
    el.setAttribute('cx', x(i, janela.length).toFixed(1));
    el.setAttribute('cy', y(valor).toFixed(1));
  }

  function mostrar_(clientX) {
    const i = indiceNoClientX_(clientX);
    const xx = x(i, janela.length);

    linhaHover.setAttribute('x1', xx.toFixed(1));
    linhaHover.setAttribute('x2', xx.toFixed(1));
    posicionarPonto_(pontoPrincipal, seriePrincipal[i], i);
    seriesBenchmark.forEach((b, idx) => posicionarPonto_(pontosBenchmark[idx], b.valores[i], i));
    hoverGroup.removeAttribute('hidden');

    const linhasTooltip = [
      { label: 'Portfólio', cor: 'var(--acoes)', valor: seriePrincipal[i] },
      ...seriesBenchmark.map((b) => ({ label: b.label, cor: `var(${b.cor})`, valor: b.valores[i] })),
    ].map((linha) => `
      <div class="rentab-tooltip-item">
        <span class="dot" style="background:${linha.cor}"></span>${linha.label}
        <b>${typeof linha.valor === 'number' ? formatPercentFromPoints(linha.valor) : '—'}</b>
      </div>
    `).join('');
    tooltip.innerHTML = `<div class="rentab-tooltip-data">${formatDateBR(janela[i].data)}</div>${linhasTooltip}`;
    tooltip.hidden = false;

    const larguraTooltip = tooltip.offsetWidth || 150;
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

/**
 * Desenha o gráfico de Rentabilidade (Portfólio vs benchmarks da visão) em
 * `container` - SVG desenhado à mão (mesma técnica validada em
 * docs/direcao-visual.html!renderChart, sem depender de biblioteca nenhuma).
 *
 * viewBox na LARGURA REAL do cartão (13/09/2026, ver cabeçalho do arquivo):
 * antes o viewBox era fixo (0 0 1000 220) e o CSS esticava esse desenho pra
 * caber no cartão (preserveAspectRatio="none") - num cartão mais estreito
 * (Longo Prazo/Renda Emergencial, lado a lado) a MESMA unidade de SVG virava
 * menos pixels de tela, encolhendo a fonte dos rótulos junto. Agora o
 * viewBox usa a largura medida de verdade (W = larguraReal_(container)) e a
 * altura fixa do CSS (H, igual .rentab-chart{height:...} em inicio.css) -
 * 1 unidade de SVG = 1px de tela sempre, não importa a largura do cartão, e
 * o número de rótulos do eixo X se adapta (menos rótulo em cartão estreito,
 * pra não amontoar). Some com um aviso, sem lançar, quando não há histórico
 * (ou histórico de menos de 2 dias, onde uma linha não diz nada). Liga
 * também o hover/touch (ver ligarInteracaoGrafico_, logo acima) depois de
 * montar o SVG.
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
  const seriesBenchmark = benchmarks.map((b) => {
    const valores = normalizarSerieRentabilidade(janela, b.campo);
    return { ...b, valores, delta: ultimoValidoDe_(valores) };
  });

  const W = larguraReal_(container);
  const H = 190;
  const padL = 44, padR = 8, padT = 12, padB = 22;
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

  // Cartão estreito (2 lado a lado) cabe menos rótulo de data sem amontoar.
  const passos = W < 460 ? 3 : (W < 720 ? 4 : 5);
  let xLabelsSvg = '';
  for (let i = 0; i < passos; i += 1) {
    const idx = Math.round((janela.length - 1) * (i / (passos - 1)));
    const xx = padL + plotW * (i / (passos - 1));
    const ancora = i === 0 ? 'start' : (i === passos - 1 ? 'end' : 'middle');
    xLabelsSvg += `<text class="axislabel" x="${xx.toFixed(1)}" y="${H - 7}" text-anchor="${ancora}">${formatDateBR(janela[idx].data)}</text>`;
  }

  const benchmarkPathsSvg = seriesBenchmark
    .map((b) => `<path d="${pathDRentabilidade_(b.valores, x, y)}" fill="none" stroke="var(${b.cor})" stroke-width="2" stroke-dasharray="${b.dash}"/>`)
    .join('');
  const principalPathSvg = `<path d="${pathDRentabilidade_(seriePrincipal, x, y)}" fill="none" stroke="var(--acoes)" stroke-width="2.6"/>`;

  // Hover/touch (13/09/2026, 3ª rodada - Tiago reportou que passar o mouse ou
  // tocar no gráfico não mostrava nada): um <g> com a linha-guia vertical +
  // um ponto por série, escondido até o 1º movimento, e um <rect>
  // transparente (`.rentab-hitarea`) cobrindo a área de plotagem que
  // escuta Pointer Events (mouse e touch pela mesma API) - ver
  // ligarInteracaoGrafico_ logo abaixo, que calcula o índice mais próximo
  // do ponteiro e monta a tooltip (HTML normal, fora do SVG, mesmo
  // cuidado com escala de fonte do gráfico em si).
  const pontosHoverSvg = [
    '<circle class="rentab-hover-ponto" data-serie="principal" r="3.6" fill="var(--acoes)" hidden/>',
    ...seriesBenchmark.map((b) => `<circle class="rentab-hover-ponto" data-serie="${b.campo}" r="3.2" fill="var(${b.cor})" hidden/>`),
  ].join('');

  container.innerHTML = `
    <svg class="rentab-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      ${gridSvg}${xLabelsSvg}${benchmarkPathsSvg}${principalPathSvg}
      <g class="rentab-hover" hidden>
        <line class="rentab-hover-linha" x1="0" x2="0" y1="${padT}" y2="${H - padB}"/>
        ${pontosHoverSvg}
      </g>
      <rect class="rentab-hitarea" x="${padL}" y="${padT}" width="${Math.max(plotW, 0)}" height="${Math.max(plotH, 0)}" fill="transparent" pointer-events="all"/>
    </svg>
    <div class="rentab-tooltip" hidden></div>
  `;

  ligarInteracaoGrafico_(container, { janela, seriePrincipal, seriesBenchmark, x, y, padL, plotW, W });

  if (legendaContainer) {
    // 13/09/2026 (2ª rodada): a % ao lado do benchmark é RELATIVA ao
    // portfólio (retorno do portfólio − retorno do benchmark, mesma
    // série "% desde o início do período") - não o retorno absoluto do
    // próprio benchmark. Positiva = portfólio bateu o benchmark no
    // período; negativa = ficou atrás. Ver correção no cabeçalho do
    // arquivo (Tiago apontou que "+12,03%" ao lado do Ibovespa lia como
    // um ganho, quando na verdade o portfólio estava atrás dele).
    const deltaPrincipal = ultimoValidoDe_(seriePrincipal);
    const liBenchmarks = seriesBenchmark.map((b) => {
      const cls = b.dash.startsWith('1.5') ? 'dot' : 'dash';
      const relativo = (typeof deltaPrincipal === 'number' && typeof b.delta === 'number')
        ? deltaPrincipal - b.delta
        : null;
      const deltaHtml = typeof relativo === 'number'
        ? `<b class="li-delta ${relativo >= 0 ? 'good' : 'bad'}">${formatPercentFromPoints(relativo)}</b>`
        : '';
      return `<span class="li"><span class="swline ${cls}" style="border-color:var(${b.cor})"></span>${b.label}${deltaHtml}</span>`;
    }).join('');
    legendaContainer.innerHTML = `
      <span class="li"><span class="swline" style="border-color:var(--acoes)"></span>Portfólio</span>
      ${liBenchmarks}
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
 * de UM cartão de Rentabilidade - fica dentro do MESMO cartão do gráfico,
 * reaproveitando o ÚLTIMO ponto da mesma série normalizada que alimenta a
 * linha do gráfico (normalizarSerieRentabilidade, via ultimoValidoDe_)
 * como a "variação no período" - uma fonte só pro número e pro desenho,
 * nunca dois cálculos podendo divergir.
 *
 * 13/09/2026 (3ª rodada): além da %, mostra também o valor em R$
 * ganho/perdido no período - a pedido do Tiago ("quero saber o valor
 * também, quanto ganhei ou perdi"). Calculado a partir dos MESMOS dois
 * pontos brutos (1º valor válido da janela e o último) que já alimentam
 * a % acima - nunca um R$ e uma % contando históricos diferentes.
 */
export function renderInfoRentabilidade(doc, container, { patrimonio, historico, visaoId = 'total', periodoId = '12m' } = {}) {
  if (!container) return;
  // campo (nomes de HistoricoInicio.gs: patrimonio/longoPrazo/rendaEmergencial) só
  // vale pro historico - o objeto `patrimonio` (Home.gs) usa 'total' pra visão
  // "total", daí reaproveitar resolverVisao (já usado pelo resumo) pro valor atual.
  const campo = CAMPO_PRINCIPAL_POR_VISAO[visaoId] || CAMPO_PRINCIPAL_POR_VISAO.total;
  const valorAtual = resolverVisao(patrimonio, visaoId).valor;
  const janela = filtrarHistoricoPorPeriodo(historico, periodoId);
  const serieNormalizada = janela.length >= 2 ? normalizarSerieRentabilidade(janela, campo) : [];
  const ultimoValido = ultimoValidoDe_(serieNormalizada);

  let ganhoReais = null;
  if (janela.length >= 2) {
    const base = primeiroValorValidoInicio_(janela, campo);
    let ultimoBruto = null;
    for (let i = janela.length - 1; i >= 0; i -= 1) {
      const v = janela[i][campo];
      if (typeof v === 'number' && Number.isFinite(v)) { ultimoBruto = v; break; }
    }
    if (base != null && ultimoBruto != null) ganhoReais = ultimoBruto - base;
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
    const prefixoReais = typeof ganhoReais === 'number'
      ? `${ganhoReais >= 0 ? '+' : '-'}${formatBRL(Math.abs(ganhoReais))} `
      : '';
    deltaEl.textContent = `${prefixoReais}${formatPercentFromPoints(ultimoValido)} no período`;
  } else {
    deltaEl.className = 'rentab-card-delta na';
    deltaEl.textContent = 'sem histórico suficiente no período';
  }
}

/**
 * Liga os pills de período (#periodoTabs) - um filtro só, compartilhado
 * pelos 3 cartões de Rentabilidade (Total/Longo Prazo/Renda Emergencial),
 * sempre visíveis ao mesmo tempo. `paineis` é um array com um item por
 * visão - { visaoId, chartContainer, legendaContainer, infoContainer } -
 * cada um é atualizado (info + gráfico) no mesmo clique de período, sem
 * buscar nada de novo (historico/patrimonio já vieram inteiros na 1ª
 * chamada). periodoInicial deve bater com o pill marcado "active" no HTML.
 *
 * Também escuta "resize" da janela (com debounce de 150ms) e redesenha -
 * necessário porque cada gráfico agora usa a largura REAL do cartão no
 * momento do desenho (ver renderGraficoRentabilidade); sem isso, redimen-
 * sionar a janela deixaria o desenho com a medida antiga.
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

  const janela = doc.defaultView;
  if (janela && typeof janela.addEventListener === 'function') {
    let timerResize = null;
    janela.addEventListener('resize', () => {
      if (timerResize) janela.clearTimeout(timerResize);
      timerResize = janela.setTimeout(atualizar, 150);
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
  renderResumoPatrimonio(doc, doc.getElementById('resumoPatrimonio'), {
    patrimonio: resposta.patrimonio,
    ativos: resposta.ativos,
    cambio: resposta.cambio,
  });

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
