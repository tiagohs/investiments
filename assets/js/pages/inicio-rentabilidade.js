/**
 * inicio-rentabilidade.js - 06/10/2026 (A-42/A-76): gráfico de rentabilidade/evolução da tela Início e os textos de resumo (DOM).
 * As contas vivem em inicio-calc.js. inicio.js reexporta (compatibilidade).
 */

import { BENCHMARKS_POR_VISAO, CAMPO_FLUXO_POR_VISAO, CAMPO_PRINCIPAL_POR_VISAO, COR_PRINCIPAL_POR_VISAO, LABEL_POR_VISAO_RENTABILIDADE, VISOES, calcularResumoEvolucao, calcularResumoRentabilidade, filtrarHistoricoPorPeriodo, inicioEhAbertura_, limitesDoHistorico_, montarAnaliseRentabilidade_, normalizarSerieRentabilidade, primeiroIndiceValidoInicio_, resolverVisao, somarProventosNoPeriodo, splitValorExibicao, ultimoValidoDe_ } from './inicio-calc.js';
import { formatBRL, formatDateBR, formatNumeroBR, formatPercentFromPoints, variacaoNula } from '../format.js';
import { renderAnalise } from '../analise-grafico.js';
import { criarGraficoLinha } from '../charts/index.js';
import { calcularComparativo, htmlComparativo } from './inicio-comparativo.js';
import { icone } from '../ui/index.js';
import { ligarFiltroPeriodo } from '../periodo-personalizado.js';

export function setValorComDec(el, formatted) {
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

/** "30/09" - rótulo curto do eixo X (a data inteira vai no título da tooltip). */
export function dataCurta_(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : '';
}

/** 06/10/2026 (Onda 3): o gráfico (instância da biblioteca) mora no próprio contêiner - redesenhar = `atualizar` (a linha MORFA). */
export function destruirGraficoDe_(container) {
  if (container && container._graficoLib) {
    try { container._graficoLib.destruir(); } catch (e) { /* já saiu do DOM */ }
    container._graficoLib = null;
  }
}

/**
 * Desenha o gráfico de Rentabilidade (Portfólio vs benchmarks da visão) em
 * `container` com a biblioteca única de gráficos (assets/js/charts/, kit
 * Figma): linha principal grossa + comparativos pontilhados, crosshair,
 * tooltip escura multilinha com a data, setas do teclado e "ver como tabela".
 * Chamar de novo no mesmo contêiner (troca de período, Atualizar dados) só
 * ATUALIZA a instância - a linha morfa em vez de redesenhar do zero.
 *
 * A legenda (bolinha + nome + o quanto o PORTFÓLIO ganhou ou perdeu EM
 * RELAÇÃO a cada benchmark - ver a correção de 13/09 no cabeçalho do arquivo)
 * é a própria legenda da biblioteca; com `legendaContainer` ela é MOVIDA pra
 * lá (as telas de Carteiras reaproveitam esta função e guardam a legenda num
 * lugar próprio). Some com um aviso, sem lançar, quando não há histórico
 * (ou menos de 2 dias, onde uma linha não diz nada).
 */
export function renderGraficoRentabilidade(doc, container, { historico, visaoId = 'total', periodoId = '12m', legendaContainer, labelPrincipal = 'Portfólio', benchmarksExtra = null, analiseContainer = null, nomeAnalise = null, formatarMoeda = formatBRL, analiseExtra = null, altura = 220 } = {}) {
  // 20/09/2026: campoPrincipal precisa existir ANTES de filtrar - "Desde o
  // início" (periodoId:'tudo') corta pro início desta visão específica
  // (ver comentário de filtrarHistoricoPorPeriodo) - sem isso, o gráfico
  // de FIIs/Ações EUA/Renda Fixa (sub-visões) "desde o início" nascia com
  // anos de linha reta em zero antes da 1ª posição de verdade.
  const campoPrincipal = CAMPO_PRINCIPAL_POR_VISAO[visaoId] || CAMPO_PRINCIPAL_POR_VISAO.total;
  const campoFluxoPrincipal = CAMPO_FLUXO_POR_VISAO[visaoId] || CAMPO_FLUXO_POR_VISAO.total;
  // 02/10/2026 (pedido D - IPCA no Patrimônio total de Carteiras):
  // benchmarksExtra acrescenta linhas a uma visão sem mexer nas outras telas.
  const benchmarks = [...(BENCHMARKS_POR_VISAO[visaoId] || BENCHMARKS_POR_VISAO.total), ...(Array.isArray(benchmarksExtra) ? benchmarksExtra : [])];
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
    destruirGraficoDe_(container);
    container.innerHTML = '<p class="hint">Sem histórico suficiente ainda pra desenhar o gráfico nesse período.</p>';
    if (legendaContainer) legendaContainer.innerHTML = '';
    if (analiseContainer) renderAnalise(doc, analiseContainer, null);
    return;
  }

  const seriePrincipal = normalizarSerieRentabilidade(janela, campoPrincipal, campoFluxoPrincipal, {
    abertura: inicioEhAbertura_(historico, janela, campoPrincipal, campoFluxoPrincipal),
  });
  const seriesBenchmark = benchmarks.map((b) => {
    const valores = normalizarSerieRentabilidade(janela, b.campo);
    return { ...b, valores, delta: ultimoValidoDe_(valores) };
  });

  // 13/09/2026 (2ª rodada): a % ao lado do benchmark é RELATIVA ao
  // portfólio (retorno do portfólio − retorno do benchmark, mesma
  // série "% desde o início do período") - não o retorno absoluto do
  // próprio benchmark. Positiva = portfólio bateu o benchmark no
  // período; negativa = ficou atrás.
  const deltaPrincipal = ultimoValidoDe_(seriePrincipal);
  const series = [
    { id: 'principal', nome: labelPrincipal, valores: seriePrincipal, principal: true, cor: `var(${corPrincipal})` },
    ...seriesBenchmark.map((b) => {
      const relativo = (typeof deltaPrincipal === 'number' && typeof b.delta === 'number') ? deltaPrincipal - b.delta : null;
      return {
        id: b.campo, nome: b.label, valores: b.valores, principal: false, pontilhada: !!b.dash, cor: `var(${b.cor})`,
        valorLegenda: typeof relativo === 'number' ? formatPercentFromPoints(relativo) : undefined,
        tomLegenda: typeof relativo === 'number' && !variacaoNula(relativo) ? (relativo >= 0 ? 'up' : 'down') : undefined,
      };
    }),
  ];
  const eixoX = janela.map((p) => ({ rotulo: dataCurta_(p.data), data: p.data }));
  const dados = { series, eixoX };

  if (container._graficoLib && container.querySelector('svg')) {
    container._graficoLib.atualizar(dados);
  } else {
    destruirGraficoDe_(container);
    container.innerHTML = '';
    container._graficoLib = criarGraficoLinha(container, {
      ...dados, altura, zero: true, ticksY: 4,
      formatarY: (v) => `${formatNumeroBR(v, 1)}%`, formatarValor: (v) => formatPercentFromPoints(v),
      formatarX: (item) => (item && item.data ? formatDateBR(item.data) : ''),
      aria: `Rentabilidade (% desde o início do período): ${labelPrincipal} contra ${benchmarks.map((b) => b.label).join(' e ')}`,
    });
  }
  if (legendaContainer) {
    const leg = container._graficoLib.casca && container._graficoLib.casca.legenda && container._graficoLib.casca.legenda.el;
    legendaContainer.classList.add('chart', 'chart-legenda-ext');
    if (leg) legendaContainer.replaceChildren(leg);
  }

  // 02/10/2026 (pedido C): card "Análise" embaixo do gráfico - os MESMOS
  // números desenhados (série do portfólio e dos índices já normalizadas),
  // então o texto nunca diverge da legenda. Ver analise-grafico.js.
  if (analiseContainer) {
    renderAnalise(doc, analiseContainer, montarAnaliseRentabilidade_({ historico, janela, seriePrincipal, seriesBenchmark, visaoId, campoPrincipal, campoFluxoPrincipal, periodoId, nomeAnalise, formatarMoeda, analiseExtra }));
  }
}

export function renderInfoRentabilidade(doc, container, { patrimonio, historico, visaoId = 'total', periodoId = '12m', label = null, formatarMoeda = formatBRL, camposProventos = null, comparativo = null } = {}) {
  if (!container) return;
  const { valorAtual, ganhoReais, percentual: ultimoValido, dataFim, diasSuspeitos } = calcularResumoRentabilidade(patrimonio, historico, { visaoId, periodoId });

  // 02/10/2026: intervalo personalizado que termina antes de hoje - o valor é o do fim dele
  const sufixoData = dataFim ? ` <span class="rentab-card-em">em ${formatDateBR(dataFim)}</span>` : '';
  container.innerHTML = `
    <div class="rentab-card-label">${label || LABEL_POR_VISAO_RENTABILIDADE[visaoId] || LABEL_POR_VISAO_RENTABILIDADE.total}${sufixoData}</div>
    <div class="rentab-card-value"></div>
    <div class="rentab-card-delta"></div>
  `;
  setValorComDec(container.querySelector('.rentab-card-value'), formatarMoeda(valorAtual));
  // 02/10/2026 (pedido B): "Ontem era" + 3 meses, logo abaixo do valor (ver inicio-comparativo.js)
  if (comparativo) container.insertAdjacentHTML('beforeend', htmlComparativo(comparativo, { formatarMoeda }));

  const deltaEl = container.querySelector('.rentab-card-delta');
  if (typeof ultimoValido === 'number') {
    // 24/09/2026 (Tiago: "lembrando que valor negativo é vermelho"): o R$ e
    // a % têm cor PRÓPRIA cada um. Os dois podem ter sinais diferentes no
    // mesmo período (a % não depende de quanto dinheiro havia em cada
    // momento, o R$ sim - ex.: rendeu bem com pouco dinheiro e perdeu um
    // pouco depois de um aporte grande); antes o bloco inteiro seguia a %,
    // e um "-R$ 107,39" aparecia verde.
    const good = ultimoValido >= 0;
    const misto = typeof ganhoReais === 'number' && Math.abs(ganhoReais) >= 0.005 && (ganhoReais >= 0) !== good;
    deltaEl.className = `rentab-card-delta ${misto ? 'misto' : (variacaoNula(ultimoValido) ? 'na' : (good ? 'good' : 'bad'))}`;
    deltaEl.textContent = '';
    if (typeof ganhoReais === 'number') {
      const reaisEl = doc.createElement('span');
      reaisEl.className = `delta-reais ${ganhoReais >= 0 ? 'good' : 'bad'}`;
      reaisEl.textContent = `${ganhoReais >= 0 ? '+' : '−'}${formatarMoeda(Math.abs(ganhoReais))}`;
      deltaEl.append(reaisEl, ' ');
    }
    const pctEl = doc.createElement('span');
    pctEl.className = `delta-pct ${good ? 'good' : 'bad'}`;
    // 06/10/2026 (kit): variação sempre com ícone de tendência (nunca só cor)
    if (!variacaoNula(ultimoValido)) pctEl.append(icone(doc, good ? 'trending-up' : 'trending-down'));
    pctEl.append(formatPercentFromPoints(ultimoValido));
    deltaEl.append(pctEl, ' no período');
    // 24/09/2026: proventos recebidos na mesma janela (Carteiras)
    const proventos = camposProventos ? somarProventosNoPeriodo(historico, periodoId, CAMPO_PRINCIPAL_POR_VISAO[visaoId] || 'patrimonio', camposProventos) : null;
    if (proventos != null) {
      const sub = doc.createElement('div');
      sub.className = 'rentab-card-sub rentab-card-proventos';
      sub.textContent = `Proventos recebidos no período: ${formatarMoeda(proventos)}`;
      container.append(sub);
    }
    // 05/10/2026 (A-20): dia com variação fora da faixa plausível = dado ruim no histórico; o % o
    // desconsidera (0% naquele dia), o ganho em R$ não - avisa em vez de esconder.
    if (diasSuspeitos && diasSuspeitos.length) {
      const aviso = doc.createElement('div');
      aviso.className = 'rentab-card-sub rentab-card-aviso';
      const exemplos = diasSuspeitos.slice(0, 3).map((d) => `${d.data ? formatDateBR(d.data) : '?'} (${formatPercentFromPoints(d.retorno)})`).join(', ');
      aviso.textContent = `Atenção: ${diasSuspeitos.length} dia${diasSuspeitos.length === 1 ? '' : 's'} com variação fora do normal no histórico (${exemplos}${diasSuspeitos.length > 3 ? '…' : ''}). O % desconsidera ${diasSuspeitos.length === 1 ? 'esse dia' : 'esses dias'}; o ganho em R$ não, então os dois podem divergir.`;
      aviso.title = 'Variação diária fora de -50% a +100%: provável defeito nos dados (preço ou fluxo de caixa desalinhados).';
      container.append(aviso);
    }
  } else {
    deltaEl.className = 'rentab-card-delta na';
    deltaEl.textContent = 'sem histórico suficiente no período';
  }
}

/** 23/09/2026 #8: bloco "rótulo / R$ valor / ±R$ variação no período /
 * Valor aplicado e ±R$ (±x%) acima/abaixo dele" em cima do gráfico de Evolução - mesmo visual do bloco da
 * Rentabilidade (renderInfoRentabilidade). */
export function renderInfoEvolucao(doc, container, { label = 'Patrimônio', valores, investidos = null, formatarMoeda = formatBRL, comparativo = null, dataFim = null, ganhoReais = null } = {}) {
  if (!container) return;
  const r = calcularResumoEvolucao(valores, investidos);
  container.innerHTML = `
    <div class="rentab-card-label"></div>
    <div class="rentab-card-value"></div>
    <div class="rentab-card-delta"></div>
    <div class="rentab-card-sub"></div>
  `;
  container.querySelector('.rentab-card-label').textContent = label;
  if (dataFim) container.querySelector('.rentab-card-label').insertAdjacentHTML('beforeend', ` <span class="rentab-card-em">em ${formatDateBR(dataFim)}</span>`);
  // 02/10/2026 (pedido B): "Ontem era" + 3 meses (ver inicio-comparativo.js)
  if (comparativo && r) container.querySelector('.rentab-card-delta').insertAdjacentHTML('afterend', htmlComparativo(comparativo, { formatarMoeda }));
  const deltaEl = container.querySelector('.rentab-card-delta');
  const subEl = container.querySelector('.rentab-card-sub');
  if (!r) {
    container.querySelector('.rentab-card-value').textContent = '—';
    deltaEl.className = 'rentab-card-delta na';
    deltaEl.textContent = 'sem histórico suficiente no período';
    subEl.remove();
    return;
  }
  setValorComDec(container.querySelector('.rentab-card-value'), formatarMoeda(r.final));
  const sinal = (v) => (v >= 0 ? '+' : '−');
  deltaEl.className = `rentab-card-delta ${Math.abs(r.variacao) < 0.005 ? 'na' : (r.variacao >= 0 ? 'good' : 'bad')}`;
  // Sem % na variação da linha: com aporte no meio, "subiu 5.000%" (desde
  // o início) não diz nada - o % que importa aqui é a distância pro Valor
  // aplicado; o rendimento do período (sem aporte) é o do gráfico de
  // Rentabilidade.
  // 06/10/2026: com `ganhoReais` (o mesmo da Rentabilidade, sem aportes) mostra o GANHO; sem ele, a variação bruta da linha.
  if (typeof ganhoReais === 'number' && Number.isFinite(ganhoReais)) {
    deltaEl.className = `rentab-card-delta ${Math.abs(ganhoReais) < 0.005 ? 'na' : (ganhoReais >= 0 ? 'good' : 'bad')}`;
    deltaEl.textContent = `${sinal(ganhoReais)}${formatarMoeda(Math.abs(ganhoReais))} ganho no período (sem contar os aportes)`;
  } else deltaEl.textContent = `${sinal(r.variacao)}${formatarMoeda(Math.abs(r.variacao))} no período`;
  if (r.aplicado != null) {
    const pctAplicado = r.aplicado ? ` ${formatPercentFromPoints((r.diferencaAplicado / Math.abs(r.aplicado)) * 100)}` : '';
    subEl.textContent = `com aportes e retiradas · Valor aplicado: ${formatarMoeda(r.aplicado)} · ${sinal(r.diferencaAplicado)}${formatarMoeda(Math.abs(r.diferencaAplicado))}${pctAplicado} ${r.diferencaAplicado >= 0 ? 'acima' : 'abaixo'} do aplicado`;
  } else {
    subEl.textContent = 'com aportes e retiradas';
  }
}

/** 02/10/2026 (pedido C): onde o card de Análise de um painel mora -
 * `analiseContainer` explícito, ou (analise:true) um <div> criado 1x logo
 * depois da legenda (ou do gráfico). */
function slotAnalise_(doc, painel) {
  if (painel.analiseContainer) return painel.analiseContainer;
  if (!painel.analise) return null;
  const ancora = painel.legendaContainer || painel.chartContainer;
  if (!ancora || !ancora.parentNode) return null;
  if (ancora._agSlot && ancora._agSlot.parentNode) return ancora._agSlot;
  const slot = doc.createElement('div');
  slot.className = 'ag-slot';
  ancora.parentNode.insertBefore(slot, ancora.nextSibling);
  ancora._agSlot = slot;
  return slot;
}

/** 02/10/2026 (pedido B): "Ontem era" + meses do painel da Início/Carteiras -
 * o valor de referência é o MESMO que o bloco mostra (ao vivo, hoje) e o
 * "ontem" de hoje vem pronto do back-end quando a visão tem (resposta.ontem). */
function comparativoDoPainel_(estado, visaoId) {
  const campo = CAMPO_PRINCIPAL_POR_VISAO[visaoId] || CAMPO_PRINCIPAL_POR_VISAO.total;
  const janela = filtrarHistoricoPorPeriodo(estado.historico, estado.periodoAtual, campo);
  const chaveOntem = { total: 'total', longoPrazo: 'longoPrazo', nacional: 'nacional', rendaEmergencial: 'rendaEmergencial' }[visaoId];
  const valorReferencia = estado.patrimonio && VISOES[visaoId] ? resolverVisao(estado.patrimonio, visaoId).valor : null;
  const ontemValor = chaveOntem && estado.ontem && typeof estado.ontem[chaveOntem] === 'number' ? estado.ontem[chaveOntem] : null;
  return calcularComparativo(estado.historico, campo, estado.periodoAtual, { janela, valorReferencia, ontemValor });
}

/**
 * Liga o seletor de período segmentado (#periodoTabs) - um filtro só, compartilhado
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
export function wireGraficoRentabilidade(doc, { patrimonio, historico, periodoTabsContainer, paineis = [], periodoInicial = 'mes', periodoPersonalizado = null, ontem = null } = {}) {
  // 02/10/2026 (pedido A): o filtro de período agora é o controlador de
  // periodo-personalizado.js (presets + chip "Escolher período" quando
  // `periodoPersonalizado` vem - { chave } pro localStorage). Sem a opção, só
  // os presets, exatamente como antes (ex.: telas que ainda não integraram).
  const limites = limitesDoHistorico_(historico);
  const chavePeriodo = typeof periodoPersonalizado === 'string' ? periodoPersonalizado : (periodoPersonalizado && periodoPersonalizado.chave) || null;
  if (periodoTabsContainer && periodoTabsContainer._graficoEstado) {
    const estado = periodoTabsContainer._graficoEstado;
    estado.patrimonio = patrimonio;
    estado.historico = historico;
    estado.paineis = paineis;
    estado.ontem = ontem;
    const filtro = ligarFiltroPeriodo(doc, periodoTabsContainer, { chave: chavePeriodo, comChip: !!periodoPersonalizado, periodoInicial, limites });
    if (filtro) estado.periodoAtual = filtro.periodo;
    estado.atualizar();
    return;
  }

  const estado = { patrimonio, historico, paineis, periodoAtual: periodoInicial, ontem };

  estado.atualizar = function atualizar() {
    estado.paineis.forEach((painel) => {
      const { visaoId, chartContainer, legendaContainer, infoContainer, labelInfo, formatarMoeda, camposProventos, labelPrincipal } = painel;
      const moeda = formatarMoeda || formatBRL;
      renderInfoRentabilidade(doc, infoContainer, {
        patrimonio: estado.patrimonio, historico: estado.historico, visaoId, periodoId: estado.periodoAtual, label: labelInfo, formatarMoeda: moeda, camposProventos: camposProventos || null,
        comparativo: painel.comparativo ? comparativoDoPainel_(estado, visaoId) : null,
      });
      if (chartContainer) {
        renderGraficoRentabilidade(doc, chartContainer, {
          historico: estado.historico, visaoId, periodoId: estado.periodoAtual, legendaContainer, labelPrincipal: labelPrincipal || undefined,
          benchmarksExtra: painel.benchmarksExtra || null,
          analiseContainer: slotAnalise_(doc, painel),
          nomeAnalise: painel.nomeAnalise || null,
          analiseExtra: painel.analiseExtra || null, // 03/10/2026: opções extras do card de Análise (rf, proventos a receber...)
          formatarMoeda: moeda,
        });
      }
    });
  };

  if (periodoTabsContainer) {
    periodoTabsContainer._graficoEstado = estado;
    const filtro = ligarFiltroPeriodo(doc, periodoTabsContainer, {
      chave: chavePeriodo,
      comChip: !!periodoPersonalizado,
      periodoInicial,
      limites,
      aoMudar(periodo) {
        estado.periodoAtual = periodo;
        estado.atualizar();
      },
    });
    if (filtro) estado.periodoAtual = filtro.periodo;
  }

  // 06/10/2026 (Onda 3): sem ouvir "resize" nem a troca de fonte - os gráficos da biblioteca acompanham a largura do
  // cartão sozinhos (ResizeObserver) e redesenham sem recriar.
  estado.atualizar();
}
