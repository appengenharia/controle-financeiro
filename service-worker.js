// Nome do cache e recursos a serem armazenados
const CACHE_NAME = 'cfo-cache-v3-reboot';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './service-worker.js',
];

// Instalação: pré-cache dos assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting()),
  );
});

// Ativação: limpar caches antigos e assumir controle
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
            return null;
          }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Fetch: cache-first com atualização em background
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (!cachedResponse) {
        return fetch(event.request)
          .then((networkResponse) => {
            const responseClone = networkResponse.clone();

            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, responseClone))
              .catch(() => {});

            return networkResponse;
          })
          .catch(() => cachedResponse);
      }

      return cachedResponse;
    }),
  );
});
