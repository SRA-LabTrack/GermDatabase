// CaneSprout v2.4.0 cleanup service worker.
// It intentionally does not intercept requests. If an older CaneSprout service
// worker discovers this update, this script removes stale shell caches and then
// unregisters itself so Vercel/browser caching can handle immutable assets.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys
        .filter((key) => key.startsWith('canesprout-') || key.startsWith('germination-registry-') || key.startsWith('germdatabase-'))
        .map((key) => caches.delete(key)));
      await self.registration.unregister();
    } catch {}
    await self.clients.claim();
  })());
});
