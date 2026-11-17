/**
 * [INPUT]: 依赖五套英文基线与 Wiki 当前修订接口。
 * [OUTPUT]: 保存版本变更和来源覆盖报告。
 * [POS]: 正式发布的来源新鲜度检查；不改变固定快照。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { projectPath } from '../lib/paths.mjs';
import fs from 'node:fs';
import {datasets} from '../../src/i18n/content-fields.ts';
import {api} from '../wiki/lib/client.mjs';
import {sha256} from './english-source.mjs';
const refs=new Map();
for(const dataset of datasets){
  const baseline=JSON.parse(fs.readFileSync(projectPath(`data/i18n/baseline/${dataset}.json`),'utf8'));
  for(const field of Object.values(baseline.fields))for(const ref of field.references)refs.set(ref.pageid,ref);
}
const pages=[...refs.values()],changed=[],errors=[];
const referenceHash=sha256(JSON.stringify([...refs.values()].sort((a,b)=>a.pageid-b.pageid)));
let checked=0;
for(let offset=0;offset<pages.length;offset+=50){
  const batch=pages.slice(offset,offset+50);
  const result=await api({action:'query',pageids:batch.map(p=>p.pageid).join('|'),prop:'revisions',rvprop:'ids|timestamp'});
  for(const page of result.query.pages){
    const expected=refs.get(page.pageid),actual=page.revisions?.[0];
    if(!actual){errors.push({expected,reason:'Missing current revision'});continue;}
    checked++;
    if(actual.revid!==expected.revid)changed.push({title:expected.title,pageid:page.pageid,pinned:expected.revid,current:actual.revid,revisedAt:actual.timestamp});
  }
  if(offset%500===0||offset+batch.length===pages.length)console.log(`Wiki revision metadata: ${Math.min(offset+batch.length,pages.length)}/${pages.length}`);
}
const report={checkedAt:new Date().toISOString(),referenceHash,checked,changed,errors};
fs.writeFileSync(projectPath('data/i18n/wiki-current-revisions.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(errors.length||changed.length)process.exitCode=1;
