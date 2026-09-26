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
 * CACHE_VERSION bumped to v2 in the same change (13/09/2026) - forces a
 * one-time cleanup of whatever got stuck under v1's cache-first CSS/JS
 * (the activate handler below already deletes any cache name that
 * doesn't match the current CACHE_NAME).
 */

const CACHE_VERSION = 'v3';
const CACHE_NAME = `patrimonio-shell-${CACHE_VERSION}`;

// Requests whose `destination` marks them as the static shell rather
// than a page navigation or a data call.
const STATIC_DESTINATIONS = new Set(['image', 'font', 'manifest']);

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

// 26/09/2026 (v3): CSS/JS vão com cache 'no-cache' - o fetch do worker também
// passa pelo cache HTTP do navegador, e o GitHub Pages manda max-age=600: sem
// isso, logo depois de um deploy, um JS novo podia rodar com um CSS (ou outro
// módulo) de até 10 min atrás. Navegação não aceita RequestInit (TypeError),
// então ela segue como antes.
async function networkFirst(request, { revalidar = false } = {}) {
  try {
    const response = await (revalidar ? fetch(request, { cache: 'no-cache' }) : fetch(request));
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

  // Navigations (HTML pages) AND now CSS/JS too (destination style/
  // script) - both go network-first, see the header comment above.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkFirst(request));
  } else if (request.destination === 'style' || request.destination === 'script') {
    event.respondWith(networkFirst(request, { revalidar: true }));
  }
  // Anything else same-origin (e.g. a fetch() with no `destination`,
  // like the shell.html partial fetched via shell.js!fetchShellPartial)
  // is left alone too - only the destinations named above are ever
  // handled by this worker.
});
