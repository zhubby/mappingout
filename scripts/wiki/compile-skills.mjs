import fs from 'node:fs/promises';
import path from 'node:path';
import { evidenceDir, readIndex, loadPage, web } from './client.mjs';
import { attributes, skillFacts, skillTypes } from './skill-facts.mjs';
import { reviewedTranslation } from './translations.mjs';

const catalog = JSON.parse(await fs.readFile(path.join(web, 'public/data/catalog.json'), 'utf8'));
const mappings = JSON.parse(await fs.readFile(path.join(web, 'scripts/wiki/skill-titles.json'), 'utf8'));
const translations = JSON.parse(await fs.readFile(path.join(web, 'scripts/wiki/translations.json'), 'utf8'));
const iconMatches = JSON.parse(await fs.readFile(path.join(evidenceDir, 'skill-icon-comparison.json'), 'utf8'));
const index = await readIndex();
const extraTypes = { 'Well Spell': '井池魔法', 'Touch Signet': '触碰纹章', 'Ward Spell': '结界魔法', 'Touch skill': '触碰技能', 'touch skill': '触碰技能', 'Touch spell': '触碰咒文', 'Touch Hex Spell': '触碰降咒', Form: '形态', 'Ranged Attack': '远程攻击技能' };
const identityExceptions = {
  'skill:0:293': '旧核心条目没有图片；与四章 Feel No Pain 的同名说明、效果与冷却一致，保留两个旧 ID。',
  'skill:4:1': '旧四章条目没有图片；与核心 Cleave 同名同效果，并有独立四章获取地点，保留旧 ID。',
  'skill:2:214': '旧图标不匹配；依据弓条件延长效果、专精属性、施放 1 秒、冷却 12 秒和 Nundak The Archer 获取来源对应 Archer’s Signet。',
  'skill:2:345': '旧周年图标不匹配；依据暗影步、目标属性窃取与周年刺客技能说明对应 Shadow Theft。',
  'skill:2:349': '旧周年图标不匹配；依据为宠物和召唤生物赋予随机武装的周年祭祀技能说明对应 Weapons of Three Forges。',
  'skill:3:292': '依据巨奴虫、400 土系投射伤害、近距限制与 5 能量 / 2 秒 / 8 秒冷却，确认 Junundu Siege；属于临时技能，不是普通捕获技能。',
  'skill:3:348': '旧周年图标不匹配；依据结束加持时获得能量的周年神唤技能说明对应 Vow of Revolution。',
  'skill:4:347': '旧周年图标不匹配；依据提高攻击、施法和技能回复速度的周年幻术结界说明对应 Time Ward。'
};
const corrections = { format: 1, source: 'https://wiki.guildwars.com', scope: 'skills', entries: {} };
const review = { format: 1, reviewedFields: ['description', 'type', 'profession', 'attribute', 'energy', 'adrenaline', 'activation', 'recharge', 'upkeep', 'sacrifice', 'overcast', 'elite', 'pveOnly', 'acquisition'], coverage: {}, issues: [], entries: [] };
for (const record of catalog.records.filter(r => r.kind === 'skill')) {
  const title = mappings[Number(record.code)];
  const page = await loadPage(title, index);
  if (!page) throw new Error(`Unresolved skill ${record.id}: ${title}`);
  const facts = skillFacts(page);
  if (!facts?.description || facts.unknownTemplates || /NaN|undefined/.test(facts.description)) throw new Error(`Unparsed mechanics: ${title}`);
  const icon = iconMatches.find(m => m.id === record.id);
  const normalize = title => title.replace(/ \(PvP\)$/, '');
  if (!identityExceptions[record.id] && (!icon || normalize(icon.candidates[0].title) !== normalize(title))) throw new Error(`Identity needs review: ${record.id}: ${title}`);
  const chinese = reviewedTranslation(page, translations);
  const type = skillTypes[facts.type] || extraTypes[facts.type];
  if (!type || attributes[facts.attribute] === undefined) throw new Error(`Untranslated metadata: ${facts.type}, ${facts.attribute}`);
  const pvpPage = await loadPage(`${page.title} (PvP)`, index);
  const pvpFacts = pvpPage ? skillFacts(pvpPage) : null;
  const special = Number(record.code) === 292;
  const skill = { ...facts, acquisition: facts.acquisition.map(({ raw, ...value }) => value), special, capturable: !special && facts.acquisition.some(s => s.method === 'capture'), ...(pvpFacts ? { pvp: { ...pvpFacts, acquisition: undefined } } : {}), faction: /\((Kurzick|Luxon)\)$/.exec(title)?.[1] };
  const details = [
    `${facts.elite ? '精英' : ''}${type}${facts.pveOnly ? ' · 仅限 PvE' : ''}${special ? ' · 巨奴虫临时技能' : ''}`,
    `维持：${facts.upkeep} · 怒气：${facts.adrenaline} · 能量：${facts.energy} · 施放：${facts.activation === '0' && /Attack/.test(facts.type) ? '普通攻击速度' : `${facts.activation} 秒`} · 冷却：${facts.recharge} 秒`,
    ...(facts.sacrifice !== '0' ? [`牺牲体力：${facts.sacrifice}%`] : []),
    ...(facts.overcast !== '0' ? [`过载：${facts.overcast}`] : []),
    ...(pvpFacts ? ['此技能的 PvE 与 PvP 版本不同；默认展示 PvE，PvP 说明另列。'] : [])
  ];
  const patch = { englishName: page.title, description: chinese?.text || facts.description, descriptionLanguage: chinese ? 'zh' : 'en', details, profession: facts.profession, attribute: attributes[facts.attribute], skill, wiki: { ...facts.reference, fields: review.reviewedFields, coordinateStatus: 'legacy-unverified', translation: chinese ? 'reviewed' : 'english-source' } };
  corrections.entries[record.id] = patch;
  review.entries.push({ id: record.id, title: page.title, revid: page.revid, identity: identityExceptions[record.id] || '英文技能名称 / 描述、技能图标独立比对一致', iconError: icon?.candidates[0].error, translated: !!chinese, changedFields: ['description', 'details', 'profession', 'attribute'].filter(key => JSON.stringify((record.legacy || record)[key]) !== JSON.stringify(patch[key])) });
  if (identityExceptions[record.id]) review.issues.push({ id: record.id, kind: 'identity-note', detail: identityExceptions[record.id] });
}
review.coverage = { skills: Object.keys(corrections.entries).length, chineseDescriptions: review.entries.filter(e => e.translated).length, pvpVariants: Object.values(corrections.entries).filter(e => e.skill.pvp).length, bosses: 0, weapons: 0, collectors: 0, storylines: 0 };
await fs.writeFile(path.join(evidenceDir, 'skill-corrections.json'), JSON.stringify(corrections, null, 2) + '\n');
await fs.writeFile(path.join(evidenceDir, 'skill-review.json'), JSON.stringify(review, null, 2) + '\n');
console.log(review.coverage);
