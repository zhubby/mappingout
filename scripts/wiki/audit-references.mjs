import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { api, evidenceDir, web } from './client.mjs';

const catalog = JSON.parse(await fs.readFile(path.join(web, 'public/data/catalog.json'), 'utf8'));
const references = new Map();
function collect(reference) {
  if (!reference) return;
  const previous = references.get(reference.revid);
  if (previous && (previous.pageid !== reference.pageid || previous.title !== reference.title)) throw new Error(`Conflicting revision ${reference.revid}`);
  references.set(reference.revid, reference);
}
for (const record of catalog.records) {
  collect(record.wiki);
  record.wiki?.references?.forEach(collect);
  collect(record.skill?.pvp?.reference);
  record.locations.forEach(place => collect(place.wiki));
}
catalog.stories?.forEach(story => story.references.forEach(collect));
const revisions = [];
for (const reference of references.values()) {
  const page = JSON.parse(await fs.readFile(path.join(evidenceDir, `pages/${reference.pageid}.json`), 'utf8'));
  const sha1 = createHash('sha1').update(page.wikitext).digest('hex');
  if (page.pageid !== reference.pageid || page.revid !== reference.revid || page.title !== reference.title || page.revisedAt !== reference.revisedAt || page.sha1 !== sha1) throw new Error(`Snapshot differs from cited revision: ${reference.title}`);
  revisions.push({ title: page.title, pageid: page.pageid, revid: page.revid, revisedAt: page.revisedAt, sha1 });
}
revisions.sort((a, b) => a.revid - b.revid);
console.log(`Verified local content hashes for ${revisions.length} cited revisions.`);
if (process.argv.includes('--remote')) {
  for (let offset = 0; offset < revisions.length; offset += 50) {
    const batch = revisions.slice(offset, offset + 50);
    const result = await api({ action: 'query', revids: batch.map(revision => revision.revid).join('|'), prop: 'revisions', rvprop: 'ids|timestamp|sha1' });
    const returned = new Map((result.query?.pages || []).flatMap(page => (page.revisions || []).map(revision => [revision.revid, { ...revision, pageid: page.pageid, title: page.title }])));
    for (const expected of batch) {
      const actual = returned.get(expected.revid);
      if (!actual || actual.pageid !== expected.pageid || actual.title !== expected.title || actual.timestamp !== expected.revisedAt || actual.sha1 !== expected.sha1) throw new Error(`Live Wiki revision differs from snapshot: ${expected.title} @ ${expected.revid}`);
    }
    console.log(`Wiki revision hashes ${offset + batch.length}/${revisions.length}`);
  }
  await fs.writeFile(path.join(evidenceDir, 'source-audit.json'), JSON.stringify({ format: 1, source: 'https://wiki.guildwars.com/api.php', checkedAt: new Date().toISOString(), referenceVersion: catalog.referenceVersion, records: catalog.records.length, revisions: revisions.length, checks: ['local-wikitext-sha1', 'live-revision-page-title-id-timestamp-sha1'], entries: revisions }, null, 2) + '\n');
}
