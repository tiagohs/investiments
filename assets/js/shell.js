/**
 * shell.js — mounts the shared UI shell (topbar, main nav, theme toggle)
 * into any page that provides the two empty mount points below.
 *
 * A page using this module looks like:
 *
 *   <body data-section="carteiras">
 *     <div class="wrap">
 *       <div id="shell-header"></div>
 *       <main> ...page content... </main>
 *       <div id="shell-footer"></div>
 *     </div>
 *     <script type="module">
 *       import { mountShell } from './assets/js/shell.js';
 *       mountShell();
 *     </script>
 *   </body>
 *
 * body[data-section] tells the shell which of the 6 top-nav items to
 * mark active - it must match one of the nav-link data-section values
 * in assets/partials/shell.html (inicio/distribuicoes/carteiras/
 * transacoes/proventos/organizacao).
 *
 * Every exported piece below is a small, separately-testable step;
 * mountShell() is just the real-world wiring of all of them together
 * (real document, real fetch, real theme.js). Tests exercise the pieces
 * directly against a jsdom document instead of calling mountShell(),
 * so they never need a real network fetch.
 *
 * Login gate (13/09/2026, revised same day): mountShell() also decides
 * whether the page's own <main> can be shown yet. If auth.js!getToken()
 * already has a valid token (session storage from an earlier page
 * load), <main> is shown immediately and options.onAuthenticated(token)
 * runs right away. Otherwise <main> stays hidden and the browser is
 * redirected to login.html (see redirectParaLogin) - a dedicated page,
 * not an overlay drawn on top of this one (the first version tried an
 * in-page gate; it looked cramped and, worse, its styling depended on
 * this page's own shell.css loading correctly, which made a real
 * caching bug - see sw.js - look like a broken login button instead of
 * what it actually was). login.html remembers where to send you back
 * via ?redirect=, and never runs anything from this page's own <main> -
 * so a page's data-fetching code never has to check for a token itself,
 * it just never runs until a token exists.
 *
 * No top-level side effects on import (same convention as api-client.js/
 * auth.js/config.js) - importing this module never touches the DOM or
 * the network by itself; only calling mountShell() does.
 */

import { initTheme, toggleTheme } from './theme.js';
import { getToken } from './auth.js';
import { getSyncStatus } from './api-client.js';
import { formatDateTimeBR, formatRelativeTime } from './format.js';
import { SPREADSHEET_URL } from './config.js';

/**
 * The shell partial always lives at assets/partials/shell.html relative
 * to THIS file (assets/js/shell.js), regardless of how deeply nested the
 * page that imports it is, or whether the site is served from a domain
 * root or a GitHub Pages subpath (https://user.github.io/repo/). Using
 * import.meta.url instead of an absolute "/assets/..." path is what
 * makes that true.
 */
export function resolveShellPartialUrl() {
  return new URL('../partials/shell.html', import.meta.url).href;
}

/** Fetches the shell partial's raw HTML text. */
export async function fetchShellPartial(url, fetchImpl = fetch) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`shell.html fetch failed: ${response.status}`);
  }
  return response.text();
}

/**
 * Parses the partial's raw HTML into its two <template> contents.
 * Uses a throwaway <div> in the caller's own document (so the resulting
 * nodes belong to that document and can later be imported/cloned into
 * it) rather than DOMParser, which some jsdom test setups don't wire up
 * by default.
 */
export function parseShellPartial(html, doc = document) {
  const container = doc.createElement('div');
  container.innerHTML = html;
  const headerTemplate = container.querySelector('#shell-header-template');
  const footerTemplate = container.querySelector('#shell-footer-template');
  if (!headerTemplate || !footerTemplate) {
    throw new Error('shell.html is missing #shell-header-template or #shell-footer-template');
  }
  return { headerContent: headerTemplate.content, footerContent: footerTemplate.content };
}

/**
 * Clones the parsed template contents into the page's own mount points.
 * A page that omits one of the mount points (e.g. a page with no footer
 * content ever, in theory) simply doesn't get that half of the shell -
 * this never throws for a missing mount, only logs, since a layout
 * mistake in one page shouldn't blank the whole thing.
 */
export function injectShell(doc, { headerContent, footerContent, headerMountId = 'shell-header', footerMountId = 'shell-footer' }) {
  const headerMount = doc.getElementById(headerMountId);
  const footerMount = doc.getElementById(footerMountId);
  if (headerMount) {
    headerMount.appendChild(headerContent.cloneNode(true));
  } else {
    console.error(`shell.js: no #${headerMountId} mount point found on this page`);
  }
  if (footerMount) {
    footerMount.appendChild(footerContent.cloneNode(true));
  } else {
    console.error(`shell.js: no #${footerMountId} mount point found on this page`);
  }
}

/**
 * Marks the nav item matching sectionKey as current/active; leaves
 * everything inactive if sectionKey is missing or matches no item
 * (better an unhighlighted nav than a wrongly-highlighted one).
 */
export function markActiveSection(doc, sectionKey) {
  const items = doc.querySelectorAll('#mainnav .nav-item');
  items.forEach((item) => {
    const isCurrent = Boolean(sectionKey) && item.getAttribute('data-section') === sectionKey;
    item.classList.toggle('current', isCurrent);
    const link = item.querySelector('.nav-link');
    if (link) link.classList.toggle('active', isCurrent);
  });
}

/**
 * Wires every popover trigger ([data-toggle-panel="somePanelId"]) to
 * open/close its matching .overlay-panel, closing any other open panel
 * first, plus a shared backdrop that closes everything on click and on
 * Escape. Reused as-is by both the sync and period popovers.
 */
export function setupPopovers(doc) {
  const backdrop = doc.getElementById('shell-backdrop');
  const panels = () => Array.from(doc.querySelectorAll('.overlay-panel'));

  function closeAllPanels() {
    panels().forEach((panel) => panel.classList.remove('open'));
    if (backdrop) backdrop.classList.remove('open');
    doc.querySelectorAll('[data-toggle-panel]').forEach((btn) => btn.setAttribute('aria-expanded', 'false'));
  }

  function togglePanel(trigger, panel) {
    const wasOpen = panel.classList.contains('open');
    closeAllPanels();
    if (!wasOpen) {
      panel.classList.add('open');
      if (backdrop) backdrop.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
    }
  }

  doc.querySelectorAll('[data-toggle-panel]').forEach((trigger) => {
    const panel = doc.getElementById(trigger.getAttribute('data-toggle-panel'));
    if (!panel) return;
    trigger.addEventListener('click', () => togglePanel(trigger, panel));
  });

  if (backdrop) backdrop.addEventListener('click', closeAllPanels);

  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAllPanels();
  });

  return closeAllPanels;
}

/**
 * Applies the stored/system theme on load and wires the footer toggle
 * button. Takes the theme module's two functions as parameters (instead
 * of importing theme.js at the top for this one function) so tests can
 * pass fakes without needing a real localStorage/matchMedia.
 */
export function setupThemeToggle(doc, { initTheme: init, toggleTheme: toggle }) {
  init(doc.documentElement);
  const button = doc.getElementById('themeToggle');
  if (button) {
    button.addEventListener('click', () => toggle(doc.documentElement));
  }
}

/**
 * sw.js always lives at the repo root, two levels up from this file
 * (assets/js/shell.js -> assets/ -> root) - same import.meta.url trick
 * as resolveShellPartialUrl(), so registration resolves correctly both
 * from a nested page (carteiras/acoes.html) and under a GitHub Pages
 * subpath (https://user.github.io/repo/).
 */
export function resolveServiceWorkerUrl() {
  return new URL('../../sw.js', import.meta.url).href;
}

/**
 * Registers the service worker if the browser supports it. Missing
 * support (older browsers, or a test environment with no `navigator`)
 * is a silent no-op, not an error - the app works the same without it,
 * just without the install-to-homescreen/offline-shell benefits.
 */
export async function registerServiceWorker(url, navigatorImpl = typeof navigator !== 'undefined' ? navigator : undefined) {
  if (!navigatorImpl || !navigatorImpl.serviceWorker) return;
  try {
    await navigatorImpl.serviceWorker.register(url);
  } catch (error) {
    console.error('shell.js: service worker registration failed', error);
  }
}

/**
 * Shows or hides the page's own <main> — hidden by default (see each
 * page's own markup) until we know a token exists. Toggled via the
 * `hidden` attribute (not display:none in CSS) so a page never has to
 * fight this with its own styles.
 */
export function setMainVisible(doc, visible) {
  const main = doc.querySelector('main');
  if (main) main.hidden = !visible;
}

/**
 * Sends the browser to the dedicated login page, remembering the
 * current path (+ query string) in ?redirect= so login.html can send
 * you right back once you're signed in. win is injectable for tests -
 * real code never touches window directly outside this one function.
 */
export function redirectParaLogin(win = window) {
  const destino = win.location.pathname + win.location.search;
  win.location.href = `login.html?redirect=${encodeURIComponent(destino)}`;
}

/**
 * Mapa status (texto gravado por Sync.gs em "Registro de Controle") ->
 * classe visual (mesmas 3 usadas no sync-badge e no status-ico: good/
 * warn/bad). "Sem dados" (quando a aba ainda não tem nenhuma linha, ver
 * Sync.gs!lerUltimoRegistroControle_) não entra aqui de propósito - cai
 * no estado neutro (sem classe) tratado à parte em renderSyncStatus.
 */
const STATUS_CLASSE_SYNC = { Sucesso: 'good', Atenção: 'warn', Erro: 'bad' };
const STATUS_ICONE_SYNC = { good: 'ico-check', warn: 'ico-warn', bad: 'ico-bad' };

/**
 * Renderiza o resultado de action=syncStatus (última linha de "Registro
 * de Controle" - ver Sync.gs!handleSyncStatus) no badge + popover do
 * topbar. `resultado` é null quando a chamada falhou (rede/token) - aí
 * o popover mantém o texto neutro em vez de fingir que sabe o status.
 * O link "Ver todas as sincronizações" é sempre a mesma URL real da
 * planilha (config.js!SPREADSHEET_URL) - a API só devolve a última
 * linha, então "quantas sincronizações foram feitas" só dá pra ver lá.
 */
export function renderSyncStatus(doc, resultado) {
  const badge = doc.getElementById('syncBadgeBtn');
  const log = doc.getElementById('syncLog');
  const link = doc.getElementById('syncSheetLink');

  if (link) link.href = SPREADSHEET_URL;

  const semDados = !resultado || !resultado.status || resultado.status === 'Sem dados';

  if (badge) {
    badge.classList.remove('good', 'warn', 'bad');
    if (!semDados) {
      const classe = STATUS_CLASSE_SYNC[resultado.status];
      if (classe) badge.classList.add(classe);
      badge.title = `Sincronização: ${resultado.status} — ${formatRelativeTime(resultado.timestamp)}`;
    } else {
      badge.title = 'Sincronização: aguardando primeira verificação';
    }
  }

  if (!log) return;
  log.innerHTML = '';
  if (semDados) {
    log.innerHTML = '<div class="hint" style="padding:9px 4px">Nenhuma sincronização registrada ainda.</div>';
    return;
  }

  const classe = STATUS_CLASSE_SYNC[resultado.status] || null;
  const icone = classe ? STATUS_ICONE_SYNC[classe] : 'ico-check';
  const row = doc.createElement('div');
  row.className = 'sync-log-row';
  row.innerHTML = `
    <span class="status-ico ${classe || ''}"><svg><use href="#${icone}"/></svg></span>
    <div class="body">
      <div class="top-line">${resultado.status}</div>
      <div class="origin">${resultado.origem || 'planilha'} · ${formatDateTimeBR(resultado.timestamp)}</div>
      ${resultado.detalhe ? `<div class="detail">${resultado.detalhe}</div>` : ''}
    </div>
  `;
  log.appendChild(row);
}

/**
 * Real-world entry point de renderSyncStatus: busca action=syncStatus e
 * liga o resultado no popover. Nunca lança - uma falha aqui não pode
 * derrubar o resto do shell, só deixa o popover no estado neutro (mesmo
 * padrão de resiliência parcial do resto do projeto - ver Home.gs).
 * getSyncStatusImpl é injetável pra teste, mesmo padrão de
 * setupAuthGate/setupThemeToggle.
 */
export async function carregarStatusSync(doc, { token, getSyncStatusImpl = getSyncStatus } = {}) {
  if (!token) return;
  try {
    const resposta = await getSyncStatusImpl(token);
    renderSyncStatus(doc, resposta.ok ? resposta.resultado : null);
  } catch (error) {
    console.error('shell.js: falha ao carregar o status de sincronização', error);
    renderSyncStatus(doc, null);
  }
}

/**
 * Decides, once per page load, whether <main> can be shown right away
 * or the browser needs to leave for login.html — see the header
 * comment above ("Login gate"). getTokenImpl/redirectImpl are
 * injectable for tests, same pattern as setupThemeToggle takes its two
 * theme.js functions as params.
 */
export function setupAuthGate(doc, { onAuthenticated = () => {}, getTokenImpl = getToken, redirectImpl = redirectParaLogin, carregarStatusSyncImpl = carregarStatusSync, win = typeof window !== 'undefined' ? window : undefined } = {}) {
  const token = getTokenImpl();
  if (token) {
    setMainVisible(doc, true);
    onAuthenticated(token);
    carregarStatusSyncImpl(doc, { token });
    return;
  }

  setMainVisible(doc, false);
  redirectImpl(win);
}

/**
 * Real-world entry point: fetches the partial, injects it, marks the
 * active section from body[data-section], wires popovers + theme +
 * the login gate, and registers the service worker. Never throws - a
 * broken shell shouldn't take the whole page down with it, so failures
 * are logged and the page is left usable without chrome.
 *
 * options.onAuthenticated(token), when given, runs exactly once - right
 * away if a valid token is already stored, or after a successful login
 * otherwise. A page with nothing to fetch (no real content yet) can
 * simply omit it.
 */
export async function mountShell(options = {}) {
  const doc = options.document || document;
  const fetchImpl = options.fetchImpl || fetch;
  const partialUrl = options.partialUrl || resolveShellPartialUrl();

  try {
    const html = await fetchShellPartial(partialUrl, fetchImpl);
    const { headerContent, footerContent } = parseShellPartial(html, doc);
    injectShell(doc, { headerContent, footerContent });
    markActiveSection(doc, doc.body.dataset.section || null);
    setupPopovers(doc);
    setupThemeToggle(doc, { initTheme, toggleTheme });
    setupAuthGate(doc, { onAuthenticated: options.onAuthenticated });
  } catch (error) {
    console.error('shell.js: failed to mount the shell', error);
  }

  await registerServiceWorker(options.serviceWorkerUrl || resolveServiceWorkerUrl(), options.navigator);
}
