import { splitTopLevel, templates, plainText, links } from './wikitext.mjs';
import { npcFacts, reference } from './content-facts.mjs';

export const collectorOverrides = { 'collector:3:128': 'Kaya (collector)', 'collector:3:175': 'Smuggler (mesmer)', 'collector:3:176': 'Smuggler (monk)', 'collector:3:177': 'Smuggler (ranger)' };
export function collectorTitle(record) {
  return collectorOverrides[record.id] || record.name.replace(/ \(Armor\)$/i, '').replace(/ \d+$/, '').replace(/ \((Regent Valley|Fort Ranik)\)$/, '');
}
export function collectorTables(page) {
  return [...page.wikitext.matchAll(/\{\{\s*:\s*([^|}]+)(?:\||\}\})/g)].map(match => match[1].trim());
}
const professions = { w: 'Warrior', r: 'Ranger', mo: 'Monk', n: 'Necromancer', me: 'Mesmer', e: 'Elementalist', a: 'Assassin', rt: 'Ritualist', p: 'Paragon', d: 'Dervish' };
function text(value) {
  for (const template of templates(value)) {
    const name = template.name.toLowerCase();
    if (name === 'center') value = value.replace(template.raw, template.fields[1] || '');
    else if (professions[name]) value = value.replace(template.raw, professions[name]);
    else if (name === 'gold') value = value.replace(template.raw, 'gold');
    else if (name === 'plat') value = value.replace(template.raw, 'platinum');
  }
  return plainText(value).replace(/\b(Warrior|Ranger|Monk|Necromancer|Mesmer|Elementalist|Assassin|Ritualist|Paragon|Dervish)\s+\1\b/g, '$1');
}
function isArmor(record) {
  return (record.legacy || record).details.slice(1).some(line => /^(Warrior|Ranger|Monk|Necromancer|Mesmer|Elementalist|Assassin|Ritualist|Paragon|Dervish)\s*·/.test(line));
}
export function collectorTableFacts(page, record, npcPage) {
  const groups = [];
  let cells = [], inTable = false, headers = [], rows = [], collecting = '', location = '';
  function flush() {
    if (cells.some(cell => cell.trim())) rows.push(cells.map(text));
    cells = [];
  }
  function table() {
    flush();
    const material = links(collecting)[0]?.title;
    let amount = Number(/\d+/.exec(plainText(collecting))?.[0]);
    if (!amount && material === 'Book of Secrets' && /1\s+(?:\[\[)?Book of Secrets/i.test(npcPage?.wikitext || '')) amount = 1;
    const includesValue = headers.some(header => /\bvalue\b/i.test(header));
    const rewards = rows.map(row => (includesValue ? row.slice(0, -1) : row).filter(Boolean)).filter(row => row.length).map(row => row[0] === row[1] ? row.slice(1) : row);
    const unresolved = rewards.flat().filter(value => value.includes('{{'));
    if (!material || !Number.isInteger(amount) || amount < 1 || !rewards.length || unresolved.length) throw new Error(`Collector table needs review: ${page.title}; ${JSON.stringify({ amount, material, rows: rewards.length, unresolved })}`);
    groups.push({ amount, material, location: plainText(location.replace(/^.*?Location.*?:'{0,3}\s*/, '')), armor: headers.some(header => /\bprof(?:ession)?\b/i.test(header)), rewards });
    headers = []; rows = [];
  }
  for (const line of page.wikitext.split('\n')) {
    if (!inTable && /Collecting/i.test(line)) { collecting = line; continue; }
    if (!inTable && /'{2,3}Location/i.test(line)) { location = line; continue; }
    if (line.startsWith('{|')) { inTable = true; continue; }
    if (!inTable) continue;
    if (line.startsWith('|-')) { flush(); continue; }
    if (line.startsWith('|}')) { table(); inTable = false; continue; }
    if (line.startsWith('!')) { headers.push(...splitTopLevel(line.slice(1), '||').map(text)); continue; }
    if (line.startsWith('|+') || !line.trim()) continue;
    if (line.startsWith('|')) {
      for (let cell of splitTopLevel(line.slice(1), '||')) {
        if (/^\s*(?:style|align|rowspan|colspan|class|width)\s*=/.test(cell)) cell = splitTopLevel(cell).slice(1).join('|');
        cells.push(cell.trim());
      }
    } else if (cells.length) cells[cells.length - 1] += '\n' + line;
  }
  if (inTable) throw new Error(`Unclosed collector table: ${page.title}`);
  let selected = groups;
  if (record) {
    selected = selected.filter(group => group.armor === isArmor(record));
    if (selected.length > 1) {
      const old = record.legacy || record;
      const amount = Number(/\d+/.exec(old.details[0])?.[0]);
      selected = selected.filter(group => group.amount === amount);
      if (selected.length > 1) {
        const names = old.details.slice(1).map(line => line.split('·')[0].trim().toLowerCase());
        const scores = selected.map(group => ({ group, score: group.rewards.filter(row => names.includes(row[0].toLowerCase())).length })).sort((a, b) => b.score - a.score);
        if (scores[0].score > scores[1].score) selected = [scores[0].group];
      }
    }
  }
  if (selected.length !== 1) throw new Error(`Collector trade variant is ambiguous: ${page.title}: ${record?.id}`);
  return { ...selected[0], reference: reference(page) };
}
export function selectCollectorTable(record, titles) {
  const armor = isArmor(record);
  const wanted = titles.filter(title => /armor/i.test(title) === armor);
  if (wanted.length === 1) return wanted[0];
  if (titles.length === 1) return titles[0]; // Mixed armor/weapon tables are split by their actual headers.
  throw new Error(`Collector table ambiguous: ${record.id}; armor=${armor}; ${titles.join(', ')}`);
}
export function assertCollectorIdentity(record, page) {
  const facts = npcFacts(page);
  const box = templates(page.wikitext, 'NPC infobox')[0].fields;
  const campaigns = { Prophecies: 1, Factions: 2, Nightfall: 3, 'Eye of the North': 4, Core: 0 };
  const campaign = campaigns[plainText(box.campaign)];
  if ((!/collector/i.test(facts.service) && !/is a \[\[collector\]\]/i.test(page.wikitext)) || (campaign !== 0 && campaign !== record.campaign)) throw new Error(`Collector identity mismatch: ${record.id}: ${page.title}`);
  return facts;
}
