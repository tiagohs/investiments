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
 *   - Static assets (CSS/JS/icons/manifest) → cache-first. These rarely
 *     change; serving straight from cache makes the app open instantly,
 *     and a miss falls back to the network and caches the result.
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
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `patrimonio-shell-${CACHE_VERSION}`;

// Requests whose `destination` marks them as the static shell rather
// than a page navigation or a data call.
const STATIC_DESTINATIONS = new Set(['style', 'script', 'image', 'font', 'manifest']);

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

async function networkFirst(request) {
  try {
    const response = await fetch(request);
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

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (STATIC_DESTINATIONS.has(request.destination)) {
    event.respondWith(cacheFirst(request));
  }
  // Anything else same-origin (e.g. a fetch() with no `destination`,
  // like a same-origin XHR) is left alone too - only known-static
  // destinations and navigations are ever cached.
});
