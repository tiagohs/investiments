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
 *
 * 16/09/2026: Índices & Câmbio mostrava o dólar/euro com a chave "R$"
 * em vez do símbolo certo (criarTileCambio ganhou o parâmetro `simbolo`,
 * "US$"/"€" em vez do default "R$"). A fatia "Ações EUA" do resumo de
 * Patrimônio (Total/Longo Prazo) agora mostra o valor em dólar primeiro,
 * com o equivalente em R$ entre parênteses
 * (calcularDistribuicaoPorClasse acumula um valorUsd só nessa fatia) -
 * cálculo interno (somas/percentuais) continua 100% em BRL, só a
 * exibição mudou (17/09/2026: o equivalente em R$ saiu da mesma linha e
 * virou uma 2ª linha menor embaixo - ver renderDistribuicao, estourava
 * a largura do card no mobile). wireTooltipAtivos ganhou toque dedicado pro mesmo
 * motivo do Radar (ver distribuicoes-metas.js) - como .ativo-card é um
 * link de verdade (não uma célula de tabela), o toque não podia usar o
 * cartão inteiro como gatilho (senão qualquer toque pra navegar
 * mostraria a tooltip de relance antes de sair da página): entrou um
 * ícone dedicado .ativo-info-icon, só ele responde a pointerdown com
 * pointerType touch/pen (alterna - 2º toque fecha), com preventDefault/
 * stopPropagation no click pra nunca navegar; fechar por toque fora é
 * um novo listener em document/pointerdown (captura). Mouse/hover no
 * cartão inteiro continuam exatamente como antes.
 *
 * 16/09/2026 (mesmo dia, continuação): a legenda do donut de resumo de
 * patrimônio (renderDistribuicao/.distrib-item) também usava `title`
 * nativo - virou .info-alvo com ícone "i" clicável, mesma técnica de
 * toque/toque-fora de cima, ligada 1x em wirePointerTooltipDistrib_ (no
 * container ESTÁVEL de renderResumoPatrimonio, não no de cada card -
 * senão duplicaria a cada redesenho). Ficaram de fora desta rodada
 * apenas os botões de ação com `title` (ex.: nenhum nesta página) - só
 * o texto de valor "Editar" já é visível nos botões daqui, não tinha
 * `title` escondendo nada.
 */

import { getHome, getHistoricoAtivo } from '../api-client.js';
import { mountRefreshControl } from '../shell.js';
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

/**
 * Widget-tile de câmbio (USD/EUR) - só valor; a API de hoje não devolve
 * variação do dia pra esses dois (ver Home.gs!montarHome_). `valor` É um
 * número em reais (quantos R$ vale 1 unidade da moeda), mas o SÍMBOLO
 * exibido é o da própria moeda do card (US$/€), não R$ - pedido do
 * Tiago (16/09/2026): "o card do dólar está com a chave R$ ao invés do
 * dólar, mesma coisa no card Euro". `simbolo` default 'R$' só por
 * segurança (nunca deveria ser usado sem um símbolo explícito - ver
 * renderIndicesCambio).
 */
export function criarTileCambio(doc, { label, valor, simbolo = 'R$', extLinkHref }) {
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
  setValorComDec(tile.querySelector('.widget-value'), `${simbolo} ${formatNumeroBR(valor)}`);
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
      simbolo: 'US$',
      extLinkHref: 'https://www.google.com/finance/quote/USD-BRL',
    }));
  }
  if (typeof cambio?.eur === 'number') {
    container.appendChild(criarTileCambio(doc, {
      label: 'Euro (EUR/BRL)',
      valor: cambio.eur,
      simbolo: '€',
      extLinkHref: 'https://www.google.com/finance/quote/EUR-BRL',
    }));
  }

  if (!container.children.length) {
    container.innerHTML = '<p class="hint">Sem dado de índices/câmbio nesta chamada.</p>';
  }
}

/**
 * As 4 visões de patrimônio que a Home.gs devolve hoje. porClasse
 * (Ações/FIIs/Renda Fixa/Ações EUA) só existe pro total - não é um
 * recorte por classe dentro de Longo Prazo, Nacional ou Renda
 * Emergencial. Nacional (17/09/2026) = Longo Prazo sem os investimentos
 * internacionais (Ações EUA) - ver Home.gs!montarHome_.
 */
const VISOES = {
  total: { chave: 'total', label: 'Patrimônio total' },
  longoPrazo: { chave: 'longoPrazo', label: 'Longo Prazo' },
  nacional: { chave: 'nacional', label: 'Patrimônio Nacional' },
  rendaEmergencial: { chave: 'rendaEmergencial', label: 'Renda Emergencial' },
};

/** {valor, label} pra visão pedida - cai em "total" se o id não for reconhecido. */
export function resolverVisao(patrimonio, visaoId) {
  const visao = VISOES[visaoId] || VISOES.total;
  return { valor: patrimonio ? patrimonio[visao.chave] : undefined, label: visao.label };
}

const ORDEM_RESUMO = ['total', 'longoPrazo', 'nacional', 'rendaEmergencial'];

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
 * já que a reserva de emergência saiu). `excluirInternacional`
 * (17/09/2026) tira as posições classe 'usa' inteiras - é assim que a
 * distribuição de Nacional difere da de Longo Prazo (fica só com
 * Ações/FIIs/Renda Fixa não-emergencial). Calculado a partir do array
 * `ativos` (não de patrimonio.porClasse, que só existe pro total
 * combinado - ver Home.gs) - classes com valor zero/ausente não entram.
 */
export function calcularDistribuicaoPorClasse(ativos, { cambioUsd, excluirEmergencial = false, excluirInternacional = false, totaisPorClasse = null } = {}) {
  const somas = { acoes: 0, fiis: 0, rf: 0, usa: 0 };
  // Soma à parte, só pra 'usa', o valor de posição em DÓLAR (preço
  // unitário em USD × quantidade - nunca convertido de volta a partir
  // do BRL já somado acima, pra não acumular arredondamento de mais em
  // cima do que precoAtualBRL/cambioUsd já podem ter introduzido).
  // Alimenta o "US$ X (R$ Y)" da fatia Ações EUA - ver renderDistribuicao.
  let somaUsaUsd = 0;
  (ativos || []).forEach((ativo) => {
    if (excluirInternacional && ativo.classe === 'usa') return;
    if (excluirEmergencial && ativo.classe === 'rf' && ativo.marca === 'emergencial') return;
    if (!(ativo.classe in somas)) return;
    somas[ativo.classe] += valorPosicaoAtivo_(ativo, cambioUsd);
    if (ativo.classe === 'usa') {
      const qtd = typeof ativo.quantidade === 'number' ? ativo.quantidade : 0;
      if (typeof ativo.precoAtual === 'number') somaUsaUsd += ativo.precoAtual * qtd;
    }
  });
  // 23/09/2026 #3: quando o chamador tem o total EXATO de cada classe
  // (patrimonio.porClasse, o mesmo número do card/topo de cada carteira),
  // usa ele em vez da soma ativo a ativo - a soma de preço-em-R$-
  // arredondado × quantidade dava a fatia "Ações EUA" alguns centavos
  // diferente do resto do app.
  if (totaisPorClasse) {
    ORDEM_CLASSE_DISTRIB.forEach((classe) => {
      if (excluirInternacional && classe === 'usa') return;
      const v = totaisPorClasse[classe];
      if (typeof v === 'number' && Number.isFinite(v) && somas[classe] > 0) somas[classe] = v;
    });
  }
  return ORDEM_CLASSE_DISTRIB
    .filter((classe) => somas[classe] > 0)
    .map((classe) => ({
      label: CLASSE_LABEL_DISTRIB[classe],
      cor: `var(${CLASSE_COR_DISTRIB[classe]})`,
      valor: somas[classe],
      ...(classe === 'usa' ? { valorUsd: somaUsaUsd } : {}),
    }));
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
 * vem, caso da Renda Emergencial). `formatarValor` (padrão formatBRL) e
 * `formatarValorTooltip` (padrão = o mesmo `formatarValor`) permitem
 * mostrar o valor principal numa moeda e o valor entre parênteses da
 * tooltip em outra - 19/09/2026 #6, pedido do Tiago pro donut "Por
 * setor" de Ações EUA (carteiras-classe-comum.js!renderDistribuicaoGrupoCarteiras):
 * "por default, mostra em dolar aqui, e no i, mantenha a versao em
 * reais" - ali `formatarValor=formatUSD` (os valores de Ações EUA já
 * vêm nativamente em US$) e `formatarValorTooltip=(v)=>formatBRL(v*cambio)`.
 * Não mexe no caminho `f.valorUsd` abaixo (2ª linha US$/R$ empilhada,
 * usado só no resumo de Patrimônio da própria Início, que mistura
 * classes em R$ com uma fatia em US$ na mesma legenda) - são 2
 * necessidades diferentes: aqui é a legenda INTEIRA numa moeda só,
 * variável por chamador.
 */
export function renderDistribuicao(doc, container, fatias, { formatarValor = formatBRL, formatarValorTooltip = formatarValor } = {}) {
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

  // 13/09/2026 (4ª rodada): Tiago pediu de volta o valor em R$ junto da
  // % (antes de virar donut, só tinha o R$; a 1ª versão do donut só
  // trouxe a % - agora mostra os dois lado a lado por fatia).
  const legenda = wrap.querySelector('.distrib-legenda');
  fatias.forEach((f, i) => {
    const pct = (f.valor / total) * 100;
    const cor = f.cor || `var(${PALETA_DISTRIB_FALLBACK[i % PALETA_DISTRIB_FALLBACK.length]})`;
    const item = doc.createElement('div');
    item.className = 'distrib-item info-alvo';
    // 14/09/2026: tooltip com nome completo (o .distrib-nome trunca com
    // "..." quando o rótulo é longo) + % com 2 casas (a legenda mostra só
    // 1 casa, pra caber) - sem precisar abrir a planilha pra ver o valor
    // exato por trás do arredondamento. 16/09/2026: era `title` nativo
    // (não aparece no toque) - agora é .info-alvo com ícone "i" clicável,
    // ver wirePointerTooltipDistrib_ logo abaixo.
    item.dataset.tooltip = `${f.label}: ${formatNumeroBR(pct, 2)}% (${formatarValorTooltip(f.valor)})`;
    // 18/09/2026: dot+nome e valor+%+ícone viraram 2 grupos (.distrib-nome-wrap/
    // .distrib-valores) em vez de 5 filhos soltos - o min-width:0 (17/09/2026)
    // não bastou sozinho num celular de verdade (Tiago testou e ainda vazava):
    // AINDA existiam 3 pedaços flex:none/nowrap (valor, %, ícone) competindo
    // por espaço na MESMA linha que o nome, então achavam largura suficiente
    // pra vazar mesmo com o resto podendo encolher. Agrupar os 2 lados deixa
    // .distrib-item virar 2 linhas empilhadas (flex-direction:column) abaixo
    // de 480px (ver CSS) - cada linha só precisa caber sozinha, nunca mais
    // todos os 5 pedaços juntos numa linha só.
    item.innerHTML = `
      <span class="distrib-nome-wrap">
        <span class="distrib-dot" style="background:${cor}"></span>
        <span class="distrib-nome">${f.label}</span>
      </span>
      <span class="distrib-valores">
        <span class="distrib-valor"></span>
        <span class="distrib-pct"></span>
        <span class="info-icon">i</span>
      </span>
    `;
    // 16/09/2026: pedido do Tiago - a fatia de Ações EUA (investimento
    // internacional) mostra o valor em dólar, com o equivalente em reais
    // (cálculo continua todo em R$ por trás - "valor"/pct acima nunca
    // mudam - só a EXIBIÇÃO muda). 17/09/2026: o equivalente em reais
    // saiu do lado (mesma linha, entre parênteses) e virou uma 2ª linha
    // embaixo do valor em dólar - "US$ X (R$ Y)" numa linha só, com nome
    // + % do lado, estourava a largura do card no mobile (linha cortando
    // na tela, pedido do Tiago pra corrigir).
    if (typeof f.valorUsd === 'number') {
      item.querySelector('.distrib-valor').innerHTML = `${formatUSD(f.valorUsd)}<span class="distrib-valor-abaixo">(${formatBRL(f.valor)})</span>`;
    } else {
      item.querySelector('.distrib-valor').textContent = formatarValor(f.valor);
    }
    item.querySelector('.distrib-pct').textContent = `${formatNumeroBR(pct, 1)}%`;
    legenda.appendChild(item);
  });

  container.appendChild(wrap);
}

/**
 * Mesma técnica/mesmo comportamento de wireTooltipAtivos logo acima
 * (touch/pen alterna no pointerdown, nunca fecha sozinho no
 * pointerleave, toque fora fecha) - versão genérica pro resto da
 * página (16/09/2026, seguimento do pedido "todos os lugares que
 * possuem um tooltip"): a legenda do donut de resumo de patrimônio
 * (renderDistribuicao) ainda usava `title` nativo. Marcador genérico
 * ".info-alvo"/".info-icon"/".info-tooltip" (mesmas classes usadas em
 * distribuicoes-metas.js!wirePointerTooltipInfo_, duplicadas aqui pelo
 * mesmo motivo de sempre - .moeda-conv/.skel/etc.) - ligado 1x no
 * container ESTÁVEL de renderResumoPatrimonio (não no de
 * renderDistribuicao, que é recriado a cada card).
 */
function wirePointerTooltipDistrib_(doc, container) {
  if (!container || container._infoTooltipWired) return;
  container._infoTooltipWired = true;

  const janela = doc.defaultView;
  const tooltip = doc.createElement('div');
  tooltip.className = 'info-tooltip';
  tooltip.hidden = true;
  (doc.body || container).appendChild(tooltip);

  let alvoAberto = null;

  function esconder_() {
    tooltip.hidden = true;
    alvoAberto = null;
  }

  function mostrar_(alvo, clientX, clientY) {
    const texto = alvo.dataset.tooltip;
    if (!texto) {
      esconder_();
      return;
    }
    tooltip.textContent = texto;
    tooltip.hidden = false;

    const larguraJanela = (janela && janela.innerWidth) || 1000;
    const alturaJanela = (janela && janela.innerHeight) || 800;
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    let esquerda = clientX + 14;
    let topo = clientY + 14;
    if (esquerda + tw > larguraJanela - 12) esquerda = clientX - tw - 14;
    if (topo + th > alturaJanela - 12) topo = clientY - th - 14;
    tooltip.style.left = `${esquerda}px`;
    tooltip.style.top = `${topo}px`;
  }

  function aoMoverOuTocar_(ev) {
    const alvo = typeof ev.target.closest === 'function' ? ev.target.closest('.info-alvo') : null;
    if (ev.pointerType === 'touch' || ev.pointerType === 'pen') {
      if (ev.type !== 'pointerdown' || !alvo) return;
      if (alvoAberto === alvo) {
        esconder_();
        return;
      }
      alvoAberto = alvo;
      mostrar_(alvo, ev.clientX, ev.clientY);
      return;
    }
    if (!alvo) {
      esconder_();
      return;
    }
    mostrar_(alvo, ev.clientX, ev.clientY);
  }

  function aoSairPonteiro_(ev) {
    if (ev.pointerType === 'touch' || ev.pointerType === 'pen') return;
    esconder_();
  }

  function aoTocarFora_(ev) {
    if (!alvoAberto) return;
    const alvo = ev.target;
    if (tooltip.contains(alvo) || alvoAberto.contains(alvo)) return;
    esconder_();
  }

  container.addEventListener('pointermove', aoMoverOuTocar_);
  container.addEventListener('pointerdown', aoMoverOuTocar_);
  container.addEventListener('pointerleave', aoSairPonteiro_);
  (doc.body ? doc : container).addEventListener('pointerdown', aoTocarFora_, true);
}

/**
 * 18/09/2026: "ontem" pro comparativo "ontem era" deixou de vir daqui
 * (valorUltimoPregaoAntes_, que escaneava `historico` procurando o último
 * dia com pregao=true) - depois de DOIS fixes seguidos na série histórica
 * combinada (montarSerieHistoricoInicio_, HistoricoInicio.gs) que ou
 * deixavam o "ontem" um dia atrasado ou corrigiam isso mas quebravam o
 * gráfico de Rentabilidade junto (aquela série casa 3 fontes com gatilhos
 * em horários diferentes - um dia pode sair incompleto sem erro nenhum),
 * o Tiago pediu um caminho separado: o backend agora grava 1x por dia um
 * snapshot dos mesmos 4 valores que Home.gs já lê ao vivo (ver
 * SnapshotResumoDiario.gs) e devolve pronto em `ontem` (resposta de
 * handleHome) - o front-end só lê `ontem[visaoId]` direto, ver
 * renderResumoPatrimonio logo abaixo.
 */

/**
 * Renderiza o resumo de patrimônio (Total / Longo Prazo / Nacional /
 * Renda Emergencial) dentro de `container` (esvazia antes) - as divisões
 * lado a lado, sempre visíveis de cara, sem aba/clique nenhum (mudança
 * de 13/09/2026 a pedido do Tiago: "mostre também os números das três
 * divisões, sem eu precisar clicar em botão"). Cada cartão traz também
 * a distribuição (donut) da própria divisão - Total/Longo Prazo/Nacional
 * por classe, Renda Emergencial por tipo de investimento (ver
 * calcularDistribuicaoPorClasse/calcularDistribuicaoRendaEmergencial).
 *
 * 17/09/2026 #2: abaixo do valor atual, uma linha menor "ontem era: R$ X
 * - Y%" (a pedido do Tiago) - compara o valor ATUAL (patrimonio, tempo
 * real) com `ontem[visaoId]` (snapshot diário vindo do backend, ver nota
 * de 18/09/2026 acima). Verde/vermelho no mesmo padrão de
 * .rentab-card-delta/.ativo-delta já usado no resto do app.
 */
export function renderResumoPatrimonio(doc, container, { patrimonio, ativos, cambio, ontem } = {}) {
  container.innerHTML = '';
  wirePointerTooltipDistrib_(doc, container);
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
      <div class="resumo-ontem"></div>
      <div class="resumo-distrib"></div>
    `;
    setValorComDec(card.querySelector('.resumo-value'), formatBRL(valor));

    const ontemEl = card.querySelector('.resumo-ontem');
    const valorOntem = ontem && typeof ontem[visaoId] === 'number' && Number.isFinite(ontem[visaoId]) ? ontem[visaoId] : null;
    if (typeof valor === 'number' && typeof valorOntem === 'number' && valorOntem !== 0) {
      const variacao = (valor - valorOntem) / valorOntem;
      const good = variacao >= 0;
      ontemEl.className = `resumo-ontem ${good ? 'good' : 'bad'}`;
      ontemEl.textContent = `ontem era: ${formatBRL(valorOntem)} - ${formatPercentFromFraction(variacao)}`;
    } else {
      ontemEl.className = 'resumo-ontem na';
      ontemEl.textContent = '';
    }

    const distribContainer = card.querySelector('.resumo-distrib');
    if (visaoId === 'rendaEmergencial') {
      renderDistribuicao(doc, distribContainer, calcularDistribuicaoRendaEmergencial(ativos));
    } else {
      const pc = patrimonio.porClasse;
      const totaisPorClasse = pc ? {
        acoes: pc.acoes, fiis: pc.fiis, usa: pc.acoesEua,
        rf: (visaoId === 'longoPrazo' || visaoId === 'nacional') ? pc.rendaFixa - (patrimonio.rendaEmergencial || 0) : pc.rendaFixa,
      } : null;
      renderDistribuicao(doc, distribContainer, calcularDistribuicaoPorClasse(ativos, {
        cambioUsd,
        totaisPorClasse,
        excluirEmergencial: visaoId === 'longoPrazo' || visaoId === 'nacional',
        excluirInternacional: visaoId === 'nacional',
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

/**
 * Recorta historico pro período pedido. 'mes' (13/09/2026, a pedido do
 * Tiago: "aqui faltou o mês atual") é diferente dos outros presets -
 * não é "os últimos N dias corridos", é o mês-calendário corrente (dia
 * 1 até hoje). "hoje" aqui é o dia do ÚLTIMO item de historico (o mais
 * recente sincronizado), não o relógio da máquina - evita qualquer
 * divergência entre o que o back-end considera "hoje" e o front-end.
 * Comparação por PREFIXO DE TEXTO (yyyy-MM) em vez de Date - historico[i].data
 * é uma data pura (yyyy-MM-dd, sem hora), e já existe um bug real
 * documentado (format.js!formatDateBR) de converter esse tipo de data
 * por Date+fuso sem necessidade nenhuma - aqui nem essa conversão existe.
 * 'tudo' (ou um id desconhecido que não seja 'mes'/'tudo') devolve o
 * array inteiro.
 */
export function filtrarHistoricoPorPeriodo(historico, periodoId = '12m', campoDesdeInicio = null) {
  if (!historico || !historico.length) return [];
  if (periodoId === 'mes') {
    const ultimaData = historico[historico.length - 1].data;
    if (typeof ultimaData !== 'string' || ultimaData.length < 7) return historico;
    const anoMes = ultimaData.slice(0, 7); // 'yyyy-MM'
    // 23/09/2026 (comparando com o Gorila - o "Mês atual" de lá começa em
    // "31 ago" com 0%): a BASE do mês é o fechamento do ÚLTIMO dia do mês
    // anterior, não o 1º dia do mês - senão o que aconteceu no dia 1 (de
    // 31/08 pra 01/09) simplesmente não entra na rentabilidade do mês. O
    // ponto-base entra na janela (é o 0% do gráfico); o resto continua
    // sendo só o mês corrente.
    const idxPrimeiroDoMes = historico.findIndex((item) => typeof item.data === 'string' && item.data.startsWith(anoMes));
    if (idxPrimeiroDoMes === -1) return [];
    return historico.slice(Math.max(0, idxPrimeiroDoMes - 1));
  }
  const dias = DIAS_POR_PERIODO[periodoId];
  if (!dias) {
    // periodoId === 'tudo' ("Desde o início") - ou qualquer id desconhecido,
    // mesmo comportamento de sempre (devolve o historico inteiro).
    //
    // 20/09/2026 (pedido do Tiago, comparando as 4 subpáginas de Carteiras):
    // "o desde o início de cada carteira varia, é sempre a 1ª data que
    // comecei a investir naquele tipo" - Ações EUA/FIIs/as 2 sub-visões de
    // Renda Fixa começaram bem depois do início do patrimônio total
    // (22/12/2020) - historico é o MESMO array pra todas as visões (só o
    // campo muda), então "Desde o início" sem nenhum corte nascia com
    // anos de linha reta em zero antes da 1ª posição de verdade daquele
    // tipo específico (Ações/Renda Fixa Total, que já existem desde o
    // início de tudo, continuam batendo com o array inteiro - só as
    // visões mais novas mudam de verdade). campoDesdeInicio (opcional,
    // omitido = comportamento antigo, nunca corta) deixa cada chamador
    // dizer QUAL campo define "o início desta visão" - corta pro primeiro
    // dia em que ELE tem valor válido, reaproveitando
    // primeiroIndiceValidoInicio_ (mesma função que já decide a base do
    // cálculo de % "desde o início" logo abaixo - nunca 2 critérios de
    // "onde essa visão começa" podendo divergir entre si).
    if (campoDesdeInicio) {
      const idxInicio = primeiroIndiceValidoInicio_(historico, campoDesdeInicio);
      if (idxInicio > 0) return historico.slice(idxInicio);
    }
    return historico;
  }
  // 23/09/2026: N dias de variação precisam de N+1 pontos (o 1º é a base
  // - mesmo motivo do 'mes', acima).
  return historico.slice(-(dias + 1));
}

// 19/09/2026: "carteiraX" abaixo são as visões por classe das 4
// subpáginas de Carteiras (Ações/FIIs/Ações EUA/Renda Fixa×3) - ver
// cabeçalho de HistoricoInicio.gs pros campos novos que alimentam elas.
// Não são "visões da Início" de verdade (a Início nunca usa essas 6),
// mas moram aqui porque renderGraficoRentabilidade/wireGraficoRentabilidade
// (o "motor" de gráfico) já é reaproveitado por Carteiras (ver
// carteiras-visao-geral.js, visaoId:'total') - mesmo precedente já
// confirmado com o Tiago, estender essas 3 tabelas em vez de duplicar o
// motor inteiro numa cópia dentro de carteiras-classe-comum.js.
export const CAMPO_PRINCIPAL_POR_VISAO = {
  total: 'patrimonio', longoPrazo: 'longoPrazo', nacional: 'nacional', rendaEmergencial: 'rendaEmergencial',
  carteiraAcoes: 'acoes', carteiraFiis: 'fiis', carteiraAcoesEua: 'acoesEua',
  carteiraRendaFixaTotal: 'rendaFixaTotal', carteiraRendaFixaLongoPrazo: 'rendaFixaLongoPrazo',
  carteiraRendaFixaEmergencial: 'rendaEmergencial', // mesmo campo da Início - RF-emergencial é o mesmo número
};

/** Campo de fluxo de caixa liquido diario (aporte/retirada/provento, ver
 * FluxoCaixaInicio.gs) correspondente a cada visao - usado so pra
 * "neutralizar" a serie do PORTFOLIO em normalizarSerieRentabilidade (TWR),
 * nunca pros benchmarks (Ibovespa/CDI/Selic nao tem aporte). */
export const CAMPO_FLUXO_POR_VISAO = {
  total: 'fluxoCaixaPatrimonio',
  longoPrazo: 'fluxoCaixaLongoPrazo',
  nacional: 'fluxoCaixaNacional',
  rendaEmergencial: 'fluxoCaixaRendaEmergencial',
  carteiraAcoes: 'fluxoCaixaAcoes',
  carteiraFiis: 'fluxoCaixaFiis',
  carteiraAcoesEua: 'fluxoCaixaAcoesEua',
  carteiraRendaFixaTotal: 'fluxoCaixaRendaFixaTotal',
  carteiraRendaFixaLongoPrazo: 'fluxoCaixaRendaFixaLongoPrazo',
  carteiraRendaFixaEmergencial: 'fluxoCaixaRendaEmergencial',
};

/** 21/09/2026 (pedido do Tiago - "Valor aplicado" tem que ser só capital
 * líquido de Compra/Venda + Renda Fixa, NUNCA reduzido por provento
 * recebido): mesmas chaves de CAMPO_FLUXO_POR_VISAO acima, mas apontando
 * pros campos fluxoAplicado* (HistoricoInicio.gs) - usado SÓ pra linha
 * pontilhada "Valor aplicado" dos gráficos de Evolução (Início +
 * subpáginas de Carteiras), nunca pro TWR da Rentabilidade (que continua
 * usando CAMPO_FLUXO_POR_VISAO acima, deduzindo provento de propósito -
 * ver FluxoCaixaInicio.gs). */
export const CAMPO_FLUXO_APLICADO_POR_VISAO = {
  total: 'fluxoAplicadoPatrimonio',
  longoPrazo: 'fluxoAplicadoLongoPrazo',
  nacional: 'fluxoAplicadoNacional',
  rendaEmergencial: 'fluxoAplicadoRendaEmergencial',
  carteiraAcoes: 'fluxoAplicadoAcoes',
  carteiraFiis: 'fluxoAplicadoFiis',
  carteiraAcoesEua: 'fluxoAplicadoAcoesEua',
  carteiraRendaFixaTotal: 'fluxoAplicadoRendaFixaTotal',
  carteiraRendaFixaLongoPrazo: 'fluxoAplicadoRendaFixaLongoPrazo',
  carteiraRendaFixaEmergencial: 'fluxoAplicadoRendaEmergencial',
};

/** Benchmarks por visão - Total/Longo Prazo/Nacional contra Ibovespa+CDI,
 * Renda Emergencial contra CDI+Selic (decisão registrada em
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
  nacional: [
    { campo: 'ibovespa', label: 'Ibovespa', cor: '--fiis', dash: '1.5 4.5' },
    { campo: 'indiceCdi', label: 'CDI', cor: '--usa', dash: '6 4' },
  ],
  rendaEmergencial: [
    { campo: 'indiceCdi', label: 'CDI', cor: '--usa', dash: '6 4' },
    { campo: 'indiceSelic', label: 'Selic', cor: '--fiis', dash: '1.5 4.5' },
  ],
  // 19/09/2026 (ver comentário de CAMPO_PRINCIPAL_POR_VISAO acima) - cores
  // e estilo de traço conferidos pixel-a-pixel no mockup real
  // (docs/direcao-visual do Design "Carteiras", artboards Acoes/Fiis/
  // AcoesEua/RendaFixa.dc.html): o benchmark de "índice de mercado"
  // (Ibovespa/IFIX) desenha em linha CHEIA (dash:null, ver
  // renderGraficoRentabilidade acima), só o benchmark de "taxa" (CDI/
  // IPCA/S&P 500) vem tracejado - diferente da Início, que tracejava os
  // dois. dash:null só funciona por causa do guard adicionado nesta
  // mesma rodada em benchmarkPathsSvg/cls logo acima.
  carteiraAcoes: [
    { campo: 'ibovespa', label: 'Ibovespa', cor: '--ink-faint', dash: null },
    { campo: 'indiceCdi', label: 'CDI', cor: '--rf', dash: '6 4' },
  ],
  carteiraFiis: [
    { campo: 'ifix', label: 'IFIX', cor: '--ink-faint', dash: null },
    { campo: 'indiceCdi', label: 'CDI', cor: '--rf', dash: '6 4' },
  ],
  carteiraAcoesEua: [
    { campo: 'ibovespa', label: 'Ibovespa', cor: '--ink-faint', dash: null },
    { campo: 'sp500', label: 'S&P 500', cor: '--acoes', dash: '6 4' },
  ],
  // Renda Fixa não tem "índice de mercado" (não tem preço de bolsa) -
  // CDI e IPCA vêm os 2 tracejados, igual o mockup de RendaFixa.dc.html.
  // As 3 sub-visões (total/longoPrazo/emergencial) comparam com os MESMOS
  // 2 benchmarks - só o campo principal (Portfólio) muda entre elas.
  carteiraRendaFixaTotal: [
    { campo: 'indiceCdi', label: 'CDI', cor: '--ink-faint', dash: '6 4' },
    { campo: 'indiceIpca', label: 'IPCA', cor: '--usa', dash: '6 4' },
  ],
  carteiraRendaFixaLongoPrazo: [
    { campo: 'indiceCdi', label: 'CDI', cor: '--ink-faint', dash: '6 4' },
    { campo: 'indiceIpca', label: 'IPCA', cor: '--usa', dash: '6 4' },
  ],
  carteiraRendaFixaEmergencial: [
    { campo: 'indiceCdi', label: 'CDI', cor: '--ink-faint', dash: '6 4' },
    { campo: 'indiceIpca', label: 'IPCA', cor: '--usa', dash: '6 4' },
  ],
};

// 19/09/2026: cor da linha do Portfólio (a série principal) por visão -
// na Início é sempre --acoes (azul), mas cada subpágina de Carteiras usa
// a cor da própria classe (mesmo token de shell.css usado no resto da
// página) - conferido pixel-a-pixel no mockup real. default 'total'
// preserva o valor hardcoded que já existia antes desta rodada.
export const COR_PRINCIPAL_POR_VISAO = {
  total: '--acoes', longoPrazo: '--acoes', nacional: '--acoes', rendaEmergencial: '--acoes',
  carteiraAcoes: '--acoes', carteiraFiis: '--fiis', carteiraAcoesEua: '--usa',
  carteiraRendaFixaTotal: '--rf', carteiraRendaFixaLongoPrazo: '--rf', carteiraRendaFixaEmergencial: '--rf',
};

/** Índice do primeiro valor numérico válido (não-nulo, finito) e diferente de
 * zero de `campo` em `historico` - zero como base de "% desde o início"
 * dividiria por zero; ibovespa também pode vir null antes do 1º pregão da
 * janela. -1 quando não existe nenhum valor válido. */
function primeiroIndiceValidoInicio_(historico, campo) {
  for (let i = 0; i < historico.length; i += 1) {
    const v = historico[i][campo];
    if (typeof v === 'number' && Number.isFinite(v) && v !== 0) return i;
  }
  return -1;
}

/** 23/09/2026 #3: a janela começa no dia em que a visão NASCEU? (o
 * ponto anterior a ela, no histórico completo, vale 0/não existe, e o dia
 * tem aporte) - aí a rentabilidade mede a partir do custo desse aporte,
 * não do fechamento do dia (ver normalizarSerieRentabilidade). */
function inicioEhAbertura_(historicoCompleto, janela, campo, campoFluxo) {
  const idx = primeiroIndiceValidoInicio_(janela, campo);
  if (idx === -1) return false;
  const pos = historicoCompleto.indexOf(janela[idx]);
  if (pos === -1) return false;
  const anterior = pos > 0 ? historicoCompleto[pos - 1][campo] : 0;
  if (typeof anterior === 'number' && Number.isFinite(anterior) && anterior !== 0) return false;
  const fluxo = janela[idx][campoFluxo];
  const valor = janela[idx][campo];
  return typeof fluxo === 'number' && fluxo > 0 && valor / fluxo >= 0.5 && valor / fluxo <= 2;
}

/** Primeiro valor numérico válido de `campo` em `historico` (ver
 * primeiroIndiceValidoInicio_). */
function primeiroValorValidoInicio_(historico, campo) {
  const idx = primeiroIndiceValidoInicio_(historico, campo);
  return idx === -1 ? null : historico[idx][campo];
}

/**
 * Normaliza a série de `campo` (dentro de `historico`, já recortado pro
 * período) pra "% desde o início do período" - único jeito de comparar
 * patrimônio (R$) com um índice (pontos ou curva base 100) na mesma escala.
 * Sem base válida (tudo zero/null na janela), devolve todo mundo null em vez
 * de inventar 0% - renderGraficoRentabilidade trata isso mostrando um aviso.
 *
 * 13/09/2026 (correção Gorilla - Tiago comparou nosso "+5.726% desde o
 * início" com o "+75,63%" do app Gorilla): quando `campoFluxo` é passado (só
 * pra série do PORTFÓLIO - patrimonio/longoPrazo/rendaEmergencial -, nunca
 * pros benchmarks, que não têm aporte/retirada), o cálculo vira Retorno
 * Ponderado no Tempo (TWR) em vez da razão ingênua valor_hoje/valor_base:
 * cada dia "neutraliza" o fluxo de caixa líquido daquele dia (aporte,
 * retirada, provento recebido - ver FluxoCaixaInicio.gs, calculado incluindo
 * câmbio histórico USD/BRL pras ações EUA) antes de medir o retorno do dia, e
 * os retornos diários são encadeados (compostos), nunca somados. Isso evita
 * que um aporte apareça como ganho (ou uma retirada/venda como perda) - a
 * causa raiz do número absurdo. Proventos entram como flow NEGATIVO (ver
 * FluxoCaixaInicio.gs) de propósito: como `patrimonio` não inclui caixa, um
 * provento recebido não move o valor bruto do dia, então soma-lo de volta é
 * o jeito de fazer o dividendo CONTAR como ganho no retorno total (pedido do
 * Tiago: "incluir proventos também"). Sem campoFluxo, mantém o cálculo antigo
 * (usado pelos benchmarks, que não têm fluxo de caixa).
 */
export function normalizarSerieRentabilidade(historico, campo, campoFluxo, { abertura = false } = {}) {
  if (!campoFluxo) {
    const base = primeiroValorValidoInicio_(historico, campo);
    if (base == null) return historico.map(() => null);
    return historico.map((item) => {
      const v = item[campo];
      if (typeof v !== 'number' || !Number.isFinite(v)) return null;
      return ((v / base) - 1) * 100;
    });
  }

  const idxBase = primeiroIndiceValidoInicio_(historico, campo);
  if (idxBase === -1) return historico.map(() => null);

  const resultado = new Array(historico.length).fill(null);
  resultado[idxBase] = 0;
  let cumulativo = 0;
  let anterior = historico[idxBase][campo];
  // 23/09/2026 #3 (Controle 8 - "Desde o início" de Ações EUA dava
  // um ganho em R$ menor que o lucro da posição em reais - o que
  // aconteceu no 1º dia sumia): quando a janela começa no DIA DA
  // ABERTURA da visão (antes disso ela valia 0 - ver inicioEhAbertura_),
  // o ponto de partida não é o fechamento desse dia e sim o CUSTO
  // aplicado nele (o fluxo do dia) - o que aconteceu entre a compra e o
  // fechamento do 1º dia também é rendimento (mesma convenção do Gorila:
  // base 0 na véspera da 1ª compra). Sem a flag (default), igual antes.
  if (abertura) {
    const fluxoAbertura = historico[idxBase][campoFluxo];
    if (typeof fluxoAbertura === 'number' && fluxoAbertura > 0) {
      const fatorAbertura = anterior / fluxoAbertura;
      if (fatorAbertura >= 0.5 && fatorAbertura <= 2) {
        cumulativo = fatorAbertura - 1;
        resultado[idxBase] = cumulativo * 100;
      }
    }
  }

  for (let i = idxBase + 1; i < historico.length; i += 1) {
    const v = historico[i][campo];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      resultado[i] = null;
      continue;
    }
    if (anterior) {
      const fluxo = historico[i][campoFluxo] || 0;
      const retornoDiaBruto = (v - fluxo) / anterior - 1;
      // 20/09/2026 (bug real, achado com dados reais do Tiago via
      // tests/harness/ - "Desde o início" de Total/Longo Prazo/Nacional/
      // Renda Fixa Total travado perto de -100% pra sempre, Carteira de
      // Ações em -101% e Renda Emergencial em -100% - comprovado rodando
      // montarSerieHistoricoInicio_ de verdade contra a planilha real):
      // esta conta só é segura quando `v` (valor bruto do dia) JÁ
      // reflete o `fluxo` que está sendo descontado dele - ou seja, as
      // duas fontes nasceram no MESMO instante. Na prática, várias
      // combinações de fonte podem desalinhar isso: o caso mais comum é
      // o fluxo (Transações, data real da compra) chegar um dia (ou
      // mais) ANTES do preço/saldo aparecer em v (aux_historico-
      // patrimonio, sujeito a atraso de backfill do GOOGLEFINANCE -
      // "lacuna" no Registro de Controle; HistoricoInicio.gs!
      // primeiraCompraPorTicker já corrige isso pra Ações/FIIs/Ações
      // EUA, mas nunca cobriu Total/Longo Prazo/Nacional/Renda Fixa) -
      // mas o mesmo tipo de desalinhamento pode nascer de qualquer outra
      // combinação fonte-a-fonte (ex.: duas linhas de Transações Renda
      // Fixa muito próximas no tempo já bastou pra travar
      // "Renda Emergencial" com dado real do Tiago). Quando isso
      // acontece, `v - fluxo` fica artificialmente baixo (às vezes até
      // negativo) só naquele dia - matematicamente equivale a "o
      // mercado caiu quase 100% hoje", o que nunca é real - e como o
      // retorno é COMPOSTO (multiplicativo), um único dia assim TRAVA o
      // acumulado perto de -100% PRA SEMPRE, mesmo que todo o resto da
      // história seja positivo (comprovado com dado real: o 2º dia de
      // toda a carteira, 23/12/2020, já dispara isso sozinho).
      // Em vez de caçar cada combinação fonte-a-fonte que pode
      // desalinhar (jogo de gato-e-rato - o padrão de bug recorrente que
      // motivou pedir o harness de testes, ver tests/harness/README.md),
      // trava aqui, na fórmula em si: nenhum dia sozinho pode implicar
      // um retorno fora da faixa fisicamente plausível pra uma carteira
      // diversificada num único pregão (o pior dia de bolsa já
      // registrado, o "Black Monday" de 1987, foi -20,5% - a faixa até
      // -50%/+100% é generosa o bastante pra nunca recortar um dia real,
      // mas pequena o bastante pra pegar qualquer desalinhamento
      // fonte-a-fonte). Um dia fora da faixa é tratado como "sem dado
      // confiável hoje" (retorno neutro, 0%, em vez de contaminar todo o
      // resto da série) - normalizarSerieRentabilidade.test.js tem os
      // casos com dado real que provam isso.
      const RETORNO_DIARIO_MIN_PLAUSIVEL = -0.5;
      const RETORNO_DIARIO_MAX_PLAUSIVEL = 1;
      const retornoDia = (retornoDiaBruto < RETORNO_DIARIO_MIN_PLAUSIVEL || retornoDiaBruto > RETORNO_DIARIO_MAX_PLAUSIVEL)
        ? 0
        : retornoDiaBruto;
      cumulativo = (1 + cumulativo) * (1 + retornoDia) - 1;
      resultado[i] = cumulativo * 100;
    } else {
      resultado[i] = null;
    }
    anterior = v;
  }

  return resultado;
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
function ligarInteracaoGrafico_(container, { janela, seriePrincipal, seriesBenchmark, x, y, padL, plotW, W, corPrincipal = '--acoes' }) {
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
      { label: 'Portfólio', cor: `var(${corPrincipal})`, valor: seriePrincipal[i] },
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
  // 20/09/2026: campoPrincipal precisa existir ANTES de filtrar - "Desde o
  // início" (periodoId:'tudo') corta pro início desta visão específica
  // (ver comentário de filtrarHistoricoPorPeriodo) - sem isso, o gráfico
  // de FIIs/Ações EUA/Renda Fixa (sub-visões) "desde o início" nascia com
  // anos de linha reta em zero antes da 1ª posição de verdade.
  const campoPrincipal = CAMPO_PRINCIPAL_POR_VISAO[visaoId] || CAMPO_PRINCIPAL_POR_VISAO.total;
  const campoFluxoPrincipal = CAMPO_FLUXO_POR_VISAO[visaoId] || CAMPO_FLUXO_POR_VISAO.total;
  const benchmarks = BENCHMARKS_POR_VISAO[visaoId] || BENCHMARKS_POR_VISAO.total;
  const corPrincipal = COR_PRINCIPAL_POR_VISAO[visaoId] || COR_PRINCIPAL_POR_VISAO.total;

  let janela = filtrarHistoricoPorPeriodo(historico, periodoId, campoPrincipal);
  // 23/09/2026 #3 (Controle 8 - Ações EUA em "3 anos": a carteira só existe
  // desde 11/06/2025, mas o S&P 500 era medido desde 24/09/2023 e a legenda
  // comparava o portfólio com ~2 anos a mais de S&P 500): quando a visão nasce DENTRO da janela, o
  // gráfico (portfólio e benchmarks) começa no 1º dia dela - comparar
  // sempre o mesmo intervalo.
  const idxNascimento = primeiroIndiceValidoInicio_(janela, campoPrincipal);
  if (idxNascimento > 0) janela = janela.slice(idxNascimento);
  if (janela.length < 2) {
    container.innerHTML = '<p class="hint">Sem histórico suficiente ainda pra desenhar o gráfico nesse período.</p>';
    if (legendaContainer) legendaContainer.innerHTML = '';
    return;
  }

  const seriePrincipal = normalizarSerieRentabilidade(janela, campoPrincipal, campoFluxoPrincipal, {
    abertura: inicioEhAbertura_(historico, janela, campoPrincipal, campoFluxoPrincipal),
  });
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
    .map((b) => `<path d="${pathDRentabilidade_(b.valores, x, y)}" fill="none" stroke="var(${b.cor})" stroke-width="2"${b.dash ? ` stroke-dasharray="${b.dash}"` : ''}/>`)
    .join('');
  const principalPathSvg = `<path d="${pathDRentabilidade_(seriePrincipal, x, y)}" fill="none" stroke="var(${corPrincipal})" stroke-width="2.6"/>`;

  // Hover/touch (13/09/2026, 3ª rodada - Tiago reportou que passar o mouse ou
  // tocar no gráfico não mostrava nada): um <g> com a linha-guia vertical +
  // um ponto por série, escondido até o 1º movimento, e um <rect>
  // transparente (`.rentab-hitarea`) cobrindo a área de plotagem que
  // escuta Pointer Events (mouse e touch pela mesma API) - ver
  // ligarInteracaoGrafico_ logo abaixo, que calcula o índice mais próximo
  // do ponteiro e monta a tooltip (HTML normal, fora do SVG, mesmo
  // cuidado com escala de fonte do gráfico em si).
  const pontosHoverSvg = [
    `<circle class="rentab-hover-ponto" data-serie="principal" r="3.6" fill="var(${corPrincipal})" hidden/>`,
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

  ligarInteracaoGrafico_(container, { janela, seriePrincipal, seriesBenchmark, x, y, padL, plotW, W, corPrincipal });

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
      // 19/09/2026: b.dash agora pode vir vazio/null (linha sólida, sem
      // stroke-dasharray - ver visões carteiraX abaixo, mockup de
      // Carteiras usa linha cheia pro benchmark de "índice de mercado"
      // tipo Ibovespa/IFIX) - sem esse guard, .startsWith quebraria.
      // Classe vazia = .chart-legend2 .swline já é sólida por padrão
      // (inicio.css), não precisa de classe nenhuma.
      const cls = !b.dash ? '' : (b.dash.startsWith('1.5') ? 'dot' : 'dash');
      const relativo = (typeof deltaPrincipal === 'number' && typeof b.delta === 'number')
        ? deltaPrincipal - b.delta
        : null;
      const deltaHtml = typeof relativo === 'number'
        ? `<b class="li-delta ${relativo >= 0 ? 'good' : 'bad'}">${formatPercentFromPoints(relativo)}</b>`
        : '';
      return `<span class="li"><span class="swline ${cls}" style="border-color:var(${b.cor})"></span>${b.label}${deltaHtml}</span>`;
    }).join('');
    legendaContainer.innerHTML = `
      <span class="li"><span class="swline" style="border-color:var(${corPrincipal})"></span>Portfólio</span>
      ${liBenchmarks}
    `;
  }
}

const LABEL_POR_VISAO_RENTABILIDADE = {
  total: 'Patrimônio total',
  longoPrazo: 'Patrimônio de Longo Prazo',
  nacional: 'Patrimônio Nacional',
  rendaEmergencial: 'Renda Emergencial',
  carteiraAcoes: 'Carteira de Ações',
  carteiraFiis: 'Carteira de FIIs',
  carteiraAcoesEua: 'Carteira de Ações EUA',
  carteiraRendaFixaTotal: 'Carteira total',
  carteiraRendaFixaLongoPrazo: 'Longo prazo',
  carteiraRendaFixaEmergencial: 'Reserva de emergência',
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
/**
 * Núcleo de cálculo por trás de renderInfoRentabilidade (extraído em
 * 19/09/2026 pra ser reaproveitado fora da Início - ver
 * carteiras-visao-geral.js!renderHeroStats_, que usa isso com
 * periodoId:'tudo' pro resumo "Investido/Resultado/Rentabilidade" do
 * hero de Carteiras). Devolve os 3 números brutos (valor atual, ganho em
 * R$ já líquido de aporte/retirada - TWR -, e a % correspondente) sem
 * tocar em DOM nenhum - renderInfoRentabilidade só formata isso.
 *
 * Existir separado garante que qualquer tela que precise de um resumo
 * "desde o início" (ou qualquer outro período) sempre usa a MESMA conta
 * já validada contra o Gorilla (ver correção de 13/09/2026 logo abaixo),
 * em vez de cada tela reimplementar sua própria soma de fluxo de caixa -
 * foi exatamente reimplementar essa soma "por fora" (somando
 * card.totalInvestido/lucroPrejuizo dos cards de classe, que só olham
 * pra posição ATUAL, sem realizado nem proventos) que fez o hero de
 * Carteiras sair batendo muito menor do que o Gorilla (R$13.169,88/+9,75%
 * contra os ~R$37.504,84/+75,23% reais) - bug relatado pelo Tiago em
 * 19/09/2026, ver comentário em renderHeroStats_.
 */
export function calcularResumoRentabilidade(patrimonio, historico, { visaoId = 'total', periodoId = '12m' } = {}) {
  const campo = CAMPO_PRINCIPAL_POR_VISAO[visaoId] || CAMPO_PRINCIPAL_POR_VISAO.total;
  const campoFluxo = CAMPO_FLUXO_POR_VISAO[visaoId] || CAMPO_FLUXO_POR_VISAO.total;
  const valorAtual = resolverVisao(patrimonio, visaoId).valor;
  // 20/09/2026: mesmo corte de "Desde o início" por visão - ver comentário
  // de filtrarHistoricoPorPeriodo/renderGraficoRentabilidade.
  const janela = filtrarHistoricoPorPeriodo(historico, periodoId, campo);
  const abertura = janela.length >= 2 && inicioEhAbertura_(historico, janela, campo, campoFluxo);
  const serieNormalizada = janela.length >= 2 ? normalizarSerieRentabilidade(janela, campo, campoFluxo, { abertura }) : [];
  const percentual = ultimoValidoDe_(serieNormalizada);

  // 13/09/2026 (correção Gorilla): o ganho em R$ também precisa descontar o
  // fluxo de caixa líquido do período (mesma lógica da % acima, TWR) - senão
  // um aporte de R$ 10.000 no meio do período aparecia como "+R$ 10.000" de
  // ganho que nunca existiu. Soma o fluxo de todos os dias DEPOIS da base (o
  // próprio dia-base é o ponto de partida, não conta como fluxo do período) e
  // desconta do delta bruto (valor final - valor base).
  let ganhoReais = null;
  if (janela.length >= 2) {
    const idxBase = primeiroIndiceValidoInicio_(janela, campo);
    if (idxBase !== -1) {
      const base = janela[idxBase][campo];
      let ultimoBruto = null;
      for (let i = janela.length - 1; i >= 0; i -= 1) {
        const v = janela[i][campo];
        if (typeof v === 'number' && Number.isFinite(v)) { ultimoBruto = v; break; }
      }
      if (ultimoBruto != null) {
        let somaFluxo = 0;
        for (let i = idxBase + 1; i < janela.length; i += 1) {
          somaFluxo += janela[i][campoFluxo] || 0;
        }
        // abertura (ver normalizarSerieRentabilidade): a base é 0 na
        // véspera e o aporte do 1º dia entra como fluxo - o ganho vira
        // exatamente "valor de hoje − tudo o que entrou".
        ganhoReais = abertura
          ? ultimoBruto - (janela[idxBase][campoFluxo] || 0) - somaFluxo
          : (ultimoBruto - base) - somaFluxo;
      }
    }
  }

  return { valorAtual, ganhoReais, percentual };
}

export function renderInfoRentabilidade(doc, container, { patrimonio, historico, visaoId = 'total', periodoId = '12m' } = {}) {
  if (!container) return;
  const { valorAtual, ganhoReais, percentual: ultimoValido } = calcularResumoRentabilidade(patrimonio, historico, { visaoId, periodoId });

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
 * chamada). periodoInicial deve bater com o pill marcado "active" no HTML
 * (14/09/2026: default trocado de "12m" pra "mes", a pedido do Tiago -
 * montarPaginaInicio agora passa periodoInicial:'mes' explicitamente, e o
 * default do parâmetro também foi atualizado pra "mes" por segurança, caso
 * algum outro chamador não passe o valor).
 *
 * Também escuta "resize" da janela (com debounce de 150ms) e redesenha -
 * necessário porque cada gráfico agora usa a largura REAL do cartão no
 * momento do desenho (ver renderGraficoRentabilidade); sem isso, redimen-
 * sionar a janela deixaria o desenho com a medida antiga.
 *
 * 14/09/2026 (botão "Atualizar dados" + timer automático - ver
 * shell.js!mountRefreshControl): montarPaginaInicio agora pode chamar
 * esta função várias vezes na vida da página (1 vez por carga de dado
 * novo), sempre com o MESMO periodoTabsContainer (elemento estático do
 * HTML, nunca recriado). Só a 1ª chamada liga os listeners de clique e
 * resize de verdade - guardado em `periodoTabsContainer._graficoEstado`;
 * chamadas seguintes só atualizam esse estado (patrimonio/historico/
 * paineis novos) e redesenham, sem religar nada (religar de novo a cada
 * refresh duplicaria o listener, e cada clique/resize futuro dispararia
 * o redesenho N vezes). Os listeners já ligados sempre leem o estado
 * mais recente através do objeto `estado` (nunca duma variável capturada
 * na 1ª chamada), por isso continuam corretos depois de um refresh.
 */
export function wireGraficoRentabilidade(doc, { patrimonio, historico, periodoTabsContainer, paineis = [], periodoInicial = 'mes' } = {}) {
  if (periodoTabsContainer && periodoTabsContainer._graficoEstado) {
    const estado = periodoTabsContainer._graficoEstado;
    estado.patrimonio = patrimonio;
    estado.historico = historico;
    estado.paineis = paineis;
    estado.atualizar();
    return;
  }

  const estado = { patrimonio, historico, paineis, periodoAtual: periodoInicial };

  estado.atualizar = function atualizar() {
    estado.paineis.forEach(({ visaoId, chartContainer, legendaContainer, infoContainer }) => {
      renderInfoRentabilidade(doc, infoContainer, { patrimonio: estado.patrimonio, historico: estado.historico, visaoId, periodoId: estado.periodoAtual });
      if (chartContainer) {
        renderGraficoRentabilidade(doc, chartContainer, { historico: estado.historico, visaoId, periodoId: estado.periodoAtual, legendaContainer });
      }
    });
  };

  if (periodoTabsContainer) {
    periodoTabsContainer._graficoEstado = estado;
    const botoesPeriodo = Array.from(periodoTabsContainer.querySelectorAll('.filter-tab'));
    botoesPeriodo.forEach((botao) => {
      botao.addEventListener('click', () => {
        botoesPeriodo.forEach((b) => b.classList.toggle('active', b === botao));
        estado.periodoAtual = botao.dataset.periodo;
        estado.atualizar();
      });
    });
  }

  const janela = doc.defaultView;
  if (janela && typeof janela.addEventListener === 'function') {
    let timerResize = null;
    janela.addEventListener('resize', () => {
      if (timerResize) janela.clearTimeout(timerResize);
      timerResize = janela.setTimeout(estado.atualizar, 150);
    });
  }

  estado.atualizar();

  // 19/09/2026 (bug relatado pelo Tiago com print): ao entrar na Início,
  // o gráfico às vezes desenha "torto" por alguns segundos e depois volta
  // ao normal sozinho, sem o usuário redimensionar a janela. Causa:
  // larguraReal_ mede clientWidth do cartão no momento do 1º desenho
  // (linha acima), mas a fonte 'IBM Plex Mono'/'Fraunces' (index.html usa
  // display=swap no Google Fonts) pode ainda não ter carregado - o
  // primeiro desenho usa a fonte de fallback do navegador, e quando a
  // fonte troca (font swap) o layout do cartão pode mudar de largura o
  // suficiente pra deixar o SVG (que usa 1 unidade = 1px da largura
  // MEDIDA naquele instante) com a proporção errada, até algo redesenhar
  // de novo - hoje só "resize" da janela fazia isso, então sem o usuário
  // redimensionar, ficava torto pro resto da visita. document.fonts.ready
  // resolve assim que as 3 fontes terminam de carregar (1x só, sem
  // religar o listener de novo em cada refresh - por isso está fora de
  // periodoTabsContainer._graficoEstado, que já lida com "não religar 2x").
  // Ambiente sem essa API (jsdom dos testes) - document.fonts não existe -
  // simplesmente não redesenha de novo, sem erro (fica só o desenho normal).
  const fontsReady = doc.fonts && typeof doc.fonts.ready?.then === 'function' ? doc.fonts.ready : null;
  if (fontsReady && !(periodoTabsContainer && periodoTabsContainer._fontsReadyLigado)) {
    if (periodoTabsContainer) periodoTabsContainer._fontsReadyLigado = true;
    fontsReady.then(() => {
      const estadoAtual = periodoTabsContainer ? periodoTabsContainer._graficoEstado : estado;
      if (estadoAtual) estadoAtual.atualizar();
    });
  }
}

// ============================================================================
// Grade "Meus Ativos"
// ============================================================================

const CLASSE_LABEL_ATIVO = { acoes: 'Ação', fiis: 'FII', usa: 'EUA', rf: 'RF' };

/** Ícone do botão "ver gráfico" (.ativo-grafico-icon, criarAtivoCard) - eixo + linha subindo, mesmo padrão de SVG inline (stroke, sem fill) já usado no botão "Editar" do Radar (distribuicoes-metas.js). */
const ICONE_GRAFICO_ATIVO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>';

/**
 * Linhas do tooltip de hover/touch de cada .ativo-card, por classe - layout
 * validado em docs/direcao-visual.html e decisão registrada em
 * docs/mapa-paginas.html ("Card de Meus Ativos ganha ... tooltip de hover
 * por classe: Nome, Quantidade, Preço Teto, Preço Médio, Descontos sobre
 * P/VP e P/L pra Ações/FIIs/USA; Tipo em vez de P/L pra FIIs; Tipo de
 * investimento/Indexador/Vencimento/Valor atualizado pra Renda Fixa").
 * descontoPVp/descontoPL já vêm como texto pronto do back-end
 * (MeusAtivos.gs) - "173% (1,73 P/VP)" - por isso entram direto, sem
 * formatador. Ações EUA ainda não tem P/L na planilha (só P/VP) - por
 * isso a linha de Desconto sobre P/L só aparece quando o dado existe.
 */
function linhasTooltipAtivo_(ativo) {
  const linhas = [];
  if (ativo.classe === 'rf') {
    linhas.push(['Tipo de investimento', ativo.tipoInvestimento || '—']);
    linhas.push(['Indexador', ativo.indexador || '—']);
    linhas.push(['Vencimento', ativo.vencimento || '—']);
    linhas.push(['Valor atualizado', formatBRL(ativo.valorAtualizado)]);
    return linhas;
  }
  linhas.push(['Nome', ativo.nome || ativo.ticker]);
  if (ativo.classe === 'fiis') {
    linhas.push(['Tipo', ativo.tipo || '—']);
    linhas.push(['Preço médio', formatBRL(ativo.precoMedio)]);
    linhas.push(['Quantidade de cotas', formatNumeroBR(ativo.quantidade, 0)]);
  } else if (ativo.classe === 'usa') {
    linhas.push(['Quantidade de ações', formatNumeroBR(ativo.quantidade, 0)]);
    linhas.push(['Preço teto', valorComConversaoBRL_(ativo.precoTeto, ativo.precoTetoBRL, formatUSD)]);
    linhas.push(['Preço médio', valorComConversaoBRL_(ativo.precoMedio, ativo.precoMedioBRL, formatUSD)]);
  } else {
    linhas.push(['Quantidade de ações', formatNumeroBR(ativo.quantidade, 0)]);
    linhas.push(['Preço teto', formatBRL(ativo.precoTeto)]);
    linhas.push(['Preço médio', formatBRL(ativo.precoMedio)]);
  }
  if (ativo.descontoPVp) linhas.push(['Desconto sobre P/VP', ativo.descontoPVp]);
  if (ativo.descontoPL) linhas.push(['Desconto sobre P/L', ativo.descontoPL]);
  return linhas;
}

/** "US$ 12,34 (R$ 66,12)" - valor principal em USD (Ações EUA) com o
 * equivalente em R$ menor do lado, mesmo padrão já usado no preço do
 * cartão (.ativo-price-conv). Sem câmbio disponível, mostra só o USD. */
function valorComConversaoBRL_(valorPrincipal, valorBRL, formatterPrincipal) {
  const texto = formatterPrincipal(valorPrincipal);
  if (typeof valorBRL !== 'number' || !Number.isFinite(valorBRL)) return texto;
  return `${texto} <span class="tt-conv">(${formatBRL(valorBRL)})</span>`;
}

/** Monta o HTML inteiro do tooltip (cabeçalho com ticker+classe + linhas). */
function tooltipInnerHtmlAtivo_(ativo) {
  const linhasHtml = linhasTooltipAtivo_(ativo).map(([label, valor]) => `
    <div class="tt-row"><span class="tt-k">${label}</span><span class="tt-v">${valor}</span></div>
  `).join('');
  return `<div class="tt-head">${ativo.ticker} <span class="tt-cat">${CLASSE_LABEL_ATIVO[ativo.classe] || ativo.classe}</span></div>${linhasHtml}`;
}


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
    <div class="ativo-card-acoes">
      <span class="ativo-grafico-icon" aria-label="Ver gráfico de preço">${ICONE_GRAFICO_ATIVO_SVG}</span>
      <span class="ativo-info-icon" aria-label="Informações rápidas">i</span>
    </div>
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

  // Guarda o ativo inteiro no próprio nó (não só o ticker em dataset) pra
  // wireTooltipAtivos ler direto na hora do hover/touch, sem precisar
  // reconsultar a lista de ativos - ver wireTooltipAtivos logo abaixo.
  card._ativoTooltip = ativo;

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
  if (!tabsContainer) return;
  tabsContainer._ativosAtuais = ativos;

  if (tabsContainer._filtroWired) {
    // Refresh (dado novo) - a aba clicada continua a mesma, só redesenha
    // a grade com o `ativos` novo, sem religar o clique (ver
    // wireGraficoRentabilidade acima pro mesmo raciocínio completo).
    const ativa = tabsContainer.querySelector('.filter-tab.active');
    renderMeusAtivos(doc, gridContainer, ativos, ativa ? ativa.dataset.classe : 'todos');
    return;
  }
  tabsContainer._filtroWired = true;

  const botoes = Array.from(tabsContainer.querySelectorAll('.filter-tab'));
  botoes.forEach((botao) => {
    botao.addEventListener('click', () => {
      botoes.forEach((b) => b.classList.toggle('active', b === botao));
      renderMeusAtivos(doc, gridContainer, tabsContainer._ativosAtuais, botao.dataset.classe);
    });
  });
}

/**
 * Liga o tooltip de hover/touch de cada .ativo-card (Nome, Quantidade,
 * Preço Teto/Médio, Descontos sobre P/VP e P/L, ou os campos de Renda
 * Fixa - ver linhasTooltipAtivo_ acima). Mesma técnica de Pointer Events
 * (mouse + touch com a mesma API) já usada no gráfico de Rentabilidade
 * (ver ligarInteracaoGrafico_), mas aqui é 1 tooltip só, position:fixed,
 * anexado a doc.body e reposicionado por delegação de evento no
 * `container` (a grade inteira) - porque o conteúdo do container é
 * substituído a cada clique nas abas de classe (wireFiltroAtivos), mas o
 * próprio container nunca é recriado, então ligar aqui uma vez só (na
 * mesma chamada que já liga o filtro, em montarPaginaInicio) é suficiente
 * pra qualquer cartão, mesmo depois de trocar de aba.
 */
export function wireTooltipAtivos(doc, container) {
  if (!container || container._tooltipWired) return;
  container._tooltipWired = true;
  const janela = doc.defaultView;
  const tooltip = doc.createElement('div');
  tooltip.className = 'ativo-tooltip';
  tooltip.hidden = true;
  (doc.body || container).appendChild(tooltip);

  // cardAberto: só usado no toque (touch/pen) - guarda qual .ativo-card
  // está com a tooltip aberta por toque, pra 1) o 2º toque no mesmo "i"
  // fechar (alternar) e 2) o listener de "toque fora" (mais abaixo) saber
  // o que fechar. No mouse/hover isso fica sempre null (esconder_ já
  // cuida de tudo via pointerleave, como sempre foi).
  let cardAberto = null;

  function esconder_() {
    tooltip.hidden = true;
    cardAberto = null;
  }

  function mostrar_(card, clientX, clientY) {
    const ativo = card._ativoTooltip;
    if (!ativo) {
      esconder_();
      return;
    }
    tooltip.innerHTML = tooltipInnerHtmlAtivo_(ativo);
    tooltip.hidden = false;

    const larguraJanela = (janela && janela.innerWidth) || 1000;
    const alturaJanela = (janela && janela.innerHeight) || 800;
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    let esquerda = clientX + 16;
    let topo = clientY + 16;
    if (esquerda + tw > larguraJanela - 12) esquerda = clientX - tw - 16;
    if (topo + th > alturaJanela - 12) topo = clientY - th - 16;
    tooltip.style.left = `${esquerda}px`;
    tooltip.style.top = `${topo}px`;
  }

  /**
   * pointerType 'touch'/'pen': o cartão inteiro é um <a href> (navega pro
   * Detalhe do Ativo), então no toque só o ícone ".ativo-info-icon" abre
   * a tooltip (não o cartão inteiro, senão qualquer toque pra navegar
   * mostraria a tooltip de relance antes de sair da página) - e
   * pointerdown alterna (2º toque no mesmo ícone fecha) em vez de só
   * mostrar, porque toque não tem "hover sustentado" pra saber quando
   * esconder. O fechamento por toque-fora fica com aoTocarFora_ abaixo.
   * Mouse/outros: continua exatamente como antes (hover no cartão
   * inteiro mostra, pointerleave esconde) - nenhum teste que já passava
   * com pointerType não informado (o default do PointerEvent) pode
   * quebrar.
   */
  function aoMoverOuTocar_(ev) {
    if (ev.pointerType === 'touch' || ev.pointerType === 'pen') {
      if (ev.type !== 'pointerdown') return;
      const icone = typeof ev.target.closest === 'function' ? ev.target.closest('.ativo-info-icon') : null;
      if (!icone) return;
      const card = icone.closest('.ativo-card');
      if (!card) return;
      if (cardAberto === card) {
        esconder_();
        return;
      }
      cardAberto = card;
      mostrar_(card, ev.clientX, ev.clientY);
      return;
    }
    const card = typeof ev.target.closest === 'function' ? ev.target.closest('.ativo-card') : null;
    if (!card) {
      esconder_();
      return;
    }
    mostrar_(card, ev.clientX, ev.clientY);
  }

  function aoSairPonteiro_(ev) {
    if (ev.pointerType === 'touch' || ev.pointerType === 'pen') return;
    esconder_();
  }

  /** Toque fora do cartão aberto (e fora da própria tooltip) fecha - "se
   * eu clico fora, o tooltip some" (pedido do Tiago, 16/09/2026). Alheio
   * ao toque (cardAberto null) não faz nada, então nunca interfere no
   * fluxo de mouse/hover de cima. */
  function aoTocarFora_(ev) {
    if (!cardAberto) return;
    const alvo = ev.target;
    if (tooltip.contains(alvo) || cardAberto.contains(alvo)) return;
    esconder_();
  }

  /** O ícone "i" nunca deve navegar (é dentro do <a> do cartão) - clique
   * (mouse ou o "click" sintético que o toque dispara depois do
   * pointerup) é sempre bloqueado, pra abrir/fechar a tooltip sem sair
   * da página. */
  function aoClicarIcone_(ev) {
    const icone = typeof ev.target.closest === 'function' ? ev.target.closest('.ativo-info-icon') : null;
    if (!icone) return;
    ev.preventDefault();
    ev.stopPropagation();
  }

  container.addEventListener('pointermove', aoMoverOuTocar_);
  container.addEventListener('pointerdown', aoMoverOuTocar_);
  container.addEventListener('pointerleave', aoSairPonteiro_);
  container.addEventListener('click', aoClicarIcone_);
  (doc.body ? doc : container).addEventListener('pointerdown', aoTocarFora_, true);
}

/**
 * Liga o botão de gráfico (.ativo-grafico-icon, rodapé de cada
 * .ativo-card - ver criarAtivoCard) a um popover ("alertinha", pedido
 * do Tiago) com o gráfico de preço do ativo. Ao contrário da tooltip de
 * info (wireTooltipAtivos, que mistura hover-no-mouse com toque-no-
 * ícone), aqui é sempre "clique/toque pra abrir, clique/toque de novo
 * (ou fora, ou no X) pra fechar" nos dois - um só listener de `click`
 * cobre mouse E o clique sintético que o toque dispara depois do
 * pointerup, sem precisar checar pointerType. Nunca navega pro Detalhe
 * do Ativo (preventDefault+stopPropagation, mesmo motivo do ícone "i").
 * 1 popover só, criado 1x e reposicionado por cartão - mesma técnica de
 * wireTooltipAtivos/wirePointerTooltipDistrib_.
 *
 * 17/09/2026 (1ª fatia - só o posicionamento/interação dos 3 "gatilhos"
 * do cartão, pedido do Tiago: "quero só reavaliar os botões, onde
 * colocá-los", antes de mexer em dado de verdade): o CORPO do popover
 * ainda é um placeholder ("gráfico chegando em breve") - buscar o
 * histórico de preço de verdade (endpoint novo no Apps Script, lendo
 * aux_historico-patrimonio, que já tem o preço de fechamento diário de
 * cada ticker) fica pra próxima rodada, depois que o encaixe do botão
 * em si estiver validado no desktop e no mobile.
 */
/** Rótulos/ids dos filtros de período do gráfico de preço do ativo -
 * MESMO conjunto/ordem usado no filtro de período da Rentabilidade
 * (#periodoTabs, pages.html) - pedido explícito do Tiago (17/09/2026):
 * "Siga o filtro que usamos na sessao Rentabilidade, onde o default é
 * mes atual". Gerado aqui em JS (não em pages.html) porque o popover
 * inteiro é montado dinamicamente - 1 popover só, reaproveitado pra
 * qualquer card, nunca um HTML estático por ativo. */
const PERIODOS_GRAFICO_ATIVO = [
  { id: 'mes', label: 'Mês atual' },
  { id: '30d', label: '30 dias' },
  { id: '6m', label: '6 meses' },
  { id: '12m', label: '12 meses' },
  { id: '3a', label: '3 anos' },
  { id: 'tudo', label: 'Desde o início' },
];

/** Rótulo compacto do eixo Y do gráfico de preço - só o número (sem
 * "R$"/"US$" repetido em cada marca, a moeda já aparece no tooltip ao
 * passar o mouse) porque o popover é bem mais estreito (300px) que um
 * cartão de Rentabilidade. */
function formatEixoPrecoAtivo_(v) {
  return formatNumeroBR(v, 2);
}

/**
 * Liga o hover (mouse) e o touch do gráfico de preço de 1 ativo -
 * adaptado de ligarInteracaoGrafico_ (gráfico de Rentabilidade, acima):
 * mesma técnica de Pointer Events sobre um <rect> transparente, mas com
 * 1 série só (sem benchmark) e tooltip mostrando o preço bruto
 * (formatMoeda: formatBRL ou formatUSD, conforme ativo.classe) em vez
 * de %. Não reaproveita ligarInteracaoGrafico_ direto porque aquela
 * função é específica da Rentabilidade (várias séries, tooltip em %) -
 * ver decisão registrada na 1ª rodada desta feature (17/09/2026).
 */
function ligarInteracaoGraficoAtivo_(container, { janela, valores, x, y, padL, plotW, W, formatMoeda }) {
  const svgEl = container.querySelector('svg.ativo-grafico-chart');
  const hitarea = container.querySelector('.ativo-grafico-hitarea');
  const hoverGroup = container.querySelector('.ativo-grafico-hover');
  const linhaHover = container.querySelector('.ativo-grafico-hover-linha');
  const pontoHover = container.querySelector('.ativo-grafico-hover-ponto');
  const tooltip = container.querySelector('.ativo-grafico-tooltip');
  if (!svgEl || !hitarea || !hoverGroup || !linhaHover || !pontoHover || !tooltip) return;

  function indiceNoClientX_(clientX) {
    const rect = svgEl.getBoundingClientRect();
    const svgX = clientX - rect.left;
    const fracao = plotW > 0 ? (svgX - padL) / plotW : 0;
    return Math.min(janela.length - 1, Math.max(0, Math.round(fracao * (janela.length - 1))));
  }

  function mostrar_(clientX) {
    const i = indiceNoClientX_(clientX);
    const xx = x(i, janela.length);

    linhaHover.setAttribute('x1', xx.toFixed(1));
    linhaHover.setAttribute('x2', xx.toFixed(1));
    pontoHover.removeAttribute('hidden');
    pontoHover.setAttribute('cx', xx.toFixed(1));
    pontoHover.setAttribute('cy', y(valores[i]).toFixed(1));
    hoverGroup.removeAttribute('hidden');

    tooltip.innerHTML = `<div class="ativo-grafico-tooltip-data">${formatDateBR(janela[i].data)}</div><b>${formatMoeda(valores[i])}</b>`;
    tooltip.hidden = false;

    const larguraTooltip = tooltip.offsetWidth || 90;
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
 * Desenha o gráfico de PREÇO BRUTO (não %) de 1 ativo só, dentro do
 * popover "Ver gráfico" (pedido do Tiago, 17/09/2026: "Preço bruto (R$
 * ou US$, conforme o ativo)"). Reaproveita os primitivos já validados
 * do gráfico de Rentabilidade (filtrarHistoricoPorPeriodo, larguraReal_,
 * pathDRentabilidade_), mas SEM normalizar pra % - a série (`serie`,
 * vinda de getHistoricoAtivo) já está na unidade final (preço cru), só
 * plota direto. Layout mais simples (1 série, sem benchmark/legenda) e
 * mais compacto (popover é bem mais estreito que um cartão de
 * Rentabilidade) que renderGraficoRentabilidade.
 */
function renderGraficoPrecoAtivo_(doc, container, { serie, periodoId = 'mes', formatMoeda }) {
  const janela = filtrarHistoricoPorPeriodo(serie, periodoId);
  if (janela.length < 2) {
    container.innerHTML = '<p class="hint">Sem histórico suficiente ainda pra desenhar o gráfico nesse período.</p>';
    return;
  }

  const valores = janela.map((item) => item.preco);
  const W = larguraReal_(container);
  const H = 140;
  const padL = 42, padR = 8, padT = 10, padB = 20;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  let minV = Math.min(...valores);
  let maxV = Math.max(...valores);
  const folga = (maxV - minV) * 0.12 || Math.abs(maxV) * 0.05 || 1;
  minV -= folga; maxV += folga;

  const y = (v) => padT + plotH * (1 - (v - minV) / (maxV - minV));
  const x = (i, n) => padL + plotW * (n > 1 ? i / (n - 1) : 0);

  const ticks = 3;
  let gridSvg = '';
  for (let t = 0; t <= ticks; t += 1) {
    const v = minV + (maxV - minV) * (t / ticks);
    const yy = y(v);
    gridSvg += `<line class="gridline" x1="${padL}" x2="${W - padR}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/>`;
    gridSvg += `<text class="axislabel" x="${padL - 6}" y="${(yy + 3).toFixed(1)}" text-anchor="end">${formatEixoPrecoAtivo_(v)}</text>`;
  }

  const passos = 3;
  let xLabelsSvg = '';
  for (let i = 0; i < passos; i += 1) {
    const idx = Math.round((janela.length - 1) * (i / (passos - 1)));
    const xx = padL + plotW * (i / (passos - 1));
    const ancora = i === 0 ? 'start' : (i === passos - 1 ? 'end' : 'middle');
    xLabelsSvg += `<text class="axislabel" x="${xx.toFixed(1)}" y="${H - 5}" text-anchor="${ancora}">${formatDateBR(janela[idx].data)}</text>`;
  }

  const pathSvg = `<path d="${pathDRentabilidade_(valores, x, y)}" fill="none" stroke="var(--acoes)" stroke-width="2.2"/>`;

  container.innerHTML = `
    <svg class="ativo-grafico-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      ${gridSvg}${xLabelsSvg}${pathSvg}
      <g class="ativo-grafico-hover" hidden>
        <line class="ativo-grafico-hover-linha" x1="0" x2="0" y1="${padT}" y2="${H - padB}"/>
        <circle class="ativo-grafico-hover-ponto" r="3.4" fill="var(--acoes)" hidden/>
      </g>
      <rect class="ativo-grafico-hitarea" x="${padL}" y="${padT}" width="${Math.max(plotW, 0)}" height="${Math.max(plotH, 0)}" fill="transparent" pointer-events="all"/>
    </svg>
    <div class="ativo-grafico-tooltip" hidden></div>
  `;

  ligarInteracaoGraficoAtivo_(container, { janela, valores, x, y, padL, plotW, W, formatMoeda });
}

/**
 * Monta o corpo "carregado" do popover: filtro de período (filter-tabs,
 * mesmo componente/CSS de #periodoTabs) + o gráfico de preço bruto.
 * `serie` já veio inteira do back-end (getHistoricoAtivo) numa única
 * chamada - trocar de período aqui é só filtrar/redesenhar em memória,
 * sem nova chamada de rede (mesmo padrão de wireGraficoRentabilidade).
 */
function montarCorpoGraficoAtivo_(doc, corpo, { ativo, serie }) {
  const pillsHtml = PERIODOS_GRAFICO_ATIVO
    .map(({ id, label }) => `<button class="filter-tab${id === 'mes' ? ' active' : ''}" type="button" data-periodo="${id}">${label}</button>`)
    .join('');
  corpo.innerHTML = `
    <div class="ativo-grafico-periodo filter-tabs">${pillsHtml}</div>
    <div class="ativo-grafico-chart-wrap"></div>
  `;

  const chartWrap = corpo.querySelector('.ativo-grafico-chart-wrap');
  const formatMoeda = ativo.classe === 'usa' ? formatUSD : formatBRL;
  const botoesPeriodo = Array.from(corpo.querySelectorAll('.filter-tab'));

  function redesenhar_(periodoId) {
    renderGraficoPrecoAtivo_(doc, chartWrap, { serie, periodoId, formatMoeda });
  }

  botoesPeriodo.forEach((botao) => {
    botao.addEventListener('click', () => {
      botoesPeriodo.forEach((b) => b.classList.toggle('active', b === botao));
      redesenhar_(botao.dataset.periodo);
    });
  });

  redesenhar_('mes');
}

/**
 * Liga o popover "Ver gráfico" de cada .ativo-card (ícone
 * .ativo-grafico-icon, criarAtivoCard) - 1 popover só, reaproveitado
 * pra qualquer card (mesmo padrão de wireTooltipAtivos), criado 1 vez
 * (idempotente via container._graficoWired) e reposicionado/redesenhado
 * a cada clique. `token` é passado pelo orquestrador (montarPaginaInicio)
 * pra buscar o histórico (getHistoricoAtivoImpl, injetável pra teste).
 *
 * 17/09/2026 (2ª rodada - pedido do Tiago: "continue com os gráficos
 * dos cards"): busca sob demanda (getHistoricoAtivo, ver api-client.js)
 * na 1ª vez que o popover de um ticker abre - o resultado fica em cache
 * no próprio nó do card (`card._historicoAtivoSerie`) pras aberturas
 * seguintes do MESMO card não baterem na rede de novo (a série inteira
 * já veio, trocar de período é só filtrar em memória - ver
 * montarCorpoGraficoAtivo_). `aberturaId` (incrementado a cada
 * mostrar_/esconder_) descarta uma resposta que chega depois do usuário
 * já ter fechado o popover ou aberto outro card - sem isso, uma busca
 * lenta do card A poderia sobrescrever o card B já aberto.
 *
 * Renda Fixa (ativo.classe==='rf') não tem preço diário por ticker
 * nesse formato (aux_historico-patrimonio guarda saldo pra RF, não
 * cotação de mercado - ver cabeçalho de apps-script/HistoricoAtivo.gs);
 * o ícone continua visível em todo card (evita UI que muda de forma por
 * classe), mas mostra um aviso direto, sem tentar buscar.
 */
export function wireGraficoAtivo(doc, container, { token, getHistoricoAtivoImpl = getHistoricoAtivo } = {}) {
  if (!container || container._graficoWired) return;
  container._graficoWired = true;

  const popover = doc.createElement('div');
  popover.className = 'ativo-grafico-popover';
  popover.hidden = true;
  popover.innerHTML = `
    <div class="ativo-grafico-popover-head">
      <span class="ativo-grafico-popover-ticker"></span>
      <button type="button" class="ativo-grafico-popover-fechar" aria-label="Fechar">×</button>
    </div>
    <div class="ativo-grafico-popover-corpo"></div>
  `;
  (doc.body || container).appendChild(popover);

  let cardAberto = null;
  let aberturaId = 0;

  function esconder_() {
    popover.hidden = true;
    cardAberto = null;
    aberturaId += 1; // invalida qualquer busca em andamento (ver mostrar_)
  }

  /** position:fixed ancorado no ícone clicado - mesma lógica de "não
   * deixa vazar da tela" já usada em mostrar_ (ativo-tooltip acima) e
   * mostrar_ (info-tooltip, wirePointerTooltipDistrib_), adaptada pra
   * abrir colado embaixo do ícone (não seguindo o ponteiro). */
  function posicionar_(icone) {
    const janela = doc.defaultView;
    const larguraJanela = (janela && janela.innerWidth) || 1000;
    const alturaJanela = (janela && janela.innerHeight) || 800;
    const rect = icone.getBoundingClientRect();
    const pw = popover.offsetWidth;
    const ph = popover.offsetHeight;
    let esquerda = rect.right - pw;
    if (esquerda < 12) esquerda = 12;
    if (esquerda + pw > larguraJanela - 12) esquerda = larguraJanela - pw - 12;
    let topo = rect.bottom + 8;
    if (topo + ph > alturaJanela - 12) topo = rect.top - ph - 8;
    popover.style.left = `${esquerda}px`;
    popover.style.top = `${topo}px`;
  }

  function mostrar_(icone, card) {
    const ativo = card._ativoTooltip;
    const corpo = popover.querySelector('.ativo-grafico-popover-corpo');
    popover.querySelector('.ativo-grafico-popover-ticker').textContent = ativo ? ativo.ticker : '';
    popover.hidden = false;
    posicionar_(icone);
    cardAberto = card;

    const minhaAbertura = (aberturaId += 1);

    if (!ativo) {
      corpo.innerHTML = '<div class="ativo-grafico-popover-hint"><p class="hint">Ativo não encontrado.</p></div>';
      return;
    }

    if (ativo.classe === 'rf') {
      corpo.innerHTML = '<div class="ativo-grafico-popover-hint"><p class="hint">Gráfico de preço não disponível para Renda Fixa.</p></div>';
      return;
    }

    if (card._historicoAtivoSerie) {
      montarCorpoGraficoAtivo_(doc, corpo, { ativo, serie: card._historicoAtivoSerie });
      return;
    }

    corpo.innerHTML = '<div class="ativo-grafico-popover-hint"><p class="hint">Carregando…</p></div>';

    getHistoricoAtivoImpl(token, ativo.ticker).then((resposta) => {
      if (minhaAbertura !== aberturaId) return; // popover fechou/trocou de card enquanto buscava
      if (!resposta.ok || !resposta.resultado) {
        corpo.innerHTML = '<div class="ativo-grafico-popover-hint"><p class="hint">Não deu pra carregar o histórico agora.</p></div>';
        return;
      }
      card._historicoAtivoSerie = resposta.resultado.serie || [];
      montarCorpoGraficoAtivo_(doc, corpo, { ativo, serie: card._historicoAtivoSerie });
    });
  }

  function aoClicar_(ev) {
    const fechar = typeof ev.target.closest === 'function' ? ev.target.closest('.ativo-grafico-popover-fechar') : null;
    if (fechar) {
      ev.preventDefault();
      esconder_();
      return;
    }
    const icone = typeof ev.target.closest === 'function' ? ev.target.closest('.ativo-grafico-icon') : null;
    if (!icone) return;
    ev.preventDefault();
    ev.stopPropagation();
    const card = icone.closest('.ativo-card');
    if (!card) return;
    if (cardAberto === card) {
      esconder_();
      return;
    }
    mostrar_(icone, card);
  }

  /** Toque/clique fora do cartão aberto (e fora do próprio popover) fecha
   * - mesmo padrão "se eu clico fora, some" já validado nas outras
   * tooltips/popovers da página. */
  function aoTocarFora_(ev) {
    if (!cardAberto) return;
    const alvo = ev.target;
    if (popover.contains(alvo) || cardAberto.contains(alvo)) return;
    esconder_();
  }

  container.addEventListener('click', aoClicar_);
  popover.addEventListener('click', aoClicar_);
  (doc.body ? doc : container).addEventListener('pointerdown', aoTocarFora_, true);
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
  const refreshControlEl = doc.getElementById('refreshControlInicio');

  async function carregarERedesenhar() {
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
    if (erroEl) erroEl.hidden = true;

    renderAvisos(doc.getElementById('inicioAvisos'), resposta.avisos);
    renderIndicesCambio(doc, doc.getElementById('indicesCambioGrid'), { indices: resposta.indices, cambio: resposta.cambio });
    renderResumoPatrimonio(doc, doc.getElementById('resumoPatrimonio'), {
      patrimonio: resposta.patrimonio,
      ativos: resposta.ativos,
      cambio: resposta.cambio,
      ontem: resposta.ontem,
    });

    const PAINEIS_RENTABILIDADE = [
      { visaoId: 'total', sufixo: 'Total' },
      { visaoId: 'longoPrazo', sufixo: 'LongoPrazo' },
      { visaoId: 'nacional', sufixo: 'Nacional' },
      { visaoId: 'rendaEmergencial', sufixo: 'RendaEmergencial' },
    ];
    wireGraficoRentabilidade(doc, {
      patrimonio: resposta.patrimonio,
      historico: resposta.historico,
      periodoTabsContainer: doc.getElementById('periodoTabs'),
      periodoInicial: 'mes',
      paineis: PAINEIS_RENTABILIDADE.map(({ visaoId, sufixo }) => ({
        visaoId,
        infoContainer: doc.getElementById(`rentabInfo${sufixo}`),
        chartContainer: doc.getElementById(`rentabChart${sufixo}`),
        legendaContainer: doc.getElementById(`rentabLegenda${sufixo}`),
      })),
    });

    renderMeusAtivos(doc, doc.getElementById('meusAtivosGrid'), resposta.ativos, 'todos');
    wireFiltroAtivos(doc, doc.getElementById('filtroAtivosTabs'), doc.getElementById('meusAtivosGrid'), resposta.ativos);
    wireTooltipAtivos(doc, doc.getElementById('meusAtivosGrid'));
    wireGraficoAtivo(doc, doc.getElementById('meusAtivosGrid'), { token });
  }

  await carregarERedesenhar();

  // Botão "Atualizar dados" + timer automático (5 em 5 min - pedido do
  // Tiago, 14/09/2026). carregarERedesenhar busca de novo e só redesenha
  // depois que os dados chegam (nunca reexibe o skeleton), e
  // wireGraficoRentabilidade/wireFiltroAtivos/wireTooltipAtivos (acima)
  // agora são idempotentes - religar não duplica listener, só atualiza o
  // que está na tela com o dado novo. marcarAtualizado() só registra o
  // horário da carga inicial que já aconteceu, sem buscar de novo.
  mountRefreshControl(doc, refreshControlEl, carregarERedesenhar).marcarAtualizado();
}
