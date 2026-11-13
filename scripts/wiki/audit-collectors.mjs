import fs from 'node:fs/promises';
import path from 'node:path';
import { readIndex, loadPage, web, evidenceDir } from './client.mjs';
import { collectorTitle, collectorTables, selectCollectorTable, collectorTableFacts, assertCollectorIdentity } from './collector-facts.mjs';

const index = await readIndex();
const catalog = JSON.parse(await fs.readFile(path.join(web, 'public/data/catalog.json'), 'utf8'));
const entries = [], issues = [];
for (const record of catalog.records.filter(record => record.kind === 'collector')) {
  try {
    const page = await loadPage(collectorTitle(record), index);
    if (!page) throw new Error('No page');
    const npc = assertCollectorIdentity(record, page);
    const title = selectCollectorTable(record, collectorTables(page));
    const table = await loadPage(title, index);
    if (!table) throw new Error(`No table: ${title}`);
    const facts = collectorTableFacts(table, record, page);
    entries.push({ id: record.id, title: page.title, revid: page.revid, areas: npc.areas, table: title, tableRevid: table.revid, ...facts });
  } catch (error) { issues.push({ id: record.id, name: record.name, error: error.message }); }
}
await fs.writeFile(path.join(evidenceDir, 'collector-audit.json'), JSON.stringify({ format: 1, entries, issues }, null, 2) + '\n');
console.log(JSON.stringify({ parsed: entries.length, issues }, null, 2));
