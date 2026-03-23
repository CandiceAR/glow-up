const CACHE_NAME = 'glowup-v2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/glow-up-icon.jpg',
  '/js/app.js',
  '/js/auth.js',
  '/js/productCatalog.js',
  '/js/routineRenderer.js',
  '/js/tryOn.js',
  '/js/catalogue.js',
  '/js/skinAnalysis.js',
  '/js/skinJourney.js',
  '/data/products-manual.json',
  '/data/catalogue.json'
];

// Installation : mise en cache des ressources statiques
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })));
    }).catch(err => {
      console.warn('Certains fichiers n\'ont pas pu être mis en cache :', err);
    })
  );
  self.skipWaiting();
});

// Activation : suppression des anciens caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch : stratégie Network First (réseau d'abord, cache en fallback)
self.addEventListener('fetch', event => {
  // Ignorer les requêtes non-GET et les requêtes externes (Firebase, Stripe, etc.)
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Mettre à jour le cache avec la nouvelle version
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => {
        // En cas d'absence de réseau, utiliser le cache
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Fallback vers index.html pour la navigation
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});
