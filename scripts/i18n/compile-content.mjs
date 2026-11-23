/**
 * [INPUT]: 依赖固定英文基线、中文术语、繁体初稿与逐文本校对。
 * [OUTPUT]: 生成繁英资料与来源；英文修订变化时拒绝旧校对。
 * [POS]: 离线语言编译入口；字形转换不继承人工审校。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import fs from 'node:fs';
import {Converter} from 'opencc-js';
import {projectPath} from '../lib/paths.mjs';
import {contentFields,datasets} from '../../src/i18n/content-fields.ts';
import {auditContent} from './audit-content.mjs';
import {sha256} from './english-source.mjs';
import {reviewedSkills} from './reviewed-skills.mjs';
import {travelerItems} from './reviewed-traveler-items.mjs';
import {loadProofreading,proofreadText} from './proofreading.mjs';
const read=file=>JSON.parse(fs.readFileSync(projectPath(file),'utf8'));
const save=(file,value)=>fs.writeFileSync(projectPath(file),JSON.stringify(value)+'\n');
const traditional=Converter({from:'cn',to:'twp'});
const terms=read('data/i18n/zh-TW-terms.json').terms,editorial=read('data/i18n/zh-TW-editorial.json');
const dictionary={...Object.fromEntries(Object.entries(terms).map(([key,value])=>[key,traditional(value.text)])),...editorial.terms};
const drafts=read('data/i18n/zh-TW-translations.json').fields;
const aliases=read('data/i18n/legacy-search-aliases.json').datasets;
const skillSources=read('data/i18n/skill-review-sources.json');
const {report,baselines}=auditContent();
if(report.evidenceErrors.length)throw Error('Wiki evidence differs; inspect the accuracy audit before compiling.');
const proofreadingDir=projectPath('data/i18n/proofreading');
const proofreading=loadProofreading(proofreadingDir);
const provenance={version:1,locale:'zh-TW',reviewStatus:'pending',datasets:{},texts:{},adaptations:{}};
let count=0,proofreadCount=0;
const normalize=text=>text?.replace(/(\p{Script=Han})[ \t]+(?=\p{Script=Han})/gu,'$1').replaceAll('秘法','祕法');
const lookup=source=>normalize(editorial.texts?.[source]??dictionary[source]??drafts[sha256(source)]?.text);
for(const dataset of datasets){
 const raw=fs.readFileSync(projectPath(`public/data/${dataset}.json`)),data=JSON.parse(raw),baseline=baselines[dataset];
 const oldEn=read(`public/data/i18n/en/${dataset}.json`),english={},chinese={},nameSources={},unverifiedFields=[],legacyAliases=Object.fromEntries(Object.entries(aliases[dataset]).map(([key,value])=>{
  const names=typeof value==='string'?[value]:value;
  return [key,[...new Set(names.flatMap(name=>[name,traditional(name)]))]];
 }));
 for(const field of contentFields(data,dataset)){
  const resolved=baseline.fields[field.key],source=resolved?.text??oldEn.fields[field.key],draft=drafts[sha256(source??'')];
  if(!source)throw Error(`Missing English source: ${dataset}/${field.key}`);
  if(!resolved)unverifiedFields.push(field.key);
  english[field.key]=source;
  const correction=proofreadText(proofreading,dataset,field.key,resolved);
  const term=terms[source];
  let text=correction?.text??lookup(source),kind=editorial.texts?.[source]?'editorial-translation':editorial.terms[source]?'editorial-label':term?'wiki-term':draft?.kind;
  if(!correction&&!dictionary[source]&&!editorial.texts?.[source]&&(!draft||draft.source!==source))throw Error(`Missing Traditional draft: ${dataset}/${field.key}; run i18n:translate:traditional`);
  const [collection,index]=field.path,row=data[collection]?.[index];
  if(dataset==='catalog'&&row?.skill&&field.path.at(-1)==='description'){
   const skill=field.path.includes('pvp')?row.skill.pvp:row.skill,pin=skillSources[skill.title];
   if(reviewedSkills[skill.title]&&pin?.revid===skill.reference.revid&&pin.englishHash===sha256(skill.description)){
    text=traditional(reviewedSkills[skill.title]).replaceAll('神喚者','神喚使');kind='adapted-english-review';
   }
  }
  if(dataset==='catalog'&&row?.skill&&field.path[2]==='details'&&field.path[3]===1){
   const skill=row.skill,activation=skill.activation==='0'&&/Attack/.test(skill.type)?'攻擊速度':`${skill.activation} 秒`;
   text=`維持：${skill.upkeep} · 怒氣：${skill.adrenaline} · 能量：${skill.energy} · 施放：${activation} · 冷卻：${skill.recharge} 秒`;kind='english-fact-renderer';
  }
  if(dataset==='calendar'&&row?.kind==='traveler'){
   const leaf=field.path.at(-1),item=lookup(row.exchange.item)??traditional(travelerItems[row.exchange.item]??'');
   if(leaf==='objective'){text=`每份旅者禮物需要 ${row.exchange.perGift} × ${item}。`;kind='english-fact-renderer';}
   if(leaf==='requirements'){text='需要能夠進入旅者所在區域。每帳號每週最多兌換 5 份旅者禮物。';kind='english-fact-renderer';}
   if(leaf==='rewards'){text='旅者禮物 × 1（每次兌換）';kind='english-fact-renderer';}
   if(leaf==='item')text=item;
  }
  if(/hex/i.test(source))text=text.replaceAll('六角形','降咒');
  if(/enchantment/i.test(source))text=text.replaceAll('結界','加持').replaceAll('附魔','加持');
  if((dataset==='skills'||row?.skill)&&['description','conciseDescription'].includes(field.path.at(-1))&&/\bconditions?\b/i.test(source))text=text.replaceAll('條件','病症');
  if(/\bGold\b/.test(source))text=text.replaceAll('金牌','金幣');
  if(/\bZaishen\b/.test(source))text=text.replace(/Zaishen|再神/g,'戰承');
  if(!resolved&&source.includes('<unk>'))text=text.replaceAll('<unk>','〔原始資料缺字〕');
  for(const number of source.match(/\d{1,3}(?:,\d{3})+/g)??[])text=text.replaceAll(number.replaceAll(',','、'),number);
  if(correction){text=correction.text;kind='agent-proofread';proofreadCount++;}
  else text=normalize(text);
  if(!text?.trim())throw Error(`Empty Traditional translation: ${dataset}/${field.key}`);
  chinese[field.key]=text;
  const origin={kind:kind??'english-retranslation',translationHash:sha256(text),...(correction?{reviewStatus:correction.status,reason:correction.reason,evidenceHash:resolved.evidenceHash}:draft?.provider?{provider:draft.provider}:{}),...(term?{references:term.references}:{}),...(editorial.terms[source]?{editorialReferences:editorial.references}:{})};
  const sourceHash=sha256(source);
  if(correction||text!==lookup(source))provenance.adaptations[`${dataset}/${field.key}`]={englishHash:sourceHash,...origin};
  else provenance.texts[sourceHash]=origin;
  if(field.path.at(-1)==='name'||field.path.at(-1)==='title'&&field.path.length===3){
   nameSources[field.key]={kind:term&&text===normalize(traditional(term.text))?'wiki-term':origin.kind,references:term?.references??[]};
   legacyAliases[field.key]=[...new Set([...(legacyAliases[field.key]??[]),...(term?.aliases??[]),term?.text].filter(Boolean))];
  }
  count++;
 }
 const englishHash=sha256(JSON.stringify(english)),baselineHash=sha256(JSON.stringify(baseline));
 const common={version:1,dataset,sourceHash:sha256(raw),englishHash,baselineHash};
 fs.mkdirSync(projectPath('public/data/i18n/zh-TW'),{recursive:true});
 save(`data/i18n/baseline/${dataset}.json`,baseline);
 save(`public/data/i18n/en/${dataset}.json`,{...common,locale:'en',fields:english,unverifiedFields});
 const pack={...common,locale:'zh-TW',translationStatus:'pending-review',fields:chinese,nameSources,legacyAliases,unverifiedFields};
 save(`public/data/i18n/zh-TW/${dataset}.json`,pack);
 provenance.datasets[dataset]={...common,packHash:sha256(JSON.stringify(pack))};
}
// Existing zh-CN approvals remain historical records. No new approval is granted.
if(proofreadCount!==proofreading.size)throw Error('Proofreading references fields no longer present in the corpus');
save('data/i18n/zh-TW-provenance.json',provenance);
save('data/i18n/accuracy-audit.json',auditContent().report);
console.log({fields:count,proofreadFields:proofreadCount,textOrigins:Object.keys(provenance.texts).length,adaptations:Object.keys(provenance.adaptations).length,unresolvedEnglish:report.stats.unresolvedEnglish});
