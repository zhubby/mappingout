import { templates, plainText, section, links } from './wikitext.mjs';
import { professions } from './skill-facts.mjs';
import { wikiTables } from './tables.mjs';

export function reference(page) {
  const { title, pageid, revid, url, revisionUrl, revisedAt, retrievedAt } = page;
  return { title, pageid, revid, url, revisionUrl, revisedAt, retrievedAt };
}
export function npcFacts(page) {
  const box = templates(page.wikitext, 'NPC infobox')[0]?.fields;
  if (!box) throw new Error(`Missing NPC infobox: ${page.title}`);
  const aliases = { w: 1, r: 2, mo: 3, n: 4, me: 5, e: 6, a: 7, rt: 8, p: 9, d: 10 };
  const profession = value => Object.entries(professions).find(([name]) => name.toLowerCase() === plainText(value).toLowerCase())?.[1] ?? aliases[plainText(value).toLowerCase()] ?? 0;
  const areaText = ['Locations', 'Location', 'Missions', 'Mission'].map(heading => section(page.wikitext, heading)).join('\n');
  return {
    title: page.title, boss: /^(y|yes|true|1|boss)$/i.test(box.boss || ''), service: plainText(box.service),
    profession: profession(box.profession), secondaryProfession: profession(box.profession2), thirdProfession: profession(box.profession3),
    level: plainText(box.level), type: plainText(box.type), affiliation: plainText(box.affiliation),
    areas: [...new Set([...templates(areaText, 'NPC location').map(t => `${t.fields[1]}${t.fields[2] ? ` (${t.fields[2]})` : ''}`), ...areaText.split('\n').filter(line => /^\*{2,}\s*\[\[/.test(line)).map(line => links(line)[0]?.title).filter(Boolean)])],
    areasText: plainText(areaText),
    skills: templates(section(page.wikitext, 'Skills')).filter(t => /^(?:Monster )?Skill icon$/i.test(t.name)).map(t => plainText(t.fields[1])),
    skillsText: plainText(section(page.wikitext, 'Skills')),
    drops: [...new Set([...links(section(page.wikitext, 'Items dropped')).map(l => l.title), ...templates(section(page.wikitext, 'Items dropped'), 'Item icon').map(t => plainText(t.fields[1]))])].filter(title => !/^(?:unique(?: item)?$|Category:)/i.test(title)),
    reference: reference(page)
  };
}
export function weaponFacts(page) {
  const box = templates(page.wikitext, 'Weapon infobox')[0]?.fields;
  const stats = section(page.wikitext, 'Stats').split('\n').filter(line => /^[:*]|^===/.test(line)).map(line => plainText(line.replace(/^[:*]+\s*/, '').replace(/^=+|=+$/g, '')));
  if (!box || !stats.length || stats.some(line => line.includes('{{'))) throw new Error(`Unparsed weapon: ${page.title}`);
  let intro = page.wikitext.split(/^==/m)[0];
  for (const template of templates(intro)) if (['weapon infobox', 'otheruses', 'other uses'].includes(template.name.toLowerCase())) intro = intro.replace(template.raw, '');
  const acquisition = intro + '\n' + ['Acquisition', 'Location', 'Locations'].map(heading => section(page.wikitext, heading)).join('\n');
  const versions = ['Versions', 'Damage type'].flatMap(heading => wikiTables(section(page.wikitext, heading)));
  return { type: plainText(box.type), bowClass: plainText(box.bowclass), attribute: plainText(box.attribute), damageType: plainText(box.damagetype), unique: /^(y|yes|true|1)$/i.test(box.unique || ''), stats, versions, acquisitionText: plainText(acquisition.replace(/__NOTOC__/g, '')), acquisitionTitles: links(acquisition).map(link => link.title), reference: reference(page) };
}

export function itemFamilyFacts(pages) {
  const variants = pages.map(itemFacts);
  if (variants.length < 2 || variants.some(facts => facts.classification !== 'unique-weapon')) throw new Error('Invalid weapon family');
  return { ...variants[0], classification: 'weapon-family', attribute: variants.map(facts => facts.attribute).join(' / '), stats: pages.flatMap((page, index) => [`${page.title}：`, ...variants[index].stats]), variants, acquisitionTitles: [...new Set(variants.flatMap(facts => facts.acquisitionTitles))] };
}

export function itemFacts(page) {
  const weapon = templates(page.wikitext, 'Weapon infobox')[0];
  const item = templates(page.wikitext, 'Item infobox')[0];
  if (!weapon && !item) throw new Error(`Missing item infobox: ${page.title}`);
  if (weapon && /^(y|yes|true|1)$/i.test(weapon.fields.unique || '')) return { ...weaponFacts(page), classification: 'unique-weapon' };
  const box = (weapon || item).fields;
  const intro = page.wikitext.split(/^==/m)[0].replace((weapon || item).raw, '').replace(/__NOTOC__/g, '');
  const acquisition = intro + '\n' + ['Acquisition', 'Location', 'Locations'].map(heading => section(page.wikitext, heading)).join('\n');
  return {
    type: plainText(box.type) || (box.uses ? 'Kit' : 'Item'), attribute: plainText(box.attribute), unique: /^(y|yes|true|1)$/i.test(box.unique || ''),
    classification: weapon ? 'variable-weapon' : 'item', stats: box.uses ? [`Uses: ${plainText(box.uses)}`] : [],
    introduction: plainText(intro), acquisitionText: plainText(section(page.wikitext, 'Acquisition')),
    acquisitionTitles: links(acquisition).map(link => link.title), reference: reference(page)
  };
}
