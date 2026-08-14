const CACHE_VERSION = 'canesprout-offline-v2.13.7';
const SMALL_SHELL_URLS = ['/version.json', '/icon.svg'];
const STATIC_DESTINATIONS = new Set(['script', 'style', 'image', 'font']);
const STATIC_PATH = /\.(?:js|css|woff2?|ttf|otf|png|jpe?g|webp|gif|svg|json)(?:\?|$)/i;

async function putIfOk(cache, request, response) {
  if (response?.ok && response.type === 'basic') await cache.put(request, response.clone());
  return response;
}

async function fetchAndCache(cache, rawUrl, { reload = false } = {}) {
  try {
    const url = new URL(rawUrl, self.location.origin);
    if (url.origin !== self.location.origin) return null;
    const response = await fetch(url.href, reload ? { cache: 'reload' } : undefined);
    if (response?.ok && response.type === 'basic') await cache.put(url.href, response.clone());
    return response;
  } catch {
    return null;
  }
}

function assetUrlsFromHtml(html) {
  const urls = [];
  const pattern = /(?:src|href)=["']([^"']+)["']/gi;
  let match;
  while ((match = pattern.exec(html))) {
    try {
      const url = new URL(match[1], self.location.origin);
      if (url.origin === self.location.origin && STATIC_PATH.test(url.pathname)) urls.push(url.href);
    } catch {}
  }
  return Array.from(new Set(urls));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);

    // Cache index.html and the main hashed JS/CSS referenced by the production
    // build. This closes the classic PWA gap where HTML was offline-ready but
    // the first application bundle had loaded before the worker gained control.
    try {
      const indexResponse = await fetch('/index.html', { cache: 'reload' });
      if (indexResponse?.ok) {
        await cache.put('/index.html', indexResponse.clone());
        await cache.put('/', indexResponse.clone());
        const html = await indexResponse.text();
        await Promise.allSettled(assetUrlsFromHtml(html).map((url) => fetchAndCache(cache, url, { reload: true })));
      }
    } catch {}

    await Promise.allSettled(SMALL_SHELL_URLS.map((url) => fetchAndCache(cache, url, { reload: true })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Retire very old pre-offline caches immediately, but keep the previous
    // versioned offline shell until the new app confirms every lazy tool is
    // warmed. A deployment therefore never deletes the only usable shell first.
    await Promise.all(keys
      .filter((key) => (key.startsWith('germination-registry-') || key.startsWith('germdatabase-') || (key.startsWith('canesprout-') && !key.startsWith('canesprout-offline-v'))))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkWithTimeout(request, timeoutMs = 3000) {
  let timer;
  try {
    return await Promise.race([
      fetch(request),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('network timeout')), timeoutMs); })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function handleNavigation(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await networkWithTimeout(request, 3000);
    if (response?.ok) {
      cache.put('/index.html', response.clone()).catch(() => {});
      cache.put('/', response.clone()).catch(() => {});
      return response;
    }
  } catch {}
  return (await cache.match(request)) || (await cache.match('/index.html')) || (await cache.match('/')) || Response.error();
}

async function handleStatic(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    return await putIfOk(cache, request, response);
  } catch {
    return cached || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Appwrite lives on a different origin. It is deliberately never cached or
  // intercepted here, so sessions/database/storage semantics stay authoritative.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (STATIC_DESTINATIONS.has(request.destination) || STATIC_PATH.test(url.pathname)) {
    event.respondWith(handleStatic(request));
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();

  if (event.data?.type === 'CACHE_URLS') {
    const urls = Array.isArray(event.data.urls) ? event.data.urls.slice(0, 80) : [];
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE_VERSION);
      await Promise.allSettled(urls.map((url) => fetchAndCache(cache, url)));
    })());
  }

  if (event.data?.type === 'PRUNE_OLD_CACHES') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith('canesprout-offline-v') && key !== CACHE_VERSION).map((key) => caches.delete(key)));
    })());
  }
});
