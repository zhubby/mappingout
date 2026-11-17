/**
 * [INPUT]: 依赖固定英文事实、字段路径与审校记录。
 * [OUTPUT]: 提供英文来源、数量签名与译文审校校验。
 * [POS]: 双语基线的证据边界；草稿不作为来源。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {createHash} from 'node:crypto';
import {atPath} from '../../src/i18n/content-fields.ts';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const han = value => /\p{Script=Han}/u.test(value);
const professions = ['None','Warrior','Ranger','Monk','Necromancer','Mesmer','Elementalist','Assassin','Ritualist','Paragon','Dervish'];
const campaigns = ['Core','Prophecies','Factions','Nightfall','Eye of the North'];
const labels = new Map(Object.entries({
  '此条不作为清剿目标。':'This entry is not a vanquishing target.',
  '支持困难模式清剿；记录的是探索区域清剿，不是主线任务完成。':'Track vanquishing of the explorable area in Hard Mode separately from mission completion.',
  '此技能的 PvE 与 PvP 版本不同；默认展示 PvE，PvP 说明另列。':'The PvE and PvP versions differ. PvE is shown by default; the PvP description is listed separately.',
  '任务奖励来源。此技能通过完成任务学习；旧版将任务联系人收录在 Boss 类别，不能据此使用捕获纹章。':'Quest reward. Learn this skill by completing a quest. Its legacy placement in the boss category does not make it capturable with a Signet of Capture.',
  '此条为随机属性装备外观，没有一套固定需求与词缀；旧版列出的数字不能视为掉落保证。':'This weapon appearance has variable stats. The legacy requirements and modifiers are not guaranteed drops.',
  '旧版类型或需求记录有误 / 不完整；以下以当前 Wiki 为准，旧数字保留在折叠资料中。':'The legacy type or requirement was incorrect or incomplete. The Wiki stats below take precedence; legacy figures are preserved in the source disclosure.',
  '版本表（英文）：':'Variants:',
  '旧标记未能与此来源的实际位置逐点对应，暂不显示。请以详情中的获取地点和条件为准。':'This legacy marker has not been matched to the acquisition location and is hidden. Consult the acquisition locations and conditions in the details.',
  '旧任务联系人位置尚未核对，暂不绘制地图标记。请以任务详情中列出的接取人与接取地点为准。':'The legacy quest-giver location is unverified and its marker is hidden. Consult the quest details for the giver and location.',
  '历史内容：Wiki 记录此 Boss 不会刷新。请使用技能详情中其他已列出的捕获来源。':'Historical content: the Wiki states that this boss does not spawn. Use another capture source listed in the skill details.',
  '旧地点与当前来源有矛盾：Wiki 列为 Arkjok Ward / Secure the Refuge，并非旧标记所列 Sunspear Sanctuary。':'The Wiki lists Arkjok Ward / Secure the Refuge, which conflicts with the legacy marker at Sunspear Sanctuary.',
  "Wiki 记录在 Grenth's Footprint 的四处可能出生点之一出现。旧图标记仅用于指引，尚未逐点核验。":"The Wiki lists four possible spawn locations in Grenth's Footprint. Legacy map coordinates have not been individually verified.",
  '仅在完成 The Great Zehtuka 之前出现；此处为可驯服的 12 级敌对狮群。':'These charmable level 12 hostile lions appear only before completing The Great Zehtuka.',
}));
const prefixes = [
  [/^等级（Wiki 原文）：/, 'Level: '], [/^所属地区（英文）：/, 'Region: '],
  [/^相邻出入口（英文）：/, 'Exits: '], [/^Wiki 所列区域：/, 'Locations: '],
  [/^技能汇总（英文，模式与出现条件见完整列表）：/, 'Skills (see the full list for mode and spawn conditions): '],
  [/^Wiki 所列技能（不同模式与区域可能不同，英文）：/, 'Skills (vary by mode and location): '],
  [/^(?:Wiki 所列掉落（英文）|掉落列表（英文）)：/, 'Items dropped: '],
  [/^服务（英文）：/, 'Service: '], [/^兑换材料：/, 'Exchange: '],
  [/^任务：/, 'Quest: '], [/^接取人（英文）：/, 'Given by: '], [/^接取地点（英文）：/, 'Given at: '],
  [/^前置任务（英文）：/, 'Prerequisites: '], [/^奖励（英文）：/, 'Rewards: '],
  [/^(?:Wiki 备注（英文）|Wiki 补充备注（英文）)：/, 'Wiki notes: '],
  [/^物品说明（英文）：/, 'Description: '], [/^获取方式（英文）：/, 'Acquisition: '],
  [/^宝箱规则（英文）：/, 'Chest rules: '],
];
function refsOf(owner, root) {
  if (owner?.reference) return [owner.reference];
  if (owner?.wiki) return [owner.wiki, ...(owner.wiki.references || [])];
  if (owner?.references) return owner.references;
  return root.references || [];
}
function context(data, field) {
  const [collection,index] = field.path;
  const row = data[collection]?.[index];
  let owner = row;
  // Nested PvP fields must cite the PvP revision, not the PvE page.
  for(let i=2;i<field.path.length-1;i++){
    const candidate=atPath(data,field.path.slice(0,i+1));
    if(candidate?.reference || candidate?.wiki || candidate?.references)owner=candidate;
  }
  return {row,owner,references:refsOf(owner,data)};
}
export function englishSource(data, dataset, field, manual = {}) {
  const {row,owner,references} = context(data,field);
  const path=field.path, leaf=path.at(-1), source=field.source;
  const result=(text,kind='wiki-text',refs=references)=>{
    if(typeof text!=='string'||!text.trim()||han(text))return undefined;
    return {text,kind,references:refs.map(({title,pageid,revid})=>({title,pageid,revid})),englishHash:sha256(text)};
  };
  const explicit=manual[`${dataset}/${field.key}`];
  if(explicit){
    if(explicit.sourceHash!==sha256(source)||!explicit.reviewer)throw Error(`Stale English source review: ${dataset}/${field.key}`);
    return result(explicit.text,explicit.kind||'application-text');
  }
  if(dataset==='catalog'){
    if(path[0]==='campaigns')return result(campaigns[row.id], 'application-label');
    if(path[0]==='professions')return result(professions[row.id], 'application-label');
    if(path[0]==='records'){
      if(row.wiki?.identityStatus==='unresolved'){
        if(leaf==='name')return result(row.kind==='green'?'Unresolved legacy item':'Unresolved legacy NPC','application-text');
        if(path[2]==='description')return result('The identity of this legacy entry has not been established. The cited page documents the investigation, not a confirmed NPC or item identity.','application-text');
      }
      if(leaf==='name'&&row.wiki?.identityStatus!=='unresolved')return result(row.englishName,'wiki-title');
      if(leaf==='attribute'&&row.skill)return result(row.skill.attribute,'wiki-text',[row.skill.reference]);
      if(leaf==='description'&&path.length===3){
        if(row.skill)return result(row.skill.description);
        if(row.item?.acquisitionText)return result(row.item.acquisitionText);
        if(row.npc)return result(`${professions[row.npc.profession]}${row.npc.boss?' boss':' NPC'} · ${row.npc.areas.join(' / ')}`, 'wiki-facts');
        if(row.area)return result(`${row.area.type} · ${row.area.title}${row.area.region?' · '+row.area.region:''}`, 'wiki-facts');
        if(row.collector)return result(`Collector · ${row.collector.location} · Exchange ${row.collector.amount} ${row.collector.material}`, 'wiki-facts');
        if(row.pet)return result(`Charmable animal · ${row.pet.species}`, 'wiki-facts');
        if(row.treasure)return result(`${row.treasure.type} · ${row.treasure.area}`, 'wiki-facts');
        if(row.loot?.type==='chest')return result(`${row.loot.title} · Completion reward for ${row.loot.dungeon}. Chest rewards are separate from direct boss drops.`, 'wiki-facts');
        if(row.item?.introduction)return result(row.item.introduction);
      }
      if(path[2]==='details'&&row.skill){
        const f=row.skill,index=Number(path[3]);
        const details=[`${f.elite?'Elite ':''}${f.type}${f.pveOnly?' · PvE only':''}${f.special?' · Temporary Junundu skill':''}`,
          `Upkeep: ${f.upkeep} · Adrenaline: ${f.adrenaline} · Energy: ${f.energy} · Activation: ${f.activation==='0'&&/Attack/.test(f.type)?'Attack speed':f.activation+' seconds'} · Recharge: ${f.recharge} seconds`,
          ...(f.sacrifice!=='0'?[`Health sacrifice: ${f.sacrifice.replace(/%+$/,'')}%`]:[]),
          ...(f.overcast!=='0'?[`Overcast: ${f.overcast}`]:[]),
          ...(f.pvp?[labels.get('此技能的 PvE 与 PvP 版本不同；默认展示 PvE，PvP 说明另列。')]:[])];
        return result(details[index],'wiki-facts');
      }
      if(path[2]==='details'&&row.npc){
        const f=row.npc;
        if(source.startsWith('主职业：'))return result(`Primary profession: ${professions[f.profession]}${f.secondaryProfession?'; Secondary profession: '+professions[f.secondaryProfession]:''}${f.thirdProfession?' / '+professions[f.thirdProfession]:''}`, 'wiki-facts');
        if(source.startsWith('分类：'))return result(`Classification: ${f.boss?'Boss':f.service?'Service NPC':f.role==='boss-like'?'Boss-like foe':'Foe'}`, 'wiki-facts');
      }
      if(path[2]==='details'&&row.area&&source.startsWith('Wiki 类型：'))return result(`Type: ${row.area.type}${row.area.levels?' · '+row.area.levels+' levels':''}`,'wiki-facts');
      if(path[2]==='locations'&&leaf==='note'&&!owner?.wiki)return undefined; // legacy notes are not Wiki evidence
      if(path[2]==='locations'&&leaf==='boss'){
        const candidates=data.records.filter(r=>r.kind==='boss'&&r.wiki?.identityStatus!=='unresolved'&&(r.name===source||r.legacy?.name===source));
        const names=[...new Set(candidates.map(r=>r.englishName))];
        if(names.length===1)return result(names[0],'wiki-title',candidates.map(r=>r.wiki));
      }
    }
  }
  if(dataset==='armor'){
    if(path[0]==='sets'&&leaf==='name')return result(row.englishName,'wiki-title');
    if(path[0]==='materials'&&leaf==='name')return result(row.englishName,'wiki-title',data.references||[]);
    if(path[0]==='offers'&&leaf==='notes'&&han(source))return result(source.slice(0,source.indexOf('\n配方核对：'))+'\nRecipe discrepancy: the page lists 600 gold in the total column, but four pieces at 200 gold each total 800 gold. The Armorer table also lists 200 gold per piece. This application totals the individual pieces as 800 gold and 28 Tanned Hide Squares.','wiki-facts', [...references,...(data.references||[])]);
  }
  if(dataset==='calendar'){
    if(leaf==='name')return result(row.englishName,'wiki-title');
    if(row.kind==='traveler'){
      if(leaf==='objective')return result(`Each Gift of the Traveler requires ${row.exchange.perGift} × ${row.exchange.item}.`, 'wiki-facts');
      if(leaf==='requirements')return result('Access to the traveler’s location is required. A maximum of 5 gifts can be obtained per account each week.','wiki-facts');
      if(leaf==='rewards')return result('Gift of the Traveler × 1 (per exchange)','wiki-facts');
    }
    if(['mission','bounty','combat','vanquish'].includes(row.kind)){
      if(leaf==='requirements'&&han(source))return result('No separate requirements section is recorded in the cited quest page. Consult its objectives and the access requirements of the target area or game mode.','application-text');
      if(leaf==='notes'&&han(source))return result(source.slice(0,source.lastIndexOf('\n'))+(row.kind==='combat'?'\nCompletion can be repeated during the same day. A tick here records at least one completion.':'\nThe completion record belongs to the rotation in which the quest was accepted. It does not change permanent skill or vanquishing progress.'),'application-text');
    }
    if(row.kind.endsWith('-bonus')){
      if(leaf==='requirements')return result('Regular weekly rotation. Festivals or temporary official events may add other effects.','application-text');
      if(leaf==='giver')return result('Foreman the Crier / in-game announcements','application-text');
      if(leaf==='turnIn')return result('No turn-in required','application-text');
      if(leaf==='notes')return result('Predicted from the cited rotation; this offline application does not read live game announcements.','application-text');
    }
  }
  if(dataset==='quests') {
    if(path[0]==='chapters' && leaf==='name') return result(source,'application-label');
    if(path[0]==='quests' && leaf==='name') return result(row.englishName,'wiki-title');
    return result(source, path.includes('requirement') ? 'wiki-facts' : 'wiki-text');
  }
  if(dataset==='skills')return result(source,path[0]==='tracks'?'application-label':leaf==='name'?'wiki-title':'wiki-text',path[0]==='tracks'?[]:references);
  if(labels.has(source))return result(labels.get(source),'application-text');
  for(const [pattern,prefix]of prefixes)if(pattern.test(source))return result(source.replace(pattern,prefix),'wiki-facts');
  if(!han(source))return result(source);
  return undefined;
}

// Compare quantities in context. Preserve signs, units, ranges and multiplicity.
// Different word order is reported for review, never declared a mistranslation.
export function numericSignature(text) {
  const normalized=text.replaceAll('−','-').replaceAll('–','-').replaceAll('…','...').replace(/(?<=\d),(?=\d{3}(?:\D|$))/g,'');
  return [...normalized.matchAll(/[+-]?\d+(?:\.\d+)?(?:\s*(?:\.\.\.|-)\s*[+-]?\d+(?:\.\d+)?)*(?:\s*%)?/g)].map(match=>match[0].replaceAll(' ',''));
}
export function numericIssues(english,chinese) {
  const issues=[];
  if(/%%|\$\d|ZXQ|MISSING_TOKEN|<unk>|⁇|\u2581/.test(chinese))issues.push('corrupt-token');
  const en=numericSignature(english),zh=numericSignature(chinese);
  if(JSON.stringify(en)!==JSON.stringify(zh))issues.push(JSON.stringify([...en].sort())===JSON.stringify([...zh].sort())?'quantity-order':'quantity-or-unit');
  return issues;
}

export function translationReviewMatches(source,text,review) {
  return Boolean(source&&review?.reviewer&&review.englishHash===source.englishHash&&review.evidenceHash===source.evidenceHash&&review.translationHash===sha256(text));
}
