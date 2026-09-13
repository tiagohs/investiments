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
  assert.ok(tile.querySelector('.ext-link'));
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
