// Unit tests for assets/js/router.js — usa rotas FAKE (nunca as reais
// montarPaginaInicio/montarPaginaDistribuicoesMetas) pra testar só o
// comportamento do router em si (troca de aba sem reload, mount 1x só
// por aba, history/popstate), sem precisar simular a resposta inteira
// da API de cada página real. ROUTES/mountRouter com as rotas de
// verdade continuam cobertas indiretamente pelos testes de
// montarPaginaInicio/montarPaginaDistribuicoesMetas em cada um dos
// próprios arquivos de teste dessas páginas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  parsePagesPartial,
  injectPageContainers,
  resolveRouteKey,
  mountRouter,
} from '../assets/js/router.js';

const PAGES_PARTIAL_HTML = `
  <template id="tpl-a"><div id="markerA">conteúdo A</div></template>
  <template id="tpl-b"><div id="markerB">conteúdo B</div></template>
`;

function fakeRoutes({ mountA = async () => {}, mountB = async () => {} } = {}) {
  return [
    { key: 'a', href: 'a.html', title: 'Página A', containerId: 'page-a', templateId: 'tpl-a', mount: mountA },
    { key: 'b', href: 'b.html', title: 'Página B', containerId: 'page-b', templateId: 'tpl-b', mount: mountB },
  ];
}

function makeDom() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <nav id="mainnav">
      <div class="nav-item" data-section="a"><a class="nav-link" href="a.html" data-section="a">A</a></div>
      <div class="nav-item" data-section="b"><a class="nav-link" href="b.html" data-section="b">B</a></div>
      <div class="nav-item" data-section="c"><a class="nav-link" href="c.html" data-section="c">C (não existe ainda)</a></div>
    </nav>
    <div id="app-pages"></div>
  </body></html>`);
  return dom.window.document;
}

function fakeFetch(html = PAGES_PARTIAL_HTML) {
  return async () => ({ ok: true, text: async () => html });
}

function makeFakeWin(pathname) {
  const pushStateCalls = [];
  let popstateHandler = null;
  return {
    location: { pathname },
    history: {
      pushState(state, title, url) {
        pushStateCalls.push({ state, title, url });
      },
    },
    addEventListener(evt, handler) {
      if (evt === 'popstate') popstateHandler = handler;
    },
    pushStateCalls,
    setPathnameAndFirePopstate(novoPathname) {
      this.location.pathname = novoPathname;
      if (popstateHandler) popstateHandler();
    },
  };
}


// --- parsePagesPartial / injectPageContainers -------------------------------

test('parsePagesPartial() extrai o content de cada <template> por route.templateId', () => {
  const doc = makeDom();
  const templates = parsePagesPartial(PAGES_PARTIAL_HTML, doc, fakeRoutes());
  assert.ok(templates.a.querySelector('#markerA'));
  assert.ok(templates.b.querySelector('#markerB'));
});

test('parsePagesPartial() lança erro claro se um template esperado não existir no partial', () => {
  const doc = makeDom();
  assert.throws(
    () => parsePagesPartial('<template id="tpl-a"></template>', doc, fakeRoutes()),
    /tpl-b/,
  );
});

test('injectPageContainers() cria um <main> escondido por rota, com o conteúdo clonado do template', () => {
  const doc = makeDom();
  const routes = fakeRoutes();
  const templates = parsePagesPartial(PAGES_PARTIAL_HTML, doc, routes);
  const mount = doc.getElementById('app-pages');

  injectPageContainers(doc, mount, templates, routes);

  const pageA = doc.getElementById('page-a');
  const pageB = doc.getElementById('page-b');
  assert.ok(pageA && pageB);
  assert.equal(pageA.hidden, true);
  assert.equal(pageB.hidden, true);
  assert.ok(pageA.querySelector('#markerA'));
  assert.ok(pageB.querySelector('#markerB'));
});


// --- resolveRouteKey ---------------------------------------------------------

test('resolveRouteKey() casa o último segmento do path com route.href', () => {
  const routes = fakeRoutes();
  assert.equal(resolveRouteKey('/a.html', routes), 'a');
  assert.equal(resolveRouteKey('/algum/subpath/b.html', routes), 'b');
});

test('resolveRouteKey() cai na 1ª rota quando não há segmento de arquivo (raiz/subpath sem nome)', () => {
  const routes = fakeRoutes();
  assert.equal(resolveRouteKey('/', routes), 'a');
  assert.equal(resolveRouteKey('', routes), 'a');
  assert.equal(resolveRouteKey('/algumrepo/', routes), 'a');
});


// --- mountRouter: boot inicial -----------------------------------------------

test('mountRouter() na inicialização só monta a rota que bate com a URL atual — a outra fica no DOM mas sem mount', async () => {
  const doc = makeDom();
  let chamadasA = 0;
  let chamadasB = 0;
  const routes = fakeRoutes({
    mountA: async () => { chamadasA += 1; },
    mountB: async () => { chamadasB += 1; },
  });
  const winImpl = makeFakeWin('/b.html');

  await mountRouter(doc, { token: 'tok', routes, fetchImpl: fakeFetch(), winImpl });

  assert.equal(chamadasA, 0, 'mount da aba não visitada não pode rodar');
  assert.equal(chamadasB, 1, 'mount da aba inicial roda exatamente 1x');
  assert.equal(doc.getElementById('page-a').hidden, true);
  assert.equal(doc.getElementById('page-b').hidden, false);
  assert.equal(doc.title, 'Página B');
  assert.equal(doc.querySelector('.nav-item[data-section="b"]').classList.contains('current'), true);
  assert.equal(winImpl.pushStateCalls.length, 0, 'boot não empilha histórico novo — já estamos nessa URL');
});

test('mountRouter() retorna null e não lança quando a página não tem #app-pages', async () => {
  const doc = new JSDOM('<!doctype html><html><body></body></html>').window.document;
  const resultado = await mountRouter(doc, { token: 'tok', routes: fakeRoutes(), fetchImpl: fakeFetch() });
  assert.equal(resultado, null);
});


// --- mountRouter: troca de aba por clique -------------------------------------

test('trocar de aba clicando no menu: monta a nova aba 1x, esconde/mostra os <main>, empilha histórico', async () => {
  const doc = makeDom();
  let chamadasA = 0;
  let chamadasB = 0;
  const routes = fakeRoutes({
    mountA: async () => { chamadasA += 1; },
    mountB: async () => { chamadasB += 1; },
  });
  const winImpl = makeFakeWin('/a.html');

  await mountRouter(doc, { token: 'tok', routes, fetchImpl: fakeFetch(), winImpl });
  assert.equal(chamadasA, 1);

  doc.querySelector('.nav-link[data-section="b"]').click();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(chamadasB, 1, 'clicar em B monta B pela 1ª vez');
  assert.equal(doc.getElementById('page-a').hidden, true);
  assert.equal(doc.getElementById('page-b').hidden, false);
  assert.equal(doc.title, 'Página B');
  assert.equal(winImpl.pushStateCalls.length, 1);
  assert.equal(winImpl.pushStateCalls[0].url, 'b.html');
});

test('voltar pra uma aba já visitada NÃO busca dado de novo — só reexibe o que já tinha', async () => {
  const doc = makeDom();
  let chamadasA = 0;
  let chamadasB = 0;
  const routes = fakeRoutes({
    mountA: async () => { chamadasA += 1; },
    mountB: async () => { chamadasB += 1; },
  });
  const winImpl = makeFakeWin('/a.html');

  const router = await mountRouter(doc, { token: 'tok', routes, fetchImpl: fakeFetch(), winImpl });
  assert.equal(chamadasA, 1);

  await router.ativar('b');
  assert.equal(chamadasB, 1);

  await router.ativar('a'); // volta pra A, já visitada antes
  assert.equal(chamadasA, 1, 'A não é buscada de novo ao voltar pra ela');
  assert.equal(doc.getElementById('page-a').hidden, false);
  assert.equal(doc.getElementById('page-b').hidden, true);
});

test('clicar na aba já ativa não monta de novo nem empilha histórico', async () => {
  const doc = makeDom();
  let chamadasA = 0;
  const routes = fakeRoutes({ mountA: async () => { chamadasA += 1; } });
  const winImpl = makeFakeWin('/a.html');

  await mountRouter(doc, { token: 'tok', routes, fetchImpl: fakeFetch(), winImpl });
  assert.equal(chamadasA, 1);
  assert.equal(winImpl.pushStateCalls.length, 0);

  doc.querySelector('.nav-link[data-section="a"]').click();
  await Promise.resolve();

  assert.equal(chamadasA, 1, 'clique na aba já ativa não monta de novo');
  assert.equal(winImpl.pushStateCalls.length, 0, 'nem empilha uma entrada de histórico redundante');
});

test('ctrl+clique (e cliques que não são o botão esquerdo) num nav-link não é interceptado — navegação normal continua livre', async () => {
  const doc = makeDom();
  let chamadasB = 0;
  const routes = fakeRoutes({ mountB: async () => { chamadasB += 1; } });
  const winImpl = makeFakeWin('/a.html');

  await mountRouter(doc, { token: 'tok', routes, fetchImpl: fakeFetch(), winImpl });

  const link = doc.querySelector('.nav-link[data-section="b"]');
  const evento = new doc.defaultView.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true });
  const naoCancelado = link.dispatchEvent(evento);

  assert.equal(naoCancelado, true, 'preventDefault não deveria ter sido chamado');
  assert.equal(chamadasB, 0, 'ctrl+clique não deveria montar a aba via router');
});

test('clique num nav-link de rota ainda não registrada (Carteiras etc.) continua navegação normal', async () => {
  const doc = makeDom();
  const routes = fakeRoutes();
  const winImpl = makeFakeWin('/a.html');

  await mountRouter(doc, { token: 'tok', routes, fetchImpl: fakeFetch(), winImpl });

  const link = doc.querySelector('.nav-link[data-section="c"]');
  const naoCancelado = link.dispatchEvent(new doc.defaultView.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

  assert.equal(naoCancelado, true, 'link de rota não registrada não deve ter o clique interceptado');
});


// --- mountRouter: voltar/avançar do navegador (popstate) ---------------------

test('popstate troca de aba (sem buscar dado de novo se já visitada) e não empilha histórico de novo', async () => {
  const doc = makeDom();
  let chamadasA = 0;
  let chamadasB = 0;
  const routes = fakeRoutes({
    mountA: async () => { chamadasA += 1; },
    mountB: async () => { chamadasB += 1; },
  });
  const winImpl = makeFakeWin('/a.html');

  const router = await mountRouter(doc, { token: 'tok', routes, fetchImpl: fakeFetch(), winImpl });
  await router.ativar('b');
  assert.equal(chamadasA, 1);
  assert.equal(chamadasB, 1);
  const pushStatesAntesDoPopstate = winImpl.pushStateCalls.length;

  winImpl.setPathnameAndFirePopstate('/a.html'); // usuário clicou "voltar"

  assert.equal(doc.getElementById('page-a').hidden, false);
  assert.equal(doc.getElementById('page-b').hidden, true);
  assert.equal(chamadasA, 1, 'A já tinha sido visitada — popstate não busca de novo');
  assert.equal(winImpl.pushStateCalls.length, pushStatesAntesDoPopstate, 'popstate nunca empilha uma entrada nova');
});
