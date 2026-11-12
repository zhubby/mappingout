// Cache shell during installation, then cache same-origin assets only after a successful visit.
// Replaced after Vite builds; the release is a deterministic hash of deployed content.
const CACHE = 'mappingout-__BUILD_VERSION__';
const PRECACHE = [/* __BUILD_PRECACHE__ */];
const base = new URL('./', self.location.href);
const isShellUrl = url => url.pathname === base.pathname || url.pathname === new URL('index.html', base).pathname;
const isHtml = response => /^text\/html(?:\s*;|$)/i.test(response.headers.get('content-type') || '');
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const shell = await fetch(new Request(base, { cache: 'reload' }));
    if (!shell.ok || !isHtml(shell)) throw new Error('Shell unavailable');
    await cache.put(base, shell);
    await cache.addAll(PRECACHE.map(asset => new Request(new URL(asset, base), { cache: 'reload' })));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => event.waitUntil((async () => { for (const key of await caches.keys()) if (key.startsWith('mappingout-') && key !== CACHE) await caches.delete(key); await self.clients.claim(); })()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;
  event.respondWith((async () => {
    let response;
    try { response = await fetch(event.request); }
    // Precached module requests and browser module requests can differ in Origin.
    // These are public, same-origin static files, so Vary: Origin must not hide them offline.
    catch {
      try {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(event.request, { ignoreVary: true }) || (event.request.mode === 'navigate' && isShellUrl(url) ? await cache.match(base, { ignoreVary: true }) : null);
        if (cached) return cached;
      } catch { /* Cache storage itself can be unavailable. */ }
      return new Response('离线资源尚未缓存', { status: 503 });
    }
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil((async () => {
        try {
          const cache = await caches.open(CACHE);
          // Report JSON and image navigations must never replace the HTML shell.
          if (isShellUrl(url)) { if (isHtml(copy)) await cache.put(base, copy); }
          else await cache.put(event.request, copy);
        } catch { /* A cache failure must not discard a successful network response. */ }
      })());
    }
    return response;
  })());
});
