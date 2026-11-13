import fs from 'node:fs/promises';
import path from 'node:path';
import { web, evidenceDir, readIndex, loadPage } from './client.mjs';
import { skillFacts } from './skill-facts.mjs';

const index = await readIndex();
const titles = JSON.parse(await fs.readFile(path.join(web, 'scripts/wiki/skill-titles.json'), 'utf8'));
const catalog = JSON.parse(await fs.readFile(path.join(web, 'public/data/catalog.json'), 'utf8'));
const facts = {};
for (const skill of catalog.records.filter(r => r.kind === 'skill')) {
  const page = await loadPage(titles[Number(skill.code)], index);
  if (page) facts[skill.id] = skillFacts(page);
}
const captures = new Map();
for (const [id, f] of Object.entries(facts)) for (const source of f?.acquisition || []) {
  if (source.method !== 'capture' || !source.campaign) continue;
  const key = `${source.campaign}:${source.title}`;
  if (!captures.has(key)) captures.set(key, { title: source.title, campaign: source.campaign, skillIds: new Set(), areas: new Set(), sources: [] });
  const boss = captures.get(key);
  boss.skillIds.add(id); source.areas.forEach(a => boss.areas.add(a));
  boss.sources.push(f.reference);
}
const groups = new Map();
for (const boss of catalog.records.filter(r => r.kind === 'boss')) {
  const key = `${boss.campaign}:${boss.name}`;
  if (!groups.has(key)) groups.set(key, { name: boss.name, campaign: boss.campaign, records: [], skills: new Set(), zones: new Set() });
  const group = groups.get(key); group.records.push(boss.id);
  (boss.related || []).filter(id => id.startsWith('skill:')).forEach(id => group.skills.add(id));
  boss.locations.forEach(l => { if (l.zone) group.zones.add(l.zone); });
}
const zones = {};
// Chinese names in the release use familiar transliterations. These independently
// checked anchors disambiguate repeated professions in early Prophecies missions.
let anchors = {};
try { anchors = JSON.parse(await fs.readFile(path.join(web, 'scripts/wiki/zone-titles.json'), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
Object.assign(zones, anchors);
const bosses = [];
for (const group of groups.values()) {
  const candidates = [...captures.values()].filter(b => b.campaign === group.campaign && [...group.skills].every(id => b.skillIds.has(id)));
  bosses.push({ ...group, skills: [...group.skills], zones: [...group.zones], candidates: candidates.map(c => ({ title: c.title, areas: [...c.areas], skillIds: [...c.skillIds], sources: c.sources })) });
}
const result = { format: 1, skills: Object.keys(facts).length, bosses, zones, summary: { bossGroups: bosses.length, uniqueSkillMatches: bosses.filter(b => b.candidates.length === 1).length, ambiguous: bosses.filter(b => b.candidates.length > 1).length, unmatched: bosses.filter(b => !b.candidates.length).length } };
await fs.writeFile(path.join(evidenceDir, 'matching.json'), JSON.stringify(result, null, 2) + '\n');
await fs.writeFile(path.join(evidenceDir, 'skill-facts.json'), JSON.stringify(facts, null, 2) + '\n');
console.log(result.summary);
