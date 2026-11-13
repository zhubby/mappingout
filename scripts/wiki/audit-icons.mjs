import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { api, binary, evidenceDir, readIndex, loadPage, web } from './client.mjs';
import { templates, plainText } from './wikitext.mjs';

const cache = path.join(web, '.wiki-cache/icons');
await fs.mkdir(cache, { recursive: true });
const index = await readIndex();
const candidates = [];
for (const title of Object.keys(index.pages)) {
  const page = await loadPage(title, index);
  const box = templates(page.wikitext, 'Skill infobox')[0]?.fields;
  if (!box || !box.id) continue;
  const image = plainText(box.image || box.name || page.title);
  candidates.push({ title, image: `File:${image.replace(/^File:/, '').replace(/\.(jpg|png)$/i, '')}.jpg`, pageid: page.pageid, ids: plainText(box.id) });
  if (/Allegiance rank/.test(box.attribute || '')) for (const faction of ['Kurzick', 'Luxon']) candidates.push({ title: `${title} (${faction})`, image: `File:${image} (${faction}).jpg`, pageid: `${page.pageid}-${faction}`, ids: plainText(box.id) });
}
let metadata = {};
try { metadata = JSON.parse(await fs.readFile(path.join(evidenceDir, 'icons.json'), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const needed = [...new Set(candidates.map(c => c.image))].filter(title => !metadata[title]);
for (let start = 0; start < needed.length; start += 40) {
  const result = await api({ action: 'query', titles: needed.slice(start, start + 40).join('|'), prop: 'imageinfo', iiprop: 'url|sha1|timestamp' });
  for (const p of result.query.pages) if (p.imageinfo) metadata[p.title] = p.imageinfo[0];
  await fs.writeFile(path.join(evidenceDir, 'icons.json'), JSON.stringify(metadata, null, 2) + '\n');
}
let downloaded = 0;
for (const candidate of candidates) {
  const info = metadata[candidate.image];
  if (!info) continue;
  const file = path.join(cache, `${candidate.pageid}.jpg`);
  try { await fs.access(file); } catch {
    await fs.writeFile(file, await binary(info.url));
    downloaded++; if (downloaded % 25 === 0) console.log(`Downloaded ${downloaded} reference icons`);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}
async function pixels(file, reference = false) {
  let image = sharp(file);
  const meta = await image.metadata();
  // MappingOut stores the 58px interior of the standard 64px Guild Wars icon.
  if (reference && meta.width === 64 && meta.height === 64) image = image.extract({ left: 3, top: 3, width: 58, height: 58 });
  return await image.resize(32, 32, { fit: 'fill' }).removeAlpha().toColourspace('srgb').raw().toBuffer();
}
const referencePixels = new Map();
for (const c of candidates) if (metadata[c.image]) referencePixels.set(c.title, { cropped: await pixels(path.join(cache, `${c.pageid}.jpg`), true), full: await pixels(path.join(cache, `${c.pageid}.jpg`)) });
const mappings = JSON.parse(await fs.readFile(path.join(web, 'scripts/wiki/skill-titles.json'), 'utf8'));
const catalog = JSON.parse(await fs.readFile(path.join(web, 'public/data/catalog.json'), 'utf8'));
const matches = [];
for (const record of catalog.records.filter(r => r.kind === 'skill' && r.image)) {
  const original = await pixels(path.join(web, 'public', record.image));
  const originalMeta = await sharp(path.join(web, 'public', record.image)).metadata();
  const ranked = [...referencePixels].map(([title, versions]) => {
    const reference = originalMeta.width === 58 ? versions.cropped : versions.full;
    let difference = 0;
    for (let i = 0; i < original.length; i++) difference += Math.abs(original[i] - reference[i]);
    return { title, error: Number((difference / original.length).toFixed(3)) };
  }).sort((a, b) => a.error - b.error);
  const proposed = mappings[Number(record.code)], resolved = index.aliases[proposed] || proposed;
  matches.push({ id: record.id, name: record.name, proposed, proposedError: ranked.find(r => r.title === resolved)?.error, candidates: ranked.slice(0, 3) });
}
await fs.writeFile(path.join(evidenceDir, 'skill-icon-comparison.json'), JSON.stringify(matches, null, 2) + '\n');
console.log({ compared: matches.length, proposedMatches: matches.filter(r => r.candidates[0].title === (index.aliases[r.proposed] || r.proposed)).length, poorMatches: matches.filter(r => r.candidates[0].error > 25).length });
