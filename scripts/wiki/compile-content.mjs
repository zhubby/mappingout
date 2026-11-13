import fs from 'node:fs/promises';
import path from 'node:path';
import { evidenceDir, readIndex, loadPage, web } from './client.mjs';
import { reference, npcFacts, weaponFacts, itemFacts, itemFamilyFacts } from './content-facts.mjs';
import { collectorTableFacts, collectorTables, assertCollectorIdentity } from './collector-facts.mjs';
import { plainText, section } from './wikitext.mjs';
import { skillFacts } from './skill-facts.mjs';
import { assertBossEvidence } from './boss-evidence.mjs';
import { legacyWeaponProfile, matchingWeaponProfile } from './weapon-evidence.mjs';
import { questFacts, questPages, chestFacts } from './source-facts.mjs';
import { locationFacts } from './location-facts.mjs';

const index = await readIndex();
const reviewed = JSON.parse(await fs.readFile(path.join(web, 'scripts/wiki/reviewed-content.json'), 'utf8'));
const storyInputs = JSON.parse(await fs.readFile(path.join(web, 'scripts/wiki/story-guides.json'), 'utf8'));
const collectors = JSON.parse(await fs.readFile(path.join(web, 'scripts/wiki/collector-reviews.json'), 'utf8'));
const bosses = JSON.parse(await fs.readFile(path.join(web, 'scripts/wiki/boss-reviews.json'), 'utf8'));
const weapons = JSON.parse(await fs.readFile(path.join(web, 'scripts/wiki/weapon-reviews.json'), 'utf8'));
const supplemental = JSON.parse(await fs.readFile(path.join(web, 'scripts/wiki/supplemental-reviews.json'), 'utf8'));
const quests = JSON.parse(await fs.readFile(path.join(web, 'scripts/wiki/quest-reviews.json'), 'utf8'));
const rewards = JSON.parse(await fs.readFile(path.join(web, 'scripts/wiki/reward-reviews.json'), 'utf8'));
const specials = JSON.parse(await fs.readFile(path.join(web, 'scripts/wiki/special-reviews.json'), 'utf8'));
const additionalItems = JSON.parse(await fs.readFile(path.join(web, 'scripts/wiki/additional-item-reviews.json'), 'utf8'));
const locations = JSON.parse(await fs.readFile(path.join(web, 'scripts/wiki/zone-reviews.json'), 'utf8'));
const catalog = JSON.parse(await fs.readFile(path.join(web, 'public/data/catalog.json'), 'utf8'));
const records = new Map(catalog.records.map(r => [r.id, r]));
const output = { format: 1, entries: {}, additions: [], locationNotes: {}, stories: [] };
const review = { format: 1, coverage: {}, entries: [], issues: [] };
async function pinned(title, revision) {
  const page = await loadPage(title, index);
  if (!page || !revision || page.revid !== revision) throw new Error(`Content needs revision review: ${title}`);
  return page;
}
function patch(id, expectedKind, page, value, fields, references = []) {
  const record = records.get(id);
  if (!record || record.kind !== expectedKind) throw new Error(`Legacy identity changed: ${id}`);
  output.entries[id] = { englishName: page.title, descriptionLanguage: 'zh', ...value, wiki: { ...reference(page), fields, coordinateStatus: 'legacy-unverified', translation: 'reviewed', references } };
  review.entries.push({ id, title: page.title, revid: page.revid, fields, relatedRevisions: references.map(r => ({ title: r.title, revid: r.revid })) });
}
for (const value of reviewed.bosses) {
  const page = await pinned(value.title, value.revid), facts = npcFacts(page);
  if (!facts.boss || facts.profession !== records.get(value.id)?.profession) throw new Error(`Boss evidence mismatch: ${value.title}`);
  patch(value.id, 'boss', page, { description: value.description, details: value.details, profession: facts.profession, npc: facts }, ['身份', '职业', '等级', '技能列表', '掉落列表', '所在区域']);
}
for (const value of bosses) {
  if (output.entries[value.id]) continue;
  const record = records.get(value.id);
  const page = await pinned(value.title, value.revid), facts = npcFacts(page);
  const skills = [];
  for (const input of value.skills) {
    const skillPage = await pinned(input.title, input.revid);
    skills.push({ ...input, facts: skillFacts(skillPage) });
  }
  assertBossEvidence(record, facts, skills, value);
  const areaReferences = [];
  for (const area of value.areaSources) areaReferences.push(reference(await pinned(area.title, area.revid)));
  const names = { 1: '战士', 2: '游侠', 3: '僧侣', 4: '死灵法师', 5: '幻术师', 6: '元素使', 7: '刺客', 8: '祭祀', 9: '圣言使', 10: '神唤者' };
  patch(value.id, 'boss', page, {
    description: `${names[facts.profession]} Boss · ${value.areas.join(' / ')}。技能、等级和掉落按 Wiki 所列资料展示；出现条件另见来源备注。`,
    details: [`主职业：${names[facts.profession]}${facts.secondaryProfession ? `；副职业：${names[facts.secondaryProfession]}` : ''}${facts.thirdProfession ? ` / ${names[facts.thirdProfession]}` : ''}`, `等级（Wiki 原文）：${facts.level}`, `技能列表（英文）：${facts.skills.join(' · ')}`, ...(facts.drops.length ? [`掉落列表（英文）：${facts.drops.join(' · ')}`] : [])],
    profession: facts.profession, npc: { ...facts, notes: plainText(section(page.wikitext, 'Notes') || section(page.wikitext, 'Note')) }
  }, ['NPC 身份', '主副职业', '等级', '技能与捕获来源', '所在区域', 'Wiki 所列掉落'], [...skills.map(skill => skill.facts.reference), ...areaReferences]);
}
for (const value of supplemental) {
  if (output.entries[value.id]) continue;
  const record = records.get(value.id);
  const page = await pinned(value.title, value.revid), facts = npcFacts(page);
  if (!record || (record.legacy || record).name !== value.name || record.campaign !== value.campaign) throw new Error(`Supplemental NPC identity mismatch: ${value.id}`);
  const role = facts.boss ? 'boss' : facts.service ? 'service' : /\[\[Category:Boss-like foes\]\]/i.test(page.wikitext) ? 'boss-like' : 'enemy';
  if (role !== value.role) throw new Error(`NPC classification changed: ${page.title}`);
  const label = { boss: 'Boss', 'boss-like': '首领级敌人（Wiki 未列为可捕获 Boss）', enemy: '普通敌人', service: '技能 / 奖励服务 NPC' }[role];
  const notes = plainText(section(page.wikitext, 'Notes') || section(page.wikitext, 'Note'));
  const details = [`分类：${label}`, `等级（Wiki 原文）：${facts.level}`, `Wiki 所列区域：${facts.areas.join(' / ')}`, ...(facts.service ? [`服务（英文）：${facts.service}`] : []), ...(facts.skills.length ? [`Wiki 所列技能（不同模式与区域可能不同，英文）：${facts.skills.join(' · ')}`] : []), ...(facts.drops.length ? [`Wiki 所列掉落（英文）：${facts.drops.join(' · ')}`] : [])];
  if (page.title === 'Krak Flamewhip') details.push('旧资料关联的 Dwarven Battle Stance 与当前资料不符。Jaga Moraine 版本使用 Devastating Hammer，且该 NPC 没有 Boss 光环；不能将其作为捕获 Boss。Sorrow\'s Furnace 是另一套技能，详见技能分组。');
  if (page.title === 'Executioner Vekil') details.unshift('历史内容：Wiki 记录此 Boss 不会刷新。请使用技能详情中其他已列出的捕获来源。');
  if (page.title === 'Eshau Longspear') details.unshift('旧地点与当前来源有矛盾：Wiki 列为 Arkjok Ward / Secure the Refuge，并非旧标记所列 Sunspear Sanctuary。');
  patch(value.id, 'boss', page, { description: `${label} · ${page.title}。保留旧条目 ID；这条记录所属的旧分类不决定 NPC 是否为 Boss。`, details, profession: facts.profession, npc: { ...facts, role, notes } }, ['NPC 身份', 'Boss / 普通敌人 / 服务 NPC 分类', 'Wiki 所列职业、等级、技能与掉落']);
  if (['Executioner Vekil', 'Eshau Longspear'].includes(page.title)) for (const place of record.locations) output.locationNotes[place.id] = { text: details[0], unconfirmed: true, reference: reference(page) };
}
for (const value of rewards) {
  const record = records.get(value.id), page = await pinned(value.title, value.revid), facts = chestFacts(page);
  if (!record || record.kind !== 'boss' || (record.legacy || record).name !== value.name || record.campaign !== value.campaign || !page.wikitext.includes(`[[${value.dungeon}]]`)) throw new Error(`Reward source changed: ${value.id}`);
  patch(value.id, 'boss', page, {
    name: `副本奖励：${value.dungeon}`, description: `${value.dungeon} 的完成奖励由 ${page.title} 发放。独特武器与随机属性装备分别列出，不能将宝箱奖励理解为 Boss 直接掉落。`,
    details: [`宝箱规则（英文）：${facts.introduction}`, ...facts.items.map(item => `${item.category}：${item.title}`)],
    loot: { type: 'chest', dungeon: value.dungeon, ...facts }
  }, ['副本奖励来源', '宝箱出现条件与开箱规则', '独特物品与随机装备分类', '掉落列表']);
  for (const place of record.locations) output.locationNotes[place.id] = { text: `旧副本标记尚未核对，不代表宝箱在地图上的位置。奖励宝箱位于 ${value.dungeon}；请查阅其完成条件。`, unconfirmed: true, reference: reference(page) };
}
for (const value of specials) {
  const record = records.get(value.id), pages = [];
  if (!record || record.kind !== 'boss' || (record.legacy || record).name !== value.legacyName) throw new Error(`Special source identity mismatch: ${value.id}`);
  for (const source of value.sources) pages.push(await pinned(source.title, source.revid));
  const groups = pages.filter(page => /\{\{NPC infobox/i.test(page.wikitext)).map(page => ({ ...npcFacts(page), notes: plainText(section(page.wikitext, 'Notes')) }));
  patch(value.id, 'boss', pages[0], {
    name: value.name, description: value.notes.join('\n'), details: groups.flatMap(npc => [`${npc.title}：${npc.areas.join(' / ')}`, ...(npc.skillsText ? [`技能（英文）：${npc.skillsText}`] : []), ...(npc.drops.length ? [`掉落（英文）：${npc.drops.join(' / ')}`] : [])]),
    loot: { type: value.type, sources: groups }
  }, value.type === 'unresolved' ? ['当前技能获取来源；旧 NPC 身份仍未确定'] : ['来源分类', '获取与兑换条件', '独立 NPC 来源与分组'], pages.slice(1).map(reference));
  for (const place of record.locations) output.locationNotes[place.id] = { text: '旧标记未能与此来源的实际位置逐点对应，暂不显示。请以详情中的获取地点和条件为准。', unconfirmed: true, reference: reference(pages[0]) };
  if (value.type === 'unresolved') {
    output.entries[value.id].wiki.identityStatus = 'unresolved';
    review.issues.push({id: value.id, kind: 'unresolved-identity', detail: value.notes[0]});
  }
}
for (const value of additionalItems) {
  const record = records.get(value.id), page = await pinned(value.title, value.revid), variants = [];
  for (const input of value.variants || []) variants.push(await pinned(input.title, input.revid));
  const facts = variants.length ? itemFamilyFacts(variants) : itemFacts(page);
  const mismatches = facts.classification === 'unique-weapon' ? matchingWeaponProfile(legacyWeaponProfile(record), facts) : [];
  if (!record || record.kind !== 'green' || (record.legacy || record).name !== value.name || record.campaign !== value.campaign || JSON.stringify(legacyWeaponProfile(record)) !== JSON.stringify(value.profile) || JSON.stringify(mismatches) !== JSON.stringify(value.mismatches) || facts.classification !== value.classification) throw new Error(`Additional item identity changed: ${value.id}`);
  const sources = [];
  const resolve = title => { for (let i = 0; i < 10 && index.aliases[title]; i++) title = index.aliases[title]; return title; };
  for (const source of value.sources) {
    const sourcePage = await pinned(source.title, source.revid);
    let listed = false;
    if (source.type === 'npc') listed = npcFacts(sourcePage).drops.some(title => resolve(title) === page.title);
    if (source.type === 'chest') listed = chestFacts(sourcePage).items.some(item => resolve(item.title) === page.title);
    if (source.type === 'quest') listed = section(sourcePage.wikitext, 'Quest information').includes(`[[${page.title}`);
    if (!listed || !facts.acquisitionTitles.some(title => resolve(title) === sourcePage.title)) throw new Error(`Additional item acquisition changed: ${value.id}`);
    sources.push(reference(sourcePage));
  }
  const typeLabels = { 'unique-weapon': '独特武器', 'weapon-family': '独特武器（多个版本）', 'variable-weapon': '随机属性装备', item: '物品' };
  const notes = plainText(section(page.wikitext, 'Notes') || section(page.wikitext, 'Note'));
  patch(value.id, 'green', page, {
    description: `${typeLabels[facts.classification]} · ${facts.type}${facts.attribute ? ` · ${facts.attribute}` : ''}。获取条件与属性按 Wiki 英文资料展示。`,
    details: [...(facts.classification === 'variable-weapon' ? ['此条为随机属性装备外观，没有一套固定需求与词缀；旧版列出的数字不能视为掉落保证。'] : []), ...(mismatches.length ? ['旧版类型或需求记录有误 / 不完整；以下以当前 Wiki 为准，旧数字保留在折叠资料中。'] : []), ...facts.stats, ...(facts.versions || []).flatMap(table => ['版本表（英文）：', ...table.map(row => row.join(' · '))]), ...(facts.introduction ? [`物品说明（英文）：${facts.introduction}`] : []), ...(facts.acquisitionText ? [`获取方式（英文）：${facts.acquisitionText}`] : []), ...(notes ? [`Wiki 备注（英文）：${notes}`] : [])],
    item: { ...facts, sources }
  }, ['物品身份', '物品 / 独特武器 / 随机装备分类', '当前类型和属性', ...(['unique-weapon', 'weapon-family'].includes(facts.classification) ? ['当前需求与加成'] : []), 'Wiki 所列获取说明'], [...sources, ...variants.slice(1).map(reference)]);
}
{
  const id = 'green:4:fa6b4893b980e1a7', page = await pinned("Hierophant's Chest", rewards.find(value => value.title === "Hierophant's Chest").revid);
  patch(id, 'green', page, {
    description: '旧装备“火之刃”的身份仍未确定。旧记录仅写“剑、鉴定获取属性”，不足以与 Wiki 中的具体物品对应。',
    details: ['旧库将此条与 Slavers’ Exile 奖励关联，但当前来源没有足够证据确认它是哪一种装备。', '未将其替换成名称相近的 Fiery Blade Axe 或其他武器；旧记录保留供后续核对。'],
    item: { classification: 'unresolved' }
  }, ['旧关联来源审查；物品身份仍未确定']);
  output.entries[id].wiki.identityStatus = 'unresolved';
  review.issues.push({ id, kind: 'unresolved-identity', detail: '火之刃：旧名称、类型与来源不足以确认具体 Wiki 物品；未猜测其属性或位置。' });
}
for (const value of quests) {
  const record = records.get(value.id), skill = records.get(value.skill.id);
  if (!record || record.kind !== 'boss' || (record.legacy || record).name !== value.name || record.campaign !== value.campaign || !record.related?.includes(skill?.id)) throw new Error(`Quest legacy identity mismatch: ${value.id}`);
  const skillPage = await pinned(value.skill.title, value.skill.revid), currentSkill = skillFacts(skillPage);
  if (currentSkill.elite && !currentSkill.pveOnly) throw new Error(`Capturable elite cannot be converted to quest reward: ${value.id}`);
  const sources = [], branches = [];
  for (const input of value.acquisition) {
    const page = await pinned(input.title, input.revid);
    if (!currentSkill.acquisition.some(source => source.method === 'quest' && (index.aliases[source.title] || source.title) === page.title)) throw new Error(`Quest acquisition changed: ${value.id}`);
    sources.push(page);
    branches.push(...await questPages(page, title => loadPage(title, index)));
  }
  if (JSON.stringify([...new Set(branches.map(page => page.title))].sort()) !== JSON.stringify(value.sources.map(source => source.title).sort())) throw new Error(`Quest branches changed: ${value.id}`);
  const facts = [];
  for (const input of value.sources) {
    const page = await pinned(input.title, input.revid), quest = questFacts(page);
    if (!quest.rewardedSkills.includes(skillPage.title)) throw new Error(`Quest reward changed: ${value.id}`);
    sources.push(page); facts.push(quest);
  }
  const references = [...new Map([skillPage, ...sources].map(page => [page.pageid, reference(page)])).values()];
  patch(value.id, 'boss', sources[0], {
    name: `技能获取：${skill.name}`, englishName: `${skillPage.title} — ${facts.map(quest => quest.title).join(' / ')}`,
    description: '任务奖励来源。此技能通过完成任务学习；旧版将任务联系人收录在 Boss 类别，不能据此使用捕获纹章。',
    details: facts.flatMap(quest => [`任务：${quest.title}`, `接取人（英文）：${quest.givenBy}`, `接取地点（英文）：${quest.givenAt}`, ...(quest.prerequisites ? [`前置任务（英文）：${quest.prerequisites}`] : []), `奖励（英文）：${quest.rewards}`]),
    profession: currentSkill.profession, quest: { skill: skill.id, branches: facts }
  }, ['技能的任务获取方式', '任务分支', '接取人和地点', '前置任务', '任务奖励'], references.filter(ref => ref.pageid !== sources[0].pageid));
  for (const place of record.locations) output.locationNotes[place.id] = {
    text: '旧任务联系人位置尚未核对，暂不绘制地图标记。请以任务详情中列出的接取人与接取地点为准。',
    unconfirmed: true, reference: reference(sources[0])
  };
}
for (const value of reviewed.weapons) {
  const page = await pinned(value.title, value.revid), facts = weaponFacts(page);
  const bossSpec = reviewed.bosses.find(b => b.title === value.boss);
  const boss = await pinned(bossSpec.title, bossSpec.revid);
  if (!facts.unique || !npcFacts(boss).drops.includes(page.title) || !records.get(value.id).related?.includes(bossSpec.id)) throw new Error(`Drop evidence mismatch: ${value.title}`);
  patch(value.id, 'green', page, { description: value.description, details: value.details, item: { ...facts, droppedBy: value.boss } }, ['物品身份', '武器类型', '属性要求', '伤害与加成', '掉落来源'], [reference(boss)]);
}
for (const value of weapons) {
  if (output.entries[value.id]) continue;
  const record = records.get(value.id);
  const page = await pinned(value.title, value.revid), facts = weaponFacts(page);
  const boss = await pinned(value.boss, value.bossRevid), npc = npcFacts(boss);
  const resolve = title => { for (let i = 0; i < 10 && index.aliases[title]; i++) title = index.aliases[title]; return title; };
  if (!record || (record.legacy || record).name !== value.name || record.campaign !== value.campaign || JSON.stringify(legacyWeaponProfile(record)) !== JSON.stringify(value.profile) || matchingWeaponProfile(value.profile, facts).length || !value.bossIds.every(id => record.related?.includes(id) && output.entries[id]?.englishName === boss.title) || !npc.drops.includes(page.title) || !facts.acquisitionTitles.some(title => resolve(title) === boss.title)) throw new Error(`Weapon identity or drop evidence mismatch: ${value.id}`);
  const notes = plainText(section(page.wikitext, 'Notes') || section(page.wikitext, 'Note'));
  patch(value.id, 'green', page, {
    description: `${boss.title} 掉落的独特武器。类型：${facts.type}${facts.bowClass ? ` / ${facts.bowClass}` : ''}；属性需求与加成按 Wiki 英文原文列出。`,
    details: [...facts.stats, ...(notes ? [`Wiki 备注（英文）：${notes}`] : [])], item: { ...facts, droppedBy: value.boss }
  }, ['物品身份', '武器与弓种类型', '属性要求与加成', 'NPC 与物品双向掉落来源'], [reference(boss)]);
}
for (const value of reviewed.collectors) {
  const page = await pinned(value.title, value.revid), table = await pinned(value.table, value.tableRevid);
  if (!page.wikitext.includes(`{{:${table.title}}}`)) throw new Error(`Collector table is no longer transcluded: ${page.title}`);
  patch(value.id, 'collector', page, { description: value.description, details: value.details }, ['所在区域', '兑换材料与数量', '四项奖励及属性'], [reference(table)]);
}
for (const value of collectors) {
  if (output.entries[value.id]) continue;
  const page = await pinned(value.title, value.revid), table = await pinned(value.table, value.tableRevid);
  assertCollectorIdentity(records.get(value.id), page);
  const linkedTables = await Promise.all(collectorTables(page).map(title => loadPage(title, index)));
  if (!linkedTables.some(linked => linked?.pageid === table.pageid)) throw new Error(`Collector table link changed: ${page.title}`);
  const facts = collectorTableFacts(table, records.get(value.id), page);
  if (facts.amount !== value.amount || facts.material !== value.material || facts.armor !== value.armor) throw new Error(`Collector trade selection changed: ${value.id}`);
  const notes = plainText(section(page.wikitext, 'Notes'));
  patch(value.id, 'collector', page, {
    description: `收藏家 · Wiki 所列位置：${facts.location}。此记录对应${facts.armor ? '护甲' : '物品 / 武器'}兑换组，奖励属性按 Wiki 英文原文列出。`,
    details: [`兑换材料：${facts.amount} ${facts.material}`, ...facts.rewards.map(row => row.join(' · ')), ...(notes ? [`Wiki 补充备注（英文）：${notes}`] : [])],
    collector: { amount: facts.amount, material: facts.material, location: facts.location, armor: facts.armor, rewards: facts.rewards }
  }, ['NPC 身份与篇章', '兑换组', '兑换材料与数量', '奖励与属性'], [reference(table)]);
}
const vanquisher = await pinned('Vanquisher', 2738774);
const locationTypes = { 'Explorable area': '探索区域', Outpost: '前哨站', Landmark: '地标', Cooperative: '主线任务', Town: '城镇', Port: '港口城镇', 'Mission outpost': '任务前哨站', Challenge: '挑战任务', Elite: '精英区域', Dungeon: '地下城', Arena: 'PvP 竞技场', Quest: '主线任务' };
const locationNotes = {
  'zone:1:91': '旧库另有 zone:1:90“天际流域”。此重复标记没有独立地图实例的证据，不作为第二个清剿目标；保留旧编号，暂停绘制此重复位置。',
  'zone:2:146': '此条是 Raisu Palace 主线任务。清剿只适用于独立的探索版本；探索版本需完成主线后从 Imperial Sanctum 前哨站进入，已单独收录。',
  'zone:2:147': 'Divine Path 是完成 Imperial Sanctum 后进入的通关奖励区域，不能清剿。',
  'zone:2:165': '旧名“申赞通道（任务）”有误：主线任务是 Sunjiang District，Shenzun Tunnels 是相邻的探索区域。',
  'zone:3:217': 'Churrhir Fields 是训练区域，不计入 Elonian Vanquisher；不提供清剿进度。',
  'zone:4:330': 'Battledepths 的 Wiki 备注明确说明此地下探索区域不能清剿。',
  'zone:4:352': 'Shards of Orr 是三层地下城，完成地下城与清剿是不同目标。',
  'zone:4:364': '“四章通关”是旧版自定义进度标记，不是可清剿区域。北方之眼的最终主线为 A Time for Heroes，完成后进入 Epilogue；旧标记的位置未能对应到一个已确认的地图实例。'
};
if (locations.length !== 366 || new Set(locations.map(value => value.id)).size !== locations.length) throw new Error('Incomplete legacy location review');
for (const value of locations) {
  const record = records.get(value.id), original = record?.legacy || record;
  const page = await pinned(value.title, value.revid), facts = locationFacts(page);
  if (!record || original.name !== value.name || original.vanquishable !== value.legacyVanquishable || record.campaign !== value.campaign || facts.type !== value.type || facts.region !== value.region || facts.vanquishable !== value.vanquishable || !locationTypes[facts.type]) throw new Error(`Location review changed: ${value.id}`);
  const repeated = value.id === 'zone:1:91', completion = value.id === 'zone:4:364';
  const vanquishable = facts.vanquishable && !repeated && !completion;
  const details = [`Wiki 类型：${locationTypes[facts.type]}${facts.levels ? ` · ${facts.levels} 层` : ''}`, `所属地区（英文）：${facts.region}`, vanquishable ? '支持困难模式清剿；记录的是探索区域清剿，不是主线任务完成。' : '此条不作为清剿目标。'];
  if (facts.exits.length) details.push(`相邻出入口（英文）：${facts.exits.join(' / ')}`);
  if (locationNotes[value.id]) details.push(locationNotes[value.id]);
  patch(value.id, 'zone', page, {
    ...(value.id === 'zone:2:165' ? { name: '孙江行政区（任务）' } : {}),
    description: `${completion ? '旧版通关标记' : repeated ? '旧版重复区域标记' : locationTypes[facts.type]} · ${page.title}。${facts.region ? `Wiki 所属地区：${facts.region}。` : ''}`,
    details, vanquishable, area: { ...facts, atlasRegion: record.locations[0]?.region, legacyMarker: repeated || completion }
  }, ['区域或标记身份', '地图实例类型', 'Wiki 所属地区', '清剿资格', '相邻出入口'], [reference(vanquisher), ...(completion ? [reference(await pinned('Epilogue', 2689660))] : [])]);
  if (repeated || completion) for (const place of record.locations) output.locationNotes[place.id] = { text: locationNotes[value.id], unconfirmed: true, reference: reference(page) };
}
const raisuPage = await pinned('Raisu Palace (explorable area)', 2699046), raisu = locationFacts(raisuPage);
if (raisuPage.pageid !== 10970 || raisu.type !== 'Explorable area' || !raisu.vanquishable) throw new Error('Raisu explorable review changed');
const raisuEntry = {
  id: `zone:gww:${raisuPage.pageid}`, kind: 'zone', name: '莱苏皇宫（探索区域）', campaign: 2, origin: 'wiki',
  code: `gww-${raisuPage.pageid}`, englishName: raisuPage.title, descriptionLanguage: 'zh',
  description: '独立于 Raisu Palace 主线任务的探索版本，可进行困难模式清剿。',
  details: ['完成 Raisu Palace 主线任务后，从 Imperial Sanctum 前哨站进入；Raisu Palace 前哨站一侧为单向出口，不能由此进入探索版本。', '清剿进度与主线任务完成分别记录。', '旧地图未提供此版本独立的已确认标记，资料查询保留，暂不绘制推测位置。'],
  vanquishable: true, locations: [], source: { file: `data/wiki/pages/${raisuPage.pageid}.json`, line: 1 }, area: { ...raisu, atlasRegion: '2:1' },
  wiki: { ...reference(raisuPage), fields: ['探索版本身份', '所属地区', '清剿资格', '进入条件与单向出口'], coordinateStatus: 'legacy-unverified', translation: 'reviewed', references: [reference(vanquisher)] }
};
output.additions.push(raisuEntry);
records.set(raisuEntry.id, raisuEntry);
review.entries.push({ id: raisuEntry.id, title: raisuPage.title, revid: raisuPage.revid, fields: raisuEntry.wiki.fields, relatedRevisions: [{ title: vanquisher.title, revid: vanquisher.revid }] });
review.issues.push({ kind: 'legacy-area-markers', detail: '五个错误清剿目标已停用；Skyward Reach 的额外旧标记保留编号但不作为第二个目标，四章通关标记不再绘制。莱苏皇宫探索版本独立补入，不复用主线任务 ID 或推测地图坐标。' });
const charm = await pinned('Charm Animal', 2730833);
for (const value of reviewed.pets) {
  const page = await pinned(value.title, value.revid), facts = npcFacts(page);
  if (facts.type !== 'Charmable animal') throw new Error(`Not a charmable animal: ${value.title}`);
  for (const id of value.ids) {
    const details = [value.level, '使用 Charm Animal 驯服；目标不能比角色高出 4 级以上，且角色当前不能已有宠物。', ...value.notes];
    patch(id, 'pet', page, { description: `可驯服动物 · ${page.title}`, details, pet: { species: page.title, level: facts.level, areas: facts.areas } }, ['物种身份', '等级范围', '驯服方式与特殊条件'], [reference(charm)]);
    if (['pet:3:21', 'pet:3:22'].includes(id)) for (const place of records.get(id).locations.filter(p => p.zone === '3:245')) {
      output.locationNotes[place.id] = { text: '仅在完成 The Great Zehtuka 之前出现；此处为可驯服的 12 级敌对狮群。', reference: reference(page) };
    }
  }
}
const treasure = await pinned('Treasure', 2723362);
const treasures = [
  [233, 'Issnur Isles', 'Buried Treasure'], [240, 'Arkjok Ward', 'Buried Treasure'], [272, 'The Mirror of Lyss', 'Buried Treasure'], [283, 'The Ruptured Heart', 'Buried Treasure'],
  [235, 'Mehtani Keys', 'Treasure Chest'], [245, 'Jahai Bluffs', 'Treasure Chest'], [267, 'The Hidden City of Ahdashim', 'Treasure Chest'], [293, 'The Sulfurous Wastes', 'Treasure Chest'], [297, 'Domain of Pain', 'Treasure Chest'], [295, 'Nightfallen Jahai', 'Treasure Chest'],
  [250, 'Bahdok Caverns', 'Do Not Touch'], [265, 'Forum Highlands', 'Do Not Touch']
];
for (const [code, area, title] of treasures) {
  const matching = catalog.records.filter(r => r.kind === 'treasure' && r.locations.some(p => p.zone === `3:${code}`));
  if (matching.length !== 1 || !treasure.wikitext.includes(`[[${area}]]`)) throw new Error(`Treasure area mismatch: ${area}`);
  const objectPage = await pinned(title, { 'Buried Treasure': 2723361, 'Treasure Chest': 2560946, 'Do Not Touch': 2691877 }[title]);
  patch(matching[0].id, 'treasure', objectPage, {
    description: `${area} 的 ${title}，属于黑暗逆袭的无需钥匙宝藏。`,
    details: ['开启不需要钥匙或开锁工具；金币直接加入角色背包，物品掉落在地面。', '奖励品质会随同一角色开启宝藏的次数增加而永久降低；并非等满时间就恢复初始奖励。', '重开间隔在 Wiki 中仍属于估计，约为 30 天，过早尝试或开启其他宝藏可能影响等待时间；本工具只记录日期，不保证重置倒计时。', ...(title === 'Do Not Touch' ? ['开启时可能出现 3–5 个火系巨灵守卫；Wiki 同时记录守卫有时不出现的异常。'] : [])],
    treasure: { type: title, area, resetDays: null }
  }, ['宝藏类型', '所在区域', '钥匙需求', '奖励衰减', '重开时间的不确定性'], [reference(treasure)]);
}
for (const [id, value] of Object.entries(reviewed.locationNotes)) {
  output.locationNotes[id] = { text: value.text, reference: reference(await pinned(value.title, value.revid)) };
}
for (const input of storyInputs) {
  const references = [];
  for (const [title, revision] of Object.entries(input.sources)) references.push(reference(await pinned(title, revision)));
  output.stories.push({ campaign: input.campaign, title: input.title, introduction: input.introduction, arcs: input.arcs, references });
}
review.coverage = Object.fromEntries(['boss', 'green', 'collector', 'pet', 'treasure', 'zone'].map(kind => [kind, review.entries.filter(e => records.get(e.id).kind === kind).length]));
review.coverage.vanquishableAreas = Object.values(output.entries).filter(entry => entry.vanquishable).length + output.additions.filter(entry => entry.vanquishable).length;
review.coverage.storylines = output.stories.length;
review.coverage.unresolvedIdentities = Object.values(output.entries).filter(entry => entry.wiki.identityStatus === 'unresolved').length;
review.issues.push({ kind: 'review-scope', detail: '全部旧资料条目已完成本轮来源审查；两条身份无法确认，另见逐条问题。旧地图坐标未逐点核验，矛盾和未确认的来源标记已停用。350 条技能效果及部分物品属性保留当前英文，未完成中文翻译。' });
await fs.writeFile(path.join(evidenceDir, 'content-corrections.json'), JSON.stringify(output, null, 2) + '\n');
await fs.writeFile(path.join(evidenceDir, 'content-review.json'), JSON.stringify(review, null, 2) + '\n');
console.log(review.coverage);
