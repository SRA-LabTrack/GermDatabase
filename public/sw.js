const CACHE = 'germdatabase-shell-v2';
const CORE = ['./', './index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('germdatabase-') && key !== CACHE).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Vite assets are content-hashed. Cache-first makes repeat launches nearly
  // instant while a new deployment naturally gets new asset URLs.
  if (url.pathname.includes('/assets/')) {
    event.respondWith((async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      }
      return response;
    })());
    return;
  }

  // HTML/version checks stay network-first so GitHub -> Vercel updates are
  // discovered immediately instead of being trapped behind an old shell.
  event.respondWith((async () => {
    try {
      return await fetch(event.request, { cache: 'no-store' });
    } catch {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') return caches.match('./index.html');
      throw new Error('Offline resource unavailable');
    }
  })());
});
