import fs from 'node:fs/promises';
import path from 'node:path';
import { web, evidenceDir, readIndex, loadPage } from './client.mjs';
import { npcFacts, weaponFacts } from './content-facts.mjs';
import { legacyWeaponProfile, matchingWeaponProfile } from './weapon-evidence.mjs';

const index = await readIndex();
const catalog = JSON.parse(await fs.readFile(path.join(web, 'public/data/catalog.json'), 'utf8'));
const corrected = JSON.parse(await fs.readFile(path.join(evidenceDir, 'content-corrections.json'), 'utf8'));
const cache = new Map();
const resolveTitle = title => { for (let i = 0; i < 10 && index.aliases[title]; i++) title = index.aliases[title]; return title; };
const rows = [];
for (const record of catalog.records.filter(r => r.kind === 'green')) {
  const profile = legacyWeaponProfile(record);
  const bosses = (record.related || []).map(id => corrected.entries[id]).filter(entry => entry?.npc);
  const candidates = [];
  for (const boss of bosses) for (const title of boss.npc.drops) {
    if (!cache.has(title)) {
      const page = await loadPage(title, index);
      let facts, error;
      try { if (page) facts = weaponFacts(page); } catch (e) { error = e.message; }
      cache.set(title, { page, facts, error });
    }
    const { page, facts, error } = cache.get(title);
    if (!page || !facts) continue;
    const rejected = matchingWeaponProfile(profile, facts);
    if (!facts.acquisitionTitles.some(title => resolveTitle(title) === boss.englishName)) rejected.push('reverse-drop');
    candidates.push({ title: page.title, revid: page.revid, boss: boss.englishName, bossRevid: boss.wiki.revid, facts, rejected, ...(error ? { error } : {}) });
  }
  const eligible = candidates.filter(candidate => !candidate.rejected.length);
  rows.push({ id: record.id, name: record.name, campaign: record.campaign, profile, bosses: bosses.map(boss => boss.englishName), status: eligible.length === 1 ? 'unique-evidence' : eligible.length ? 'ambiguous' : 'unresolved', candidates });
}
const summary = Object.fromEntries(['unique-evidence', 'ambiguous', 'unresolved'].map(status => [status, rows.filter(row => row.status === status).length]));
await fs.writeFile(path.join(evidenceDir, 'weapon-audit.json'), JSON.stringify({ format: 1, scope: 'Candidate evidence only; names and variants require a pinned identity review before application.', summary, entries: rows }, null, 2) + '\n');
console.log(summary);
