/**
 * [INPUT]: 依赖构建版本、启动资源、已访问资料路径与离线清单。
 * [OUTPUT]: 缓存启动壳、已访问资源和用户手动准备的全量资料。
 * [POS]: Web 缓存生命周期边界；缓存失败不阻断在线响应。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
const CACHE = 'mappingout-__BUILD_VERSION__';
const PRECACHE = [/* __BUILD_PRECACHE__ */];
const base = new URL('./', self.location.href);
const isShellUrl = url => url.pathname === base.pathname || url.pathname === new URL('index.html', base).pathname;
const isHtml = response => /^text\/html(?:\s*;|$)/i.test(response.headers.get('content-type') || '');
const isSecureOrigin = () => self.location.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]', '::1'].includes(self.location.hostname.toLowerCase());
let preparation;
const visitedRequests = new Map();

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    if (!isSecureOrigin()) throw new Error('Secure origin required');
    const cache = await caches.open(CACHE);
    const shell = await fetch(new Request(base, { cache: 'reload' }));
    if (!shell.ok || !isHtml(shell)) throw new Error('Shell unavailable');
    await cache.put(base, shell);
    await cache.addAll(PRECACHE.map(asset => new Request(new URL(asset, base), { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) {
    if (key.startsWith('mappingout-') && key !== CACHE) await caches.delete(key);
  }
  await self.clients.claim();
})()));

function progress(port, state, latestError) {
  port.postMessage({
    type: 'mappingout:offline-progress',
    completed: state.completed,
    total: state.total,
    skipped: state.skipped,
    failed: state.errors.length,
    latestError,
  });
}

function manifestEntries(value) {
  if (!Array.isArray(value) || value.length > 100000) throw new Error('Invalid offline manifest');
  const paths = [...new Set(value)];
  return paths.map(path => {
    if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..')) {
      throw new Error('Invalid offline asset path');
    }
    const url = new URL(path.split('/').map(encodeURIComponent).join('/'), base);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) throw new Error('Offline asset outside worker scope');
    return { path, url };
  });
}

async function prepareOffline(port, controller) {
  const state = { total: 0, completed: 0, skipped: 0, errors: [], next: 0 };
  const manifestUrl = new URL('offline-assets.json', base);
  const manifestResponse = await fetch(new Request(manifestUrl, { cache: 'reload', signal: controller.signal }));
  if (!manifestResponse.ok) throw new Error(`Offline manifest unavailable (${manifestResponse.status})`);
  const entries = manifestEntries(await manifestResponse.json());
  controller.signal.throwIfAborted();
  state.total = entries.length;
  const cache = await caches.open(CACHE);
  progress(port, state);

  async function prepareNext() {
    while (!controller.signal.aborted) {
      const index = state.next++;
      if (index >= entries.length) return;
      const entry = entries[index];
      let latestError;
      try {
        const cached = await cache.match(entry.url, { ignoreVary: true });
        if (cached) {
          state.skipped++;
          state.completed++;
          progress(port, state);
          continue;
        }
      } catch { /* A failed cache lookup must not prevent the online fetch. */ }
      if (controller.signal.aborted) return;
      try {
        const response = await fetch(new Request(entry.url, { cache: 'reload', signal: controller.signal }));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await cache.put(entry.url, response.clone());
      } catch (error) {
        if (controller.signal.aborted) return;
        latestError = { path: entry.path, message: error instanceof Error ? error.message : String(error) };
        state.errors.push(latestError);
      }
      state.completed++;
      progress(port, state, latestError);
    }
  }

  await Promise.all([prepareNext(), prepareNext()]);
  const status = controller.signal.aborted ? 'cancelled' : state.errors.length ? 'partial' : 'complete';
  port.postMessage({
    type: 'mappingout:offline-result',
    status,
    completed: state.completed,
    total: state.total,
    skipped: state.skipped,
    failed: state.errors.length,
    errors: state.errors,
  });
}

async function cacheVisited(paths) {
  if (!Array.isArray(paths) || paths.length > 100) return;
  const valid = [...new Set(paths.filter(path => typeof path === 'string'
    && (/^data\/(?:i18n\/(?:zh-TW|en)\/)?(?:catalog|armor|calendar|quests|skills)\.json$/.test(path)
      || /^build\/[A-Za-z0-9_.-]+\.(?:js|css)$/.test(path))))];
  let cache;
  try { cache = await caches.open(CACHE); }
  catch { return; }
  await Promise.all(valid.map(path => {
    const url = new URL(path, base);
    if (visitedRequests.has(url.href)) return visitedRequests.get(url.href);
    const pending = (async () => {
      try {
        if (await cache.match(url, { ignoreVary: true })) return;
        const response = await fetch(new Request(url));
        if (response.ok) await cache.put(url, response);
      } catch { /* 已访问资料缓存失败时保留在线功能。 */ }
      finally { visitedRequests.delete(url.href); }
    })();
    visitedRequests.set(url.href, pending);
    return pending;
  }));
}

self.addEventListener('message', event => {
  if (event.data?.type === 'mappingout:cache-visited') {
    event.waitUntil(cacheVisited(event.data.paths));
    return;
  }
  if (event.data?.type !== 'mappingout:prepare-offline' || !event.ports?.[0]) return;
  const port = event.ports[0];
  if (preparation) {
    port.postMessage({ type: 'mappingout:offline-error', message: 'Offline preparation is already running' });
    return;
  }
  const controller = new AbortController();
  preparation = { port, controller };
  port.onmessage = message => {
    if (message.data?.type === 'cancel') controller.abort();
  };
  port.start?.();
  event.waitUntil((async () => {
    try {
      await prepareOffline(port, controller);
    } catch (error) {
      if (controller.signal.aborted) {
        port.postMessage({ type: 'mappingout:offline-result', status: 'cancelled', completed: 0, total: 0, skipped: 0, failed: 0, errors: [] });
      } else {
        port.postMessage({ type: 'mappingout:offline-error', message: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      if (preparation?.controller === controller) preparation = undefined;
    }
  })());
});

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
          // A report or image response must never replace the HTML shell.
          if (isShellUrl(url)) { if (isHtml(copy)) await cache.put(base, copy); }
          else await cache.put(event.request, copy);
        } catch { /* A cache failure must not discard a successful network response. */ }
      })());
    }
    return response;
  })());
});
