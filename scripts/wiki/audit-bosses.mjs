import fs from 'node:fs/promises';
import path from 'node:path';
import { web, evidenceDir, readIndex, loadPage } from './client.mjs';
import { npcFacts } from './content-facts.mjs';
import { skillFacts } from './skill-facts.mjs';

const index = await readIndex();
const catalog = JSON.parse(await fs.readFile(path.join(web, 'public/data/catalog.json'), 'utf8'));
const titles = JSON.parse(await fs.readFile(path.join(web, 'scripts/wiki/skill-titles.json'), 'utf8'));
const areas = JSON.parse(await fs.readFile(path.join(web, 'scripts/wiki/zone-titles.json'), 'utf8'));
const sources = new Map(), facts = new Map(), npcs = new Map();
for (const skill of catalog.records.filter(r => r.kind === 'skill')) {
  const page = await loadPage(titles[Number(skill.code)], index);
  const value = skillFacts(page);
  facts.set(skill.id, value);
  sources.set(skill.id, value.acquisition);
}
async function npc(title) {
  if (npcs.has(title)) return npcs.get(title);
  const page = await loadPage(title, index);
  let result = null;
  try { if (page) result = { page, facts: npcFacts(page) }; } catch { /* A quest or an acquisition item is not an NPC. */ }
  npcs.set(title, result);
  return result;
}
const normalize = value => value.toLowerCase().replaceAll('_', ' ').replace(/^the /, '').trim();
const rows = [];
for (const record of catalog.records.filter(r => r.kind === 'boss')) {
  const legacyProfession = (record.legacy || record).profession;
  const skills = record.related?.filter(id => id.startsWith('skill:')) || [];
  const candidates = new Map();
  for (const skill of skills) for (const source of sources.get(skill) || []) {
    if (source.campaign !== record.campaign && source.campaign !== 0) continue;
    const value = await npc(source.title);
    if (!value) continue;
    if (!candidates.has(value.page.title)) candidates.set(value.page.title, { ...value, acquisitions: [] });
    candidates.get(value.page.title).acquisitions.push({ skill, ...source });
  }
  const checked = [];
  for (const candidate of candidates.values()) {
    const reasons = [];
    const { page, facts: value, acquisitions } = candidate;
    const matchedAreas = record.locations.flatMap(location => (areas[location.zone] || []).filter(area => value.areas.some(actual => normalize(area) === normalize(actual.replace(/ \((?:level|floor) [^)]+\)$/i, '')))));
    if (!matchedAreas.length) reasons.push('area');
    if (legacyProfession && ![value.profession, value.secondaryProfession, value.thirdProfession].includes(legacyProfession)) reasons.push('profession');
    for (const id of skills) {
      const skill = facts.get(id);
      if (!acquisitions.some(source => source.skill === id)) reasons.push(`acquisition:${id}`);
      if (skill.elite && !value.skills.includes(skill.title)) reasons.push(`npc-skill:${id}`);
      if (skill.elite && !value.boss) reasons.push('not-boss');
    }
    checked.push({ title: page.title, revid: page.revid, boss: value.boss, service: value.service, profession: value.profession, areas: value.areas, matchedAreas: [...new Set(matchedAreas)], skills: value.skills, rejected: [...new Set(reasons)], acquisitions });
  }
  const eligible = checked.filter(candidate => !candidate.rejected.length);
  rows.push({ id: record.id, name: record.name, campaign: record.campaign, profession: legacyProfession, zones: record.locations.map(p => p.zone), skills, status: eligible.length === 1 ? 'unique-evidence' : eligible.length ? 'ambiguous' : 'unresolved', candidates: checked });
}
const summary = Object.fromEntries(['unique-evidence', 'ambiguous', 'unresolved'].map(status => [status, rows.filter(row => row.status === status).length]));
await fs.writeFile(path.join(evidenceDir, 'boss-audit.json'), JSON.stringify({ format: 1, scope: 'Candidate evidence only; identities require a pinned review before application.', summary, entries: rows }, null, 2) + '\n');
console.log(summary);
