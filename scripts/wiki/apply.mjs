import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async (root, name) => JSON.parse(await fs.readFile(path.join(root, 'data/wiki', name), 'utf8'));
export async function wikiReview(root = web) {
  const [skills, content] = await Promise.all([read(root, 'skill-review.json'), read(root, 'content-review.json')]);
  return {
    format: 1, referenceVersion: 'gww-2026-11-13', source: 'https://wiki.guildwars.com',
    scope: '按字段审查现有游戏资料及 Wiki 修订；两条旧身份无法确认，见问题清单。不是游戏实测，地图坐标仍为旧资料。',
    coverage: { ...skills.coverage, bosses: content.coverage.boss, weapons: content.coverage.green, collectors: content.coverage.collector, pets: content.coverage.pet, treasures: content.coverage.treasure, storylines: content.coverage.storylines, unresolvedIdentities: content.coverage.unresolvedIdentities },
    issues: [...skills.issues, ...content.issues], entries: [...skills.entries, ...content.entries]
  };
}
export async function writeWikiReview(filename, root = web) {
  await fs.writeFile(filename, JSON.stringify(await wikiReview(root), null, 2) + '\n');
}
export async function applyWikiCorrections(catalog, report, root = web) {
  const [skills, content, review] = await Promise.all([read(root, 'skill-corrections.json'), read(root, 'content-corrections.json'), wikiReview(root)]);
  if (skills.format !== 1 || content.format !== 1) throw new Error('Unsupported wiki correction format');
  const patches = { ...skills.entries, ...content.entries };
  if (Object.keys(patches).length !== Object.keys(skills.entries).length + Object.keys(content.entries).length) throw new Error('Duplicate wiki patches');
  const allowed = new Set(['name', 'englishName', 'description', 'descriptionLanguage', 'details', 'profession', 'attribute', 'skill', 'wiki', 'npc', 'item', 'collector', 'pet', 'treasure', 'quest', 'loot']);
  for (const [id, patch] of Object.entries(patches)) for (const field of Object.keys(patch)) if (!allowed.has(field)) throw new Error(`Wiki correction cannot replace identity or coordinates: ${id}.${field}`);
  const ids = new Set(catalog.records.map(record => record.id));
  const places = new Set(catalog.records.flatMap(record => record.locations.map(place => place.id)));
  for (const id of Object.keys(patches)) if (!ids.has(id)) throw new Error(`Wiki correction no longer matches a legacy identity: ${id}`);
  for (const id of Object.keys(content.locationNotes)) if (!places.has(id)) throw new Error(`Wiki location correction no longer matches an identity: ${id}`);
  for (const record of catalog.records) {
    const patch = patches[record.id];
    if (patch) {
      record.legacy ||= { name: record.name, description: record.description, details: record.details, profession: record.profession, attribute: record.attribute };
      Object.assign(record, patch);
    }
    for (const place of record.locations) {
      const correction = content.locationNotes[place.id];
      if (correction) {
        place.legacyNote ??= place.note; place.note = correction.text; place.wiki = correction.reference;
        if (correction.unconfirmed) { place.legacyValid ??= place.valid; place.valid = false; place.positionStatus = 'unconfirmed'; }
      }
    }
  }
  catalog.stories = content.stories;
  catalog.referenceVersion = review.referenceVersion;
  report.wiki = { referenceVersion: catalog.referenceVersion, coverage: review.coverage, scope: review.scope, source: review.source, review: 'data/wiki-review.json' };
  return catalog;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataPath = path.join(web, 'public/data');
  const catalog = JSON.parse(await fs.readFile(path.join(dataPath, 'catalog.json'), 'utf8'));
  const report = JSON.parse(await fs.readFile(path.join(dataPath, 'report.json'), 'utf8'));
  await applyWikiCorrections(catalog, report);
  await writeWikiReview(path.join(dataPath, 'wiki-review.json'));
  await fs.writeFile(path.join(dataPath, 'catalog.json'), JSON.stringify(catalog));
  await fs.writeFile(path.join(dataPath, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('Applied reviewed Wiki corrections; stable IDs and personal backup format are unchanged.', report.wiki.coverage);
}
