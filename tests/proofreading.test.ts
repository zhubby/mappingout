/**
 * [INPUT]: 依赖逐文本校对绑定与固定英文证据。
 * [OUTPUT]: 验证校对优先级、过期拒绝、动态效果身份与证据隔离。
 * [POS]: 维护期校对回归；不把代理审读转换成人工批准。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import {indexProofreading,proofreadText} from '../scripts/i18n/proofreading.mjs';
import {sha256} from '../scripts/i18n/english-source.mjs';

const source={text:'Your party gains 5 Energy.',englishHash:sha256('Your party gains 5 Energy.'),evidenceHash:'revision-7'};
const binding={dataset:'quests',key:'quests/1/text',englishHash:source.englishHash,evidenceHash:source.evidenceHash};
const entry={source:source.text,text:'你的隊伍獲得 5 點能量。',reason:'party 指隊伍，並非聚會。',bindings:[binding]};
const document=(entries:any[])=>({version:1,locale:'zh-TW',status:'agent-reviewed-not-in-game-verified',entries});

describe('Pinned bilingual proofreading',()=>{
 it('applies only to the exact field, English body and revision evidence reviewed',()=>{
  const index=indexProofreading([document([entry])]);
  expect(proofreadText(index,'quests',binding.key,source)).toMatchObject({text:entry.text,reason:entry.reason});
  expect(proofreadText(index,'catalog',binding.key,source)).toBeUndefined();
  expect(proofreadText(index,'quests','quests/2/text',source)).toBeUndefined();
 });
 it('rejects both English changes and revision-only changes before compilation',()=>{
  const index=indexProofreading([document([entry])]);
  expect(()=>proofreadText(index,'quests',binding.key,{...source,text:'Your party loses 5 Energy.',englishHash:sha256('Your party loses 5 Energy.')})).toThrow(/Stale/);
  expect(()=>proofreadText(index,'quests',binding.key,{...source,evidenceHash:'revision-8'})).toThrow(/Stale/);
  expect(()=>proofreadText(index,'quests',binding.key,undefined)).toThrow(/Stale/);
 });
 it('requires explicit reasons and genuine source hashes, and rejects conflicting bindings',()=>{
  expect(()=>indexProofreading([document([{...entry,reason:''}])])).toThrow(/reason/);
  expect(()=>indexProofreading([document([{...entry,bindings:[{...binding,englishHash:'forged'}]}])])).toThrow(/hash/);
  expect(()=>indexProofreading([document([entry,{...entry,text:'不同譯文'}])])).toThrow(/Duplicate/);
 });
 it('keeps agent review distinct from human approval or in-game evidence',()=>{
  expect(()=>indexProofreading([{...document([entry]),status:'human-approved'}])).toThrow(/status/);
  const result=proofreadText(indexProofreading([document([entry])]),'quests',binding.key,source);
  expect(result.status).toBe('agent-reviewed-not-in-game-verified');
  expect(result.reviewer).toBeUndefined();
 });
 it('rejects unknown, missing and duplicated dynamic tokens from the actual Cleave template',()=>{
  const data=JSON.parse(fs.readFileSync('public/data/skills.json','utf8'));
  const template=data.skills.find((skill:any)=>skill.id==='skill:gww:4050').variants[0].descriptionTemplate;
  const dynamicEntry={source:template,text:template,reason:'核对真实动态说明的效果身份与每次出现。',bindings:[{dataset:'skills',key:'skills/skill:gww:4050/variants/skill-version:gww:4050/descriptionTemplate',englishHash:sha256(template),evidenceHash:'pinned-cleave'}]};
  expect(()=>indexProofreading([document([dynamicEntry])])).not.toThrow();
  for(const text of [template.replace('[[MO:growth:0:var3]]','[[MO:unknown:0:var3]]'),template.replace('[[MO:growth:0:var3]]',''),template+'[[MO:growth:0:var3]]']){
   expect(()=>indexProofreading([document([{...dynamicEntry,text}])])).toThrow(/Dynamic/);
  }
 });
});
