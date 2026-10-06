/**
 * inicio-ativos.js - 06/10/2026 (A-42/A-76): cartão de ativo da Início, tooltip e gráfico de preço do ativo (DOM).
 * inicio.js reexporta (compatibilidade).
 */

import { formatBRL, formatDateBR, formatNumeroBR, formatPercentFromFraction, formatUSD, variacaoNula } from '../format.js';
import { refAtivo, urlAtivo } from '../link-ativo.js';
import { logoCirculoHtml } from './logo-circulo.js';
import { htmlBotaoFavorito } from './inicio-favoritos.js';
import { dataCurta_, destruirGraficoDe_, setValorComDec } from './inicio-rentabilidade.js';
import { icone } from '../ui/index.js';
import { botoesSegmentadoHtml, ligarFiltroPeriodo, rotuloPeriodo } from '../periodo-personalizado.js';
import { filtrarHistoricoPorPeriodo, limitesDoHistorico_ } from './inicio-calc.js';
import { criarGraficoLinha } from '../charts/index.js';
import { getHistoricoAtivo } from '../api-client.js';

const CLASSE_LABEL_ATIVO = { acoes: 'Ação', fiis: 'FII', usa: 'EUA', rf: 'RF' };

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

/**
 * Cria um .ativo-card - cartão inteiro é o link pro Detalhe do Ativo
 * (ativo/index.html?ref=..., ver link-ativo.js - 25/09/2026), sem link externo
 * separado, mesmo padrão já aplicado aos widget-tiles de índices/câmbio.
 * Renda Fixa não tem preço-teto (não existe preço-teto pra título de renda
 * fixa) nem viés - mostra o saldo atualizado no lugar do preço, e o
 * indexador/vencimento no lugar do desconto sobre P/VP ou P/L.
 */
export function criarAtivoCard(doc, ativo, { favorito = false } = {}) {
  const card = doc.createElement('a');
  card.className = `ativo-card ${ativo.classe}`;
  card.href = urlAtivo(refAtivo(ativo)); // 25/09/2026: tela Detalhe do ativo (ativo/index.html)

  const viesHtml = ativo.vies
    ? `<span class="vies-badge chip-tonal ${ativo.vies === 'comprar' ? 'chip-good' : 'chip-warn'} ${ativo.vies}">${ativo.vies === 'comprar' ? 'Comprar' : 'Aguardar'}</span>`
    : '';

  let precoHtml;
  let deltaHtml;
  let detalheHtml;

  // 06/10/2026 (kit): variação do dia com ícone de tendência (nunca só cor) - 0,00% é neutro
  const deltaDoDia = () => {
    const tem = typeof ativo.variacaoDia === 'number' && Number.isFinite(ativo.variacaoDia);
    if (!tem) return '<div class="ativo-delta na">—</div>';
    const nulo = variacaoNula(ativo.variacaoDia, { fracao: true });
    const sobe = ativo.variacaoDia >= 0;
    const tom = nulo ? 'na' : (sobe ? 'good' : 'bad');
    const ico = nulo ? 'trending-flat' : (sobe ? 'trending-up' : 'trending-down');
    return `<div class="ativo-delta ${tom}"><svg class="ico" aria-hidden="true"><use href="#ico-${ico}"/></svg>${formatPercentFromFraction(ativo.variacaoDia)} <span class="dim">hoje</span></div>`;
  };

  if (ativo.classe === 'rf') {
    precoHtml = `<div class="ativo-price"></div>`;
    deltaHtml = typeof ativo.variacaoDia === 'number' && Number.isFinite(ativo.variacaoDia) ? deltaDoDia() : '';
    detalheHtml = `<div class="ativo-detalhe">${[ativo.indexador, ativo.vencimento ? `vence ${ativo.vencimento}` : null].filter(Boolean).join(' · ')}</div>`;
  } else {
    precoHtml = `<div class="ativo-price"></div>`;
    deltaHtml = deltaDoDia();
    const desconto = ativo.classe === 'usa' || ativo.classe === 'acoes' ? ativo.descontoPL : ativo.descontoPVp;
    detalheHtml = desconto ? `<div class="ativo-detalhe">Desconto: ${desconto}</div>` : '';
  }

  card.innerHTML = `
    <div class="ativo-card-top">
      ${ativo.classe === 'rf' ? '' : logoCirculoHtml(ativo.ticker)}
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
      ${htmlBotaoFavorito(ativo, favorito)}
      <span class="ativo-grafico-icon" role="button" tabindex="0" aria-label="Ver gráfico de preço" title="Ver gráfico de preço"><svg class="ico" aria-hidden="true"><use href="#ico-show-chart"/></svg></span>
      <span class="ativo-info-icon" role="button" tabindex="0" aria-label="Informações rápidas" title="Informações rápidas"><svg class="ico" aria-hidden="true"><use href="#ico-info"/></svg></span>
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
    // 23/09/2026: grade de favoritos em modo edição (arrastando) - sem tooltip
    if (container.classList && container.classList.contains('editando')) {
      esconder_();
      return;
    }
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
const PERIODOS_GRAFICO_ATIVO = ['mes', '30d', '6m', '12m', '3a', 'tudo'].map((id) => ({ id, label: rotuloPeriodo(id) }));

/**
 * Desenha o gráfico de PREÇO BRUTO (não %) de 1 ativo só, dentro do
 * popover "Ver gráfico" (pedido do Tiago, 17/09/2026: "Preço bruto (R$
 * ou US$, conforme o ativo)"). 06/10/2026 (Onda 3): agora com a biblioteca
 * única de gráficos (linha + área suave, crosshair, tooltip escura); trocar
 * de período só atualiza a instância (a linha morfa). A série (`serie`,
 * vinda de getHistoricoAtivo) já está na unidade final (preço cru).
 */
function renderGraficoPrecoAtivo_(doc, container, { serie, periodoId = 'mes', formatMoeda }) {
  const janela = filtrarHistoricoPorPeriodo(serie, periodoId);
  if (janela.length < 2) {
    destruirGraficoDe_(container);
    container.innerHTML = '<p class="hint">Sem histórico suficiente ainda pra desenhar o gráfico nesse período.</p>';
    return;
  }
  const dados = {
    series: [{ id: 'preco', nome: 'Preço', valores: janela.map((item) => item.preco), cor: 'var(--md-sys-color-primary)', area: true }],
    eixoX: janela.map((p) => ({ rotulo: dataCurta_(p.data), data: p.data })),
  };
  if (container._graficoLib && container.querySelector('svg')) {
    container._graficoLib.atualizar(dados);
    return;
  }
  destruirGraficoDe_(container);
  container.innerHTML = '';
  container._graficoLib = criarGraficoLinha(container, {
    ...dados, altura: 160, ticksY: 3, area: true, legenda: false, botaoTabela: false, maxRotulosX: 3,
    formatarY: (v) => formatNumeroBR(v, 2), formatarValor: (v) => formatMoeda(v),
    formatarX: (item) => (item && item.data ? formatDateBR(item.data) : ''),
    aria: 'Preço do ativo no período',
  });
}

/**
 * Monta o corpo "carregado" do popover: filtro de período (segmentado,
 * mesmo componente/CSS de #periodoTabs) + o gráfico de preço bruto.
 * `serie` já veio inteira do back-end (getHistoricoAtivo) numa única
 * chamada - trocar de período aqui é só filtrar/redesenhar em memória,
 * sem nova chamada de rede (mesmo padrão de wireGraficoRentabilidade).
 */
function montarCorpoGraficoAtivo_(doc, corpo, { ativo, serie }) {
  corpo.innerHTML = `
    <div class="ativo-grafico-periodo">${botoesSegmentadoHtml(PERIODOS_GRAFICO_ATIVO.map(({ id }) => id), 'mes')}</div>
    <div class="ativo-grafico-chart-wrap"></div>
  `;

  const chartWrap = corpo.querySelector('.ativo-grafico-chart-wrap');
  const formatMoeda = ativo.classe === 'usa' ? formatUSD : formatBRL;

  function redesenhar_(periodoId) {
    renderGraficoPrecoAtivo_(doc, chartWrap, { serie, periodoId, formatMoeda });
  }

  // 02/10/2026 (pedido A): mesmo filtro com "Escolher período" dos outros
  // gráficos - o calendário só deixa escolher dias que a série do ativo tem.
  const filtro = ligarFiltroPeriodo(doc, corpo.querySelector('.ativo-grafico-periodo'), {
    chave: 'inicio.graficoAtivo',
    periodoInicial: 'mes',
    limites: limitesDoHistorico_(serie),
    aoMudar: redesenhar_,
  });
  redesenhar_(filtro ? filtro.periodo : 'mes');
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
      <button type="button" class="ativo-grafico-popover-fechar" aria-label="Fechar"><svg class="ico" aria-hidden="true"><use href="#ico-close"/></svg></button>
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
    // 02/10/2026: o calendário de "Escolher período" mora fora do popover
    if (alvo && typeof alvo.closest === 'function' && alvo.closest('.fp-camada')) return;
    esconder_();
  }

  /** 06/10/2026 (A-59, teclado): o ícone é um role=button num <span> - Enter/Espaço fazem o mesmo que o clique; Esc fecha. */
  function aoTecla_(ev) {
    if (ev.key === 'Escape') { if (cardAberto) esconder_(); return; }
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const icone = typeof ev.target.closest === 'function' ? ev.target.closest('.ativo-grafico-icon') : null;
    if (!icone) return;
    ev.preventDefault();
    icone.click();
  }

  container.addEventListener('click', aoClicar_);
  container.addEventListener('keydown', aoTecla_);
  popover.addEventListener('click', aoClicar_);
  popover.addEventListener('keydown', aoTecla_);
  (doc.body ? doc : container).addEventListener('pointerdown', aoTocarFora_, true);
}
