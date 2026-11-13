import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { plainText, templates } from '../scripts/wiki/wikitext.mjs';
import { skillFacts } from '../scripts/wiki/skill-facts.mjs';
import { npcFacts, weaponFacts, itemFacts } from '../scripts/wiki/content-facts.mjs';
import { locationFacts } from '../scripts/wiki/location-facts.mjs';
import { chestFacts, questFacts, questPages } from '../scripts/wiki/source-facts.mjs';
import { reviewedTranslation } from '../scripts/wiki/translations.mjs';
import { collectorTableFacts, assertCollectorIdentity } from '../scripts/wiki/collector-facts.mjs';
import { assertBossEvidence } from '../scripts/wiki/boss-evidence.mjs';
import { legacyWeaponProfile, matchingWeaponProfile } from '../scripts/wiki/weapon-evidence.mjs';
import { applyWikiCorrections } from '../scripts/wiki/apply.mjs';
import { query, defaultFilters, trackable, preferredPlace } from '../src/domain';
import { emptyPersonal, makeBackup, parseBackup } from '../src/storage';
import type { Catalog } from '../src/types';

const json = async (filename: string) => JSON.parse(await fs.readFile(filename, 'utf8'));
const data: Catalog = await json('public/data/catalog.json');
const index = await json('data/wiki/index.json');
async function page(title: string) {
  return json(`data/wiki/pages/${index.pages[title].pageid}.json`);
}
const entry = (id: string) => data.records.find(record => record.id === id)!;

describe('Wiki extraction uses the meaning of the source templates', () => {
  it('keeps links and nested template parameters together', () => {
    const [box] = templates('{{Skill infobox|description=[[skill|Effect]] {{gr|5|100}} {{gray|1=if x=y}}|energy=5}}', 'skill infobox');
    expect(box.fields.description).toBe('[[skill|Effect]] {{gr|5|100}} {{gray|1=if x=y}}');
    expect(box.fields.energy).toBe('5');
    expect(plainText(box.fields.description)).toBe('Effect 5…81…100 if x=y');
  });
  it('distinguishes attribute interpolation from title endpoints and retains unknown mechanics', () => {
    expect(plainText('{{gr|10|35}} {{gr2|10|20}} {{3/4}}')).toBe('10…30…35 10…20 0.75');
    expect(plainText('Damage: {{unknown formula|12}}')).toContain('{{unknown formula|12}}');
  });
  it('reads skill costs and does not turn campaign headings into capture targets', async () => {
    const facts = skillFacts(await page('Word of Healing'));
    expect(facts).toMatchObject({ gameIds: [282], energy: '5', activation: '0.75', recharge: '3' });
    expect(facts.acquisition.some((source: any) => source.title === 'Core')).toBe(false);
    expect(facts.acquisition).toContainEqual(expect.objectContaining({ title: 'Dassk Arossyss', campaign: 1, areas: ['Dunes of Despair'] }));
  });
  it('reads profession aliases and mission locations on actual Boss pages', async () => {
    expect(npcFacts(await page('Arlak Stoneleaf'))).toMatchObject({ boss: true, profession: 1, areas: ['Ice Caves of Sorrow'] });
    expect(npcFacts(await page('Flint Fleshcleaver')).drops).toContain("Flint's Fleshcleaver");
  });
  it('retains third professions and separates historical sources from current spawns', async () => {
    expect(npcFacts(await page('Blade Ancient Syu-Shai'))).toMatchObject({ profession: 7, secondaryProfession: 8, thirdProfession: 1 });
    expect(npcFacts(await page('Yoannh the Rebuilder'))).toMatchObject({ profession: 3, secondaryProfession: 10, thirdProfession: 9 });
    expect(entry('boss:3:5bc996f7ffeac3b6').details[0]).toContain('不会刷新');
    expect(entry('boss:3:5bc996f7ffeac3b6').locations.every(place => !place.valid)).toBe(true);
  });
  it('keeps both gender-specific quests and their actual rewards and prerequisites', async () => {
    const branches = await questPages(await page('Prenuptial Disagreement'), page);
    expect(branches.map((branch: any) => branch.title).sort()).toEqual(['Prenuptial Disagreement (female)', 'Prenuptial Disagreement (male)']);
    const female = questFacts(branches.find((branch: any) => branch.title.endsWith('(female)')));
    expect(female).toMatchObject({ givenBy: 'Olaf Olafson', givenAt: 'Olafstead', prerequisites: 'Bear Club for Women' });
    expect(female.rewardedSkills).toContain('"You Are All Weaklings!"');
    expect(female.rewards).not.toContain('Walkthrough');
  });
  it('retains per-chest rules and singular Other headings instead of inventing boss drops', async () => {
    expect(chestFacts(await page("Arachni's Spoils")).items).toContainEqual({ title: 'Mantis Dreamweaver Polymock piece', category: 'Other' });
    expect(chestFacts(await page('Citadel Chest')).introduction).toContain('exactly one');
    expect(chestFacts(await page("Hierophant's Chest")).introduction).toContain('Deldrimor Armor Remnant');
  });
  it('preserves variable attribute placeholders and expanded profession rows in weapon versions', async () => {
    const boar = weaponFacts(await page('Golden Boar Scepter'));
    expect(boar.stats[0]).toContain('<attribute>');
    expect(boar.versions[0]).toContainEqual(['Monk', 'Keeper of Light', 'Healing Prayers', 'Healing Prayers', 'Holy', '-']);
    expect(itemFacts(await page('Bone Dragon Staff')).classification).toBe('variable-weapon');
    expect(itemFacts(await page('Bonecage Scythe (unique)')).classification).toBe('unique-weapon');
  });
  it('recognizes lowercase names, the literal boss flag, singular mission headings and secondary professions', async () => {
    expect(npcFacts(await page('Goss Aleessh')).profession).toBe(5);
    expect(npcFacts(await page('Jono Yawpyawl')).boss).toBe(true);
    expect(npcFacts(await page('Issah Sshay')).areas).toContain('Thirsty River');
    expect(npcFacts(await page('Fenrir'))).toMatchObject({ profession: 9, secondaryProfession: 1 });
  });
  it('keeps campaign links with whitespace and repeated unlinked NPC acquisition variants', async () => {
    const powerBlock = skillFacts(await page('Power Block'));
    expect(powerBlock.acquisition).toContainEqual(expect.objectContaining({ title: 'Anmat the Trickster', campaign: 4 }));
    const blades = skillFacts(await page('Flashing Blades'));
    expect(blades.acquisition).toContainEqual(expect.objectContaining({ title: 'Lou, of the Knives', areas: ['Wajjun Bazaar', 'Deactivating P.O.X.'] }));
  });
  it('does not substitute a different boss with the same elite, profession and area', async () => {
    const review = (await json('scripts/wiki/boss-reviews.json')).find((value: any) => value.title === 'Arlak Stoneleaf');
    const skills = await Promise.all(review.skills.map(async (input: any) => ({ ...input, facts: skillFacts(await page(input.title)) })));
    const virag = npcFacts(await page('Virag Bladestone')), arlak = npcFacts(await page('Arlak Stoneleaf'));
    expect(() => assertBossEvidence(entry(review.id), virag, skills, review)).toThrow(/source identity/);
    expect(() => assertBossEvidence(entry(review.id), arlak, skills, { ...review, areas: ['Frozen Forest'] })).toThrow(/area evidence/);
  });
  it('normalizes bow subclasses while preserving the individual shortbow bonuses', async () => {
    const graygore = weaponFacts(await page("Graygore's Shortbow"));
    expect(matchingWeaponProfile({ type: 'bow', attribute: 'Marksmanship' }, graygore)).toEqual([]);
    expect(graygore.stats).toContain('Life Draining: 5');
    expect(weaponFacts(await page("Graygore's Zealous Shortbow")).stats).toContain('Energy gain on hit: 1');
    expect(legacyWeaponProfile({ details: ['钝击伤害:19-35 (需要 9 鎚术精通)'] })).toMatchObject({ type: 'hammer', attribute: 'Hammer Mastery' });
  });
  it('keeps all-spell recharge separate from attribute-specific casting time', async () => {
    const stats = weaponFacts(await page("Flint's Fleshcleaver")).stats;
    expect(stats).toContain('Halves skill recharge of spells (20% chance)');
    expect(stats).toContain('Halves casting time of Water Magic spells (20% chance)');
  });
  it('refuses a Chinese translation after the referenced revision changes', () => {
    expect(reviewedTranslation({ title: 'Cleave', revid: 2 }, {})).toBeNull();
    expect(() => reviewedTranslation({ title: 'Cleave', revid: 2 }, { Cleave: { revid: 1, text: '旧翻译' } })).toThrow(/revision review/);
  });
  it('keeps empty price cells from deleting actual weapon bonuses', async () => {
    const record = entry('collector:3:156');
    const facts = collectorTableFacts(await page('Keeper of Bone/Collector'), record, await page('Keeper of Bone'));
    expect(facts.amount).toBe(1);
    expect(facts.rewards[0].join(' ')).toContain('Health +30');
    expect(facts.rewards[0].join(' ')).toContain('Halves skill recharge of spells');
  });
  it('selects the matching cost group and retains separate armor and weapon rewards', async () => {
    const imperial = collectorTableFacts(await page('Imperial Quartermaster/Collector'), entry('collector:2:179'), await page('Imperial Quartermaster'));
    expect(imperial.amount).toBe(3);
    expect(imperial.rewards).toHaveLength(6);
    expect(imperial.rewards[0][0]).toBe('Forbidden Key');
    const innis = await page('Innis the White/Collector');
    expect(collectorTableFacts(innis, entry('collector:1:260')).rewards).toHaveLength(2);
    expect(collectorTableFacts(innis, entry('collector:1:276')).rewards).toHaveLength(4);
  });
  it('rejects the unrelated Kaya quest giver despite an identical name', async () => {
    const questGiver = await page('Kaya');
    expect(() => assertCollectorIdentity(entry('collector:3:128'), questGiver)).toThrow(/identity mismatch/);
    expect(assertCollectorIdentity(entry('collector:3:128'), await page('Kaya (collector)')).service).toBe('Collector');
  });
});

describe('corrected catalog and existing character compatibility', () => {
  it('preserves every original record ID and every original map coordinate', async () => {
    const baseline = await json('data/wiki/legacy-identities.json');
    const legacy = data.records.filter(record => record.origin !== 'wiki');
    const identities = legacy.map(record => ({ id: record.id, locations: record.locations.map(place => ({ id: place.id, region: place.region, zone: place.zone, x: place.x, y: place.y })) }));
    expect(legacy).toHaveLength(baseline.recordCount);
    expect(createHash('sha256').update(JSON.stringify(identities)).digest('hex')).toBe(baseline.idsAndCoordinates);
  });
  it('uses actual vanquishing evidence instead of the explorable-area label', async () => {
    expect(locationFacts(await page('Battledepths'))).toMatchObject({ type: 'Explorable area', vanquishable: false });
    expect(locationFacts(await page('Churrhir Fields'))).toMatchObject({ type: 'Explorable area', vanquishable: false });
    expect(locationFacts(await page('Shards of Orr'))).toMatchObject({ type: 'Dungeon', vanquishable: false });
    expect(locationFacts(await page('Raisu Palace (explorable area)'))).toMatchObject({ type: 'Explorable area', vanquishable: true });
    expect(locationFacts(await page('Raisu Palace'))).toMatchObject({ type: 'Cooperative', vanquishable: false });
  });
  it('corrects five false targets and preserves separate legacy markers without duplicate vanquishes', async () => {
    for (const id of ['zone:2:147', 'zone:3:217', 'zone:4:330', 'zone:4:352', 'zone:4:364']) {
      expect(entry(id).vanquishable, id).toBe(false);
      expect(entry(id).legacy?.vanquishable, id).toBe(true);
      expect(trackable(entry(id)), id).toBe(false);
    }
    expect(entry('zone:1:90').vanquishable).toBe(true);
    expect(entry('zone:1:91').vanquishable).toBe(false);
    expect(entry('zone:1:91').locations.every(place => !place.valid)).toBe(true);
    expect(entry('zone:4:364').locations.every(place => !place.valid)).toBe(true);
    const totals = [1, 2, 3, 4].map(campaign => data.records.filter(record => record.kind === 'zone' && record.campaign === campaign && record.vanquishable).length);
    expect(totals).toEqual([54, 33, 34, 15]);
    const areas = await Promise.all(data.records.filter(record => record.kind === 'zone' && record.vanquishable).map(record => page(record.englishName!)));
    expect(new Set(areas.map(source => source.pageid)).size).toBe(136);
    for (const source of areas) expect(templates(source.wikitext, 'Vanquisher'), source.title).toHaveLength(1);
  });
  it('adds the missing Raisu explorable version with its own identity and no invented coordinates', () => {
    const area = entry('zone:gww:10970'), mission = entry('zone:2:146');
    expect(mission.englishName).toBe('Raisu Palace');
    expect(trackable(mission)).toBe(false);
    expect(area).toMatchObject({ origin: 'wiki', kind: 'zone', vanquishable: true, locations: [], englishName: 'Raisu Palace (explorable area)' });
    expect(area.legacy).toBeUndefined();
    expect(area.details.join(' ')).toContain('Imperial Sanctum');
    expect(query(data, { ...defaultFilters, kind: 'zone', q: 'Raisu Palace' }, emptyPersonal()).map(record => record.id)).toContain(area.id);
    expect(query(data, { ...defaultFilters, kind: 'zone', campaign: '2', region: '2:1', q: 'Raisu Palace (explorable area)' }, emptyPersonal()).map(record => record.id)).toEqual([area.id]);
    expect(query(data, { ...defaultFilters, kind: 'zone', region: '2:2', q: 'Raisu Palace (explorable area)' }, emptyPersonal())).toHaveLength(0);
    expect(query(data, { ...defaultFilters, kind: 'zone', zone: 'gww:10970' }, emptyPersonal()).map(record => record.id)).toEqual([area.id]);
    expect(query(data, { ...defaultFilters, kind: 'zone', zone: '3:301:line-98' }, emptyPersonal()).map(record => record.id)).toEqual(['zone:3:301:line-98']);
    expect(data.records.filter(record => record.origin === 'wiki').map(record => record.id)).toEqual([area.id]);
  });
  it('retains historical personal records when an old target loses vanquishing eligibility', () => {
    const state = emptyPersonal();
    state.characters = [{ id: 'legacy-player', name: '旧角色' }];
    state.preferences.characterId = 'legacy-player';
    state.progress = [{ characterId: 'legacy-player', entryId: 'zone:4:330', done: true }];
    const restored = parseBackup(JSON.stringify(makeBackup(state))).data;
    expect(restored.progress).toEqual(state.progress);
    expect(query(data, { ...defaultFilters, kind: 'zone', incomplete: true }, restored).some(record => record.id === 'zone:4:330')).toBe(false);
    expect(query(data, { ...defaultFilters, kind: 'zone', incomplete: true }, restored)).toHaveLength(136);
  });
  it('hides uncertain positions in skills and linked source entries while retaining legacy search', () => {
    const skill = entry('skill:4:338'), source = entry('boss:4:d7559ebaf4f6df63');
    expect(source.name).toContain('技能获取');
    expect(skill.locations.every(place => !place.valid && place.positionStatus === 'unconfirmed' && place.legacyValid)).toBe(true);
    expect(preferredPlace(skill, defaultFilters)).toBeUndefined();
    expect(query(data, { ...defaultFilters, kind: 'boss', q: '奥伦·奥拉夫多蒂尔' }, emptyPersonal()).some(record => record.id === source.id)).toBe(true);
  });
  it('separates random skins, unique variants, multiple shields and unresolved identities', async () => {
    const raw = await json('public/data/catalog.json');
    const item = (name: string) => raw.records.find((record: any) => record.kind === 'green' && record.name === name);
    expect(item('骨牢镰刀').item.classification).toBe('variable-weapon');
    expect(item('骨笼镰刀').item.classification).toBe('unique-weapon');
    expect(item('鲁纳尔的硫磺法杖').englishName).toBe("Runar's Brimstone Staff");
    expect(item('维尔纳尔的法杖').englishName).toBe("Villnar's Staff");
    expect(item('卓克纳尔之盾').item.variants).toHaveLength(4);
    expect(item('火之刃').wiki.identityStatus).toBe('unresolved');
    expect(raw.records.filter((record: any) => record.wiki?.identityStatus === 'unresolved')).toHaveLength(2);
  });
  it('corrects changed mechanics and distinguishes learned and temporary skills', () => {
    expect(entry('skill:0:4').skill).toMatchObject({ type: 'Skill', recharge: '20' });
    expect(entry('skill:0:4').skill!.pvp!.description).not.toBe(entry('skill:0:4').skill!.description);
    expect(entry('skill:0:21').description).toContain('75%');
    expect(entry('skill:0:19').englishName).toBe('Tainted Flesh');
    expect(entry('skill:4:295').skill!.capturable).toBe(false);
    expect(trackable(entry('skill:3:292'))).toBe(false);
  });
  it('keeps identical Chinese pet names as different species and corrects levels and quest conditions', () => {
    expect(entry('pet:2:14').englishName).toBe('Lurker');
    expect(entry('pet:2:15').englishName).toBe('Reef Lurker');
    expect(entry('pet:4:32').details[0]).toContain('初始为 5 级');
    expect(entry('pet:4:32').legacy!.description).toBe('等级：20');
    const note = entry('pet:3:21').locations.find(place => place.zone === '3:245')!;
    expect(note.note).toContain('之前');
    expect(note.legacyNote).toContain('之后');
    for (const treasure of data.records.filter(e => e.kind === 'treasure')) expect(treasure.details.join(' ')).toContain('估计');
  });
  it('supports English search and preserves existing progress and backup identities', () => {
    const state = emptyPersonal();
    state.characters = [{ id: 'existing', name: '旧角色' }];
    state.preferences.characterId = 'existing';
    state.progress = [{ characterId: 'existing', entryId: 'skill:0:19', done: true }];
    expect(query(data, { ...defaultFilters, q: 'tainted flesh' }, state).some(e => e.id === 'skill:0:19')).toBe(true);
    expect(query(data, { ...defaultFilters, q: 'tainted flesh', incomplete: true }, state)).toHaveLength(0);
    expect(parseBackup(JSON.stringify(makeBackup(state))).data.progress).toEqual(state.progress);
  });
  it('reapplying corrections preserves original descriptions and location notes', async () => {
    const copy = structuredClone(data);
    await applyWikiCorrections(copy, {});
    expect(copy).toEqual(data);
  });
  it('rejects a correction whose legacy identity disappeared before modifying data', async () => {
    const copy = structuredClone(data);
    copy.records = copy.records.filter(e => e.id !== 'skill:0:19');
    const before = structuredClone(copy);
    await expect(applyWikiCorrections(copy, {})).rejects.toThrow(/legacy identity/);
    expect(copy).toEqual(before);
  });
  it('retains four storylines with explicit branch and parallel-route notes', () => {
    expect(data.stories).toHaveLength(4);
    expect(data.stories!.find(story => story.campaign === 2)!.arcs.some(arc => arc.note?.includes('替代路线'))).toBe(true);
    expect(data.stories!.find(story => story.campaign === 3)!.arcs.some(arc => arc.note?.includes('二选一'))).toBe(true);
    expect(data.stories!.find(story => story.campaign === 4)!.arcs.some(arc => arc.note?.includes('任意顺序'))).toBe(true);
    for (const story of data.stories!) expect(story.references).toHaveLength(2);
  });
});
