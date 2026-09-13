// Unit tests for assets/js/shell.js, using jsdom for the DOM-touching
// pieces (this module injects/queries real elements, unlike theme.js's
// plain-object-friendly design). mountShell() itself is exercised with a
// fake fetch and a fake theme module so no real network/localStorage is
// needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  parseShellPartial,
  injectShell,
  markActiveSection,
  setupPopovers,
  setupThemeToggle,
  registerServiceWorker,
  setMainVisible,
  redirectParaLogin,
  setupAuthGate,
  renderSyncStatus,
  carregarStatusSync,
  mountShell,
} from '../assets/js/shell.js';

const SHELL_PARTIAL_HTML = `
  <template id="shell-header-template">
    <div class="topbar"><div class="brand-mark">P</div></div>
    <div class="overlay-backdrop" id="shell-backdrop"></div>
    <div class="sync-wrap">
      <button id="syncBadgeBtn" data-toggle-panel="syncPanel" aria-expanded="false">sync</button>
      <div class="overlay-panel" id="syncPanel">
        <div class="sync-log" id="syncLog"><div class="hint">Nenhuma sincronização registrada ainda.</div></div>
        <a id="syncSheetLink" href="#">link</a>
      </div>
    </div>
    <div class="outro-wrap">
      <button id="outroBtn" data-toggle-panel="outroPanel" aria-expanded="false">outro</button>
      <div class="overlay-panel" id="outroPanel">outro panel</div>
    </div>
    <nav id="mainnav">
      <div class="nav-item" data-section="inicio"><a class="nav-link" data-section="inicio">Início</a></div>
      <div class="nav-item" data-section="carteiras"><a class="nav-link" data-section="carteiras">Carteiras</a></div>
    </nav>
  </template>
  <template id="shell-footer-template">
    <div class="theme-footer"><button id="themeToggle">tema</button></div>
  </template>
`;

function makeDom(bodyHtml = '<div id="shell-header"></div><main></main><div id="shell-footer"></div>') {
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`);
  return dom.window.document;
}

function mountedDoc(bodySection) {
  const doc = makeDom();
  if (bodySection) doc.body.dataset.section = bodySection;
  const { headerContent, footerContent } = parseShellPartial(SHELL_PARTIAL_HTML, doc);
  injectShell(doc, { headerContent, footerContent });
  return doc;
}


// --- setMainVisible / redirectParaLogin / setupAuthGate --------------------
// getTokenImpl/redirectImpl are injected fakes here on purpose - the real
// auth.js touches sessionStorage and the real redirectParaLogin does a
// genuine window.location.href navigation, neither of which belongs in a
// unit test. mountShell()'s own tests further down never provide a token,
// so they exercise this same "no token yet" path for free (with the real
// redirectParaLogin, harmlessly assigning href on a jsdom window that never
// actually navigates anywhere).

test('setMainVisible() toggles the hidden attribute on <main>', () => {
  const doc = makeDom();
  setMainVisible(doc, false);
  assert.equal(doc.querySelector('main').hidden, true);
  setMainVisible(doc, true);
  assert.equal(doc.querySelector('main').hidden, false);
});

test('setMainVisible() is a no-op (never throws) when the page has no <main>', () => {
  const doc = makeDom('<div id="shell-header"></div><div id="shell-footer"></div>');
  assert.doesNotThrow(() => setMainVisible(doc, true));
});

test('redirectParaLogin() sends the browser to login.html, remembering the current path+query in ?redirect=', () => {
  let assignedHref = null;
  const fakeWin = { location: { pathname: '/carteiras/acoes.html', search: '?periodo=12m', set href(v) { assignedHref = v; }, get href() { return assignedHref; } } };
  redirectParaLogin(fakeWin);
  assert.equal(assignedHref, 'login.html?redirect=%2Fcarteiras%2Facoes.html%3Fperiodo%3D12m');
});

test('setupAuthGate() shows <main> right away and calls onAuthenticated when a token already exists - never redirects', () => {
  const doc = makeDom();
  let calledWith = null;
  setupAuthGate(doc, {
    onAuthenticated: (token) => { calledWith = token; },
    getTokenImpl: () => 'token-existente',
    redirectImpl: () => { throw new Error('não deveria redirecionar - já tinha token'); },
    carregarStatusSyncImpl: () => {},
  });
  assert.equal(doc.querySelector('main').hidden, false);
  assert.equal(calledWith, 'token-existente');
});

test('setupAuthGate() also dispara carregarStatusSyncImpl com o token, quando autenticado', () => {
  const doc = makeDom();
  let calledWith = null;
  setupAuthGate(doc, {
    getTokenImpl: () => 'token-existente',
    redirectImpl: () => { throw new Error('não deveria redirecionar - já tinha token'); },
    carregarStatusSyncImpl: (_doc, { token }) => { calledWith = token; },
  });
  assert.equal(calledWith, 'token-existente');
});

test('setupAuthGate() nunca chama carregarStatusSyncImpl quando não há token', () => {
  const doc = makeDom();
  let called = false;
  setupAuthGate(doc, {
    getTokenImpl: () => null,
    redirectImpl: () => {},
    carregarStatusSyncImpl: () => { called = true; },
  });
  assert.equal(called, false);
});

test('setupAuthGate() hides <main> and redirects to login when there is no token yet - never calls onAuthenticated', () => {
  const doc = makeDom();
  let redirected = false;
  setupAuthGate(doc, {
    onAuthenticated: () => { throw new Error('não deveria ser chamado sem login'); },
    getTokenImpl: () => null,
    redirectImpl: () => { redirected = true; },
  });
  assert.equal(doc.querySelector('main').hidden, true);
  assert.equal(redirected, true);
});

test('setupAuthGate() defaults onAuthenticated to a no-op - a page with nothing to fetch yet can omit it', () => {
  const doc = makeDom();
  assert.doesNotThrow(() => setupAuthGate(doc, {
    getTokenImpl: () => 'token-existente',
    redirectImpl: () => { throw new Error('não deveria chamar'); },
    carregarStatusSyncImpl: () => {},
  }));
});

// --- renderSyncStatus / carregarStatusSync --------------------------------

function syncDom() {
  const doc = makeDom();
  const wrap = doc.createElement('div');
  wrap.innerHTML = `
    <button id="syncBadgeBtn" class="sync-badge"></button>
    <div id="syncLog"></div>
    <a id="syncSheetLink" href="#"></a>
  `;
  doc.body.appendChild(wrap);
  return doc;
}

test('renderSyncStatus() com "Sem dados" mantém o estado neutro (placeholder, sem classe no badge)', () => {
  const doc = syncDom();
  renderSyncStatus(doc, { status: 'Sem dados', timestamp: null, origem: '', detalhe: 'Nenhuma sincronização registrada ainda.' });
  const badge = doc.getElementById('syncBadgeBtn');
  assert.equal(badge.classList.contains('good'), false);
  assert.equal(badge.classList.contains('warn'), false);
  assert.equal(badge.classList.contains('bad'), false);
  assert.match(doc.getElementById('syncLog').textContent, /Nenhuma sincronização registrada ainda/);
});

test('renderSyncStatus() com resultado null (falha ao buscar) também cai no estado neutro', () => {
  const doc = syncDom();
  renderSyncStatus(doc, null);
  assert.equal(doc.getElementById('syncBadgeBtn').classList.contains('bad'), false);
  assert.match(doc.getElementById('syncLog').textContent, /Nenhuma sincronização registrada ainda/);
});

test('renderSyncStatus() com status "Sucesso" pinta o badge de "good" e mostra a linha no log', () => {
  const doc = syncDom();
  renderSyncStatus(doc, { status: 'Sucesso', timestamp: '2026-09-13T10:00:00.000Z', origem: 'app', detalhe: '29 ativos sincronizados' });
  const badge = doc.getElementById('syncBadgeBtn');
  assert.equal(badge.classList.contains('good'), true);
  const log = doc.getElementById('syncLog');
  assert.match(log.textContent, /Sucesso/);
  assert.match(log.textContent, /29 ativos sincronizados/);
});

test('renderSyncStatus() com status "Erro" pinta o badge de "bad"', () => {
  const doc = syncDom();
  renderSyncStatus(doc, { status: 'Erro', timestamp: '2026-09-13T10:00:00.000Z', origem: 'app', detalhe: 'falhou' });
  assert.equal(doc.getElementById('syncBadgeBtn').classList.contains('bad'), true);
});

test('renderSyncStatus() sempre aponta o link "ver todas" pra planilha real (SPREADSHEET_URL)', () => {
  const doc = syncDom();
  renderSyncStatus(doc, { status: 'Sucesso', timestamp: '2026-09-13T10:00:00.000Z', origem: 'app', detalhe: '' });
  assert.match(doc.getElementById('syncSheetLink').href, /docs\.google\.com\/spreadsheets/);
});

test('carregarStatusSync() busca com o token e renderiza o resultado', async () => {
  const doc = syncDom();
  let tokenRecebido = null;
  await carregarStatusSync(doc, {
    token: 'tok-123',
    getSyncStatusImpl: async (token) => {
      tokenRecebido = token;
      return { ok: true, resultado: { status: 'Sucesso', timestamp: '2026-09-13T10:00:00.000Z', origem: 'app', detalhe: '' } };
    },
  });
  assert.equal(tokenRecebido, 'tok-123');
  assert.equal(doc.getElementById('syncBadgeBtn').classList.contains('good'), true);
});

test('carregarStatusSync() sem token não busca nada', async () => {
  const doc = syncDom();
  let chamou = false;
  await carregarStatusSync(doc, { token: null, getSyncStatusImpl: async () => { chamou = true; return { ok: true, resultado: {} }; } });
  assert.equal(chamou, false);
});

test('carregarStatusSync() trata falha (ok:false ou exceção) caindo no estado neutro, sem lançar', async () => {
  const doc = syncDom();
  await assert.doesNotReject(carregarStatusSync(doc, {
    token: 'tok-123',
    getSyncStatusImpl: async () => { throw new Error('rede fora'); },
  }));
  assert.equal(doc.getElementById('syncBadgeBtn').classList.contains('bad'), false);
  assert.match(doc.getElementById('syncLog').textContent, /Nenhuma sincronização registrada ainda/);
});

// --- parseShellPartial ---------------------------------------------------

test('parseShellPartial() finds both templates and exposes their content', () => {
  const doc = makeDom();
  const { headerContent, footerContent } = parseShellPartial(SHELL_PARTIAL_HTML, doc);
  assert.ok(headerContent.querySelector('#mainnav'));
  assert.ok(footerContent.querySelector('#themeToggle'));
});

test('parseShellPartial() throws a clear error when a template is missing', () => {
  const doc = makeDom();
  assert.throws(
    () => parseShellPartial('<template id="shell-header-template"></template>', doc),
    /shell-footer-template/,
  );
});

// --- injectShell ----------------------------------------------------------

test('injectShell() clones header and footer content into their mount points', () => {
  const doc = mountedDoc();
  assert.ok(doc.getElementById('shell-header').querySelector('#mainnav'));
  assert.ok(doc.getElementById('shell-footer').querySelector('#themeToggle'));
});

test('injectShell() logs but does not throw when a mount point is missing', () => {
  const doc = makeDom('<main></main>'); // no #shell-header / #shell-footer at all
  const { headerContent, footerContent } = parseShellPartial(SHELL_PARTIAL_HTML, doc);
  assert.doesNotThrow(() => injectShell(doc, { headerContent, footerContent }));
});

// --- markActiveSection ------------------------------------------------

test('markActiveSection() marks the matching nav-item current and its link active', () => {
  const doc = mountedDoc();
  markActiveSection(doc, 'carteiras');

  const carteirasItem = doc.querySelector('.nav-item[data-section="carteiras"]');
  const inicioItem = doc.querySelector('.nav-item[data-section="inicio"]');
  assert.equal(carteirasItem.classList.contains('current'), true);
  assert.equal(carteirasItem.querySelector('.nav-link').classList.contains('active'), true);
  assert.equal(inicioItem.classList.contains('current'), false);
  assert.equal(inicioItem.querySelector('.nav-link').classList.contains('active'), false);
});

test('markActiveSection() leaves every item inactive when sectionKey matches nothing', () => {
  const doc = mountedDoc();
  markActiveSection(doc, 'pagina-que-nao-existe');
  doc.querySelectorAll('.nav-item').forEach((item) => {
    assert.equal(item.classList.contains('current'), false);
  });
});

test('markActiveSection() leaves every item inactive when sectionKey is null', () => {
  const doc = mountedDoc();
  markActiveSection(doc, null);
  doc.querySelectorAll('.nav-item').forEach((item) => {
    assert.equal(item.classList.contains('current'), false);
  });
});

// --- setupPopovers ------------------------------------------------------

test('setupPopovers() opens a panel and the backdrop on trigger click, closes on backdrop click', () => {
  const doc = mountedDoc();
  setupPopovers(doc);

  const syncBtn = doc.getElementById('syncBadgeBtn');
  const syncPanel = doc.getElementById('syncPanel');
  const backdrop = doc.getElementById('shell-backdrop');

  syncBtn.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(syncPanel.classList.contains('open'), true);
  assert.equal(backdrop.classList.contains('open'), true);
  assert.equal(syncBtn.getAttribute('aria-expanded'), 'true');

  backdrop.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(syncPanel.classList.contains('open'), false);
  assert.equal(backdrop.classList.contains('open'), false);
  assert.equal(syncBtn.getAttribute('aria-expanded'), 'false');
});

test('setupPopovers() opening one panel closes another that was already open', () => {
  const doc = mountedDoc();
  setupPopovers(doc);

  const syncBtn = doc.getElementById('syncBadgeBtn');
  const outroBtn = doc.getElementById('outroBtn');
  const syncPanel = doc.getElementById('syncPanel');
  const outroPanel = doc.getElementById('outroPanel');
  const click = (el) => el.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));

  click(syncBtn);
  assert.equal(syncPanel.classList.contains('open'), true);

  click(outroBtn);
  assert.equal(outroPanel.classList.contains('open'), true);
  assert.equal(syncPanel.classList.contains('open'), false);
});

test('setupPopovers() clicking an open trigger again toggles its panel closed', () => {
  const doc = mountedDoc();
  setupPopovers(doc);
  const syncBtn = doc.getElementById('syncBadgeBtn');
  const syncPanel = doc.getElementById('syncPanel');
  const click = () => syncBtn.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));

  click();
  assert.equal(syncPanel.classList.contains('open'), true);
  click();
  assert.equal(syncPanel.classList.contains('open'), false);
});

test('setupPopovers() closes every open panel on Escape', () => {
  const doc = mountedDoc();
  setupPopovers(doc);
  const syncBtn = doc.getElementById('syncBadgeBtn');
  const syncPanel = doc.getElementById('syncPanel');
  syncBtn.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(syncPanel.classList.contains('open'), true);

  doc.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(syncPanel.classList.contains('open'), false);
});

// --- setupThemeToggle ----------------------------------------------------

test('setupThemeToggle() calls initTheme once on setup with the root element', () => {
  const doc = mountedDoc();
  let initedWith = null;
  setupThemeToggle(doc, { initTheme: (root) => { initedWith = root; }, toggleTheme: () => {} });
  assert.equal(initedWith, doc.documentElement);
});

test('setupThemeToggle() calls toggleTheme with the root element when the button is clicked', () => {
  const doc = mountedDoc();
  let toggledWith = null;
  setupThemeToggle(doc, { initTheme: () => {}, toggleTheme: (root) => { toggledWith = root; return 'dark'; } });

  doc.getElementById('themeToggle').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(toggledWith, doc.documentElement);
});

test('setupThemeToggle() does not throw when the page has no theme toggle button', () => {
  const doc = makeDom('<div id="shell-header"></div><main></main>'); // no footer mount, no button
  assert.doesNotThrow(() => setupThemeToggle(doc, { initTheme: () => {}, toggleTheme: () => {} }));
});

// --- registerServiceWorker -------------------------------------------

test('registerServiceWorker() does nothing when the browser has no serviceWorker support', async () => {
  await assert.doesNotReject(registerServiceWorker('sw.js', {}));
  await assert.doesNotReject(registerServiceWorker('sw.js', undefined));
});

test('registerServiceWorker() calls navigator.serviceWorker.register() with the given url', async () => {
  let registeredWith = null;
  const fakeNavigator = { serviceWorker: { register: async (url) => { registeredWith = url; } } };
  await registerServiceWorker('fake://sw.js', fakeNavigator);
  assert.equal(registeredWith, 'fake://sw.js');
});

test('registerServiceWorker() logs but does not throw when register() rejects', async () => {
  const fakeNavigator = { serviceWorker: { register: async () => { throw new Error('nope'); } } };
  await assert.doesNotReject(registerServiceWorker('fake://sw.js', fakeNavigator));
});

// --- mountShell (the real-world glue, with fakes for fetch/document) ------

test('mountShell() fetches the partial, injects it, marks the section, and wires theme', async () => {
  const doc = makeDom(); // fresh, un-injected document
  doc.body.dataset.section = 'carteiras';

  const fetchImpl = async (url) => ({
    ok: true,
    text: async () => SHELL_PARTIAL_HTML,
  });

  await mountShell({ document: doc, fetchImpl, partialUrl: 'fake://shell.html' });

  assert.ok(doc.getElementById('mainnav'), 'header content should be injected');
  const carteirasItem = doc.querySelector('.nav-item[data-section="carteiras"]');
  assert.equal(carteirasItem.classList.contains('current'), true);
});

test('mountShell() logs and does not throw when the fetch fails', async () => {
  const doc = makeDom();
  const fetchImpl = async () => ({ ok: false, status: 404, text: async () => '' });

  await assert.doesNotReject(mountShell({ document: doc, fetchImpl, partialUrl: 'fake://missing.html' }));
  assert.equal(doc.getElementById('shell-header').children.length, 0);
});

test('mountShell() also registers the service worker, using the given navigator/serviceWorkerUrl', async () => {
  const doc = makeDom();
  const fetchImpl = async () => ({ ok: true, text: async () => SHELL_PARTIAL_HTML });
  let registeredWith = null;
  const fakeNavigator = { serviceWorker: { register: async (url) => { registeredWith = url; } } };

  await mountShell({
    document: doc,
    fetchImpl,
    partialUrl: 'fake://shell.html',
    serviceWorkerUrl: 'fake://sw.js',
    navigator: fakeNavigator,
  });

  assert.equal(registeredWith, 'fake://sw.js');
});

test('mountShell() still registers the service worker even when the shell fetch fails', async () => {
  const doc = makeDom();
  const fetchImpl = async () => ({ ok: false, status: 500, text: async () => '' });
  let registeredWith = null;
  const fakeNavigator = { serviceWorker: { register: async (url) => { registeredWith = url; } } };

  await mountShell({
    document: doc,
    fetchImpl,
    partialUrl: 'fake://shell.html',
    serviceWorkerUrl: 'fake://sw.js',
    navigator: fakeNavigator,
  });

  assert.equal(registeredWith, 'fake://sw.js');
});
