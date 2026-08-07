const CACHE = 'canesprout-shell-v2.2.0';

self.addEventListener('install', () => {
  // No install-time precache: avoid duplicate Vercel requests on a user's first visit.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => (key.startsWith('canesprout-') || key.startsWith('germination-registry-') || key.startsWith('germdatabase-')) && key !== CACHE).map((key) => caches.delete(key))
  )));
  self.clients.claim();
});

async function cacheSuccessful(request, response, cacheKey = request) {
  if (response?.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(cacheKey, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/assets/') || url.pathname === '/icon.svg' || url.pathname === '/icon.png') {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => cacheSuccessful(event.request, response))));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match('/index.html');
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put('/index.html', response.clone());
        return response;
      } catch {
        return cache.match('/index.html');
      }
    })());
  }
});
