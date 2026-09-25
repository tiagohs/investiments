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
import { getToken, clearToken } from './auth.js';
import { getSyncHistorico, syncNow, syncRendaFixaEIndices, syncProventosFnet, syncInformesFnet, syncVideos, limparCacheHistorico } from './api-client.js';
import { formatDateTimeBR, formatRelativeTime } from './format.js';
import { SPREADSHEET_URL } from './config.js';
import { limparCacheDados } from './cache-dados.js';

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
  doc.querySelectorAll('#mainnav .nav-link[href]').forEach((link) => {
    link.setAttribute('href', new URL(link.getAttribute('href'), rootUrl).href);
  });
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
  if (!container) return { atualizar: async () => {}, marcarAtualizado: () => {}, pararTimer: () => {} };
  container.innerHTML = '';

  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = 'refresh-btn';
  btn.textContent = 'Atualizar dados';

  const status = doc.createElement('span');
  status.className = 'refresh-status';
  status.textContent = '';

  container.append(btn, status);

  function registrarAtualizacao_() {
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
      await aoAtualizar();
      registrarAtualizacao_();
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

  return { atualizar, marcarAtualizado: registrarAtualizacao_, pararTimer };
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
 * O link "Ver todas as sincronizações" é sempre a mesma URL real da
 * planilha (config.js!SPREADSHEET_URL) - a API só devolve a última
 * linha, então "quantas sincronizações foram feitas" só dá pra ver lá.
 */
export function renderSyncStatus(doc, resultado, agora = new Date()) {
  const badge = doc.getElementById('syncBadgeBtn');
  const log = doc.getElementById('syncLog');
  const link = doc.getElementById('syncSheetLink');
  const refreshPill = doc.getElementById('refreshPill');
  const refreshLabel = doc.getElementById('refreshLabel');

  if (link) link.href = SPREADSHEET_URL;

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
export async function carregarStatusSync(doc, { token, getSyncHistoricoImpl = getSyncHistorico } = {}) {
  if (!token) return;
  try {
    const resposta = await getSyncHistoricoImpl(token);
    const lista = resposta.ok ? resposta.resultado : null;
    // badge/pill sempre refletem a MAIS RECENTE (lista[0], mesmo dado que
    // action=syncStatus devolvia sozinho antes) - lista vazia (nenhuma
    // sincronização ainda) e falha de rede caem no mesmo estado neutro,
    // igual antes (ver renderSyncStatus).
    renderSyncStatus(doc, lista && lista.length ? lista[0] : null);
    renderSyncLog(doc, lista);
  } catch (error) {
    console.error('shell.js: falha ao carregar o status de sincronização', error);
    renderSyncStatus(doc, null);
    renderSyncLog(doc, null);
  }
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
export function setupAuthGate(doc, { onAuthenticated = () => {}, getTokenImpl = getToken, redirectImpl = redirectParaLogin, carregarStatusSyncImpl = carregarStatusSync, setupSyncNowButtonImpl = setupSyncNowButton, setupLimparCacheButtonImpl = setupLimparCacheButton, win = typeof window !== 'undefined' ? window : undefined } = {}) {
  const token = getTokenImpl();
  if (token) {
    setMainVisible(doc, true);
    onAuthenticated(token);
    carregarStatusSyncImpl(doc, { token });
    setupSyncNowButtonImpl(doc, { token });
    setupLimparCacheButtonImpl(doc, { token });
    return;
  }

  setMainVisible(doc, false);
  redirectImpl(win);
}

/** 25/09/2026: botão "Sair" do topo - esquece a sessão deste aparelho e vai pro login. */
export function setupLogoutButton(doc, { clearTokenImpl = clearToken, redirectImpl = redirectParaLogin, win = doc.defaultView } = {}) {
  const btn = doc.getElementById('logoutBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    clearTokenImpl();
    redirectImpl(win);
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
    setupAuthGate(doc, { onAuthenticated: options.onAuthenticated });
  } catch (error) {
    console.error('shell.js: failed to mount the shell', error);
  }

  await registerServiceWorker(options.serviceWorkerUrl || resolveServiceWorkerUrl(), options.navigator);
}
