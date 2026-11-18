/**
 * [INPUT]: 依赖已启动的最终容器镜像与原生 HTTP fetch。
 * [OUTPUT]: 校验健康、资料完整性、MIME、缓存、条件请求、Range 和真实 404。
 * [POS]: 两种 CPU 架构共用的 HTTP 验收入口；请求直接访问服务，不经过 Service Worker。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';

const base = new URL(process.argv[2] || 'http://127.0.0.1:8080');
const revalidate = 'public, max-age=0, must-revalidate';
async function request(path, { status = 200, ...options } = {}) {
  const response = await fetch(new URL(path, base), { ...options, signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, status, `${path}: HTTP ${response.status}, expected ${status}`);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff', `${path}: MIME sniffing must be disabled`);
  return response;
}

// 容器已启动不代表监听端口已就绪；仅在启动阶段重试健康探针。
let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const response = await request('/healthz');
    assert.equal(await response.text(), 'ok\n');
    ready = true;
    break;
  } catch {
    await setTimeout(500);
  }
}
assert.ok(ready, `Container did not become healthy: ${base.origin}`);

for (const path of ['/', '/index.html', '/?kind=skill&map=2%3A2']) {
  const response = await request(path);
  assert.match(response.headers.get('content-type') || '', /^text\/html/);
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  const html = await response.text();
  assert.ok(html.includes('<div id="root">'), 'Application shell is missing');
  if (path !== '/') continue;
  const assets = [...html.matchAll(/(?:src|href)="\.?(\/build\/[^"\s]+\.(?:js|css))"/g)].map(match => match[1]);
  assert.ok(assets.some(asset => asset.endsWith('.js')) && assets.some(asset => asset.endsWith('.css')), 'Built JS or CSS is missing');
  for (const asset of assets) {
    const built = await request(asset, { method: 'HEAD' });
    assert.match(built.headers.get('content-type') || '', asset.endsWith('.css') ? /text\/css/ : /javascript/);
    assert.equal(built.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  }
}

const catalog = await request('/data/catalog.json');
assert.match(catalog.headers.get('content-type') || '', /application\/json/);
assert.equal(catalog.headers.get('cache-control'), revalidate);
const data = await catalog.json();
assert.equal(data.campaigns.length, 4);
assert.equal(data.regions.length, 20);
for (const path of ['/data/armor.json', '/data/calendar.json', '/data/quests.json', '/data/skills.json', '/data/i18n/en/skills.json', '/data/i18n/zh-CN/quests.json']) {
  const response = await request(path, { method: 'HEAD' });
  assert.match(response.headers.get('content-type') || '', /application\/json/);
  assert.equal(response.headers.get('cache-control'), revalidate);
}
const compressed = await request('/data/catalog.json', { headers: { 'Accept-Encoding': 'gzip' } });
assert.equal(compressed.headers.get('content-encoding'), 'gzip');
assert.equal((await compressed.json()).campaigns.length, 4);

const map = await request('/assets/maps/1-1.jpg', { method: 'HEAD' });
assert.match(map.headers.get('content-type') || '', /image\/jpeg/);
assert.equal(map.headers.get('cache-control'), revalidate);
assert.ok(map.headers.get('etag'), 'Map ETag is missing');
await request('/assets/maps/1-1.jpg', { status: 304, headers: { 'If-None-Match': map.headers.get('etag') } });
const partial = await request('/assets/maps/1-1.jpg', { status: 206, headers: { Range: 'bytes=0-15' } });
assert.match(partial.headers.get('content-range') || '', /^bytes 0-15\/\d+$/);
assert.equal((await partial.arrayBuffer()).byteLength, 16);

const fonts = await (await request('/fonts/manifest.json')).json();
for (const font of fonts.fonts.filter(font => font.file)) {
  const response = await request(`/${font.file}`, { method: 'HEAD' });
  assert.match(response.headers.get('content-type') || '', /^font\//);
  assert.equal(response.headers.get('cache-control'), revalidate);
}
const license = await request('/licenses/gfdl-1.3.txt');
assert.ok((await license.text()).includes('GNU Free Documentation License'));

const worker = await request('/sw.js');
assert.match(worker.headers.get('content-type') || '', /javascript/);
assert.equal(worker.headers.get('cache-control'), 'no-cache');
const source = await worker.text();
assert.match(source, /mappingout-[a-f0-9]{24}/);
assert.ok(!source.includes('__BUILD_'), 'Service Worker build placeholders remain');

for (const path of ['/data/missing.json', '/assets/maps/missing.jpg', '/build/missing.js', '/missing-route', '/data/', '/../../etc/passwd']) {
  const response = await request(path, { status: 404 });
  assert.ok(!(response.headers.get('cache-control') || '').includes('immutable'), 'A missing resource has immutable caching');
  assert.ok(!(await response.text()).includes('<div id="root">'), 'Missing resource returned the app shell');
}
console.log(`Container HTTP acceptance passed: ${base.origin}`);
