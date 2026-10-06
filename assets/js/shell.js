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
import { getToken, clearToken, decodeTokenPayload } from './auth.js';
import { getSyncHistorico, syncNow, syncRendaFixaEIndices, syncProventosFnet, syncInformesFnet, syncVideos, limparCacheHistorico, consolidar } from './api-client.js';
import { formatDateTimeBR, formatRelativeTime } from './format.js';
import { limparCacheDados, lerCacheDados } from './cache-dados.js';
import { montarBuscaGlobal } from './ui/busca.js'; // 05/10/2026: busca em pílula na top bar (ativos do cache local + telas)
// 05/10/2026: helpers de UI M3 (confirmar/toast/erro de carga/abas...) também saem daqui, pra páginas que já importam o shell
export { confirmar, abrirFolha, toast, mostrarErroCarga, mostrarEstadoVazio, criarTabs, criarBreadcrumb, abrirMenu, ligarMenu, criarSwitch, montarCabecalhoPagina, definirTituloPagina, formatarTituloPagina, progressoTopo } from './ui/index.js';
import { setupCarrinhoHeader } from './carrinho-header.js'; // 05/10/2026: carrinho em andamento no header de todas as telas

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

/**
 * The main-nav links in shell.html are written relative to the site
 * root (e.g. href="distribuicoes-metas.html", href="carteiras/index.html").
 * That's correct when the shell is mounted on a top-level page, but on
 * a page nested one level deep (e.g. carteiras/index.html) the browser
 * resolves them relative to the CURRENT page instead, so
 * "distribuicoes-metas.html" becomes
 * ".../carteiras/distribuicoes-metas.html" - a 404 on GitHub Pages
 * (bug reported 19/09/2026: Carteiras -> Ações -> Distribuições e
 * Metas no menu principal).
 *
 * resolveSiteRootUrl() gives the site root as an absolute URL, using
 * the same import.meta.url trick as resolveShellPartialUrl() above -
 * robust to both page nesting depth and GitHub Pages subpath
 * deployment. fixNavLinkHrefs() then rewrites every main-nav href to
 * be resolved against that root instead of the current page.
 */
export function resolveSiteRootUrl() {
  return new URL('../../', import.meta.url).href;
}

/**
 * Rewrites every #mainnav .nav-link href to an absolute URL resolved
 * against rootUrl, so it always points at the right page regardless of
 * how deeply nested the current page is.
 */
export function fixNavLinkHrefs(doc, rootUrl) {
  // 05/10/2026: trilho (#mainnav) e gaveta (#navDrawer) + links de raiz avulsos (marca, "Novo aporte")
  doc.querySelectorAll('#mainnav .nav-link[href], #navDrawer .nav-link[href], [data-href-raiz]').forEach((link) => {
    const alvo = link.getAttribute('data-href-raiz') || link.getAttribute('href');
    if (!alvo || alvo === '#') return;
    link.setAttribute('href', new URL(alvo, rootUrl).href);
  });
  // Imagens do shell (logo) usam caminho relativo à raiz do site.
  doc.querySelectorAll('img[data-src-raiz]').forEach((img) => {
    img.setAttribute('src', new URL(img.getAttribute('data-src-raiz'), rootUrl).href);
  });
}

/** Fetches the shell partial's raw HTML text. */
export async function fetchShellPartial(url, fetchImpl = fetch) {
  // 26/09/2026: 'no-cache' pelo mesmo motivo do pages.html (router.js).
  const response = await fetchImpl(url, { cache: 'no-cache' });
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
  // 05/10/2026: marca trilho e gaveta; aria-current na seção atual e título da seção na top bar
  const items = doc.querySelectorAll('#mainnav .nav-item, #navDrawer .nav-item');
  let titulo = '';
  items.forEach((item) => {
    const isCurrent = Boolean(sectionKey) && item.getAttribute('data-section') === sectionKey;
    item.classList.toggle('current', isCurrent);
    const link = item.querySelector('.nav-link');
    if (link) {
      link.classList.toggle('active', isCurrent);
      if (isCurrent) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
      if (isCurrent && !titulo) {
        const rotulo = item.querySelector('.nav-label');
        titulo = (rotulo && rotulo.textContent.trim()) || link.getAttribute('aria-label') || '';
      }
    }
  });
  const tituloEl = doc.getElementById('shellSecaoTitulo');
  if (tituloEl && titulo) tituloEl.textContent = titulo;
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
  // 05/10/2026: botão da top bar (#themeToggle) e o item de tema do menu da conta ([data-tema-toggle])
  const botoes = new Set(doc.querySelectorAll('#themeToggle, [data-tema-toggle]'));
  botoes.forEach((button) => {
    button.addEventListener('click', () => toggle(doc.documentElement));
  });
}

const CHAVE_NAV = 'investiments_nav_expandido';
const BP_GAVETA_FIXA = 1200; // >= 1200px: gaveta empurra o conteúdo
const BP_GAVETA_PADRAO_ABERTA = 1440; // sem preferência salva: aberta só a partir daqui
const BP_TRILHO = 840; // < 840px: sem trilho, gaveta modal

/**
 * 05/10/2026: trilho 80px + gaveta 280px (kit Figma). Estado em body[data-nav="aberto|fechado"]
 * e #navDrawer[data-aberto]. >=1200px a gaveta empurra o conteúdo e a escolha é lembrada
 * (localStorage, com try/catch); 840-1199px abre por cima com scrim; <840px é modal pelo ☰ da top bar.
 * Tolera partial sem esses elementos (testes usam um shell falso).
 */
export function setupNavDrawer(doc, { win = doc.defaultView, storage = null } = {}) {
  const drawer = doc.getElementById('navDrawer');
  if (!drawer) return { abrir() {}, fechar() {}, alternar() {}, estaAberta: () => false };
  const body = doc.body;
  const scrim = doc.getElementById('navScrim');
  const gatilhos = ['navToggle', 'navToggleTopo'].map((id) => doc.getElementById(id)).filter(Boolean);
  const fecharBtn = doc.getElementById('navFechar');
  const largura = () => (win && typeof win.innerWidth === 'number' ? win.innerWidth : 1280);
  const store = storage || (() => { try { return win && win.localStorage; } catch (e) { return null; } })();
  const ler = () => { try { return store ? store.getItem(CHAVE_NAV) : null; } catch (e) { return null; } };
  const gravar = (v) => { try { if (store) store.setItem(CHAVE_NAV, v); } catch (e) { /* sem storage: só não lembra */ } };

  let aberta = false;
  function aplicar(sim, { lembrar = false } = {}) {
    aberta = Boolean(sim);
    const w = largura();
    drawer.setAttribute('data-aberto', aberta ? 'true' : 'false');
    body.setAttribute('data-nav', aberta ? 'aberto' : 'fechado');
    gatilhos.forEach((g) => g.setAttribute('aria-expanded', aberta ? 'true' : 'false'));
    const sobreposta = w < BP_GAVETA_FIXA;
    if (scrim) scrim.classList.toggle('open', aberta && sobreposta);
    if (w < BP_TRILHO) body.classList.toggle('nav-modal-aberta', aberta); else body.classList.remove('nav-modal-aberta');
    if (lembrar && w >= BP_GAVETA_FIXA) gravar(aberta ? '1' : '0');
  }
  function estadoInicial() {
    const w = largura();
    if (w < BP_GAVETA_FIXA) return false;
    const salvo = ler();
    if (salvo === '1') return true;
    if (salvo === '0') return false;
    return w >= BP_GAVETA_PADRAO_ABERTA;
  }

  const abrir = () => aplicar(true, { lembrar: true });
  const fechar = () => aplicar(false, { lembrar: true });
  const alternar = () => (aberta ? fechar() : abrir());
  gatilhos.forEach((g) => g.addEventListener('click', alternar));
  if (fecharBtn) fecharBtn.addEventListener('click', fechar);
  if (scrim) scrim.addEventListener('click', () => aplicar(false));
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && aberta && largura() < BP_GAVETA_FIXA) { aplicar(false); const g = gatilhos[0]; if (g && typeof g.focus === 'function') g.focus(); }
  });
  // Tocar num link da gaveta quando ela está por cima fecha (navegação no mesmo documento)
  drawer.addEventListener('click', (e) => {
    const link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (link && largura() < BP_GAVETA_FIXA) aplicar(false);
  });

  aplicar(estadoInicial());
  // Cruzou um breakpoint: recalcula (o fixo vira por cima e vice-versa)
  if (win && typeof win.matchMedia === 'function') {
    [BP_TRILHO, BP_GAVETA_FIXA].forEach((bp) => {
      const mq = win.matchMedia(`(min-width: ${bp}px)`);
      const aoCruzar = () => aplicar(estadoInicial());
      if (mq && typeof mq.addEventListener === 'function') mq.addEventListener('change', aoCruzar);
    });
  }
  return { abrir, fechar, alternar, estaAberta: () => aberta };
}

/**
 * 05/10/2026: sombra na top bar ao rolar; no celular a faixa da busca some ao descer e volta ao subir.
 */
export function setupTopbarScroll(doc, { win = doc.defaultView } = {}) {
  const topbar = doc.getElementById('topbar');
  if (!topbar || !win || typeof win.addEventListener !== 'function') return () => {};
  let ultimo = typeof win.scrollY === 'number' ? win.scrollY : 0;
  const aoRolar = () => {
    const y = win.scrollY || 0;
    topbar.classList.toggle('rolou', y > 4);
    if (y > 80 && y > ultimo + 6) topbar.classList.add('busca-oculta');
    else if (y < ultimo - 6 || y <= 80) topbar.classList.remove('busca-oculta');
    ultimo = y;
  };
  win.addEventListener('scroll', aoRolar, { passive: true });
  aoRolar();
  return () => win.removeEventListener('scroll', aoRolar);
}

/** Iniciais pro avatar: "tiago.silva@x.com" -> "TS"; sem nada -> "P". */
export function iniciaisDe(texto) {
  const base = String(texto || '').split('@')[0].split(/[^A-Za-zÀ-ÿ0-9]+/).filter(Boolean);
  if (!base.length) return 'P';
  const duas = base.length > 1 ? base[0][0] + base[1][0] : base[0].slice(0, 2);
  return duas.toUpperCase();
}

/**
 * 05/10/2026: avatar/nome da conta (a partir do token da sessão, sem chamada nova) e links da planilha.
 */
export function setupConta(doc, { token = null, spreadsheetUrl = null } = {}) {
  const payload = token ? decodeTokenPayload(token) : null;
  const email = payload && typeof payload.email === 'string' ? payload.email : '';
  const nome = payload && typeof payload.name === 'string' && payload.name ? payload.name : (email ? email.split('@')[0] : 'Minha conta');
  const ini = iniciaisDe(payload && payload.name ? payload.name : email);
  [['contaAvatar', ini], ['contaAvatar2', ini]].forEach(([id, v]) => { const el = doc.getElementById(id); if (el) el.textContent = v; });
  [['contaNome', nome], ['contaNome2', nome]].forEach(([id, v]) => { const el = doc.getElementById(id); if (el) el.textContent = v; });
  [['contaSub', email || 'Patrimônio'], ['contaSub2', email || 'Patrimônio']].forEach(([id, v]) => { const el = doc.getElementById(id); if (el) el.textContent = v; });
  if (spreadsheetUrl) aplicarLinkPlanilha(doc, spreadsheetUrl);
}

/**
 * 06/10/2026 (A-27): a URL da planilha deixou de morar no repositório
 * (config.js); a API (syncHistorico/syncStatus) devolve `planilhaUrl` e este
 * helper aponta os 3 links ("Abrir a planilha" do menu e da gaveta + "ver
 * todas" do popover de sincronização). Só aceita URL do Google Planilhas.
 */
export function aplicarLinkPlanilha(doc, url) {
  if (typeof url !== 'string' || !/^https:\/\/docs\.google\.com\/spreadsheets\//.test(url)) return false;
  ['planilhaLink', 'planilhaDrawer', 'syncSheetLink'].forEach((id) => {
    const a = doc.getElementById(id);
    if (a) a.setAttribute('href', url);
  });
  return true;
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
 * Botão "Atualizar dados" + "Atualizado às HH:MM" + timer automático,
 * reaproveitado pela Início e por Distribuições e Metas (pedido do
 * Tiago, 14/09/2026: "poderiam ter algum tipo de timer... coloque um
 * botão de atualizar"). `aoAtualizar` é o `carregarERedesenhar()` da
 * própria página — busca de novo e só redesenha depois que os dados
 * chegam, então os dados atuais continuam na tela o tempo todo; nunca
 * mostra skeleton de novo (loadingEl só é escondido 1x, nunca reexibido
 * pelas páginas). Aqui só trocamos o texto do botão pra "Atualizando…"
 * enquanto a busca está em voo.
 *
 * Quem chama já fez a 1ª busca sozinho (mesmo padrão de sempre: buscar
 * antes de desenhar) — por isso `marcarAtualizado()` existe separado de
 * `atualizar()`: registra "Atualizado às HH:MM" sem buscar de novo,
 * pra refletir a carga inicial que já aconteceu.
 *
 * Testável: `intervaloMs: 0` desliga o timer automático (evita deixar
 * um setInterval real pendurado nos testes); `setIntervalImpl`/
 * `clearIntervalImpl`/`agora` são injetáveis pelo mesmo motivo que o
 * resto do arquivo (getXImpl em todo lugar).
 */
export function mountRefreshControl(doc, container, aoAtualizar, {
  intervaloMs = 5 * 60 * 1000,
  setIntervalImpl = typeof setInterval === 'function' ? setInterval : null,
  clearIntervalImpl = typeof clearInterval === 'function' ? clearInterval : null,
  agora = () => new Date(),
} = {}) {
  // Sem lugar pro botão, atualizar() ainda busca: desde 26/09/2026 as páginas
  // fazem a 1ª carga por aqui (o botão aparece com "Atualizando…" já no início).
  if (!container) return { atualizar: async () => { await aoAtualizar(); }, marcarAtualizado: () => {}, marcarFalha: () => {}, pararTimer: () => {} };
  container.innerHTML = '';

  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = 'refresh-btn';
  btn.textContent = 'Atualizar dados';

  const status = doc.createElement('span');
  status.className = 'refresh-status';
  status.textContent = '';

  container.append(btn, status);

  function registrarFalha_() {
    // 05/10/2026: falhou -> não finge "Atualizado às"; mostra o erro e deixa tentar de novo
    status.textContent = 'Falhou ao atualizar';
    status.classList.add('erro');
  }
  function registrarAtualizacao_() {
    status.classList.remove('erro');
    const d = agora();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    status.textContent = `Atualizado às ${hh}:${mm}`;
  }

  let emAndamento = false;
  async function atualizar() {
    if (emAndamento) return;
    emAndamento = true;
    btn.disabled = true;
    btn.classList.add('carregando');
    const textoOriginal = btn.textContent;
    btn.textContent = 'Atualizando…';
    try {
      // 05/10/2026: aoAtualizar() devolvendo `false` (ou lançando) conta como falha
      let resultado;
      try { resultado = await aoAtualizar(); } catch (erro) { registrarFalha_(); return; }
      if (resultado === false) registrarFalha_(); else registrarAtualizacao_();
    } finally {
      btn.disabled = false;
      btn.classList.remove('carregando');
      btn.textContent = textoOriginal;
      emAndamento = false;
    }
  }

  btn.addEventListener('click', atualizar);

  let timer = null;
  if (intervaloMs > 0 && setIntervalImpl) {
    timer = setIntervalImpl(atualizar, intervaloMs);
    // unref: nao deixa esse timer (5 min) segurar o processo Node vivo -
    // sem isso, `node --test` trava sem imprimir o resumo final, porque um
    // setInterval real fica pendurado a cada teste que chama
    // montarPaginaInicio/montarPaginaDistribuicoesMetas de verdade. Guarda
    // defensiva pro `setIntervalImpl` injetado nos testes (tests/shell.test.js),
    // que retorna um objeto sem `.unref`.
    if (timer && typeof timer.unref === 'function') timer.unref();
  }
  function pararTimer() {
    if (timer !== null && clearIntervalImpl) clearIntervalImpl(timer);
    timer = null;
  }

  return { atualizar, marcarAtualizado: registrarAtualizacao_, marcarFalha: registrarFalha_, pararTimer };
}

/**
 * Sends the browser to the dedicated login page, remembering the
 * current path (+ query string) in ?redirect= so login.html can send
 * you right back once you're signed in. win is injectable for tests -
 * real code never touches window directly outside this one function.
 */
export function redirectParaLogin(win = window, { raizSite = resolveSiteRootUrl() } = {}) {
  const destino = win.location.pathname + win.location.search;
  // 25/09/2026 (bug do Tiago: token expirou dentro de Carteiras -> 404):
  // "login.html" relativo virava carteiras/login.html (e proventos/login.html)
  // nas páginas de subpasta - mesmo problema que resolveSiteRootUrl já
  // resolve pros links do menu. Agora sempre a login.html da raiz do site.
  win.location.href = new URL(`login.html?redirect=${encodeURIComponent(destino)}`, raizSite).href;
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
 * Categoria (Renda Fixa vs Renda Variável) inferida do texto de
 * `detalhe` gravado em "Registro de Controle" - a aba não tem uma
 * coluna própria pra isso (ver Sync.gs!gravarRegistroControle_), mas os
 * dois fluxos escrevem mensagens em formatos bem distintos e estáveis:
 * o de Renda Fixa/Índices/CDI-SELIC sempre começa com "Renda Fixa:"
 * (ver atualizarRendaFixaEIndicesDiario_, BackfillIndices.gs) e o de
 * Renda Variável (ações/FIIs/USA) sempre no formato "<N> de <M>
 * ativos..." (ver atualizarHistoricoInterno_, Sync.gs) - inclusive nas
 * linhas de teste (origem "Teste"), que reusam esse mesmo formato de
 * propósito. null quando nenhum dos dois padrões bate (mensagem
 * desconhecida) - o título cai só no status, sem categoria.
 * Pedido do Tiago (16/09/2026): mostrar isso no título de cada linha do
 * popover, já que "Sucesso"/"Atenção"/"Erro" sozinho não diz qual dos
 * dois fluxos rodou.
 */
export function categoriaSync_(detalhe) {
  if (typeof detalhe !== 'string' || !detalhe) return null;
  if (detalhe.indexOf('Renda Fixa:') === 0) return 'Renda Fixa';
  if (/^\d+ de \d+ ativos/.test(detalhe)) return 'Renda Variável (Patrimônio)';
  return null;
}

const CHAVE_RESUMO_SYNC = 'investiments_sync_resumo';
const VALIDADE_RESUMO_SYNC_MS = 15 * 60 * 1000;
const CATEGORIA_CLASSE_SYNC = { 'Renda Fixa': 'rf', 'Renda Variável (Patrimônio)': 'rv' };

/**
 * Renderiza a lista COMPLETA de "Registro de Controle" (action=
 * syncHistorico - ver Sync.gs!handleSyncHistorico/lerRegistroControle_)
 * dentro do popover - antes só a última linha aparecia lá (ver
 * renderSyncStatus, que continua cuidando só do badge/pill do topo).
 * Cada linha mostra a categoria (Renda Fixa / Renda Variável
 * (Patrimônio), ver categoriaSync_) + status no título, e o texto de
 * Detalhe fica escondido atrás de um botão "i" - pedido do Tiago
 * (16/09/2026): a lista inteira com o texto de Detalhe sempre visível
 * ficava grande e difícil de escanear rápido. `lista` é null/vazia
 * quando não há sincronização registrada ainda OU a chamada falhou -
 * os dois casos caem no mesmo texto neutro (mesmo padrão de
 * renderSyncStatus).
 */
export function renderSyncLog(doc, lista) {
  const log = doc.getElementById('syncLog');
  if (!log) return;
  log.innerHTML = '';

  if (!lista || !lista.length) {
    log.innerHTML = '<div class="hint" style="padding:9px 4px">Nenhuma sincronização registrada ainda.</div>';
    return;
  }

  lista.forEach((item, indice) => {
    const classe = STATUS_CLASSE_SYNC[item.status] || null;
    const icone = classe ? STATUS_ICONE_SYNC[classe] : 'ico-check';
    const categoria = categoriaSync_(item.detalhe);
    const categoriaClasse = categoria ? CATEGORIA_CLASSE_SYNC[categoria] : '';
    const temDetalhe = typeof item.detalhe === 'string' && item.detalhe.length > 0;
    const detalheId = `syncDetail${indice}`;

    const row = doc.createElement('div');
    row.className = 'sync-log-row';
    row.innerHTML = `
      <span class="status-ico ${classe || ''}"><svg><use href="#${icone}"/></svg></span>
      <div class="body">
        <div class="top-line">
          <span class="top-line-text">${categoria ? `<span class="sync-categoria ${categoriaClasse}">${categoria}</span> · ` : ''}${item.status}</span>
          ${temDetalhe ? `<button class="sync-info-btn" type="button" aria-expanded="false" aria-controls="${detalheId}" title="Ver detalhes">i</button>` : ''}
        </div>
        <div class="origin">${item.origem || 'planilha'} · ${formatDateTimeBR(item.timestamp)}</div>
        ${temDetalhe ? `<div class="detail" id="${detalheId}" hidden>${item.detalhe}</div>` : ''}
      </div>
    `;
    log.appendChild(row);

    if (temDetalhe) {
      const botaoInfo = row.querySelector('.sync-info-btn');
      const detalheEl = row.querySelector('.detail');
      botaoInfo.addEventListener('click', () => {
        const vaiAbrir = detalheEl.hidden;
        detalheEl.hidden = !vaiAbrir;
        botaoInfo.setAttribute('aria-expanded', String(vaiAbrir));
        botaoInfo.classList.toggle('active', vaiAbrir);
      });
    }
  });
}

/**
 * Renderiza o resultado de action=syncStatus (última linha de "Registro
 * de Controle" - ver Sync.gs!handleSyncStatus) no badge + popover do
 * topbar. `resultado` é null quando a chamada falhou (rede/token) - aí
 * o popover mantém o texto neutro em vez de fingir que sabe o status.
 * O link "Ver todas as sincronizações" aponta pra planilha (URL vinda da
 * API, ver aplicarLinkPlanilha) - "quantas sincronizações foram feitas" só
 * dá pra ver lá.
 */
export function renderSyncStatus(doc, resultado, agora = new Date(), planilhaUrl = null) {
  const badge = doc.getElementById('syncBadgeBtn');
  const log = doc.getElementById('syncLog');
  const link = doc.getElementById('syncSheetLink');
  const refreshPill = doc.getElementById('refreshPill');
  const refreshLabel = doc.getElementById('refreshLabel');

  if (planilhaUrl) aplicarLinkPlanilha(doc, planilhaUrl);

  const semDados = !resultado || !resultado.status || resultado.status === 'Sem dados';
  const classeAtual = !semDados ? STATUS_CLASSE_SYNC[resultado.status] : null;

  if (badge) {
    badge.classList.remove('good', 'warn', 'bad');
    // O ícone do badge sempre reflete a classe da ÚLTIMA sincronização
    // (mesma tabela STATUS_ICONE_SYNC já usada na linha do popover, logo
    // abaixo) - antes ficava hardcoded em #ico-check no shell.html e nunca
    // era atualizado aqui, então uma sincronização "Atenção"/"Erro"
    // continuava mostrando o ícone de check (bug relatado por print pelo
    // Tiago em 13/09/2026).
    const icone = badge.querySelector('svg use');
    if (!semDados) {
      if (classeAtual) badge.classList.add(classeAtual);
      badge.title = `Sincronização: ${resultado.status} — ${formatRelativeTime(resultado.timestamp, agora)}`;
      if (icone) icone.setAttribute('href', `#${classeAtual ? STATUS_ICONE_SYNC[classeAtual] : 'ico-check'}`);
    } else {
      badge.title = 'Sincronização: aguardando primeira verificação';
      if (icone) icone.setAttribute('href', '#ico-check');
    }
  }

  if (refreshPill || refreshLabel) {
    const texto = !semDados ? formatRelativeTime(resultado.timestamp, agora) : '--';
    if (refreshLabel) refreshLabel.textContent = texto;
    if (refreshPill) {
      refreshPill.title = !semDados
        ? `Cotações atualizadas ${texto}`
        : 'Cotações atualizadas — aguardando primeira sincronização';
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
export async function carregarStatusSync(doc, { token, getSyncHistoricoImpl = getSyncHistorico, leve = false, storage = null, agora = () => Date.now() } = {}) {
  if (!token) return;
  const st = storage || (() => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } })();
  // 05/10/2026 (A-43): na carga da página (leve) NÃO busca a lista inteira
  // (syncHistorico, até 20 linhas): pinta o badge e o aviso de consolidação
  // a partir do último resumo guardado (15 min de validade) e, se não há/
  // venceu, faz UMA busca de 1 linha. A lista completa só vem ao abrir o
  // popover (setupSyncPopoverSobDemanda).
  if (leve) {
    let guardado = null;
    try { guardado = st ? JSON.parse(st.getItem(CHAVE_RESUMO_SYNC) || 'null') : null; } catch (e) { guardado = null; }
    if (guardado && typeof guardado.ts === 'number' && agora() - guardado.ts < VALIDADE_RESUMO_SYNC_MS) {
      renderSyncStatus(doc, guardado.ultima || null, new Date(), guardado.planilhaUrl || null);
      if ('consolidacao' in guardado) renderConsolidacao(doc, guardado.consolidacao);
      return;
    }
  }
  try {
    const resposta = await getSyncHistoricoImpl(token, ...(leve ? [1] : []));
    const lista = resposta.ok ? resposta.resultado : null;
    // badge/pill sempre refletem a MAIS RECENTE (lista[0], mesmo dado que
    // action=syncStatus devolvia sozinho antes) - lista vazia (nenhuma
    // sincronização ainda) e falha de rede caem no mesmo estado neutro,
    // igual antes (ver renderSyncStatus).
    const ultima = lista && lista.length ? lista[0] : null;
    renderSyncStatus(doc, ultima, new Date(), resposta.ok ? resposta.planilhaUrl : null);
    if (!leve) renderSyncLog(doc, lista);
    // 26/09/2026: aviso "Consolidação necessária" (Consolidacao.gs) vem junto
    if (resposta.ok && 'consolidacao' in resposta) renderConsolidacao(doc, resposta.consolidacao);
    if (resposta.ok && st) {
      try { st.setItem(CHAVE_RESUMO_SYNC, JSON.stringify({ ts: agora(), planilhaUrl: typeof resposta.planilhaUrl === 'string' ? resposta.planilhaUrl : null, ultima: ultima ? { timestamp: ultima.timestamp, origem: ultima.origem, status: ultima.status } : null, consolidacao: 'consolidacao' in resposta ? resposta.consolidacao : null })); } catch (e) { /* só conveniência */ }
    }
  } catch (error) {
    console.error('shell.js: falha ao carregar o status de sincronização', error);
    renderSyncStatus(doc, null);
    renderSyncLog(doc, null);
  }
}

/**
 * 05/10/2026 (A-43): a lista completa do Registro de Controle só é buscada
 * quando o popover de sincronização ABRE (no máximo 1x a cada 30 s).
 */
export function setupSyncPopoverSobDemanda(doc, { token, carregarStatusSyncImpl = carregarStatusSync, agora = () => Date.now() } = {}) {
  const btn = doc.querySelector('[data-toggle-panel="syncPanel"]');
  if (!btn || !token) return;
  let ultima = 0;
  btn.addEventListener('click', () => {
    if (btn.getAttribute('aria-expanded') !== 'true') return; // fechando
    if (agora() - ultima < 30000) return;
    ultima = agora();
    carregarStatusSyncImpl(doc, { token });
  });
}

/**
 * Wires #syncNowBtn ("Sincronizar tudo", dentro do popover "Registro de
 * Controle") pra rodar uma sincronização manual completa (ações/FIIs/USA +
 * Renda Fixa/Índices/CDI/SELIC + proventos e informes dos FIIs no FNet),
 * e os botões [data-sync] pra forçar só uma delas; recarrega o popover com
 * o resultado ao final.
 *
 * 14/09/2026: pedido do Tiago - o botão já existia no HTML (assets/
 * partials/shell.html) mas nunca tinha sido ligado a nada (nenhum
 * addEventListener em lugar nenhum do JS) - clicar nele não fazia
 * literalmente nada. syncNowImpl/carregarStatusSyncImpl são injetáveis
 * pros testes, mesmo padrão do resto do arquivo (getTokenImpl etc.).
 * Nunca lança - mesmo padrão de resiliência parcial do resto do shell
 * (ver carregarStatusSync): uma falha de rede aqui não pode quebrar a
 * página, só deixa o popover sem se atualizar.
 */
export function setupSyncNowButton(doc, { token, syncNowImpl = syncNow, syncRendaFixaEIndicesImpl = syncRendaFixaEIndices, syncProventosFnetImpl = syncProventosFnet, syncInformesFnetImpl = syncInformesFnet, syncVideosImpl = syncVideos, carregarStatusSyncImpl = carregarStatusSync } = {}) {
  const button = doc.getElementById('syncNowBtn');
  if (!button || !token) return;

  // 25/09/2026 (Tiago: "agora temos pelo menos tres syncs, preciso ter a
  // opção de clicar em um botão para cada sincronização ser forçada quando
  // eu quiser"): as 4 rotinas que os gatilhos diários rodam, cada uma com
  // seu botão ([data-sync="..."] no popover), e "Sincronizar tudo"
  // (#syncNowBtn) roda as 4 em sequência. Cada uma é uma requisição
  // SEPARADA (nunca combinadas numa só - ver o comentário de
  // syncRendaFixaEIndices em api-client.js pro motivo) e cada uma no seu
  // próprio try/catch: uma falhar não impede as outras nem trava os botões.
  const passos = {
    ativos: { impl: syncNowImpl, rotulo: 'ações/FIIs/USA' },
    rendaFixa: { impl: syncRendaFixaEIndicesImpl, rotulo: 'Renda Fixa/Índices' },
    proventos: { impl: syncProventosFnetImpl, rotulo: 'proventos (FNet)' },
    informes: { impl: syncInformesFnetImpl, rotulo: 'informes dos FIIs (FNet)' },
    // 25/09/2026: vídeos dos canais do YouTube (Videos.gs, gatilho de 6h)
    videos: { impl: syncVideosImpl, rotulo: 'vídeos (YouTube)' },
  };
  const ordemTudo = ['ativos', 'rendaFixa', 'proventos', 'informes', 'videos'];
  const individuais = Array.from(doc.querySelectorAll('[data-sync]')).filter((el) => passos[el.dataset.sync]);
  const todos = [button, ...individuais];
  let ocupado = false;

  async function rodar(ids, botao) {
    if (ocupado) return;
    ocupado = true;
    const textos = todos.map((el) => el.textContent);
    todos.forEach((el) => { el.disabled = true; });
    for (let i = 0; i < ids.length; i += 1) {
      botao.textContent = ids.length > 1 ? `Sincronizando ${i + 1}/${ids.length}…` : 'Sincronizando…';
      try {
        await passos[ids[i]].impl(token);
      } catch (error) {
        console.error(`shell.js: falha ao sincronizar ${passos[ids[i]].rotulo}`, error);
      }
    }
    await carregarStatusSyncImpl(doc, { token });
    todos.forEach((el, i) => { el.disabled = false; el.textContent = textos[i]; });
    ocupado = false;
  }

  button.addEventListener('click', () => rodar(ordemTudo, button));
  individuais.forEach((el) => el.addEventListener('click', () => rodar([el.dataset.sync], el)));
}

// ---------------------------------------------------------------------------
// 26/09/2026: "Consolidação necessária" (Tiago: "algo parecido com a Kinvo:
// ele mostra uma notificação 'Consolidação necessária', onde clico, e tudo é
// atualizado"). Aparece no topo quando entram transações/ativos novos
// (Lancamentos.gs / NovoAtivo.gs marcam, Consolidacao.gs guarda); o clique
// roda as rodadas de action=consolidar e recarrega a página com tudo novo.
// ---------------------------------------------------------------------------

function escHtml_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Frase curta do que falta (ativos, renda fixa). */
export function resumoPendenciaConsolidacao(estado) {
  if (!estado || !estado.pendente) return '';
  const partes = [];
  const ativos = [...new Set([...(estado.ativos || []), ...(estado.precos || [])])];
  if (ativos.length) partes.push(`${ativos.length === 1 ? 'histórico de' : 'históricos de'} ${ativos.slice(0, 6).join(', ')}${ativos.length > 6 ? ` e mais ${ativos.length - 6}` : ''}`);
  if (estado.rf) partes.push('Renda Fixa');
  return partes.join(' · ');
}

/** Mostra/esconde o aviso no topo. estado = resumoConsolidacao_ do back-end (ou null = não sabe: não mexe). */
export function renderConsolidacao(doc, estado) {
  const wrap = doc.getElementById('consolWrap');
  if (!wrap || estado === undefined) return;
  const pendente = !!(estado && estado.pendente);
  if (wrap.dataset.rodando === '1') return; // no meio de uma consolidação: quem manda é o botão
  wrap.hidden = !pendente;
  if (!pendente) return;
  const btn = doc.getElementById('consolBtn');
  if (btn) btn.title = `Consolidação necessária: ${resumoPendenciaConsolidacao(estado)}`;
  const oque = doc.getElementById('consolOque');
  if (oque) oque.textContent = resumoPendenciaConsolidacao(estado);
  const lista = doc.getElementById('consolMotivos');
  if (lista) {
    const motivos = (estado.motivos || []).slice(0, 5);
    lista.innerHTML = motivos.length
      ? motivos.map((m) => `<li><span>${escHtml_(m.texto)}</span>${m.quando ? `<small>${escHtml_(formatDateTimeBR(m.quando))}</small>` : ''}</li>`).join('')
      : '';
    lista.hidden = !motivos.length;
  }
}

/**
 * Liga o botão "Consolidar agora" (#consolGo) e os avisos vindos das telas
 * (window 'consolidacao:pendente' = mostra; 'consolidacao:abrir' = abre o
 * painel). Ao terminar: limpa o cache deste aparelho e recarrega.
 */
export function setupConsolidacao(doc, { token, consolidarImpl = consolidar, limparCacheLocalImpl = limparCacheLocalNavegador, win = doc.defaultView, setTimeoutImpl = typeof setTimeout !== 'undefined' ? setTimeout : undefined } = {}) {
  const wrap = doc.getElementById('consolWrap');
  const go = doc.getElementById('consolGo');
  if (!wrap || !go || !token) return;
  const progresso = doc.getElementById('consolProgresso');
  const painel = doc.getElementById('consolPanel');
  const btn = doc.getElementById('consolBtn');

  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('consolidacao:pendente', (ev) => renderConsolidacao(doc, ev.detail || null));
    win.addEventListener('consolidacao:abrir', () => {
      if (wrap.hidden) wrap.hidden = false;
      if (painel && !painel.classList.contains('open') && btn) btn.click();
    });
  }

  const linhas = [];
  function mostrarProgresso(rodape = '') {
    if (!progresso) return;
    const html = linhas.join('') + rodape;
    progresso.hidden = !html;
    progresso.innerHTML = html;
  }
  const passo = (texto, cls = '') => `<div class="consol-passo${cls ? ` ${cls}` : ''}">${texto}</div>`;

  async function rodar(tudo) {
    if (go.disabled) return;
    go.disabled = true;
    wrap.dataset.rodando = '1';
    wrap.classList.add('rodando');
    const textoOriginal = go.textContent;
    go.innerHTML = '<span class="spinner" aria-hidden="true"></span>Consolidando…';
    linhas.length = 0;
    mostrarProgresso(passo('Recalculando o histórico…'));
    let resposta = null;
    try {
      resposta = await consolidarImpl(token, {
        tudo,
        onRodada: (r) => {
          (r.feito || []).forEach((f) => linhas.push(passo(escHtml_(f), 'ok')));
          const rodape = r.status === 'ocupado' ? passo('Esperando a sincronização que está rodando terminar…')
            : (r.continuar ? passo('Próxima etapa…') : '');
          mostrarProgresso(rodape);
        },
      });
    } catch (error) {
      resposta = { ok: false, erro: String(error) };
    }
    delete wrap.dataset.rodando;
    wrap.classList.remove('rodando');
    if (!resposta || !resposta.ok) {
      mostrarProgresso(passo(`Não deu pra consolidar: ${escHtml_((resposta && resposta.erro) || 'erro desconhecido')}. Tenta de novo em instantes.`, 'erro'));
      go.disabled = false;
      go.textContent = textoOriginal;
      return;
    }
    const r = resposta.resultado || {};
    (r.avisos || []).forEach((a) => linhas.push(passo(escHtml_(a), 'aviso')));
    if (r.incompleto || r.continuar) {
      mostrarProgresso(passo('Ainda falta um pedaço (o histórico de preços de ativo novo pode levar mais de uma rodada) - clique em Continuar.'));
      go.disabled = false;
      go.textContent = 'Continuar';
      return;
    }
    mostrarProgresso(passo('<b>Pronto.</b> Recarregando com tudo atualizado…', 'ok'));
    const avisos = (r.avisos || []).length;
    go.textContent = 'Consolidado ✓';
    try { await limparCacheLocalImpl(); } catch (_) { /* segue */ }
    if (win && win.location && setTimeoutImpl) setTimeoutImpl(() => win.location.reload(), avisos ? 3500 : 1400);
  }

  go.addEventListener('click', () => rodar(false));
  // "Recalcular histórico" (Registro de Controle): refaz o histórico de TODOS os ativos com as transações de hoje
  doc.querySelectorAll('[data-consolidar-tudo]').forEach((b) => b.addEventListener('click', () => {
    if (go.disabled) return;
    wrap.hidden = false;
    const oque = doc.getElementById('consolOque');
    if (oque) oque.textContent = 'Recalcular o histórico de todos os ativos e da Renda Fixa';
    if (painel && !painel.classList.contains('open') && btn) btn.click();
    rodar(true);
  }));
}

/**
 * 25/09/2026 (Tiago: "ao clicar em limpar cache, ainda to recebendo cache
 * de quando entro em uma tela de ativo.. quero que tudo seja limpo"): o
 * lado do NAVEGADOR do botão "Limpar cache" - apaga as respostas guardadas
 * no IndexedDB (cache-dados.js: Início, Distribuições, Carteiras,
 * Proventos e cada tela de ativo) e o Cache Storage do service worker
 * (ícones/fontes - sw.js). NÃO mexe no login (token) nem nas preferências
 * de tela (tema, R$/US$, filtros de Proventos) - isso não é cache.
 * Nunca lança.
 */
export async function limparCacheLocalNavegador({ limparCacheDadosImpl = limparCacheDados, cachesImpl = typeof caches !== 'undefined' ? caches : undefined } = {}) {
  try { await limparCacheDadosImpl(); } catch (_) { /* segue */ }
  if (!cachesImpl) return;
  try {
    const nomes = await cachesImpl.keys();
    await Promise.all(nomes.map((nome) => cachesImpl.delete(nome)));
  } catch (_) { /* segue */ }
}

/**
 * Wires #limparCacheBtn (dentro do popover "Registro de Controle", ao
 * lado do "Sincronizar agora") - botão "Limpar cache" pedido pelo Tiago
 * em 17/09/2026, depois de um caso real: corrigiu um valor ruim do
 * Ibovespa direto na célula da planilha e o app continuou mostrando o
 * número velho por até 6h (o cache da série combinada só percebe linha
 * NOVA/removida, nunca um valor editado no lugar - ver
 * apps-script/HistoricoInicio.gs!limparCacheHistoricoInicio_). Ação
 * deliberadamente SEPARADA de "Sincronizar agora" - a maioria dos syncs
 * não corrige nada manualmente na planilha, então limpar esse cache
 * sempre que sincroniza jogaria fora uma otimização que normalmente é
 * válida; este botão é a válvula de escape só pra quando precisa.
 *
 * Depois de limpar com sucesso, recarrega a página (winImpl.location.
 * reload()) num pequeno atraso - dá tempo do texto de confirmação
 * aparecer antes da tela sumir, e garante que a PRÓXIMA leitura da Home
 * (ou de qualquer página aberta) vem fresca de verdade, sem precisar o
 * Tiago lembrar de atualizar sozinho. winImpl/setTimeoutImpl são
 * injetáveis pros testes (mesmo padrão de winImpl em setupAuthGate) -
 * sem win (ambiente de teste), pula o reload.
 */
export function setupLimparCacheButton(doc, { token, limparCacheHistoricoImpl = limparCacheHistorico, limparCacheLocalImpl = limparCacheLocalNavegador, win = typeof window !== 'undefined' ? window : undefined, setTimeoutImpl = typeof setTimeout !== 'undefined' ? setTimeout : undefined } = {}) {
  const button = doc.getElementById('limparCacheBtn');
  if (!button || !token) return;

  button.addEventListener('click', async () => {
    if (button.disabled) return;
    const textoOriginal = button.textContent;
    button.disabled = true;
    button.textContent = 'Limpando…';
    // 25/09/2026: o cache DESTE aparelho (IndexedDB de todas as telas,
    // inclusive "ativo:<ticker>") some junto - começa já, em paralelo com o
    // servidor, e sempre termina antes do reload. Nunca lança.
    const limpezaLocal = Promise.resolve().then(() => limparCacheLocalImpl()).catch(() => {});
    try {
      const resposta = await limparCacheHistoricoImpl(token);
      await limpezaLocal;
      if (!resposta || !resposta.ok) throw new Error((resposta && resposta.erro) || 'resposta inválida do servidor');
      button.textContent = 'Cache limpo ✓';
      if (win && setTimeoutImpl) {
        setTimeoutImpl(() => win.location.reload(), 900);
        return; // a página vai recarregar - não reabilita o botão à toa
      }
    } catch (error) {
      console.error('shell.js: falha ao limpar o cache do histórico', error);
      button.textContent = 'Falhou - tenta de novo';
    }
    button.disabled = false;
    button.textContent = textoOriginal;
  });
}

/**
 * Decides, once per page load, whether <main> can be shown right away
 * or the browser needs to leave for login.html — see the header
 * comment above ("Login gate"). getTokenImpl/redirectImpl are
 * injectable for tests, same pattern as setupThemeToggle takes its two
 * theme.js functions as params.
 */
export function setupAuthGate(doc, { onAuthenticated = () => {}, getTokenImpl = getToken, redirectImpl = redirectParaLogin, carregarStatusSyncImpl = carregarStatusSync, setupSyncNowButtonImpl = setupSyncNowButton, setupLimparCacheButtonImpl = setupLimparCacheButton, setupConsolidacaoImpl = setupConsolidacao, win = typeof window !== 'undefined' ? window : undefined } = {}) {
  const token = getTokenImpl();
  if (token) {
    setMainVisible(doc, true);
    setupConsolidacaoImpl(doc, { token }); // antes das telas: elas podem avisar logo no 1º carregamento
    onAuthenticated(token);
    carregarStatusSyncImpl(doc, { token, leve: true }); // 05/10/2026 (A-43): carga leve; a lista inteira só ao abrir o popover
    try { setupSyncPopoverSobDemanda(doc, { token, carregarStatusSyncImpl }); } catch (e) { /* o popover só perde a busca ao abrir */ }
    setupSyncNowButtonImpl(doc, { token });
    setupLimparCacheButtonImpl(doc, { token });
    return;
  }

  setMainVisible(doc, false);
  redirectImpl(win);
}

/**
 * 05/10/2026 (A-44): ao sair, o aparelho não pode continuar mostrando o
 * patrimônio "deslogado": apaga o IndexedDB das respostas (cache-dados.js:
 * Início com o histórico inteiro, Carteiras, Proventos, Ativo...), o Cache
 * Storage do service worker e as chaves `investiments_*` do localStorage/
 * sessionStorage (aportes pendentes, resumo da sincronização, token). O TEMA
 * (`investiments_theme`) é preferência de tela, não dado - fica. Nunca lança.
 */
export const CHAVES_LOCAIS_MANTIDAS_NO_LOGOUT = ['investiments_theme'];
export async function limparDadosLocaisDaSessao({ limparCacheLocalImpl = limparCacheLocalNavegador, storages = null } = {}) {
  const lista = storages || (() => {
    const r = [];
    try { if (typeof localStorage !== 'undefined') r.push(localStorage); } catch (e) { /* bloqueado */ }
    try { if (typeof sessionStorage !== 'undefined') r.push(sessionStorage); } catch (e) { /* bloqueado */ }
    return r;
  })();
  lista.forEach((st) => {
    try {
      const chaves = [];
      for (let i = 0; i < st.length; i += 1) chaves.push(st.key(i));
      chaves.filter((k) => typeof k === 'string' && k.startsWith('investiments_') && !CHAVES_LOCAIS_MANTIDAS_NO_LOGOUT.includes(k))
        .forEach((k) => { try { st.removeItem(k); } catch (e) { /* segue */ } });
    } catch (e) { /* segue */ }
  });
  try { await limparCacheLocalImpl(); } catch (e) { /* segue */ }
}

/** 25/09/2026: botão "Sair" do topo - esquece a sessão deste aparelho e vai pro login. */
export function setupLogoutButton(doc, { clearTokenImpl = clearToken, redirectImpl = redirectParaLogin, win = doc.defaultView, limparDadosImpl = limparDadosLocaisDaSessao, esperaMaxMs = 1500 } = {}) {
  const btn = doc.getElementById('logoutBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    clearTokenImpl();
    // 05/10/2026 (A-44): limpa também os dados guardados no aparelho; o login não espera mais que 1,5 s por isso
    let limpeza = Promise.resolve();
    try { limpeza = Promise.resolve(limparDadosImpl()); } catch (e) { /* segue */ }
    let ja = false;
    const ir = () => { if (!ja) { ja = true; redirectImpl(win); } };
    limpeza.then(ir, ir);
    const tempo = setTimeout(ir, esperaMaxMs);
    if (tempo && typeof tempo.unref === 'function') tempo.unref();
  });
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
    fixNavLinkHrefs(doc, options.siteRootUrl || resolveSiteRootUrl());
    markActiveSection(doc, doc.body.dataset.section || null);
    setupPopovers(doc);
    setupThemeToggle(doc, { initTheme, toggleTheme });
    setupLogoutButton(doc);
    // 05/10/2026: navegação nova (trilho + gaveta), top bar, busca e conta; cada um isolado pra não derrubar o resto
    const win = doc.defaultView;
    const tokenSessao = (() => { try { return getToken(); } catch (e) { return null; } })();
    try { setupNavDrawer(doc, { win }); } catch (e) { console.error('shell.js: gaveta', e); }
    try { setupTopbarScroll(doc, { win }); } catch (e) { console.error('shell.js: scroll da top bar', e); }
    try { setupConta(doc, { token: tokenSessao }); } catch (e) { console.error('shell.js: conta', e); }
    try { montarBuscaGlobal(doc, { raizSite: options.siteRootUrl || resolveSiteRootUrl(), ler: lerCacheDados, win }); } catch (e) { console.error('shell.js: busca', e); }
    // 05/10/2026: carrinho em andamento (Transações) no header + aviso "Você comprou?" quando expira
    let carrinhoHeader = null;
    try { carrinhoHeader = setupCarrinhoHeader(doc); } catch (erroCarrinho) { console.error('shell.js: carrinho do header', erroCarrinho); }
    // 06/10/2026: com o login, o header busca os aportes "aguardando valores finais" (qualquer tela/aparelho)
    if (carrinhoHeader && typeof carrinhoHeader.definirToken === 'function') {
      const tokenAgora = (() => { try { return getToken(); } catch (e) { return null; } })();
      if (tokenAgora) { try { carrinhoHeader.definirToken(tokenAgora); } catch (e) { /* o resto da tela segue */ } }
    }
    setupAuthGate(doc, {
      onAuthenticated: (token) => {
        try { setupConta(doc, { token }); } catch (e) { /* avatar genérico */ }
        if (typeof options.onAuthenticated === 'function') return options.onAuthenticated(token);
        return undefined;
      },
    });
  } catch (error) {
    console.error('shell.js: failed to mount the shell', error);
  }

  await registerServiceWorker(options.serviceWorkerUrl || resolveServiceWorkerUrl(), options.navigator);
}
