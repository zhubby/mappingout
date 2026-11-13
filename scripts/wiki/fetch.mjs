import fs from 'node:fs/promises';
import path from 'node:path';
import { api, category, evidenceDir, fetchPages, web, readIndex, loadPage } from './client.mjs';
import { links, section, templates } from './wikitext.mjs';
import { collectorTitle, collectorTables } from './collector-facts.mjs';
import { skillFacts } from './skill-facts.mjs';

const skills = JSON.parse(await fs.readFile(path.join(web, 'scripts/wiki/skill-titles.json'), 'utf8'));
const catalog = JSON.parse(await fs.readFile(path.join(web, 'public/data/catalog.json'), 'utf8'));
const mode = process.argv[2] || 'skills';
let titles;
if (mode === 'skills') titles = [...Object.values(skills), ...await category('Category:Elite skills'), 'Template:Skill infobox', 'Template:Gr', 'Template:Gr2', 'Guild Wars Wiki:Copyrights'];
else if (mode === 'collectors') titles = catalog.records.filter(r => r.kind === 'collector').map(collectorTitle);
else if (mode === 'story') titles = ['Storyline', 'Storyline of Prophecies', 'Storyline of Factions', 'Storyline of Nightfall', 'Storyline of Eye of the North', 'Storyline of Beyond', 'List of Prophecies missions and primary quests', 'List of Factions missions and primary quests', 'List of Nightfall missions and primary quests', 'List of Eye of the North primary quests', 'Treasure', 'Animal companion'];
else if (mode === 'collector-aliases') titles = catalog.records.filter(r => r.kind === 'collector').map(collectorTitle);
else if (mode === 'areas') titles = Object.values(JSON.parse(await fs.readFile(path.join(web, 'scripts/wiki/zone-titles.json'), 'utf8'))).flat();
else if (mode === 'titles') titles = JSON.parse(await fs.readFile(process.argv[3], 'utf8'));
else if (mode === 'category-pages') titles = Object.values(JSON.parse(await fs.readFile(path.join(evidenceDir, 'categories.json'), 'utf8'))).flat();
else if (mode === 'area-npcs') {
  const index = await readIndex();
  const areas = Object.values(JSON.parse(await fs.readFile(path.join(web, 'scripts/wiki/zone-titles.json'), 'utf8'))).flat();
  titles = [];
  for (const title of new Set(areas)) {
    const page = await loadPage(title, index);
    if (!page) continue;
    const npcs = section(page.wikitext, 'NPCs');
    for (const line of npcs.split('\n')) if (/^\*+.*\{\{(?:w|r|mo|n|me|e|a|rt|p|d|x)\}\}/i.test(line)) {
      const name = links(line)[0]?.title;
      if (name) titles.push(name);
    }
  }
}
else if (mode === 'acquisition') {
  const index = await readIndex();
  titles = [];
  for (const title of new Set(Object.values(skills))) {
    const page = await loadPage(title, index);
    if (!page) throw new Error(`Skill page missing: ${title}`);
    titles.push(...(skillFacts(page)?.acquisition || []).map(source => source.title));
  }
}
else if (mode === 'collector-tables') {
  const index = await readIndex();
  titles = [];
  for (const record of catalog.records.filter(r => r.kind === 'collector')) {
    const title = collectorTitle(record);
    const page = await loadPage(title, index);
    if (!page) throw new Error(`Collector page missing: ${title}`);
    titles.push(...collectorTables(page));
  }
}
else if (mode === 'weapons') {
  const index = await readIndex();
  titles = [];
  for (const title of Object.keys(index.pages)) {
    const page = await loadPage(title, index);
    if (!page || !templates(page.wikitext, 'NPC infobox').length) continue;
    for (const line of section(page.wikitext, 'Items dropped').split('\n').filter(line => /unique/i.test(line))) {
      const item = templates(line, 'Item icon')[0]?.fields[1] || links(line).find(link => !/^unique(?: item)?$/i.test(link.title))?.title;
      if (item) titles.push(item);
    }
  }
}
else if (mode === 'bosses') {
  const matching = JSON.parse(await fs.readFile(path.join(evidenceDir, 'matching.json'), 'utf8'));
  titles = matching.bosses.flatMap(b => b.candidates.map(c => c.title));
}
else if (mode === 'categories') {
  const result = {};
  for (const name of ['Bosses', 'Unique items', 'Charmable animals']) result[name] = await category(`Category:${name}`, true);
  await fs.mkdir(evidenceDir, { recursive: true });
  await fs.writeFile(path.join(evidenceDir, 'categories.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(Object.fromEntries(Object.entries(result).map(([key, values]) => [key, values.length])));
  process.exit(0);
} else throw new Error(`Unknown mode ${mode}`);
const { missing } = await fetchPages(titles, { refresh: process.argv.includes('--refresh') });
await fs.mkdir(evidenceDir, { recursive: true });
await fs.writeFile(path.join(evidenceDir, `${mode}-missing.json`), JSON.stringify(missing, null, 2) + '\n');
console.log({ mode, requested: new Set(titles).size, missing });
if (mode === 'skills') {
  const site = await api({ action: 'query', meta: 'siteinfo', siprop: 'rightsinfo' });
  await fs.writeFile(path.join(evidenceDir, 'license.json'), JSON.stringify(site.query.rightsinfo, null, 2) + '\n');
}
