import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { api, binary, evidenceDir, web } from './client.mjs';

const names = ['Warrior', 'Ranger', 'Monk', 'Necromancer', 'Mesmer', 'Elementalist', 'Assassin', 'Ritualist', 'Paragon', 'Dervish'];
const result = await api({ action: 'query', titles: names.map(name => `File:${name}-tango-icon-200.png`).join('|'), prop: 'revisions|imageinfo', rvprop: 'ids|timestamp|content', rvslots: 'main', iiprop: 'url|sha1|timestamp' });
const pages = new Map(result.query.pages.map(page => [page.title, page]));
const directory = path.join(web, 'src/assets/professions');
await fs.mkdir(directory, { recursive: true });
const icons = [];
for (const name of names) {
  const page = pages.get(`File:${name}-tango-icon-200.png`), info = page?.imageinfo?.[0], revision = page?.revisions?.[0];
  if (!info || !revision || !/\{\{GFDL image(?:\||\}\})/i.test(revision.slots.main.content)) throw new Error(`Unconfirmed profession icon source or license: ${name}`);
  const original = await binary(info.url);
  if (createHash('sha1').update(original).digest('hex') !== info.sha1) throw new Error(`Image changed during download: ${name}`);
  const converted = await sharp(original).resize(72, 72).png().toBuffer();
  const asset = `src/assets/professions/${name.toLowerCase()}.png`;
  await fs.writeFile(path.join(web, asset), converted);
  icons.push({ profession: name, asset, source: info.descriptionurl, originalUrl: info.url, originalSha1: info.sha1, uploadedAt: info.timestamp, pageid: page.pageid, revid: revision.revid, revisedAt: revision.timestamp, revisionUrl: `https://wiki.guildwars.com/index.php?title=${encodeURIComponent(page.title)}&oldid=${revision.revid}`, license: 'GFDL', licenseDeclaration: revision.slots.main.content, modification: 'Resized from 200×200 to 72×72 PNG; artwork unchanged.', sha256: createHash('sha256').update(converted).digest('hex') });
}
await fs.writeFile(path.join(evidenceDir, 'profession-icons.json'), JSON.stringify({ format: 1, retrievedAt: new Date().toISOString(), icons }, null, 2) + '\n');
console.log(`Downloaded and verified ${icons.length} profession icons.`);
