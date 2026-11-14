const CACHE_NAME = 'marketpulse-cache-v3';
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/globe.svg',
];

// Offline fallback candidate API endpoints
const CACHEABLE_API_ROUTES = [
  '/api/assets',
  '/api/market/regime',
  '/api/dividends',
  '/api/catalysts',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // For Cacheable API routes (Assets, Regime, Dividends, Catalysts):
  // Network-first with background cache update; falls back to cached response if offline
  if (CACHEABLE_API_ROUTES.some((route) => url.pathname.startsWith(route))) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) {
            return cached;
          }
          return new Response(JSON.stringify({ error: 'Network unavailable', isOffline: true }), {
            headers: { 'Content-Type': 'application/json' },
            status: 503,
          });
        })
    );
    return;
  }

  // Other API routes or Supabase queries: Network-first
  if (url.pathname.startsWith('/api') || url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        return new Response(JSON.stringify({ error: 'Network unavailable', isOffline: true }), {
          headers: { 'Content-Type': 'application/json' },
          status: 503,
        });
      })
    );
    return;
  }

  // Navigation requests (HTML document): Network-first with offline cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const rootCached = await caches.match('/');
          if (rootCached) return rootCached;
          return new Response('Offline', { status: 503 });
        })
    );
    return;
  }

  // Static assets (scripts, styles, images): Cache first with network fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
