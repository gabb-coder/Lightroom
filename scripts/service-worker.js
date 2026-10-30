/* Darkroom service worker (M33). Template: vite.config.ts fills in the
 * version and the list of built files at build time (dist/sw.js).
 *
 * - Install: precache every built file, so the app also starts offline.
 * - Page loads: network first (new deploys show up), the cached page offline.
 * - Built files: cache first (their names change with their content).
 * Only same-origin GET requests are handled; photos never leave the browser
 * anyway (they live in IndexedDB). Lookups ignore Vary (servers add
 * "Vary: Origin" or "Accept-Encoding"; these files don't vary).
 */
const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = `darkroom-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('darkroom-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(() => caches.match('/', { cacheName: CACHE, ignoreVary: true }).then((hit) => hit ?? Response.error())),
    );
    return;
  }
  event.respondWith(caches.match(request, { cacheName: CACHE, ignoreVary: true }).then((hit) => hit ?? fetch(request)));
});
