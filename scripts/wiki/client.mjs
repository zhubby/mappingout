import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetch, ProxyAgent } from 'undici';

export const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const evidenceDir = path.join(web, 'data/wiki');
const proxy = process.env.WIKI_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const dispatcher = proxy ? new ProxyAgent(proxy) : undefined;
const apiRoot = 'https://wiki.guildwars.com/api.php';
const userAgent = 'MappingOutDataReview/1.0 (https://github.com/zhubby/mappingout; read-only reference verification)';
let lastRequest = 0;
export async function api(parameters) {
  const elapsed = Date.now() - lastRequest;
  if (elapsed < 400) await new Promise(resolve => setTimeout(resolve, 400 - elapsed));
  const url = new URL(apiRoot);
  for (const [key, value] of Object.entries({ format: 'json', formatversion: 2, maxlag: 5, ...parameters })) url.searchParams.set(key, String(value));
  let error;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      lastRequest = Date.now();
      const response = await fetch(url, { dispatcher, headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(`Wiki HTTP ${response.status}`);
      const result = await response.json();
      if (result.error) throw new Error(JSON.stringify(result.error));
      return result;
    } catch (e) { error = e; if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1))); }
  }
  throw error;
}
export async function category(title, recursive = false, visited = new Set()) {
  if (visited.has(title)) return [];
  visited.add(title);
  const pages = []; let continuation;
  do {
    const result = await api({ action: 'query', list: 'categorymembers', cmtitle: title, cmlimit: 500, ...(continuation || {}) });
    for (const page of result.query.categorymembers) {
      if (page.ns === 0) pages.push(page.title);
      else if (page.ns === 14 && recursive) pages.push(...await category(page.title, true, visited));
    }
    continuation = result.continue;
  } while (continuation);
  return [...new Set(pages)];
}
export async function readIndex() {
  try {
    const index = JSON.parse(await fs.readFile(path.join(evidenceDir, 'index.json'), 'utf8'));
    // Snapshots are authoritative; rebuilding metadata also recovers an interrupted index write.
    for (const file of await fs.readdir(path.join(evidenceDir, 'pages'))) {
      if (!file.endsWith('.json')) continue;
      const { wikitext, ...metadata } = JSON.parse(await fs.readFile(path.join(evidenceDir, 'pages', file), 'utf8'));
      index.pages[metadata.title] = metadata;
    }
    return index;
  }
  catch (e) { if (e.code !== 'ENOENT') throw e; return { format: 1, site: 'https://wiki.guildwars.com', pages: {}, aliases: {} }; }
}
export async function binary(url) {
  if (new URL(url).hostname !== 'wiki.guildwars.com') throw new Error('Unexpected image origin');
  const response = await fetch(url, { dispatcher, headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Wiki image HTTP ${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
export async function fetchPages(titles, { refresh = false } = {}) {
  await fs.mkdir(path.join(evidenceDir, 'pages'), { recursive: true });
  const index = await readIndex();
  const needed = [...new Set(titles)].filter(title => refresh || !index.pages[index.aliases[title] || title]);
  const missing = [];
  for (let offset = 0; offset < needed.length; offset += 20) {
    const batch = needed.slice(offset, offset + 20);
    const result = await api({ action: 'query', titles: batch.join('|'), redirects: 1, prop: 'revisions|info', inprop: 'url', rvprop: 'ids|timestamp|sha1|content', rvslots: 'main' });
    for (const alias of [...(result.query.normalized || []), ...(result.query.redirects || [])]) index.aliases[alias.from] = alias.to;
    for (const page of result.query.pages) {
      if (page.missing) { missing.push(page.title); continue; }
      const revision = page.revisions?.[0];
      if (!revision?.slots?.main?.content) throw new Error(`Missing wikitext: ${page.title}`);
      const evidence = { title: page.title, pageid: page.pageid, revid: revision.revid, revisedAt: revision.timestamp, sha1: revision.sha1, url: page.fullurl, revisionUrl: `https://wiki.guildwars.com/index.php?title=${encodeURIComponent(page.title)}&oldid=${revision.revid}`, retrievedAt: new Date().toISOString(), wikitext: revision.slots.main.content };
      await fs.writeFile(path.join(evidenceDir, `pages/${page.pageid}.json`), JSON.stringify(evidence, null, 2) + '\n');
      const { wikitext, ...metadata } = evidence;
      index.pages[page.title] = metadata;
    }
    await fs.writeFile(path.join(evidenceDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
    console.log(`Wiki snapshots ${Math.min(offset + batch.length, needed.length)}/${needed.length}; total ${Object.keys(index.pages).length}`);
  }
  return { index, missing };
}
export async function loadPage(title, index) {
  index ||= await readIndex();
  let resolved = title;
  for (let i = 0; i < 10 && index.aliases[resolved]; i++) resolved = index.aliases[resolved];
  const meta = index.pages[resolved];
  if (!meta) return null;
  return JSON.parse(await fs.readFile(path.join(evidenceDir, `pages/${meta.pageid}.json`), 'utf8'));
}
