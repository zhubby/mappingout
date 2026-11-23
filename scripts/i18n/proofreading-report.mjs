/**
 * [INPUT]: 依赖五套繁英资料、逐文本校对绑定与来源修订报告。
 * [OUTPUT]: 写入全量范围、已审覆盖与未审风险统计。
 * [POS]: 全文校对进度入口；关键词只标风险，不授予审读状态。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import fs from 'node:fs';
import {projectPath} from '../lib/paths.mjs';
import {datasets} from '../../src/i18n/content-fields.ts';
import {loadProofreading,proofreadText} from './proofreading.mjs';
const read=file=>JSON.parse(fs.readFileSync(projectPath(file),'utf8'));
const index=loadProofreading(projectPath('data/i18n/proofreading'));
const risks={
 'literal-game-concept':/字元|聚會|政黨|產卵|十六進|六角形|病房|腳輪|死刑|陰天|快閃記憶體|計程車|驅逐艦|主打歌/,
 'source-placeholder':/<unk>|\{\{|\[Incomplete source section\]/,
 'conditional-mechanic':/\b(?:if|unless|while|only|instead|next|each|every|maximum|minimum|less than|more than)\b/i,
};
const uniqueEnglish=new Set(),reviewedEnglish=new Set(),remainingEnglish=new Set(),seen=new Set(),reports=[];
for(const dataset of datasets){
 const en=read(`public/data/i18n/en/${dataset}.json`),zh=read(`public/data/i18n/zh-TW/${dataset}.json`),baseline=read(`data/i18n/baseline/${dataset}.json`);
 const texts=new Set(),reviewed=new Set(),remaining=new Set(),riskFields=Object.fromEntries(Object.keys(risks).map(key=>[key,0]));
 const riskExamples=[];let reviewedFields=0;
 for(const [key,source]of Object.entries(en.fields)){
  texts.add(source);uniqueEnglish.add(source);
  const entry=proofreadText(index,dataset,key,baseline.fields[key]);
  if(entry){
   if(zh.fields[key]!==entry.text)throw Error(`Proofread text not compiled: ${dataset}/${key}`);
   reviewedFields++;reviewed.add(source);reviewedEnglish.add(source);seen.add(`${dataset}/${key}`);
  }else{
   remaining.add(source);remainingEnglish.add(source);
   const flags=Object.entries(risks).filter(([type,pattern])=>pattern.test(type==='literal-game-concept'?zh.fields[key]:source)).map(([type])=>type);
   for(const flag of flags)riskFields[flag]++;
   if(flags.includes('literal-game-concept')&&riskExamples.length<12)riskExamples.push({key,english:source,chinese:zh.fields[key],flags});
  }
 }
 reports.push({dataset,fields:Object.keys(en.fields).length,distinctEnglish:texts.size,reviewedFields,reviewedDistinctEnglish:reviewed.size,remainingFields:Object.keys(en.fields).length-reviewedFields,remainingDistinctEnglish:remaining.size,unverifiedEnglishFields:en.unverifiedFields.length,riskFields,riskExamples});
}
if(seen.size!==index.size)throw Error('Obsolete proofreading bindings remain');
const current=read('data/i18n/wiki-current-revisions.json');
const report={version:1,generatedAt:new Date().toISOString(),scope:'All five Traditional Chinese and English data packs; UI reviewed separately',reviewMethod:'Individual agent semantic comparison against exact English text and revision evidence; not human approval or in-game verification',complete:false,fields:reports.reduce((n,r)=>n+r.fields,0),distinctEnglish:uniqueEnglish.size,reviewedFields:seen.size,reviewedDistinctEnglish:reviewedEnglish.size,remainingFields:reports.reduce((n,r)=>n+r.remainingFields,0),remainingDistinctEnglish:remainingEnglish.size,englishRevisionCheck:{checkedAt:current.checkedAt,checked:current.checked,changed:current.changed.length,errors:current.errors.length},datasets:reports};
fs.writeFileSync(projectPath('data/i18n/proofreading/coverage.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,datasets:reports.map(({riskExamples,...row})=>row)},null,2));
