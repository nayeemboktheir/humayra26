self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const cacheNames = await caches.keys();
      await Promise.allSettled(cacheNames.map((name) => caches.delete(name)));
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: 'window' });
      await Promise.allSettled(clients.map((client) => {
        const target = new URL(client.url);
        target.searchParams.set('cache_bust', '20260717-invoice-unlocked-v5');
        return client.navigate(target.href);
      }));
    } finally {
      await self.registration.unregister();
    }
  })());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request, { cache: 'reload' }));
});
