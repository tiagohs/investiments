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
  renderHero,
  wireVisaoTabs,
  filtrarHistoricoPorPeriodo,
  normalizarSerieRentabilidade,
  renderGraficoRentabilidade,
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

// --- resolverVisao / renderHero ----------------------------------------------

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

test('renderHero() shows the porClasse breakdown only for the "total" visão', () => {
  const doc = makeDom('<div id="hero"></div>');
  const hero = doc.getElementById('hero');

  renderHero(doc, hero, PATRIMONIO_EXEMPLO, 'total');
  assert.ok(hero.querySelector('.hero-classes'), 'total deveria mostrar o detalhamento por classe');

  renderHero(doc, hero, PATRIMONIO_EXEMPLO, 'longoPrazo');
  assert.equal(hero.querySelector('.hero-classes'), null, 'Longo Prazo não tem detalhamento por classe na API');
});

test('renderHero() shows a hint instead of throwing when patrimonio is missing', () => {
  const doc = makeDom('<div id="hero"></div>');
  const hero = doc.getElementById('hero');
  renderHero(doc, hero, null, 'total');
  assert.match(hero.textContent, /Sem dado/);
});

// --- wireVisaoTabs -----------------------------------------------------------

test('wireVisaoTabs() re-renders the hero for the clicked visão and toggles the active class', () => {
  const doc = makeDom(`
    <div class="filter-tabs" id="tabs">
      <button class="filter-tab active" data-visao="total">Total</button>
      <button class="filter-tab" data-visao="rendaEmergencial">Renda Emergencial</button>
    </div>
    <div id="hero"></div>
  `);
  const tabs = doc.getElementById('tabs');
  const hero = doc.getElementById('hero');
  renderHero(doc, hero, PATRIMONIO_EXEMPLO, 'total');
  wireVisaoTabs(doc, tabs, hero, PATRIMONIO_EXEMPLO);

  const botaoRendaEmergencial = tabs.querySelector('[data-visao="rendaEmergencial"]');
  botaoRendaEmergencial.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));

  assert.match(hero.querySelector('.hero-value').textContent, /60\.227/);
  assert.equal(botaoRendaEmergencial.classList.contains('active'), true);
  assert.equal(tabs.querySelector('[data-visao="total"]').classList.contains('active'), false);
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

test('renderGraficoRentabilidade() mostra um aviso (sem lançar) quando não há histórico suficiente', () => {
  const doc = makeDom('<div id="chart"></div>');
  const container = doc.getElementById('chart');
  assert.doesNotThrow(() => renderGraficoRentabilidade(doc, container, { historico: [], visaoId: 'total', periodoId: '30d' }));
  assert.match(container.textContent, /Sem histórico/);
});

test('wireGraficoRentabilidade() renderiza de cara e reage tanto ao período quanto à visão', () => {
  const doc = makeDom(`
    <div class="filter-tabs" id="visaoTabs">
      <button class="filter-tab active" data-visao="total">Total</button>
      <button class="filter-tab" data-visao="rendaEmergencial">Renda Emergencial</button>
    </div>
    <div class="filter-tabs" id="periodoTabs">
      <button class="filter-tab" data-periodo="30d">30 dias</button>
      <button class="filter-tab active" data-periodo="12m">12 meses</button>
    </div>
    <div id="chart"></div>
    <div id="legenda"></div>
  `);
  const historico = gerarHistoricoExemplo(40);
  wireGraficoRentabilidade(doc, {
    historico,
    visaoTabsContainer: doc.getElementById('visaoTabs'),
    periodoTabsContainer: doc.getElementById('periodoTabs'),
    chartContainer: doc.getElementById('chart'),
    legendaContainer: doc.getElementById('legenda'),
    periodoInicial: '12m',
  });
  assert.ok(doc.getElementById('chart').querySelector('svg'), 'já renderiza de cara, sem esperar clique nenhum');

  doc.getElementById('periodoTabs').querySelector('[data-periodo="30d"]')
    .dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(doc.getElementById('periodoTabs').querySelector('[data-periodo="30d"]').classList.contains('active'), true);

  doc.getElementById('visaoTabs').querySelector('[data-visao="rendaEmergencial"]')
    .dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.match(doc.getElementById('legenda').textContent, /Selic/);
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
      <div class="filter-tabs" id="visaoTabs">
        <button class="filter-tab active" data-visao="total">Total</button>
        <button class="filter-tab" data-visao="longoPrazo">Longo Prazo</button>
      </div>
      <div id="heroPatrimonio"></div>
      <div class="filter-tabs" id="periodoTabs">
        <button class="filter-tab" data-periodo="30d">30 dias</button>
        <button class="filter-tab active" data-periodo="12m">12 meses</button>
      </div>
      <div id="graficoRentabilidade"></div>
      <div id="rentabLegenda"></div>
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
  assert.ok(doc.getElementById('heroPatrimonio').querySelector('.hero-value'));
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
