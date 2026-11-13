import fs from 'node:fs/promises';
import path from 'node:path';
import { api, category, fetchPages, loadPage, readIndex, evidenceDir } from './client.mjs';
import { links } from './wikitext.mjs';

const professions = ['Warrior','Ranger','Monk','Necromancer','Mesmer','Elementalist','Assassin','Ritualist','Paragon','Dervish'];
const mode = process.argv[2] || 'all';
if (mode === 'all' || mode === 'armor') {
  const titles = ['Armor','Armorer','Common armor', ...professions.map(p => `${p} armor`)];
  for (const profession of professions) titles.push(...await category(`Category:${profession} armor`, true));
  titles.push(...await category('Category:Common armor', true));
  await fetchPages(titles);
  const index = await readIndex();
  const related = [];
  for (const title of titles) {
    const page = await loadPage(title, index);
    if (!page) continue;
    for (const link of links(page.wikitext)) {
      if (professions.some(p => link.title.startsWith(p + ' ')) && !/\/|gallery/i.test(link.title)) related.push(link.title);
    }
  }
  await fetchPages(related);
  const armorer = await loadPage('Armorer', await readIndex());
  const merchants = links(armorer.wikitext).filter(l => !/^(?:Category|File|Image):/.test(l.title)).map(l => l.title);
  await fetchPages(merchants);
  await fs.writeFile(path.join(evidenceDir,'armor-discovery.json'), JSON.stringify({roots:titles, related:[...new Set(related)]},null,2)+'\n');
}
if (mode === 'all' || mode === 'calendar') {
  const roots = ['Zaishen Challenge Quest','Zaishen Mission','Zaishen Bounty','Zaishen Combat','Zaishen Vanquish','Nicholas the Traveler','Weekly bonuses','Template:Automated weekly bonuses', 'Template:Cycle/Nicholas', ...['ZMission','ZBounty','ZCombat','ZVanquish'].map(t => `Template:Cycle/${t}`)];
  await fetchPages(roots);
  const index = await readIndex(), titles = [];
  for (const type of ['ZMission','ZBounty','ZCombat','ZVanquish']) {
    const page = await loadPage(`Template:Cycle/${type}`,index);
    for (const match of page.wikitext.matchAll(/^\s*\|\s*\d+\s*=\s*([^\n]+)/gm)) titles.push(`${match[1].trim()} (${type==='ZVanquish'?'Zaishen vanquish':'Zaishen quest'})`);
  }
  await fetchPages(titles);
  // Independent server-side template expansion fixtures, including both reset boundaries.
  const dates = ['2026-11-13 15:59:59','2026-11-13 16:00:00','2026-11-16 14:59:59','2026-11-16 15:00:00','2026-12-31 23:59:59','2027-01-01 00:00:00'];
  const fixtures = [];
  for (const date of dates) {
    const text = ['ZMission','ZBounty','ZCombat','ZVanquish'].map(type=>`{{Cycle|${type}|${date}}}`).join('\n');
    const result = await api({action:'expandtemplates',prop:'wikitext',text});
    fixtures.push({at:date.replace(' ','T')+'Z',quests:result.expandtemplates.wikitext.trim().split('\n')});
  }
  await fs.writeFile(path.join(evidenceDir,'calendar-fixtures.json'),JSON.stringify(fixtures,null,2)+'\n');
}
