const CACHE_NAME = 'glowup-v27';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
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
  '/js/makeupRoutine.js',
  '/js/firestoreProducts.js',
  '/js/subscription.js'
];

// Installation : mise en cache des ressources statiques
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })));
    }).catch(err => {
      console.warn('[SW] Certains fichiers n\'ont pas pu être mis en cache :', err);
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

// Fetch : stratégie Network First
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Ignorer les requêtes externes (Firebase, Stripe, Netlify Functions, etc.)
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/.netlify/')) return;
  if (url.pathname === '/admin.html' || url.pathname === '/admin') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (!response || !response.ok) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});
