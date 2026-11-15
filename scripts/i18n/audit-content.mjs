import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {contentFields} from '../../src/i18n/content-fields.ts';
import {englishSource,numericIssues,sha256} from './english-source.mjs';
import {skillFacts} from '../wiki/skill-facts.mjs';
import {npcFacts,weaponFacts} from '../wiki/content-facts.mjs';
import {armorFacts} from '../wiki/armor-facts.mjs';
import {collectorTableFacts} from '../wiki/collector-facts.mjs';
import {locationFacts} from '../wiki/location-facts.mjs';
import {headingSection} from '../wiki/source-facts.mjs';
import {plainText,templates} from '../wiki/wikitext.mjs';

const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
export function auditContent(root=process.cwd()){
  const previous=process.cwd();process.chdir(root);
  try{
    const manual=fs.existsSync('data/i18n/english-reviews.json')?read('data/i18n/english-reviews.json'):{};
    const overrides=read('data/i18n/overrides.json');
    // Only the previously reviewed campaign and region labels are imported.
    for(const [key,value]of Object.entries(overrides))if(/^en\/catalog\/(?:campaigns|regions)\//.test(key))manual[key.slice(3)]={sourceHash:sha256(value.source),text:value.text,reviewer:value.reviewer,kind:'application-label'};
    const report={version:2,baseline:'Guild Wars Wiki, pinned English revisions',stats:{fields:0,wikiText:0,factRenderers:0,applicationText:0,unresolvedEnglish:0,englishCorrections:0,numericFlags:0},evidence:{skills:0,pvp:0,npcs:0,weapons:0,collectors:0,areas:0,armorSets:0,armorOffers:0,quests:0,travelerExchanges:0,weeklyEffects:0,rotations:0},evidenceErrors:[],unresolved:[],englishChanges:[],numeric:[]};
    const baselines={};
    const page=ref=>{
      const file=`data/wiki/pages/${ref.pageid}.json`;
      if(!fs.existsSync(file))throw Error(`Missing Wiki snapshot ${ref.title}`);
      const source=read(file);
      if(source.revid!==ref.revid||source.title!==ref.title)throw Error(`Wiki revision changed: ${ref.title} (${ref.revid} -> ${source.revid})`);
      return source;
    };
    const same=(expected,actual,key)=>{
      if(JSON.stringify(expected)!==JSON.stringify(actual))report.evidenceErrors.push({key,expected,actual});
    };
    const checked=new Set();
    for(const dataset of ['catalog','armor','calendar']){
      const bytes=fs.readFileSync(`public/data/${dataset}.json`),data=JSON.parse(bytes);
      const en=read(`public/data/i18n/en/${dataset}.json`).fields,zh=read(`public/data/i18n/zh-CN/${dataset}.json`).fields;
      const baseline={version:2,dataset,sourceHash:sha256(bytes),fields:{}};
      for(const field of contentFields(data,dataset)){
        report.stats.fields++;
        const id=`${dataset}/${field.key}`;
        const resolved=englishSource(data,dataset,field,manual);
        if(!resolved){report.unresolved.push({key:id,legacyText:field.source,englishDraft:en[field.key]});report.stats.unresolvedEnglish++;continue;}
        const evidenceHash=sha256(JSON.stringify(resolved.references));
        baseline.fields[field.key]={...resolved,legacyHash:sha256(field.source),evidenceHash};
        if(resolved.kind==='wiki-text'||resolved.kind==='wiki-title')report.stats.wikiText++;
        else if(resolved.kind==='wiki-facts')report.stats.factRenderers++;
        else report.stats.applicationText++;
        for(const ref of resolved.references){const identity=`${ref.pageid}:${ref.revid}`;if(!checked.has(identity)){page(ref);checked.add(identity);}}
        if(en[field.key]!==resolved.text){report.englishChanges.push({key:id,before:en[field.key],after:resolved.text,kind:resolved.kind,references:resolved.references});report.stats.englishCorrections++;}
        const issues=numericIssues(resolved.text,zh[field.key]||'');
        if(issues.length){report.numeric.push({key:id,english:resolved.text,chinese:zh[field.key],issues,references:resolved.references});report.stats.numericFlags++;}
      }
      if(dataset==='catalog')for(const row of data.records){
        if(row.skill){
          for(const [label,value]of [['skill',row.skill],['pvp',row.skill.pvp]]){
            if(!value)continue;
            const facts=skillFacts(page(value.reference));
            for(const key of ['title','gameIds','profession','attribute','type','elite','pveOnly','energy','adrenaline','activation','recharge','upkeep','sacrifice','overcast','description','conciseDescription','progression','warnings'])same(facts[key],value[key],`${row.id}/${label}/${key}`);
            if(label==='skill')same(facts.acquisition.map(({raw,...entry})=>entry),value.acquisition,`${row.id}/skill/acquisition`);
            report.evidence[label==='skill'?'skills':'pvp']++;
          }
        }
        if(row.npc){
          const facts=npcFacts(page(row.npc.reference));
          for(const key of ['boss','profession','secondaryProfession','thirdProfession','level','areas','skills','skillsText','drops','service'])same(facts[key],row.npc[key],`${row.id}/npc/${key}`);
          report.evidence.npcs++;
        }
        if(row.item?.unique&&row.item.reference&&(!row.item.classification||row.item.classification==='unique-weapon')){
          const facts=weaponFacts(page(row.item.reference));
          for(const key of ['type','attribute','damageType','stats','versions'])same(facts[key],row.item[key],`${row.id}/item/${key}`);
          report.evidence.weapons++;
        }
        if(row.collector){
          const table=row.wiki.references.find(ref=>/\/Collectors?(?:\b|\/)/i.test(ref.title));
          if(!table)throw Error(`Missing collector table ${row.id}`);
          const facts=collectorTableFacts(page(table),row,page(row.wiki));
          for(const key of ['amount','material','location','armor','rewards'])same(facts[key],row.collector[key],`${row.id}/collector/${key}`);
          report.evidence.collectors++;
        }
        if(row.area){
          const facts=locationFacts(page(row.area.reference));
          for(const key of ['title','type','region','levels','exits'])same(facts[key],row.area[key],`${row.id}/area/${key}`);
          report.evidence.areas++;
        }
      }
      if(dataset==='calendar'){
        const byId=new Map(data.activities.map(a=>[a.id,a]));
        for(const rotation of data.rotations){
          const source=page(rotation.reference);
          if(['mission','bounty','combat','vanquish','traveler'].includes(rotation.id)){
            const match=/-\s*(\d{10})\b/.exec(source.wikitext);
            same(Number(match?.[1])*1000,rotation.epoch,`${rotation.id}/epoch`);
            same(rotation.id==='traveler'?604800000:86400000,rotation.period,`${rotation.id}/period`);
            if(rotation.id!=='traveler'){
              const titles=[...source.wikitext.matchAll(/^\s*\|\s*\d+\s*=\s*([^\n]+)/gm)].map(m=>m[1].trim());
              same(titles,rotation.sequence.map(id=>byId.get(id).englishName),`${rotation.id}/sequence`);
            }else{
              const values=name=>{
                const start=source.wikitext.indexOf(`vardefine:${name}|`),rest=source.wikitext.slice(start),end=rest.search(/\}\}\s*\}\}/);
                return [...rest.slice(0,end).matchAll(/^\s*\|\s*\d+\s*=\s*([^\n]+)/gm)].map(m=>plainText(m[1]));
              };
              const items=values('NicholasItem'),amounts=values('NicholasQuantity'),locations=values('NicholasLocation');
              rotation.sequence.forEach((id,i)=>{
                const activity=byId.get(id);
                same(items[i],activity.exchange.item,`${id}/item`);
                same(Number(amounts[i]),activity.exchange.perGift,`${id}/perGift`);
                same(locations[i],activity.location,`${id}/location`);
                report.evidence.travelerExchanges++;
              });
              const npc=page(byId.get(rotation.sequence[0]).references[1]);
              if(!/limited to 5 Gifts of the Traveler per week/.test(npc.wikitext))report.evidenceErrors.push({key:'traveler/weeklyLimit',expected:'5 gifts per account per week',actual:'Source wording changed; review the limit.'});
            }
          }else{
            same(Date.parse('2013-05-13T15:00:00Z'),rotation.epoch,`${rotation.id}/epoch`);
            if(!source.wikitext.includes('13 May 2013 15:00'))report.evidenceErrors.push({key:`${rotation.id}/epoch`,actual:'Weekly template epoch changed'});
            const label=rotation.id==='pve-bonus'?'PvE':'PvP';
            const fragment=source.wikitext.split(`vardefine:${label} event|`)[1]?.split('}}}}')[0]||'';
            const names=[...fragment.matchAll(/^\s*\|\s*\d+\s*=\s*([^\n]+)/gm)].map(m=>m[1].trim()+' Bonus');
            same(names,rotation.sequence.map(id=>byId.get(id).englishName),`${rotation.id}/sequence`);
            same(604800000,rotation.period,`${rotation.id}/period`);
          }
          report.evidence.rotations++;
        }
        for(const activity of data.activities){
          if(['mission','bounty','combat','vanquish'].includes(activity.kind)){
            const source=page(activity.references[0]),box=templates(source.wikitext,'Quest infobox')[0]?.fields;
            same(plainText(headingSection(source.wikitext,'Objectives')),activity.objective,`${activity.id}/objective`);
            same(plainText(headingSection(source.wikitext,'Rewards')||headingSection(source.wikitext,'Reward')),activity.rewards,`${activity.id}/rewards`);
            same(`${plainText(box['given by'])} · ${plainText(box['given at'])}`,activity.giver,`${activity.id}/giver`);
            report.evidence.quests++;
          }else if(activity.kind.endsWith('-bonus')){
            const source=page(activity.references[1]);
            const line=source.wikitext.split('\n').find(line=>line.includes(`|| ${activity.englishName}`)&&line.split('||').length>=3);
            const effect=plainText(line.split('||').slice(2).join('||'));
            same(effect,activity.objective,`${activity.id}/objective`);same(effect,activity.rewards,`${activity.id}/rewards`);
            report.evidence.weeklyEffects++;
          }
        }
      }
      if(dataset==='armor')for(const set of data.sets){
        const facts=armorFacts(page(set.reference));
        same(facts.set.englishName,set.englishName,`${set.id}/name`);
        for(const offer of data.offers.filter(o=>o.armorId===set.id)){
          const expected=facts.offers.find(o=>o.id===offer.id);
          for(const key of ['armorRating','ratingByProfession','pieces'])same(expected?.[key],offer[key],`${offer.id}/${key}`);
          report.evidence.armorOffers++;
        }
        report.evidence.armorSets++;
      }
      baselines[dataset]=baseline;
    }
    report.evidence.revisions=checked.size;
    return {report,baselines};
  }finally{process.chdir(previous);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const {report,baselines}=auditContent();
  fs.mkdirSync('data/i18n/baseline',{recursive:true});
  for(const [dataset,baseline]of Object.entries(baselines))fs.writeFileSync(`data/i18n/baseline/${dataset}.json`,JSON.stringify(baseline)+'\n');
  fs.writeFileSync('data/i18n/accuracy-audit.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({stats:report.stats,evidence:report.evidence,evidenceErrors:report.evidenceErrors.length,sampleErrors:report.evidenceErrors.slice(0,5)},null,2));
  if(report.evidenceErrors.length)process.exitCode=1;
}
