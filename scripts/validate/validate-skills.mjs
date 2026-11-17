/**
 * [INPUT]: 依赖技能目录、覆盖证据、固定快照和图标清单。
 * [OUTPUT]: 校验可学习边界、版本、等级效果与媒体完整性。
 * [POS]: 技能离线构建门禁；拒绝缺图、缺版本和失效引用。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { projectRoot } from '../lib/paths.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {skillEligibility,compileGrowth} from '../wiki/lib/skill-library-facts.mjs';
import {compileEffects,resourcesOf,resourceKeys} from '../wiki/lib/skill-effects.mjs';
import {templates,plainText} from '../wiki/lib/wikitext.mjs';
const root = projectRoot;
const hash=(value,kind='sha256')=>createHash(kind).update(value).digest('hex');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
export async function validateSkillData(publicDir=path.join(root,'public'), directory=root){
 const data=await read(path.join(publicDir,'data/skills.json')),report=await read(path.join(directory,'data/wiki/skill-library-coverage.json'));
 const discovery=await read(path.join(directory,'data/wiki/skill-library-discovery.json')),media=await read(path.join(directory,'data/wiki/skill-library-images.json'));
 const fail=text=>{throw Error(`技能资料校验失败：${text}`);};
 if(data.version!==1||data.referenceVersion!==report.referenceVersion)fail('资料和覆盖版本不一致');
 const variants=data.skills.flatMap(s=>s.variants),ids=new Set(data.skills.map(s=>s.id)),variantIds=new Set(variants.map(v=>v.id));
 if(ids.size!==data.skills.length||variantIds.size!==variants.length)fail('技能或版本身份重复');
 if(report.missingImages.length||media.errors.length)fail('仍有图标缺口');
 const included=report.decisions.filter(d=>d.included);
 if(data.coverage.included!==data.skills.length||data.coverage.variants!==variants.length||data.coverage.excluded!==report.decisions.length-included.length||data.coverage.discovered!==report.decisions.length||included.length!==variants.length)fail('目录覆盖不完整');
 if(!Array.from({length:11},(_,i)=>i).every(id=>variants.some(v=>v.profession===id)))fail('缺少职业或通用技能');
 const snapshots=new Map(),checkedImages=new Set();
 async function source(ref){
  if(!ref?.pageid||!ref.revid)fail('缺少来源身份');
  const key=`${ref.pageid}:${ref.revid}`;
  if(snapshots.has(key))return snapshots.get(key);
  const page=await read(path.join(directory,`data/wiki/pages/${ref.pageid}.json`));
  const url=new URL(ref.revisionUrl);
  if(page.pageid!==ref.pageid||page.revid!==ref.revid||page.title!==ref.title||page.sha1!==hash(page.wikitext,'sha1')||url.origin!=='https://wiki.guildwars.com'||url.searchParams.get('oldid')!==String(ref.revid))fail(`来源修订不一致 ${ref.title}`);
  snapshots.set(key,page);return page;
 }
 const definitions={};for(const ref of report.growthTemplates){const p=await source(ref);definitions[p.title.replace(/^Template:/,'').toLowerCase()]=p.wikitext;}
 async function image(file){
  if(checkedImages.has(file))return;
  if(!/^assets\/(?:skill-library|skill-resources)\/[a-z\d-]+\.(?:jpg|png)$/.test(file))fail(`图像路径无效 ${file}`);
  const item=media.images.find(i=>i.file===file);
  if(!item?.originalSha1||typeof item.licenseDeclaration!=='string'||item.modification!=='None; original Wiki file.')fail(`图像来源缺失 ${file}`);
  const bytes=await fs.readFile(path.join(publicDir,file));
  if(bytes.length!==item.bytes||hash(bytes)!==item.sha256||hash(bytes,'sha1')!==item.originalSha1.padStart(40,'0'))fail(`图像哈希不一致 ${file}`);
  await source(item.reference);checkedImages.add(file);
 }
 if(JSON.stringify(data.resourceIcons.map(i=>i.key).sort())!==JSON.stringify([...resourceKeys].sort()))fail('七种资源图标不齐全');
 for(const icon of data.resourceIcons){await image(icon.file);const info=media.images.find(i=>i.file===icon.file);if(info.width!==20||info.height!==20)fail(`资源图标尺寸改变 ${icon.key}`);}
 const quests=await read(path.join(publicDir,'data/quests.json')),catalog=await read(path.join(publicDir,'data/catalog.json'));
 const questIds=new Set(quests.quests.map(q=>q.id)),zoneIds=new Set(catalog.records.filter(r=>r.kind==='zone'&&r.area&&r.wiki?.identityStatus!=='unresolved').map(r=>r.id));
 for(const skill of data.skills){
  if(!skill.name||skill.name!==skill.englishName||!skill.variants.length)fail(`技能名称或版本缺失 ${skill.id}`);
  const modes=new Set();
  for(const variant of skill.variants){
   const page=await source(variant.reference),fields=templates(page.wikitext,'Skill infobox')[0]?.fields;
   const decision=included.find(d=>d.pageid===page.pageid);
   if(!decision||!skillEligibility(page,discovery.classification[page.title]||[]).included||variant.id!==`skill-version:gww:${page.pageid}`||!variant.gameIds.length||!variant.description)fail(`技能边界或身份改变 ${page.title}`);
   if(plainText(fields.description)!==variant.description||JSON.stringify(resourcesOf(fields))!==JSON.stringify(variant.resources))fail(`技能事实改变 ${page.title}`);
   const effects=compileEffects(page,fields,compileGrowth(page,definitions),variant.reference);
   for(const key of ['effects','descriptionParts','descriptionTemplate'])if(JSON.stringify(effects[key])!==JSON.stringify(variant[key]))fail(`成长效果改变 ${page.title}/${key}`);
   for(const mode of variant.modes){const context=`${mode}:${variant.format||'standard'}`;if(!['pve','pvp'].includes(mode)||modes.has(context))fail(`版本模式重叠 ${page.title}`);modes.add(context);}
   if(new Set(variant.effects.map(e=>e.id)).size!==variant.effects.length||variant.effects.some(e=>!Object.keys(e.values).length||Object.values(e.values).some(v=>!Number.isFinite(v))))fail(`效果数值无效 ${page.title}`);
   for(const related of variant.related)if(!ids.has(related))fail(`相关技能失效 ${page.title}`);
   for(const entry of variant.acquisition)if(entry.questId&&!questIds.has(entry.questId)||entry.zoneIds?.some(id=>!zoneIds.has(id)))fail(`获取地点或任务失效 ${page.title}`);
   const expected=media.skills.find(i=>i.pageid===page.pageid);if(expected?.file!==variant.image)fail(`技能图标身份改变 ${page.title}`);
   await image(variant.image);
  }
 }
 return {skills:data.skills.length,variants:variants.length,effects:variants.reduce((n,v)=>n+v.effects.length,0),images:checkedImages.size,disputedRanges:report.dynamicRanges.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await validateSkillData());
