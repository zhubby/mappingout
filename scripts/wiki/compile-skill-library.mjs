/**
 * [INPUT]: 依赖技能发现证据、固定页面、成长模板与图像清单。
 * [OUTPUT]: 生成独立技能百科和逐项收录、排除及数值覆盖报告。
 * [POS]: 全技能离线编译入口；保留旧地图技能身份与进度。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {web,evidenceDir,readIndex,loadPage} from './client.mjs';
import {templates,plainText,section,links} from './wikitext.mjs';
import {skillFacts} from './skill-facts.mjs';
import {reference} from './content-facts.mjs';
import {compileGrowth,skillEligibility} from './skill-library-facts.mjs';
import {compileEffects,resourcesOf,tagsOf} from './skill-effects.mjs';
const read=async file=>JSON.parse(await fs.readFile(path.join(web,file),'utf8'));
const discovery=await read('data/wiki/skill-library-discovery.json'),index=await readIndex(),legacy=await read('public/data/catalog.json');
const quests=await read('public/data/quests.json');
const zoneByTitle=new Map(legacy.records.filter(r=>r.kind==='zone'&&r.area&&r.wiki?.identityStatus!=='unresolved').map(r=>[r.area.title,r.id]));
const questByTitle=new Map(quests.quests.map(q=>[q.englishName,q.id]));
let media={icons:[],skills:[]};try{media=await read('data/wiki/skill-library-images.json');}catch(error){if(error.code!=='ENOENT')throw error;}
const definitions={},templateReferences=[];
for(const title of ['Template:Skill infobox','Template:Gr','Template:Gr2'])templateReferences.push(reference(await loadPage(title,index)));
for(const title of discovery.progressionTemplates||[]){const page=await loadPage(title,index);definitions[title.replace(/^Template:/,'').toLowerCase()]=page.wikitext;templateReferences.push(reference(page));}
const campaignIds={Core:0,Prophecies:1,Factions:2,Nightfall:3,'Eye of the North':4};
const groups=new Map(),decisions=[],seen=new Set(),rawRelated=new Map();
for(const candidate of discovery.candidates){
 const page=await loadPage(candidate.title,index);
 if(!page){decisions.push({...candidate,included:false,reason:'Missing page'});continue;}
 if(seen.has(page.pageid))continue;seen.add(page.pageid);
 const categories=discovery.classification[page.title]||[],decision=skillEligibility(page,categories);
 decisions.push({...candidate,pageid:page.pageid,revid:page.revid,...decision});if(!decision.included)continue;
 const box=templates(page.wikitext,'Skill infobox')[0].fields,facts=skillFacts(page),ref=reference(page);
 const pvp=/^(y|yes|true)$/i.test(box['is-pvp']||'')||categories.includes('Category:PvP versions of skills');
 const baseTitle=pvp?(templates(page.wikitext,'pveversion')[0]?.fields[1]||page.title.replace(/ \((?:PvP|Codex)\)$/,'')):page.title;
 const base=await loadPage(baseTitle,index)||page,id=`skill:gww:${base.pageid}`,variantId=`skill-version:gww:${page.pageid}`;
 const acquisitionPage=pvp&&!facts.acquisition.length?base:page,acquisitionFacts=acquisitionPage===page?facts:skillFacts(base);
 const growth=compileGrowth(page,definitions),content=compileEffects(page,box,growth,ref);
 const image=media.skills.find(image=>image.pageid===page.pageid)?.file||'';
 const modes=pvp?['pvp']:facts.pveOnly||facts.hasPvp?['pve']:['pve','pvp'];
 const variant={id:variantId,name:page.title,englishName:page.title,...(/\(Codex\)$/.test(page.title)?{format:'codex'}:{}),gameIds:facts.gameIds,modes,profession:facts.profession,attribute:facts.attribute,campaigns:[...new Set([box.campaign||'Core',box.campaign2].filter(Boolean).map(c=>campaignIds[plainText(c)]).filter(c=>c!==undefined))],type:facts.type,elite:facts.elite,pveOnly:facts.pveOnly,image,
  description:facts.description,conciseDescription:facts.conciseDescription,...content,resources:resourcesOf(box),target:plainText(box.target||''),range:plainText(box.range||''),aoe:plainText(box.aoe||''),tags:tagsOf(box,categories,facts.description),acquisition:acquisitionFacts.acquisition.map(({raw,...source})=>{const titles=links(raw).map(l=>l.title),questId=titles.map(title=>questByTitle.get(title)).find(Boolean),zoneIds=[...new Set(titles.map(title=>zoneByTitle.get(title)).filter(Boolean))];return {...source,reference:reference(acquisitionPage),...(questId?{questId}:{}),...(zoneIds.length?{zoneIds}:{})};}),notes:[plainText(section(page.wikitext,'Notes')),...facts.warnings.map(w=>`${w.kind}: ${w.text}`)].filter(Boolean),related:[],reference:ref};
 if(!variant.description||!variant.gameIds.length)throw Error(`Incomplete learnable skill: ${page.title}`);
 rawRelated.set(variantId,[...templates(section(page.wikitext,'Related skills')).filter(t=>/^(skill icon|duplicate skill icon)$/i.test(t.name)).flatMap(t=>[t.fields[1],...(t.name.toLowerCase()==='duplicate skill icon'?[t.fields[2]]:[])]),...links(section(page.wikitext,'Related skills')).map(l=>l.title)].filter(Boolean));
 const group=groups.get(id)||{id,name:base.title,englishName:base.title,reference:reference(base),legacyEntryIds:legacy.records.filter(r=>r.kind==='skill'&&r.englishName===base.title).map(r=>r.id),variants:[]};
 group.variants.push(variant);groups.set(id,group);
}
const skills=[...groups.values()].sort((a,b)=>a.englishName.localeCompare(b.englishName)),byTitle=new Map(skills.flatMap(s=>s.variants.map(v=>[v.englishName,s.id])));
for(const skill of skills){skill.variants.sort((a,b)=>Number(!a.modes.includes('pve'))-Number(!b.modes.includes('pve')));for(const v of skill.variants)v.related=[...new Set((rawRelated.get(v.id)||[]).map(title=>byTitle.get(title)).filter(id=>id&&id!==skill.id))];}
const variants=skills.flatMap(s=>s.variants),effects=variants.flatMap(v=>v.effects);
const tracks=[['Allegiance rank',12],['Kurzick rank',12],['Luxon rank',12],['Sunspear rank',10],['Lightbringer rank',8],['Asura rank',10],['Deldrimor rank',10],['Ebon Vanguard rank',10],['Norn rank',10]].filter(([name])=>effects.some(e=>e.axis===name)).map(([name,max])=>({id:name.toLowerCase().replace(/[^a-z0-9]+/g,'-'),name,max}));
const refs=[...new Map([...variants.map(v=>v.reference),...templateReferences].map(ref=>[ref.pageid,ref])).values()].sort((a,b)=>a.pageid-b.pageid);
const referenceVersion=createHash('sha256').update(JSON.stringify(refs)).digest('hex').slice(0,24);
const coverage={discovered:decisions.length,included:skills.length,variants:variants.length,excluded:decisions.filter(d=>!d.included).length,dynamicEffects:variants.flatMap(v=>v.descriptionParts.filter(p=>p.raw&&!p.effectId)).length};
const catalog={version:1,referenceVersion,skills,resourceIcons:media.icons.map(icon=>({key:icon.key,file:icon.file,reference:icon.reference})),tracks,coverage,references:refs};
await fs.writeFile(path.join(web,'public/data/skills.json'),JSON.stringify(catalog)+'\n');
const report={version:1,referenceVersion,scope:'Current learnable player skills, profession/common/title-linked and PvE/PvP versions',coverage,professions:Object.fromEntries(Array.from({length:11},(_,id)=>[id,variants.filter(v=>v.profession===id).length])),decisions,directories:Object.fromEntries(Object.entries(discovery.directories).map(([title,candidates])=>[title,{candidates:candidates.length,included:candidates.filter(c=>byTitle.has(index.aliases[c]||c)).length}])),growthTemplates:templateReferences,dynamicRanges:variants.flatMap(v=>v.descriptionParts.filter(p=>p.raw&&!p.effectId).map(p=>({skill:v.englishName,raw:p.raw,reference:v.reference}))),unclassifiedEffects:effects.filter(e=>e.metric==='other').length,missingImages:variants.filter(v=>!v.image).map(v=>v.englishName)};
await fs.writeFile(path.join(evidenceDir,'skill-library-coverage.json'),JSON.stringify(report,null,2)+'\n');
console.log({coverage,professions:report.professions,effects:effects.length,missingImages:report.missingImages.length});
