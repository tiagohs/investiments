// Unit tests for assets/js/pages/inicio.js. All the render functions are
// pure DOM builders (given a jsdom document + plain data, never fetch
// anything themselves) - montarPaginaInicio is the one real-world
// orchestrator, exercised here with a fake getHomeImpl instead of a real
// fetch/token, same pattern as shell.test.js's fake fetchImpl.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  splitValorExibicao,
  criarTileIndice,
  criarTileCambio,
  renderIndicesCambio,
  resolverVisao,
  calcularDistribuicaoPorClasse,
  calcularDistribuicaoRendaEmergencial,
  renderDistribuicao,
  renderResumoPatrimonio,
  filtrarHistoricoPorPeriodo,
  normalizarSerieRentabilidade,
  renderGraficoRentabilidade,
  renderInfoRentabilidade,
  wireGraficoRentabilidade,
  criarAtivoCard,
  renderMeusAtivos,
  wireFiltroAtivos,
  renderAvisos,
  montarPaginaInicio,
} from '../assets/js/pages/inicio.js';

function makeDom(bodyHtml) {
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`);
  return dom.window.document;
}

// --- splitValorExibicao ------------------------------------------------------

test('splitValorExibicao() splits at the decimal comma for a currency value', () => {
  assert.deepEqual(splitValorExibicao('R$ 5,09'), { principal: 'R$ 5', dec: ',09' });
});

test('splitValorExibicao() splits at the last thousands separator when there is no decimal part', () => {
  assert.deepEqual(splitValorExibicao('185.600'), { principal: '185', dec: '.600' });
});

test('splitValorExibicao() returns the whole string as "principal" when there is no separator at all', () => {
  assert.deepEqual(splitValorExibicao('—'), { principal: '—', dec: '' });
});

// --- criarTileIndice / criarTileCambio --------------------------------------

test('criarTileIndice() renders the value, label, and a "good" (up) delta for a non-negative variação', () => {
  const doc = makeDom('');
  const tile = criarTileIndice(doc, { label: 'Ibovespa', valor: 185600, variacaoDia: 1.2, extLinkHref: 'https://example.com' });
  assert.match(tile.querySelector('.widget-value').textContent, /185/);
  assert.match(tile.querySelector('.widget-label').textContent, /Ibovespa/);
  assert.equal(tile.querySelector('.widget-delta').textContent, '+1,20% hoje');
  assert.ok(tile.querySelector('.arrow-badge.good'));
});

test('criarTileIndice() com extLinkHref vira o cartão inteiro clicável (<a>), não um link solto dentro dele', () => {
  const doc = makeDom('');
  const tile = criarTileIndice(doc, { label: 'Ibovespa', valor: 185600, variacaoDia: 1.2, extLinkHref: 'https://example.com/ibov' });
  assert.equal(tile.tagName, 'A');
  assert.equal(tile.getAttribute('href'), 'https://example.com/ibov');
  assert.equal(tile.getAttribute('target'), '_blank');
  assert.equal(tile.getAttribute('rel'), 'noopener');
  assert.equal(tile.querySelector('.ext-link'), null);
});

test('criarTileIndice() sem extLinkHref não vira link (fica <div>, nunca um <a> sem destino)', () => {
  const doc = makeDom('');
  const tile = criarTileIndice(doc, { label: 'S&P 500', valor: 6500 });
  assert.equal(tile.tagName, 'DIV');
});

test('criarTileIndice() renders a "bad" (down) delta for a negative variação', () => {
  const doc = makeDom('');
  const tile = criarTileIndice(doc, { label: 'IFIX', valor: 3761.37, variacaoDia: -0.9 });
  assert.equal(tile.querySelector('.widget-delta').textContent, '-0,90% hoje');
  assert.ok(tile.querySelector('.arrow-badge.bad'));
});

test('criarTileIndice() degrades gracefully (no arrow, em-dash delta) when variação is missing', () => {
  const doc = makeDom('');
  const tile = criarTileIndice(doc, { label: 'S&P 500', valor: 6500 });
  assert.equal(tile.querySelector('.arrow-badge'), null);
  assert.equal(tile.querySelector('.widget-delta').textContent, '—');
});

test('criarTileCambio() renders the BRL value and a neutral "câmbio" delta, no arrow', () => {
  const doc = makeDom('');
  const tile = criarTileCambio(doc, { label: 'Dólar (USD/BRL)', valor: 5.09 });
  assert.match(tile.querySelector('.widget-value').textContent, /5/);
  assert.equal(tile.querySelector('.widget-delta').textContent, 'câmbio');
  assert.equal(tile.querySelector('.arrow-badge'), null);
});

test('criarTileCambio() com extLinkHref também vira o cartão inteiro clicável', () => {
  const doc = makeDom('');
  const tile = criarTileCambio(doc, { label: 'Euro (EUR/BRL)', valor: 5.92, extLinkHref: 'https://example.com/eur' });
  assert.equal(tile.tagName, 'A');
  assert.equal(tile.getAttribute('href'), 'https://example.com/eur');
});

// --- renderIndicesCambio -----------------------------------------------------

test('renderIndicesCambio() renders one tile per field present, in order', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderIndicesCambio(doc, grid, {
    indices: { ibovespa: { valor: 185600, variacaoDia: -0.9 }, spx: { valor: 6500, variacaoDia: 0.4 } },
    cambio: { usd: 5.09 },
  });
  const labels = Array.from(grid.querySelectorAll('.widget-label')).map((el) => el.textContent.trim().split(' ')[0]);
  assert.equal(grid.querySelectorAll('.widget-tile').length, 3);
  assert.match(labels[0], /Ibovespa/);
});

test('renderIndicesCambio() shows a hint instead of a blank grid when nothing came back at all', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderIndicesCambio(doc, grid, {});
  assert.equal(grid.querySelectorAll('.widget-tile').length, 0);
  assert.match(grid.textContent, /Sem dado/);
});

test('renderIndicesCambio() clears previous content before re-rendering', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  renderIndicesCambio(doc, grid, { indices: { ibovespa: { valor: 1, variacaoDia: 1 } } });
  renderIndicesCambio(doc, grid, { cambio: { eur: 5.9 } });
  assert.equal(grid.querySelectorAll('.widget-tile').length, 1);
  assert.match(grid.querySelector('.widget-label').textContent, /Euro/);
});

// --- resolverVisao / renderResumoPatrimonio -----------------------------------

const PATRIMONIO_EXEMPLO = {
  total: 147583.80,
  longoPrazo: 87356.59,
  rendaEmergencial: 60227.21,
  porClasse: { acoes: 20000, fiis: 15000, rendaFixa: 87356.59, acoesEua: 25227.21 },
};

test('resolverVisao() picks the right field + label for each known visão', () => {
  assert.equal(resolverVisao(PATRIMONIO_EXEMPLO, 'total').valor, 147583.80);
  assert.equal(resolverVisao(PATRIMONIO_EXEMPLO, 'longoPrazo').valor, 87356.59);
  assert.equal(resolverVisao(PATRIMONIO_EXEMPLO, 'rendaEmergencial').valor, 60227.21);
});

test('resolverVisao() falls back to "total" for an unrecognized visão id', () => {
  assert.equal(resolverVisao(PATRIMONIO_EXEMPLO, 'algo-inexistente').valor, 147583.80);
});

// ativos usados nos testes de distribuição - 2 posições de Renda Fixa,
// uma "longo-prazo" (Tesouro IPCA) e duas "emergencial" (Tesouro Selic +
// CDB), pra dar pra testar tanto calcularDistribuicaoPorClasse quanto
// calcularDistribuicaoRendaEmergencial com o mesmo fixture.
const ATIVOS_RESUMO_EXEMPLO = [
  { classe: 'acoes', ticker: 'BBAS3', precoAtual: 20, quantidade: 1000 }, // 20.000
  { classe: 'fiis', ticker: 'HGLG11', precoAtual: 150, quantidade: 100 }, // 15.000
  { classe: 'usa', ticker: 'AAPL', precoAtual: 100, quantidade: 50, precoAtualBRL: 550 }, // 27.500 (já convertido)
  { classe: 'rf', ticker: 'Tesouro IPCA · 2035', marca: 'longo-prazo', tipoInvestimento: 'Tesouro IPCA', valorAtualizado: 50000 },
  { classe: 'rf', ticker: 'Tesouro Selic · 2029', marca: 'emergencial', tipoInvestimento: 'Tesouro Selic', valorAtualizado: 30000 },
  { classe: 'rf', ticker: 'CDB Banco X', marca: 'emergencial', tipoInvestimento: 'CDB', valorAtualizado: 10000 },
];

test('calcularDistribuicaoPorClasse() soma o valor de posição de cada classe (Ações/FIIs/RF/EUA)', () => {
  const distrib = calcularDistribuicaoPorClasse(ATIVOS_RESUMO_EXEMPLO, { cambioUsd: 5 });
  const porLabel = Object.fromEntries(distrib.map((f) => [f.label, f.valor]));
  assert.equal(porLabel['Ações'], 20000);
  assert.equal(porLabel['FIIs'], 15000);
  assert.equal(porLabel['Renda Fixa'], 90000); // 50.000 (longo prazo) + 30.000 + 10.000 (emergencial)
  assert.equal(porLabel['Ações EUA'], 27500);
});

test('calcularDistribuicaoPorClasse() com excluirEmergencial tira a reserva de emergência de dentro de Renda Fixa', () => {
  const distrib = calcularDistribuicaoPorClasse(ATIVOS_RESUMO_EXEMPLO, { cambioUsd: 5, excluirEmergencial: true });
  const porLabel = Object.fromEntries(distrib.map((f) => [f.label, f.valor]));
  assert.equal(porLabel['Renda Fixa'], 50000, 'só a posição marca=longo-prazo (Tesouro IPCA) deveria sobrar');
  assert.equal(porLabel['Ações'], 20000, 'as outras classes não mudam - a reserva de emergência é só Renda Fixa');
});

test('calcularDistribuicaoPorClasse() usa precoAtual×câmbio como fallback quando o ativo EUA não vem com precoAtualBRL', () => {
  const semConversaoPronta = [{ classe: 'usa', ticker: 'AAPL', precoAtual: 100, quantidade: 50 }];
  const distrib = calcularDistribuicaoPorClasse(semConversaoPronta, { cambioUsd: 5 });
  assert.equal(distrib.find((f) => f.label === 'Ações EUA').valor, 25000); // 100 * 50 * 5
});

test('calcularDistribuicaoRendaEmergencial() agrupa por tipo de investimento, maior valor primeiro', () => {
  const distrib = calcularDistribuicaoRendaEmergencial(ATIVOS_RESUMO_EXEMPLO);
  assert.deepEqual(distrib.map((f) => f.label), ['Tesouro Selic', 'CDB'], 'só as posições marca=emergencial entram, ordenadas do maior pro menor');
  assert.equal(distrib[0].valor, 30000);
  assert.equal(distrib[1].valor, 10000);
});

test('renderDistribuicao() desenha uma fatia (arco do donut + item de legenda) por entrada', () => {
  const doc = makeDom('<div id="distrib"></div>');
  const container = doc.getElementById('distrib');
  renderDistribuicao(doc, container, [
    { label: 'Ações', cor: 'var(--acoes)', valor: 60 },
    { label: 'FIIs', cor: 'var(--fiis)', valor: 40 },
  ]);
  assert.equal(container.querySelectorAll('.distrib-arco').length, 2);
  assert.equal(container.querySelectorAll('.distrib-item').length, 2);
  assert.match(container.textContent, /60,0%/);
  assert.match(container.textContent, /40,0%/);
});

test('renderDistribuicao() mostra um aviso (sem lançar) quando não há dado suficiente', () => {
  const doc = makeDom('<div id="distrib"></div>');
  const container = doc.getElementById('distrib');
  assert.doesNotThrow(() => renderDistribuicao(doc, container, []));
  assert.match(container.textContent, /Sem dado/);
});

test('renderResumoPatrimonio() mostra as 3 divisões juntas, sem precisar de clique nenhum', () => {
  const doc = makeDom('<div id="resumo"></div>');
  const resumo = doc.getElementById('resumo');
  renderResumoPatrimonio(doc, resumo, { patrimonio: PATRIMONIO_EXEMPLO, ativos: ATIVOS_RESUMO_EXEMPLO, cambio: { usd: 5 } });

  const cards = resumo.querySelectorAll('.resumo-card');
  assert.equal(cards.length, 3, 'Total + Longo Prazo + Renda Emergencial de cara, nenhuma aba pra clicar');
  assert.match(resumo.textContent, /147\.583/);
  assert.match(resumo.textContent, /87\.356/);
  assert.match(resumo.textContent, /60\.227/);
});

test('renderResumoPatrimonio() mostra a distribuição (donut) nos 3 cartões - Total/Longo Prazo por classe, Renda Emergencial por tipo', () => {
  const doc = makeDom('<div id="resumo"></div>');
  const resumo = doc.getElementById('resumo');
  renderResumoPatrimonio(doc, resumo, { patrimonio: PATRIMONIO_EXEMPLO, ativos: ATIVOS_RESUMO_EXEMPLO, cambio: { usd: 5 } });

  const cardTotal = resumo.querySelector('.resumo-card-total');
  assert.match(cardTotal.textContent, /Renda Fixa/);
  assert.ok(cardTotal.querySelector('.distrib-arco'), 'total deveria mostrar o donut de distribuição por classe');

  const outrosCards = Array.from(resumo.querySelectorAll('.resumo-card')).filter((c) => c !== cardTotal);
  const [cardLongoPrazo, cardRendaEmergencial] = outrosCards;
  assert.ok(cardLongoPrazo.querySelector('.distrib-arco'), 'Longo Prazo também mostra o donut agora');
  assert.match(cardRendaEmergencial.textContent, /Tesouro Selic/, 'Renda Emergencial mostra por tipo de investimento, não por classe');
});

test('renderResumoPatrimonio() shows a hint instead of throwing when patrimonio is missing', () => {
  const doc = makeDom('<div id="resumo"></div>');
  const resumo = doc.getElementById('resumo');
  renderResumoPatrimonio(doc, resumo, {});
  assert.match(resumo.textContent, /Sem dado/);
});

// --- filtrarHistoricoPorPeriodo / normalizarSerieRentabilidade / gráfico ----

/** 40 dias corridos, patrimonio crescendo 1000/dia, ibovespa e indiceCdi/indiceSelic
 * também subindo de forma previsível - dá pra calcular a mão o que cada teste espera. */
function gerarHistoricoExemplo(dias = 40) {
  const historico = [];
  for (let i = 0; i < dias; i += 1) {
    const d = new Date(2026, 0, 1 + i);
    historico.push({
      data: d.toISOString().slice(0, 10),
      patrimonio: 100000 + i * 1000,
      longoPrazo: 80000 + i * 800,
      rendaEmergencial: 20000 + i * 200,
      indiceCdi: 100 * (1 + i * 0.001),
      indiceSelic: 100 * (1 + i * 0.0009),
      ibovespa: i < 3 ? null : 120000 + i * 500, // simula "antes do 1º pregão da janela"
    });
  }
  return historico;
}

test('filtrarHistoricoPorPeriodo() corta os últimos N dias corridos do preset pedido', () => {
  const historico = gerarHistoricoExemplo(40);
  assert.equal(filtrarHistoricoPorPeriodo(historico, '30d').length, 30);
  assert.equal(filtrarHistoricoPorPeriodo(historico, '30d')[0], historico[10]);
});

test('filtrarHistoricoPorPeriodo() com "tudo" (ou preset desconhecido) devolve o array inteiro', () => {
  const historico = gerarHistoricoExemplo(40);
  assert.equal(filtrarHistoricoPorPeriodo(historico, 'tudo').length, 40);
  assert.equal(filtrarHistoricoPorPeriodo(historico, 'nao-existe').length, 40);
});

test('filtrarHistoricoPorPeriodo() sem histórico (ou vazio) devolve array vazio, nunca lança', () => {
  assert.deepEqual(filtrarHistoricoPorPeriodo(undefined, '30d'), []);
  assert.deepEqual(filtrarHistoricoPorPeriodo([], '30d'), []);
});

test('normalizarSerieRentabilidade() calcula "% desde o início" a partir do 1º valor válido', () => {
  const janela = gerarHistoricoExemplo(5); // patrimonio: 100000,101000,102000,103000,104000
  const serie = normalizarSerieRentabilidade(janela, 'patrimonio');
  assert.equal(serie[0], 0);
  assert.match(String(serie[4]), /4/); // (104000/100000 - 1) * 100 = 4
});

test('normalizarSerieRentabilidade() pula valores null (ibovespa antes do 1º pregão) sem quebrar - usa o 1º válido como base', () => {
  const janela = gerarHistoricoExemplo(5); // ibovespa: null,null,null,121500,122000
  const serie = normalizarSerieRentabilidade(janela, 'ibovespa');
  assert.equal(serie[0], null);
  assert.equal(serie[1], null);
  assert.equal(serie[2], null);
  assert.equal(serie[3], 0); // primeiro valor válido vira a base (0%)
});

test('normalizarSerieRentabilidade() sem nenhum valor válido na janela devolve tudo null (nunca divide por zero)', () => {
  const janela = [{ data: '2026-01-01', patrimonio: 0 }, { data: '2026-01-02', patrimonio: 0 }];
  assert.deepEqual(normalizarSerieRentabilidade(janela, 'patrimonio'), [null, null]);
});

test('renderGraficoRentabilidade() desenha um <svg> com uma linha principal + 2 benchmarks pra visão "total"', () => {
  const doc = makeDom('<div id="chart"></div>');
  const container = doc.getElementById('chart');
  renderGraficoRentabilidade(doc, container, { historico: gerarHistoricoExemplo(40), visaoId: 'total', periodoId: '30d' });
  const svg = container.querySelector('svg.rentab-chart');
  assert.ok(svg);
  assert.equal(svg.querySelectorAll('path').length, 3); // portfólio + ibovespa + cdi
});

test('renderGraficoRentabilidade() troca os benchmarks pra CDI+Selic na visão "rendaEmergencial"', () => {
  const doc = makeDom('<div id="chart"></div><div id="legenda"></div>');
  const container = doc.getElementById('chart');
  const legenda = doc.getElementById('legenda');
  renderGraficoRentabilidade(doc, container, { historico: gerarHistoricoExemplo(40), visaoId: 'rendaEmergencial', periodoId: '30d', legendaContainer: legenda });
  assert.match(legenda.textContent, /Selic/);
  assert.doesNotMatch(legenda.textContent, /Ibovespa/);
});

test('renderGraficoRentabilidade() mostra, junto do nome de cada benchmark, o quanto o PORTFÓLIO ganhou ou perdeu EM RELAÇÃO a ele (não o retorno absoluto do benchmark)', () => {
  const doc = makeDom('<div id="chart"></div><div id="legenda"></div>');
  const container = doc.getElementById('chart');
  const legenda = doc.getElementById('legenda');
  // patrimonio sobe 1000/dia (base 100000) e indiceCdi sobe 0.1%/dia (base 100) -
  // o portfólio cresce MUITO mais rápido que o CDI na janela, então a %
  // ao lado do CDI (portfólio − CDI) tem que ser positiva e grande - bem
  // diferente do retorno absoluto do próprio CDI (que seria só uns 2-3%).
  renderGraficoRentabilidade(doc, container, { historico: gerarHistoricoExemplo(40), visaoId: 'total', periodoId: '30d', legendaContainer: legenda });
  assert.match(legenda.textContent, /CDI\s*\+2[0-9],/, 'CDI deveria vir com a diferença (~+23%), não o retorno absoluto dele (~+2,9%)');
  assert.ok(legenda.querySelector('.li-delta.good'), 'delta positivo (portfólio bateu o benchmark) usa a cor "good"');
});

test('renderGraficoRentabilidade() mostra NEGATIVO quando o portfólio fica ATRÁS do benchmark (bug real reportado pelo Tiago)', () => {
  const doc = makeDom('<div id="chart"></div><div id="legenda"></div>');
  const container = doc.getElementById('chart');
  const legenda = doc.getElementById('legenda');
  // Portfólio sobe só 0,8% na janela; Ibovespa sobe 20% - o portfólio fica
  // NITIDAMENTE atrás do Ibovespa, então a % ao lado dele tem que ser
  // negativa (não "+20%" - isso pareceria um ganho, quando na real é uma
  // perda relativa. Esse era exatamente o problema apontado no print: um
  // "+12,03%" verde do lado do Ibovespa enquanto o portfólio só subiu 5%).
  const historico = [
    { data: '2026-01-01', patrimonio: 100000, ibovespa: 100000, indiceCdi: 100 },
    { data: '2026-01-02', patrimonio: 100200, ibovespa: 105000, indiceCdi: 100.1 },
    { data: '2026-01-03', patrimonio: 100400, ibovespa: 110000, indiceCdi: 100.2 },
    { data: '2026-01-04', patrimonio: 100600, ibovespa: 115000, indiceCdi: 100.3 },
    { data: '2026-01-05', patrimonio: 100800, ibovespa: 120000, indiceCdi: 100.4 },
  ];
  renderGraficoRentabilidade(doc, container, { historico, visaoId: 'total', periodoId: 'tudo', legendaContainer: legenda });
  assert.match(legenda.textContent, /Ibovespa\s*-1[0-9],/, 'portfólio (+0,8%) muito atrás do Ibovespa (+20%) - diferença negativa, por volta de -19%');
  assert.ok(legenda.querySelector('.li-delta.bad'), 'delta negativo (portfólio atrás do benchmark) usa a cor "bad", nunca "good"');
});

test('renderGraficoRentabilidade() mostra um aviso (sem lançar) quando não há histórico suficiente', () => {
  const doc = makeDom('<div id="chart"></div>');
  const container = doc.getElementById('chart');
  assert.doesNotThrow(() => renderGraficoRentabilidade(doc, container, { historico: [], visaoId: 'total', periodoId: '30d' }));
  assert.match(container.textContent, /Sem histórico/);
});

// --- Hover/touch do gráfico (13/09/2026, 3ª rodada - antes não tinha
// NENHUMA interação ligada ao SVG: mouse/touch não mostravam nada) -----------

// 5 dias corridos, com Ibovespa/CDI também variando, pra dar pra checar a
// tooltip trazendo o valor de cada série no mesmo dia.
const HISTORICO_HOVER_EXEMPLO = [
  { data: '2026-01-01', patrimonio: 100000, ibovespa: 100000, indiceCdi: 100 },
  { data: '2026-01-02', patrimonio: 101000, ibovespa: 101000, indiceCdi: 100.1 },
  { data: '2026-01-03', patrimonio: 102000, ibovespa: 102000, indiceCdi: 100.2 },
  { data: '2026-01-04', patrimonio: 103000, ibovespa: 103000, indiceCdi: 100.3 },
  { data: '2026-01-05', patrimonio: 104000, ibovespa: 104000, indiceCdi: 100.4 },
];

test('renderGraficoRentabilidade() esconde a tooltip e os pontos de hover antes de qualquer interação', () => {
  const doc = makeDom('<div id="chart"></div>');
  const container = doc.getElementById('chart');
  renderGraficoRentabilidade(doc, container, { historico: HISTORICO_HOVER_EXEMPLO, visaoId: 'total', periodoId: 'tudo' });

  assert.equal(container.querySelector('.rentab-tooltip').hidden, true);
  assert.equal(container.querySelector('.rentab-hover').hasAttribute('hidden'), true);
});

test('renderGraficoRentabilidade() pointermove sobre a área do gráfico mostra a tooltip com a data e o valor de cada série', () => {
  const doc = makeDom('<div id="chart"></div>');
  const container = doc.getElementById('chart');
  renderGraficoRentabilidade(doc, container, { historico: HISTORICO_HOVER_EXEMPLO, visaoId: 'total', periodoId: 'tudo' });

  const hitarea = container.querySelector('.rentab-hitarea');
  // Sem layout de verdade (jsdom), a largura do cartão cai no fallback de
  // 640px (ver larguraReal_) - padL=44, padR=8 -> plotW=588. O meio exato
  // da janela de 5 dias (índice 2, "03/01/2026") fica em clientX = padL +
  // plotW*0.5 = 338 (getBoundingClientRect também é 0 em jsdom, então
  // clientX já É a posição dentro do próprio <svg>).
  hitarea.dispatchEvent(new doc.defaultView.PointerEvent('pointermove', { clientX: 338, clientY: 50, bubbles: true }));

  const tooltip = container.querySelector('.rentab-tooltip');
  assert.equal(tooltip.hidden, false);
  assert.match(tooltip.textContent, /03\/01\/2026/);
  assert.match(tooltip.textContent, /Portfólio/);
  assert.match(tooltip.textContent, /Ibovespa/);
  assert.match(tooltip.textContent, /CDI/);
  assert.equal(container.querySelector('.rentab-hover').hasAttribute('hidden'), false, 'linha-guia + pontos aparecem junto com a tooltip');
});

test('renderGraficoRentabilidade() pointerdown (toque, sem "arrastar" o dedo antes) também mostra a tooltip', () => {
  const doc = makeDom('<div id="chart"></div>');
  const container = doc.getElementById('chart');
  renderGraficoRentabilidade(doc, container, { historico: HISTORICO_HOVER_EXEMPLO, visaoId: 'total', periodoId: 'tudo' });

  container.querySelector('.rentab-hitarea')
    .dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', { clientX: 200, clientY: 50, bubbles: true }));

  assert.equal(container.querySelector('.rentab-tooltip').hidden, false);
});

test('renderGraficoRentabilidade() pointerleave esconde a tooltip e os pontos de novo', () => {
  const doc = makeDom('<div id="chart"></div>');
  const container = doc.getElementById('chart');
  renderGraficoRentabilidade(doc, container, { historico: HISTORICO_HOVER_EXEMPLO, visaoId: 'total', periodoId: 'tudo' });

  const hitarea = container.querySelector('.rentab-hitarea');
  hitarea.dispatchEvent(new doc.defaultView.PointerEvent('pointermove', { clientX: 338, clientY: 50, bubbles: true }));
  assert.equal(container.querySelector('.rentab-tooltip').hidden, false);

  hitarea.dispatchEvent(new doc.defaultView.PointerEvent('pointerleave', { bubbles: true }));
  assert.equal(container.querySelector('.rentab-tooltip').hidden, true);
  assert.equal(container.querySelector('.rentab-hover').hasAttribute('hidden'), true);
});

// --- renderInfoRentabilidade -------------------------------------------------

const PATRIMONIO_RENTAB_EXEMPLO = { total: 104000, longoPrazo: 90000, rendaEmergencial: 14000 };

test('renderInfoRentabilidade() mostra o valor atual + o R$ ganho/perdido + a variação em % no período (mesmo par de pontos que alimenta a linha do gráfico)', () => {
  const doc = makeDom('<div id="info"></div>');
  const container = doc.getElementById('info');
  renderInfoRentabilidade(doc, container, {
    patrimonio: PATRIMONIO_RENTAB_EXEMPLO,
    historico: gerarHistoricoExemplo(5), // patrimonio: 100000..104000 -> +R$4.000, +4% no período
    visaoId: 'total',
    periodoId: 'tudo',
  });
  assert.match(container.querySelector('.rentab-card-value').textContent, /104\.000/);
  const textoDelta = container.querySelector('.rentab-card-delta').textContent;
  assert.match(textoDelta, /\+R\$\s*4\.000,00/, 'precisa mostrar o valor em R$ ganho, não só a %');
  assert.match(textoDelta, /\+4,00%/);
  assert.equal(container.querySelector('.rentab-card-delta').classList.contains('good'), true);
});

test('renderInfoRentabilidade() mostra o R$ PERDIDO (com sinal de menos, sem duplicar) quando o período é negativo', () => {
  const doc = makeDom('<div id="info"></div>');
  const container = doc.getElementById('info');
  const historico = [
    { data: '2026-01-01', patrimonio: 104000 },
    { data: '2026-01-02', patrimonio: 102000 },
    { data: '2026-01-03', patrimonio: 100000 },
  ];
  renderInfoRentabilidade(doc, container, {
    patrimonio: { total: 100000 },
    historico,
    visaoId: 'total',
    periodoId: 'tudo',
  });
  const textoDelta = container.querySelector('.rentab-card-delta').textContent;
  assert.match(textoDelta, /-R\$\s*4\.000,00/, 'perda de R$4.000 (104.000 -> 100.000), sinal único');
  assert.doesNotMatch(textoDelta, /-R\$\s*-/, 'nunca dois sinais de menos juntos');
  assert.equal(container.querySelector('.rentab-card-delta').classList.contains('bad'), true);
});

test('renderInfoRentabilidade() sem histórico suficiente no período mostra o valor mas nenhuma variação (nunca lança)', () => {
  const doc = makeDom('<div id="info"></div>');
  const container = doc.getElementById('info');
  assert.doesNotThrow(() => renderInfoRentabilidade(doc, container, { patrimonio: PATRIMONIO_RENTAB_EXEMPLO, historico: [], visaoId: 'total' }));
  assert.equal(container.querySelector('.rentab-card-delta').classList.contains('na'), true);
});

// --- wireGraficoRentabilidade -------------------------------------------------

test('wireGraficoRentabilidade() renderiza os 3 painéis de cara (sempre visíveis, sem precisar de clique) e reage ao período em todos ao mesmo tempo', () => {
  const doc = makeDom(`
    <div class="filter-tabs" id="periodoTabs">
      <button class="filter-tab" data-periodo="30d">30 dias</button>
      <button class="filter-tab active" data-periodo="12m">12 meses</button>
    </div>
    <div id="infoTotal"></div><div id="chartTotal"></div><div id="legendaTotal"></div>
    <div id="infoRE"></div><div id="chartRE"></div><div id="legendaRE"></div>
  `);
  const historico = gerarHistoricoExemplo(40);
  const paineis = [
    { visaoId: 'total', infoContainer: doc.getElementById('infoTotal'), chartContainer: doc.getElementById('chartTotal'), legendaContainer: doc.getElementById('legendaTotal') },
    { visaoId: 'rendaEmergencial', infoContainer: doc.getElementById('infoRE'), chartContainer: doc.getElementById('chartRE'), legendaContainer: doc.getElementById('legendaRE') },
  ];

  wireGraficoRentabilidade(doc, {
    patrimonio: PATRIMONIO_RENTAB_EXEMPLO,
    historico,
    periodoTabsContainer: doc.getElementById('periodoTabs'),
    paineis,
    periodoInicial: '12m',
  });

  assert.ok(doc.getElementById('chartTotal').querySelector('svg'), 'já renderiza de cara, sem esperar clique nenhum');
  assert.ok(doc.getElementById('chartRE').querySelector('svg'));
  assert.match(doc.getElementById('legendaRE').textContent, /Selic/, 'painel de Renda Emergencial já usa os benchmarks certos de cara');

  doc.getElementById('periodoTabs').querySelector('[data-periodo="30d"]')
    .dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));

  assert.equal(doc.getElementById('periodoTabs').querySelector('[data-periodo="30d"]').classList.contains('active'), true);
  assert.ok(doc.getElementById('chartTotal').querySelector('svg'), 'os dois painéis continuam atualizados no mesmo clique de período');
  assert.ok(doc.getElementById('chartRE').querySelector('svg'));
});

// --- criarAtivoCard / renderMeusAtivos / wireFiltroAtivos -------------------

const ATIVO_ACAO_EXEMPLO = {
  classe: 'acoes', ticker: 'BBAS3', nome: 'Banco do Brasil', precoAtual: 22.14, variacaoDia: -0.012,
  vies: 'comprar', descontoPL: '12% (0,88 P/L)',
};

const ATIVO_USA_EXEMPLO = {
  classe: 'usa', ticker: 'CHTR', precoAtual: 320.5, precoAtualBRL: 1732.5, variacaoDia: 0.008,
  vies: 'aguardar', descontoPL: '-8% (14,2 P/L)',
};

const ATIVO_RF_EXEMPLO = {
  classe: 'rf', ticker: 'Tesouro Selic · 03/2029', codigo: 'TS-2029', marca: 'longo-prazo',
  indexador: 'Selic', vencimento: '03/2029', valorAtualizado: 12480.55, variacaoDia: 0.0004,
};

test('criarAtivoCard() de Ações vira o cartão inteiro clicável, com viés e desconto', () => {
  const doc = makeDom('');
  const card = criarAtivoCard(doc, ATIVO_ACAO_EXEMPLO);
  assert.equal(card.tagName, 'A');
  assert.equal(card.getAttribute('href'), 'ativo.html?ref=BBAS3&classe=acoes');
  assert.match(card.querySelector('.ativo-ticker').textContent, /BBAS3/);
  assert.ok(card.querySelector('.vies-badge.comprar'));
  assert.equal(card.querySelector('.ativo-delta').classList.contains('bad'), true); // variação negativa
  assert.match(card.querySelector('.ativo-detalhe').textContent, /12%/);
});

test('criarAtivoCard() de Ações EUA mostra o preço convertido pra BRL ao lado do preço em USD', () => {
  const doc = makeDom('');
  const card = criarAtivoCard(doc, ATIVO_USA_EXEMPLO);
  assert.match(card.querySelector('.ativo-price').textContent, /320/);
  assert.match(card.querySelector('.ativo-price-conv').textContent, /1\.732/);
});

test('criarAtivoCard() de Renda Fixa usa "codigo" (não o rótulo composto) como ref, e mostra indexador+vencimento no lugar do desconto', () => {
  const doc = makeDom('');
  const card = criarAtivoCard(doc, ATIVO_RF_EXEMPLO);
  assert.equal(card.getAttribute('href'), 'ativo.html?ref=TS-2029&classe=rf');
  assert.equal(card.querySelector('.vies-badge'), null, 'Renda Fixa não tem preço-teto, então não tem viés');
  assert.match(card.querySelector('.ativo-detalhe').textContent, /Selic/);
  assert.match(card.querySelector('.ativo-detalhe').textContent, /03\/2029/);
  assert.match(card.querySelector('.ativo-price').textContent, /12\.480/);
});

test('renderMeusAtivos() filtra por classe e mostra um aviso pra categoria vazia', () => {
  const doc = makeDom('<div id="grid"></div>');
  const grid = doc.getElementById('grid');
  const ativos = [ATIVO_ACAO_EXEMPLO, ATIVO_USA_EXEMPLO, ATIVO_RF_EXEMPLO];

  renderMeusAtivos(doc, grid, ativos, 'todos');
  assert.equal(grid.querySelectorAll('.ativo-card').length, 3);

  renderMeusAtivos(doc, grid, ativos, 'fiis');
  assert.match(grid.textContent, /Nenhum ativo/);
});

test('wireFiltroAtivos() re-renderiza a grade filtrada e alterna a classe active', () => {
  const doc = makeDom(`
    <div class="filter-tabs" id="tabs">
      <button class="filter-tab active" data-classe="todos">Todos</button>
      <button class="filter-tab" data-classe="rf">Renda Fixa</button>
    </div>
    <div id="grid"></div>
  `);
  const tabs = doc.getElementById('tabs');
  const grid = doc.getElementById('grid');
  const ativos = [ATIVO_ACAO_EXEMPLO, ATIVO_RF_EXEMPLO];
  renderMeusAtivos(doc, grid, ativos, 'todos');
  wireFiltroAtivos(doc, tabs, grid, ativos);

  tabs.querySelector('[data-classe="rf"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));

  assert.equal(grid.querySelectorAll('.ativo-card').length, 1);
  assert.equal(tabs.querySelector('[data-classe="rf"]').classList.contains('active'), true);
});

// --- renderAvisos ------------------------------------------------------------

test('renderAvisos() hides the banner when there are no avisos', () => {
  const doc = makeDom('<div id="avisos"></div>');
  const banner = doc.getElementById('avisos');
  renderAvisos(banner, undefined);
  assert.equal(banner.hidden, true);
  renderAvisos(banner, {});
  assert.equal(banner.hidden, true);
});

test('renderAvisos() shows every failed section', () => {
  const doc = makeDom('<div id="avisos"></div>');
  const banner = doc.getElementById('avisos');
  renderAvisos(banner, { historico: 'Error: aba não encontrada', ativos: 'Error: timeout' });
  assert.equal(banner.hidden, false);
  assert.match(banner.textContent, /historico/);
  assert.match(banner.textContent, /ativos/);
});

// --- montarPaginaInicio -------------------------------------------------------

function makePaginaDom() {
  return makeDom(`
    <div class="inicio-loading" id="inicioLoading"></div>
    <div class="inicio-erro" id="inicioErro" hidden></div>
    <div id="inicioConteudo" hidden>
      <div class="avisos-banner" id="inicioAvisos" hidden></div>
      <div class="widget-grid" id="indicesCambioGrid"></div>
      <div id="resumoPatrimonio"></div>
      <div class="filter-tabs" id="periodoTabs">
        <button class="filter-tab" data-periodo="30d">30 dias</button>
        <button class="filter-tab active" data-periodo="12m">12 meses</button>
      </div>
      <div id="rentabInfoTotal"></div><div id="rentabChartTotal"></div><div id="rentabLegendaTotal"></div>
      <div id="rentabInfoLongoPrazo"></div><div id="rentabChartLongoPrazo"></div><div id="rentabLegendaLongoPrazo"></div>
      <div id="rentabInfoRendaEmergencial"></div><div id="rentabChartRendaEmergencial"></div><div id="rentabLegendaRendaEmergencial"></div>
      <div class="filter-tabs" id="filtroAtivosTabs">
        <button class="filter-tab active" data-classe="todos">Todos</button>
        <button class="filter-tab" data-classe="rf">Renda Fixa</button>
      </div>
      <div id="meusAtivosGrid"></div>
    </div>
  `);
}

test('montarPaginaInicio() renders every section and hides the loading state on success', async () => {
  const doc = makePaginaDom();
  const getHomeImpl = async () => ({
    ok: true,
    patrimonio: PATRIMONIO_EXEMPLO,
    indices: { ibovespa: { valor: 185600, variacaoDia: -0.9 } },
    cambio: { usd: 5.09, eur: 5.92 },
  });

  await montarPaginaInicio('token-fake', { doc, getHomeImpl });

  assert.equal(doc.getElementById('inicioLoading').hidden, true);
  assert.equal(doc.getElementById('inicioConteudo').hidden, false);
  assert.equal(doc.getElementById('indicesCambioGrid').querySelectorAll('.widget-tile').length, 3); // ibovespa + usd + eur
  assert.ok(doc.getElementById('resumoPatrimonio').querySelector('.resumo-value'));
  assert.equal(doc.getElementById('inicioErro').hidden, true);
});

test('montarPaginaInicio() shows the error state (and keeps the content hidden) when the back-end rejects the call', async () => {
  const doc = makePaginaDom();
  const getHomeImpl = async () => ({ ok: false, etapa: 'autenticação', erro: 'token expirado' });

  await montarPaginaInicio('token-fake', { doc, getHomeImpl });

  assert.equal(doc.getElementById('inicioLoading').hidden, true);
  assert.equal(doc.getElementById('inicioConteudo').hidden, true);
  assert.equal(doc.getElementById('inicioErro').hidden, false);
  assert.match(doc.getElementById('inicioErro').textContent, /token expirado/);
});

test('montarPaginaInicio() surfaces avisos (partial section failure) without hiding the rest', async () => {
  const doc = makePaginaDom();
  const getHomeImpl = async () => ({
    ok: true,
    patrimonio: PATRIMONIO_EXEMPLO,
    indices: {},
    cambio: {},
    avisos: { historico: 'Error: algo falhou' },
  });

  await montarPaginaInicio('token-fake', { doc, getHomeImpl });

  assert.equal(doc.getElementById('inicioConteudo').hidden, false);
  assert.equal(doc.getElementById('inicioAvisos').hidden, false);
  assert.match(doc.getElementById('inicioAvisos').textContent, /historico/);
});
