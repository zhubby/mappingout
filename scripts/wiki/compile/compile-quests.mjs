/**
 * [INPUT]: 依赖任务发现清单、固定 Wiki 快照和路线图清单。
 * [OUTPUT]: 生成离线任务目录与逐项覆盖审计。
 * [POS]: 任务资料编译入口；身份与攻略始终绑定同一组来源。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { web, evidenceDir, readIndex, loadPage } from '../lib/client.mjs';
import { templates, links } from '../lib/wikitext.mjs';
import { reference } from '../lib/content-facts.mjs';
import { cleanQuestText, questSections, mapTitles, pageLinks, contentBlocks } from '../lib/quest-content.mjs';
import { compileQuestGraph } from '../lib/quest-graph.mjs';
import { supplementQuest, appendSections, eliteSubquests } from '../lib/quest-support.mjs';

const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const save = async (file, value) => fs.writeFile(file, JSON.stringify(value) + '\n');
const sha = text => createHash('sha256').update(text).digest('hex');
const discovery = await read(path.join(evidenceDir, 'quest-discovery.json')), index = await readIndex();
const catalog = await read(path.join(web, 'public/data/catalog.json'));
const calendar = await read(path.join(web, 'public/data/calendar.json'));
let images = { images: [] }; try { images = await read(path.join(evidenceDir, 'quest-images.json')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
let expansions={pages:{}};try{expansions=await read(path.join(evidenceDir,'quest-template-expansions.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
const roots = new Map(), rows = [], pages = new Map(), aliases = new Map(), exclusions = [], seen = new Set();
const professions = { Warrior:1, Ranger:2, Monk:3, Necromancer:4, Mesmer:5, Elementalist:6, Assassin:7, Ritualist:8, Paragon:9, Dervish:10 };
for (const chapter of discovery.chapters) {
  const page = await loadPage(chapter.list, index);
  const main = page.wikitext.split(/^==\s*(?:Notes|Trivia|Challenge|Competitive|Optional)/mi)[0];
  roots.set(chapter.id, { page, titles: links(main).map(link => index.aliases[link.title] || link.title) });
  pages.set(`root:${chapter.id}`, { page });
}
const classify = (candidate, page, box, mission) => {
  const categories = discovery.classification[page.title] || [], source = page.wikitext;
  if (['Elite Mission','Challenge Mission','Dungeon','Mission'].includes(page.title)) return { exclude:'Reference overview, not a playable instance' };
  if (/Bonus Mission Pack/i.test(box.campaign || '')) return { exclude:'Bonus Mission Pack outside the selected campaigns' };
  if (categories.some(c => /Historical content|Historical quests|Removed content/i.test(c)) || /\{\{\s*historical content/i.test(source)) return { exclude:'Historical or removed content' };
  if (categories.some(c => /festival|wintersday|halloween|canthan new year|dragon festival|wintersday|wayfarer|anniversary celebration/i.test(c))) return { exclude:'Festival content' };
  if (/^(?:Fort Aspenwood|The Jade Quarry|Training Arena|Zaishen Challenge|Zaishen Elite)$/.test(page.title) || categories.some(c => /Zaishen Combat quests|PvP quests|Competitive missions/i.test(c)) || /^(?:The Path to (?:Combat|Victory)|Alliance Battles \(Zaishen|Codex Arena \(Zaishen|Guild Versus Guild \(Zaishen|Heroes' Ascent \(Zaishen|Random Arena \(Zaishen)/i.test(page.title)) return { exclude:'PvP content' };
  const location = templates(source, 'Location infobox')[0]?.fields;
  const type = cleanQuestText(box.type || location?.type || '');
  const dungeon = /Dungeon/i.test(type), challenge = /Challenge/i.test(type) || categories.includes('Category:Challenge missions');
  const elite = /Elite/i.test(type) || categories.includes('Category:Elite missions') || ['The Fissure of Woe','The Underworld','Domain of Anguish'].includes(page.title);
  if (!box.__quest && !mission && !dungeon && !challenge && !elite) return { exclude:'Reference page, not a quest or PvE instance' };
  let chapter = candidate.chapters.find(id => id !== 'core') || 'core';
  const campaign = cleanQuestText(box.campaign || location?.campaign || '');
  const campaignMap = { Prophecies:'prophecies', Factions:'factions', Nightfall:'nightfall', 'Eye of the North':'eotn', 'War in Kryta':'kryta', 'Hearts of the North':'kryta', 'Winds of Change':'winds', Core:'core' };
  if (campaignMap[campaign]) chapter = campaignMap[campaign];
  if (/Hearts of the North quests/.test(categories.join(' '))) chapter = 'kryta';
  if (page.title === 'Memories of Purity') return { chapter:'winds', kind:'utility' };
  let kind = dungeon ? 'dungeon' : elite ? 'elite' : challenge ? 'challenge' : /Zaishen (?:Bounty|Mission|Vanquish) quests|Wanted quests/i.test(categories.join(' ')) || /\(Zaishen (?:quest|vanquish)\)$|^Wanted:/i.test(page.title) ? 'bounty' : /primary/i.test(type) || mission || (chapter !== 'core' && roots.get(chapter)?.titles.includes(page.title)) ? 'main' : 'side';
  if (chapter === 'winds') {
    const primary = roots.get('winds').page.wikitext.split('== Optional quests ==')[0];
    kind = links(primary).some(link => link.title === page.title.replace(/ \(Hard mode\)$/i, '')) ? 'main' : 'side';
  }
  if (/Hearts of the North quests/.test(categories.join(' '))) kind = 'main';
  return { chapter, kind };
};
for (const candidate of discovery.candidates) {
  let page = await loadPage(candidate.title, index);
  if (!page) throw Error(`Missing discovery snapshot ${candidate.title}`);
  const expansion=expansions.pages[page.pageid]||[];
  page={...page,wikitext:expansion.reduce((text,item)=>{if(item.sourceRevid!==page.revid)throw Error(`Stale template expansion ${page.title}`);return /^\{\{\s*cost\b/i.test(item.raw)?text:text.replaceAll(item.raw,item.expanded);},page.wikitext.replaceAll('{{PAGENAME}}',page.title))};
  if (seen.has(page.pageid)) { aliases.set(candidate.title, aliases.get(page.title)); continue; }
  seen.add(page.pageid);
  const quest = templates(page.wikitext, 'Quest infobox')[0]?.fields;
  const mission = templates(page.wikitext, 'Mission infobox')[0]?.fields;
  const box = { ...(quest || mission || templates(page.wikitext, 'Location infobox')[0]?.fields || {}), __quest:!!quest };
  const result = classify(candidate, page, box, mission);
  if (result.exclude) { exclusions.push({ title:page.title, pageid:page.pageid, reason:result.exclude }); continue; }
  const categories = discovery.classification[page.title] || [];
  const id = `quest:gww:${page.pageid}`;
  const standard = templates(page.wikitext, 'Standard prerequisites')[0]?.fields;
  const nationality = (box.nationality || standard?.nationality || standard?.campaign || '').toLowerCase();
  const origins = { pre:[1], tyrian:[1], prophecies:[1], canthan:[2], factions:[2], elonian:[3], nightfall:[3], 'non-tyrian':[2,3], 'non-canthan':[1,3], 'non-elonian':[1,2] };
  const allowedOrigins = origins[nationality] || (categories.some(c => /Tyrian only|Ascalon \(pre-Searing\) quests/.test(c)) ? [1] : categories.some(c => /Canthan only/.test(c)) ? [2] : categories.some(c => /Elonian only/.test(c)) ? [3] : undefined);
  const originCampaign = allowedOrigins?.length===1 ? allowedOrigins[0] : undefined;
  const profession = professions[cleanQuestText(box.profession)] || (standard?.primary === 'y' ? Object.entries(professions).find(([name])=>name.toLowerCase()===standard.profession?.toLowerCase())?.[1] : undefined);
  const chapter = discovery.chapters.find(c => c.id === result.chapter);
  const rootOrder = roots.get(chapter.id).titles.indexOf(page.title);
  const row = {
    id, name:page.title, englishName:page.title, chapter:chapter.id, campaign:chapter.campaign,
    region: /Hearts of the North quests/.test(categories.join(' ')) ? 'Hearts of the North' : cleanQuestText(box.region || box.section), kind:result.kind,
    mode:/\(Hard mode\)$|\(Zaishen vanquish\)$/i.test(page.title) ? 'hard' : chapter.id === 'winds' || originCampaign === 1 && /pre-Searing/i.test(categories.join(' ')) ? 'normal' : 'both',
    repeatable:/^(?:y|yes|true|1)$/i.test(box.repeatable || '') || /Zaishen|Wanted quests/.test(categories.join(' ')) || result.kind === 'dungeon' || !!mission,
    order:rootOrder < 0 ? 10000 : rootOrder, ...(profession ? { profession } : {}), ...(originCampaign ? { originCampaign } : {}), ...(allowedOrigins ? { allowedOrigins } : {}),
    givenBy:cleanQuestText(box['given by']), givenAt:cleanQuestText(box['given at']), requirement:{op:'all',items:[]}, recommendedAfter:[],
    sections:questSections(page), images:[], references:[reference(page)], links:[],
    ...(mission && chapter.campaign<=3 ? {missionReward:chapter.campaign===1?'bonus':'mastery'} : {}),
  };
  // 两种副本信息框都将入口写在 location / starts 参数内。
  if (!row.givenAt && mission) row.givenAt = cleanQuestText(box.location || box.starts || box.outpost);
  for(const item of expansion)if(!row.references.some(ref=>ref.pageid===item.reference.pageid))row.references.push(item.reference);
  if(mission){const source=await loadPage('Template:Mission infobox',index);if(!source)throw Error('Missing mission map template snapshot');row.references.push(reference(source));}
  if(standard){const source=await loadPage('Template:Standard prerequisites',index);if(source)row.references.push(reference(source));}
  const activity = calendar.activities.find(a => a.references?.some(ref => ref.pageid === page.pageid));
  if (activity) row.activityId = activity.id;
  rows.push(row); pages.set(id, { page, box }); aliases.set(page.title, id); aliases.set(candidate.title, id);
}
const resolve = title => {
  for (let i=0; i<10 && index.aliases[title]; i++) title=index.aliases[title];
  return aliases.get(title);
};
// 每个候选链接都要在全部页面完成身份建立后再解析。
const byId = new Map(rows.map(row => [row.id, row]));
function targetFor(page, box) {
  if(/\(Hard mode\)$/i.test(page.title))return page.title.replace(/ \(Hard mode\)$/i,'');
  if(/\(Zaishen vanquish\)$/i.test(page.title))return links(box.map1text || '')[0]?.title || page.title.replace(/ \(Zaishen vanquish\)$/i,'');
  if(/\(Zaishen quest\)$/i.test(page.title))return page.title.replace(/ \(Zaishen quest\)$/i,'');
  return links(box.quest || '')[0]?.title;
}
for (const row of rows) await supplementQuest(row, pages.get(row.id).page, title => loadPage(title, index));
// 先完成来源补充，再递归复用详情，结果不依赖目录遍历顺序。
const linked = new Set();
function linkDetails(row, stack = new Set()) {
  if (linked.has(row.id) || stack.has(row.id)) return;
  stack.add(row.id);
  const { page, box } = pages.get(row.id);
  const targetTitle = targetFor(page,box);
  const target = byId.get(resolve(targetTitle));
  if (target) {
    linkDetails(target, stack);
    if (!row.sections.some(s => /walkthrough/.test(s.id)) && target.sections.some(s => /walkthrough/.test(s.id))) {
      appendSections(row, target.sections.filter(s => /walkthrough|bonus|hard-mode|notes/.test(s.id)), pages.get(target.id).page, `shared-${target.id}`);
      row.references.push(...target.references.filter(ref => !row.references.some(r => r.pageid === ref.pageid)));
      row.walkthroughFrom = target.id;
    }
  }
  for (const child of eliteSubquests(page, resolve, byId)) {
    linkDetails(child, stack);
    appendSections(row, [{id:`walkthrough-${child.id}`,title:child.englishName,blocks:child.sections.filter(s=>/walkthrough/.test(s.id)).flatMap(s=>s.blocks)}].filter(s=>s.blocks.length), pages.get(child.id).page, `elite-${child.id}`);
  }
  linked.add(row.id); stack.delete(row.id);
}
rows.forEach(row => linkDetails(row));
const wantedImages = new Set();
for (const row of rows) {
  const { page, box } = pages.get(row.id);
  const allLinks = pageLinks(page);
  const targetTitle = targetFor(page,box);
  const target = byId.get(resolve(targetTitle));
  // 地城的具体攻略通常在对应任务页，或在 /Walkthrough 子页。
  if (!row.sections.some(s => /walkthrough/.test(s.id))) {
    const walkPage = await loadPage(`${page.title}/Walkthrough`, index);
    if (walkPage) {
      row.sections.push({id:'walkthrough-linked',title:'Walkthrough',blocks:contentBlocks(walkPage.wikitext,'linked')});
      row.references.push(reference(walkPage));
    }
    const areaPage = targetTitle && !target ? await loadPage(targetTitle,index) : null;
    if(areaPage){
      const extra=questSections(areaPage).filter(s=>/^(?:walkthrough|notes|requirements)/.test(s.id));
      if(extra.length){appendSections(row,extra,areaPage,`target-${areaPage.pageid}`);}
    }
  }
  if (!row.sections.some(s => s.id.startsWith('objectives')) && box.objectives) row.sections.unshift({ id:'objectives-infobox', title:'Objectives', blocks:contentBlocks(box.objectives,'objectives-infobox') });
  if (!row.sections.length) {
    let intro = page.wikitext.split(/^==/m)[0];
    for (const template of templates(intro)) if (/infobox|otheruses|quotation/i.test(template.name)) intro=intro.replace(template.raw,'');
    const blocks = contentBlocks(intro, 'overview');
    if (blocks.length) row.sections.push({id:'walkthrough-overview',title:'Overview',blocks});
  }
  row.links = allLinks.flatMap(title => {
    const questId=resolve(title), zone=catalog.records.find(entry=>entry.kind==='zone' && entry.wiki?.identityStatus!=='unresolved' && entry.area?.atlasRegion && (entry.englishName===title || entry.wiki?.title===title));
    return questId && questId !== row.id ? [{title,questId,url:`https://wiki.guildwars.com/wiki/${encodeURIComponent(title.replaceAll(' ','_'))}`}]
      : zone ? [{title,zoneId:zone.id,url:zone.wiki.url}] : [];
  });
  row.links = [...new Map(row.links.map(link=>[link.questId||link.zoneId,link])).values()];
  const titles = new Set(mapTitles(page));
  if (target) mapTitles(pages.get(target.id).page).forEach(title=>titles.add(title));
  for (const ref of row.references.filter(ref=>!ref.title.startsWith('Template:'))) {
    const source = await loadPage(ref.title,index);
    if(source)mapTitles(source).forEach(title=>titles.add(title));
  }
  titles.forEach(title=>wantedImages.add(title));
  row.images = images.images.filter(image=>titles.has(image.title)).map(({title,...image})=>({...image,caption:title.replace(/^File:/,'').replace(/\.[^.]+$/,'')}));
  row.images = [...new Map(row.images.map(image=>[image.id,image])).values()];
  row.missingSourceImages = [...titles].filter(title=>!images.images.some(image=>image.title===title));
  row.guideQuality = row.sections.some(s=>/walkthrough/.test(s.id)) ? 'detailed' : row.sections.some(s=>s.id.startsWith('target-')) ? 'target-notes' : row.sections.some(s=>s.id.startsWith('instructions-')) ? 'instructions' : 'objectives-only';
}
const graph = compileQuestGraph(rows, pages, discovery.chapters, resolve);
const sourceGaps = rows.filter(row=>row.guideQuality !== 'detailed' && row.kind !== 'utility').map(row=>({id:row.id,title:row.englishName,quality:row.guideQuality,sections:row.sections.map(s=>s.title)}));
const imageTitles = [...wantedImages].sort();
const referenceVersion=sha(JSON.stringify(rows.map(row=>row.references.map(ref=>[ref.pageid,ref.revid])))).slice(0,24);
const output = {version:1,referenceVersion,chapters:discovery.chapters.map(chapter=>({id:chapter.id,name:chapter.name,introduction:cleanQuestText(roots.get(chapter.id).page.wikitext.split(/^==/m)[0]),reference:reference(roots.get(chapter.id).page)})),quests:rows.sort((a,b)=>a.order-b.order || a.englishName.localeCompare(b.englishName)),coverage:{discovered:seen.size,included:rows.length,excluded:exclusions.length,sourceGaps:sourceGaps.length}};
const report={version:1,referenceVersion,coverage:output.coverage,chapters:Object.fromEntries(discovery.chapters.map(c=>[c.id,rows.filter(r=>r.chapter===c.id).length])),included:rows.map(row=>({id:row.id,title:row.englishName,chapter:row.chapter,kind:row.kind,revid:row.references[0].revid})),excluded:exclusions,sourceGaps,cycles:graph.cycles,imageTitles,missingImages:imageTitles.filter(title=>!images.images.some(image=>image.title===title))};
await save(path.join(web,'public/data/quests.json'),output);
await save(path.join(evidenceDir,'quest-coverage.json'),report);
console.log(JSON.stringify({coverage:output.coverage,chapters:report.chapters,cycles:graph.cycles,images:imageTitles.length,missingImages:report.missingImages.length},null,2));
