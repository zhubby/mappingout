import fs from 'node:fs';
import {contentFields} from '../../src/i18n/content-fields.ts';
import {auditContent} from './audit-content.mjs';
import {sha256,numericIssues} from './english-source.mjs';
import {reviewedSkills,numericReviewNotes} from './reviewed-skills.mjs';
import {travelerItems} from './reviewed-traveler-items.mjs';

const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const save=(file,value)=>fs.writeFileSync(file,JSON.stringify(value)+'\n');
const {report,baselines}=auditContent();
if(report.evidenceErrors.length)throw Error('Wiki evidence differs; see the accuracy audit before compiling language packs.');
const previousReviews=read('data/i18n/review.json').reviews;
const previousSkills=read('scripts/wiki/translations.json');
const skillReviewSources=read('data/i18n/skill-review-sources.json');
const reviews={};
let correctedEnglish=0,reviewedChinese=0;
fs.mkdirSync('data/i18n/baseline',{recursive:true});
for(const dataset of ['catalog','armor','calendar']){
  const raw=fs.readFileSync(`public/data/${dataset}.json`),data=JSON.parse(raw),baseline=baselines[dataset];
  save(`data/i18n/baseline/${dataset}.json`,baseline);
  const oldEn=read(`public/data/i18n/en/${dataset}.json`),oldZh=read(`public/data/i18n/zh-CN/${dataset}.json`);
  const english={},chinese={},unverifiedEnglish=[];
  for(const field of contentFields(data,dataset)){
    const resolved=baseline.fields[field.key];
    // Unresolved legacy/editorial drafts remain visible for local review only.
    // They cannot be released and never enter the authoritative baseline.
    if(!resolved)unverifiedEnglish.push(field.key);
    english[field.key]=resolved?.text||oldEn.fields[field.key];
    if(!english[field.key])throw Error(`Missing English source ${dataset}/${field.key}`);
    if(english[field.key]!==oldEn.fields[field.key])correctedEnglish++;
    let text=oldZh.fields[field.key],reviewer,numericReview;
    const [collection,index,section]=field.path;
    const row=data[collection]?.[index];
    const skillDescription=dataset==='catalog'&&collection==='records'&&row.skill&&field.path.at(-1)==='description';
    if(skillDescription){
      const skill=field.path.includes('pvp')?row.skill.pvp:row.skill;
      const old=previousSkills[skill.title],fresh=reviewedSkills[skill.title],pin=skillReviewSources[skill.title];
      if(fresh){
        if(!pin||pin.revid!==skill.reference.revid||pin.englishHash!==sha256(skill.description))throw Error(`Skill translation needs a new English review: ${skill.title}`);
        text=fresh;reviewer='English-source manual review';numericReview=numericReviewNotes[skill.title];
      }else if(old?.revid===skill.reference.revid){text=old.text;reviewer='Pinned Wiki translation review';}
    }
    if(dataset==='catalog'&&collection==='records'&&row.skill&&section==='details'){
      const f=row.skill,i=Number(field.path[3]);
      // Numeric values come from the same verified English facts. Units are
      // rendered once, so a source value of "33%" can never become "33%%".
      const details=[data.records[index].details[0],`维持：${f.upkeep} · 怒气：${f.adrenaline} · 能量：${f.energy} · 施放：${f.activation==='0'&&/Attack/.test(f.type)?'普通攻击速度':f.activation+' 秒'} · 冷却：${f.recharge} 秒`,
        ...(f.sacrifice!=='0'?[`牺牲体力：${f.sacrifice.replace(/%+$/,'')}%`]:[]),
        ...(f.overcast!=='0'?[`过载：${f.overcast}`]:[]),
        ...(f.pvp?['此技能的 PvE 与 PvP 版本不同；默认展示 PvE，PvP 说明另列。']:[])];
      text=details[i];reviewer='Bilingual skill-fact renderer review';
    }
    if(dataset==='calendar'&&row.kind==='traveler'){
      const item=travelerItems[row.exchange.item];
      if(!item)throw Error(`Traveler item needs review: ${row.exchange.item}`);
      const leaf=field.path.at(-1);
      if(leaf==='objective'){text=`每份旅者礼物需要 ${row.exchange.perGift} × ${item}。`;reviewer='Bilingual traveler exchange renderer review';}
      if(leaf==='requirements'){text='需要能够进入旅者所在区域。每账号每周最多兑换 5 份旅者礼物。';reviewer='Pinned traveler limit review';}
      if(leaf==='rewards'){text='旅者礼物 × 1（每次兑换）';reviewer='Pinned traveler reward review';}
      if(leaf==='item'){text=item;reviewer='English item-name manual review';}
      if(leaf==='giver'){text='旅者尼古拉斯';reviewer='English NPC-name manual review';}
    }
    if(dataset==='calendar'&&['mission','bounty','combat','vanquish'].includes(row.kind)&&section==='requirements'&&/\p{Script=Han}/u.test(field.source)){
      text='所引任务页面未单列前置条件。请参阅任务目标及目标区域或模式的进入要求。';reviewer='English-source application note review';
    }
    if(!text?.trim())throw Error(`Missing Chinese draft ${dataset}/${field.key}`);
    chinese[field.key]=text;
    const key=`zh-CN/${dataset}/${field.key}`;
    const previous=previousReviews[key];
    const record={englishHash:sha256(english[field.key]),evidenceHash:resolved?.evidenceHash,translationHash:sha256(text)};
    if(previous?.reviewer&&previous.englishHash===record.englishHash&&previous.evidenceHash===record.evidenceHash&&previous.translationHash===record.translationHash)reviews[key]=previous;
    if(reviewer&&resolved){
      const issues=numericIssues(resolved.text,text);
      // An explicit semantic note is required to waive a quantity/order flag.
      reviews[key]={...record,reviewer,...(issues.length&&numericReview?{numericReview}:{} )};
      reviewedChinese++;
    }
  }
  const englishHash=sha256(JSON.stringify(english)),baselineHash=sha256(JSON.stringify(baseline));
  const common={version:1,dataset,sourceHash:sha256(raw),englishHash,baselineHash};
  save(`public/data/i18n/en/${dataset}.json`,{...common,locale:'en',fields:english,unverifiedFields:unverifiedEnglish});
  save(`public/data/i18n/zh-CN/${dataset}.json`,{...common,locale:'zh-CN',fields:chinese});
}
save('data/i18n/review.json',{version:2,baseline:'English Wiki text and pinned revisions',reviews});
save('data/i18n/accuracy-audit.json',report);
console.log({correctedEnglish,reviewedChinese,unresolvedEnglish:report.stats.unresolvedEnglish});
