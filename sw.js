/**
 * sw.js — service worker for the installable PWA shell.
 *
 * Scope: this file lives at the repo root, so its default scope covers
 * every page (root and every subfolder — carteiras/, transacoes/, etc.)
 * without needing an explicit {scope} option at registration time.
 * Registered from assets/js/shell.js (registerServiceWorker()), not from
 * a <script> in each page's <head> — one place instead of repeated logic
 * per page, matching how shell.js already owns every other piece of
 * cross-page wiring.
 *
 * What gets cached, and what never does:
 *   - CSS/JS (destination style/script) → network-first, same as HTML
 *     navigations (see below). Revised 13/09/2026: these were
 *     cache-first until a real bug showed exactly why that's wrong
 *     during active development - a code edit to shell.css/shell.js
 *     landed on disk, but a browser that had already cached the OLD
 *     version (from an earlier visit, under this same CACHE_VERSION)
 *     kept silently serving it on every reload - no error, just stale
 *     code that looked "broken" because it didn't match the source
 *     anymore. Icons/fonts/the manifest genuinely don't change often,
 *     so they stay cache-first below - CSS/JS do change often, right
 *     up until this app is finished, so "always try the network first"
 *     is worth the (imperceptible, same-origin, tiny-file) latency cost
 *     for a single-user app.
 *   - Icons/fonts/manifest (destination image/font/manifest) →
 *     cache-first. A miss falls back to the network and caches the
 *     result.
 *   - HTML pages (navigations) → network-first. A code update should
 *     reach you on the very next visit; the cached copy is only a
 *     fallback for when the network request itself fails (e.g. opening
 *     the installed app with no connection), not the first choice.
 *   - Everything else (any cross-origin request — Apps Script Web App,
 *     GOOGLEFINANCE via Apps Script, the Banco Central SGS API — and any
 *     non-GET request) → never intercepted, never cached. This worker
 *     only ever calls event.respondWith() for same-origin GET requests;
 *     for everything else it does nothing, so the browser's normal
 *     network fetch runs untouched. Financial data must always be
 *     fresh, never served from this cache.
 *
 * 06/10/2026 (A-42, v6): estratégias por tipo -
 *   - JS: continua network-first com revalidação ('no-cache'). Não vira stale-while-revalidate: os módulos ES do site não têm hash
 *     no nome (o site é publicado direto da branch, sem build), então servir cada módulo do cache e atualizar depois pode juntar
 *     módulos de versões diferentes numa mesma carga (A novo importando um nome que o B antigo não exporta = página quebrada até
 *     recarregar). A cascata de módulos que isso custava foi atacada no HTML (<link rel="modulepreload">: todos os módulos do
 *     caminho crítico saem em paralelo, ~1 RTT) e na divisão por rota (import() lazy).
 *   - CSS e imagens/manifest: stale-while-revalidate - o CSS bloqueia a 1ª pintura, então na visita seguinte vem do cache na hora e
 *     é atualizado em segundo plano (a mudança aparece na carga seguinte). Mudou muito um CSS e quer que apareça já? Suba CACHE_VERSION.
 *   - Fontes: cache-first (não mudam). HTML: network-first, com navigation preload (a requisição da página sai em paralelo
 *     com a partida do worker).
 *
 * CACHE_VERSION bumped to v2 in the same change (13/09/2026) - forces a
 * one-time cleanup of whatever got stuck under v1's cache-first CSS/JS
 * (the activate handler below already deletes any cache name that
 * doesn't match the current CACHE_NAME).
 */

const CACHE_VERSION = 'v22'; // v22: "Para ficar no lucro" - quantas cotas comprar pra sair do prejuízo (08/10/2026); v21: Etapa 0 - etag das leituras e desempenho por tela (08/10/2026); v20: conta Google sem acesso (08/10/2026); v19: aviso de autorização do Apps Script (08/10/2026); v18: lançamentos - linha recusada pela validação da planilha (07/10/2026); v17: fundo de investimento na Renda Fixa - Sobre o fundo, cota real x estimativa, logo (07/10/2026); v16: "Colar uma tabela" em Transações › Lançamentos (07/10/2026); v15: terceiro destino da Renda Fixa, Reservado para objetivos (07/10/2026); v14: Metas - meta sem alvo, aporte crescente, estimativas e investimento fora da carteira (07/10/2026); v10: Início com hero "Patrimônio líquido" + Metas, "Investimentos" no lugar de "Patrimônio total" (07/10/2026); v9: documentos (07/10/2026) - parcial, encerrados, remover vários; v8: fontes servidas pelo próprio site (assets/fonts, 06/10/2026) - sem Google Fonts; v6: A-42 (06/10/2026) - divisão por rota (import() lazy), comum-telas.css, SWR de CSS/imagens; v5: Onda 3 M3 (06/10/2026) - m3-tokens.css, components.css, charts.css, assets/js/ui/*, assets/js/charts/*; v4: logo novo (05/10/2026)
const CACHE_NAME = `patrimonio-shell-${CACHE_VERSION}`;

// Requests whose `destination` marks them as the static shell rather
// than a page navigation or a data call.
const STATIC_DESTINATIONS = new Set(['font']); // cache-first
const REVALIDATE_DESTINATIONS = new Set(['image', 'manifest', 'style']); // stale-while-revalidate (06/10/2026, A-42)

self.addEventListener('install', (event) => {
  // Activate this version as soon as it finishes installing, instead of
  // waiting for every open tab of the old version to close - the app is
  // small enough that "reload once and you're on the new version" is
  // the behavior worth optimizing for.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith('patrimonio-shell-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
      // 06/10/2026 (A-42): a requisição da página sai junto com a partida do worker (event.preloadResponse, usado em networkFirst)
      if (self.registration && self.registration.navigationPreload) {
        try { await self.registration.navigationPreload.enable(); } catch (error) { /* só otimização */ }
      }
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

// 06/10/2026 (A-42): responde do cache na hora e atualiza em segundo plano (a versão nova vale da carga seguinte). Sem cópia
// no cache, vai à rede (revalidando, como CSS/JS sempre foram). `event.waitUntil` mantém o worker vivo até o cache atualizar.
async function staleWhileRevalidate(event, request) {
  const cached = await caches.match(request);
  const atualizar = (async () => {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  })();
  if (cached) {
    if (typeof event.waitUntil === 'function') event.waitUntil(atualizar.catch(() => {}));
    return cached;
  }
  return atualizar;
}

// 26/09/2026 (v3): CSS/JS vão com cache 'no-cache' - o fetch do worker também
// passa pelo cache HTTP do navegador, e o GitHub Pages manda max-age=600: sem
// isso, logo depois de um deploy, um JS novo podia rodar com um CSS (ou outro
// módulo) de até 10 min atrás. Navegação não aceita RequestInit (TypeError),
// então ela segue como antes.
async function networkFirst(request, { revalidar = false, preload = null } = {}) {
  try {
    const doPreload = preload ? await preload : null; // navigation preload (undefined/null quando não há)
    const response = doPreload || await (revalidar ? fetch(request, { cache: 'no-cache' }) : fetch(request));
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only ever handle same-origin GET requests - everything else (any
  // cross-origin call, any POST) passes straight through untouched.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (STATIC_DESTINATIONS.has(request.destination)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // CSS, imagens e manifest: stale-while-revalidate (ver o cabeçalho). Navegações e JS: network-first, abaixo.
  if (REVALIDATE_DESTINATIONS.has(request.destination) && request.mode !== 'navigate') {
    event.respondWith(staleWhileRevalidate(event, request));
    return;
  }

  // Navigations (HTML pages) AND JS (destination script) - both go network-first, see the header comment above.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkFirst(request, { preload: event.preloadResponse }));
  } else if (request.destination === 'script') {
    event.respondWith(networkFirst(request, { revalidar: true }));
  }
  // Anything else same-origin (e.g. a fetch() with no `destination`,
  // like the shell.html partial fetched via shell.js!fetchShellPartial)
  // is left alone too - only the destinations named above are ever
  // handled by this worker.
});
