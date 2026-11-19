/**
 * [INPUT]: 依赖 Web 构建目录与 Service Worker 模板。
 * [OUTPUT]: 生成版本缓存、启动资源预缓存和完整离线资源清单。
 * [POS]: Web 构建收尾；首次安装保持轻量，用户按需准备完整资源。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { projectRoot } from '../lib/paths.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const web = projectRoot;
export async function finalizeBuild(dist = path.join(web, 'dist'), templateFile = path.join(web, 'public/sw.js')) {
  const template = await fs.readFile(templateFile, 'utf8');
  if (!template.includes('__BUILD_VERSION__') || !template.includes('[/* __BUILD_PRECACHE__ */]')) throw new Error('Service Worker template is missing build tokens');
  async function files(dir, prefix = '') {
    const result = [];
    for (const item of await fs.readdir(dir, { withFileTypes: true })) {
      const name = prefix + item.name;
      if (item.isDirectory()) result.push(...await files(path.join(dir, item.name), `${name}/`));
      else if (item.isFile() && !['sw.js', 'offline-assets.json'].includes(name)) result.push(name);
    }
    return result.sort();
  }
  const paths = await files(dist);
  for (const required of ['index.html', 'data/catalog.json', '_headers']) if (!paths.includes(required)) throw new Error(`Incomplete build: ${required}`);
  const html = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
  const startupAssets = [...new Set([...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map(([, reference]) => reference)
    .filter(reference => /^(?:\.\/)?build\//.test(reference))
    .map(reference => decodeURIComponent(new URL(reference, 'https://mappingout.invalid/').pathname.slice(1))))].sort();
  if (!startupAssets.some(name => name.endsWith('.js')) || !startupAssets.some(name => name.endsWith('.css'))) throw new Error('Missing Vite startup assets');
  const workerAssets = paths.filter(name => /^build\/content\.worker-[^/]+\.js$/.test(name));
  if (workerAssets.length !== 1) throw new Error('Missing content worker startup asset');
  for (const name of startupAssets) if (!paths.includes(name)) throw new Error(`Missing Vite startup asset: ${name}`);
  const offlineAssets = paths.filter(name => name !== 'index.html' && name !== '_headers' && !name.split('/').includes('AGENTS.md'));
  const hash = createHash('sha256').update(template);
  for (const name of paths) {
    const bytes = await fs.readFile(path.join(dist, name));
    // Length delimiters keep filename/content boundaries unambiguous.
    hash.update(`\0${Buffer.byteLength(name)}:${name}\0${bytes.length}:`).update(bytes);
  }
  const precache = [...new Set([...startupAssets, ...workerAssets])].sort();
  const offlineManifest = `${JSON.stringify(offlineAssets)}\n`;
  hash.update(`\0precache:${JSON.stringify(precache)}\0offline-assets:${offlineManifest}`);
  const version = hash.digest('hex').slice(0, 24);
  await fs.writeFile(path.join(dist, 'offline-assets.json'), offlineManifest);
  await fs.writeFile(path.join(dist, 'sw.js'), template.replace('__BUILD_VERSION__', version).replace('[/* __BUILD_PRECACHE__ */]', JSON.stringify(precache)));
  return { version, precache, offlineAssets };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('离线缓存版本', await finalizeBuild());
}
