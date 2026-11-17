/**
 * [INPUT]: 依赖 Web 构建目录与 Service Worker 模板。
 * [OUTPUT]: 生成代码、资料、字体、任务图和全技能图标预缓存。
 * [POS]: Web 构建收尾；大幅护甲预览与地图按访问缓存。
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
      else if (item.isFile() && name !== 'sw.js') result.push(name);
    }
    return result.sort();
  }
  const paths = await files(dist);
  for (const required of ['index.html', 'data/catalog.json', '_headers']) if (!paths.includes(required)) throw new Error(`Incomplete build: ${required}`);
  const precache = paths.filter(name => name.startsWith('build/'));
  if (!precache.some(name => name.endsWith('.js')) || !precache.some(name => name.endsWith('.css'))) throw new Error('Missing Vite build assets');
  precache.push('data/catalog.json');
  precache.push(...paths.filter(name => ['data/wiki-review.json','data/armor.json','data/calendar.json','data/quests.json','data/skills.json','licenses/gfdl-1.3.txt'].includes(name)));
  precache.push(...paths.filter(name => name.startsWith('data/i18n/') || name.startsWith('fonts/')));
  precache.push(...paths.filter(name => /^assets\/materials\/[a-z-]+\.png$/.test(name)));
  precache.push(...paths.filter(name => /^assets\/quests\/[^/]+\.webp$/.test(name)));
  precache.push(...paths.filter(name => /^assets\/(?:skill-library|skill-resources)\/[^/]+\.(?:jpg|png)$/.test(name)));
  const hash = createHash('sha256').update(template);
  for (const name of paths) {
    const bytes = await fs.readFile(path.join(dist, name));
    // Length delimiters keep filename/content boundaries unambiguous.
    hash.update(`\0${Buffer.byteLength(name)}:${name}\0${bytes.length}:`).update(bytes);
  }
  const version = hash.digest('hex').slice(0, 24);
  await fs.writeFile(path.join(dist, 'sw.js'), template.replace('__BUILD_VERSION__', version).replace('[/* __BUILD_PRECACHE__ */]', JSON.stringify(precache)));
  return { version, precache };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('离线缓存版本', await finalizeBuild());
}
