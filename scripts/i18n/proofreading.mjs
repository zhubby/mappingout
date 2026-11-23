/**
 * [INPUT]: 依赖逐文本语义校对与固定英文正文、修订证据。
 * [OUTPUT]: 索引字段校对；拒绝冲突、失效绑定与动态效果身份变化。
 * [POS]: 离线语言编译的校对层；不写入人工审校批准。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {sha256} from './english-source.mjs';
import fs from 'node:fs';
import path from 'node:path';

const status='agent-reviewed-not-in-game-verified';
const datasets=new Set(['catalog','armor','calendar','quests','skills']);
export function assertDynamicTokens(source,text){
 const tokens=value=>[...value.matchAll(/\[\[MO:[^\]]+\]\]/g)].map(match=>match[0]).sort();
 if(JSON.stringify(tokens(source))!==JSON.stringify(tokens(text)))throw Error('Dynamic effect tokens differ from English source');
}
export function loadProofreading(directory){
 const files=fs.readdirSync(directory).filter(file=>file.endsWith('.json')&&file!=='coverage.json').sort();
 return indexProofreading(files.map(file=>JSON.parse(fs.readFileSync(path.join(directory,file),'utf8'))));
}
export function indexProofreading(documents){
 const index=new Map();
 for(const document of documents){
  if(document.version!==1||document.locale!=='zh-TW'||document.status!==status)throw Error('Invalid proofreading document status');
  if(!Array.isArray(document.entries))throw Error('Missing proofreading entries');
  for(const entry of document.entries){
   for(const key of ['source','text','reason'])if(typeof entry[key]!=='string'||!entry[key].trim())throw Error(`Missing proofreading ${key}`);
   assertDynamicTokens(entry.source,entry.text);
   if(!Array.isArray(entry.bindings)||!entry.bindings.length)throw Error('Missing proofreading bindings');
   for(const binding of entry.bindings){
    if(!datasets.has(binding.dataset)||typeof binding.key!=='string'||!binding.key.trim())throw Error('Invalid proofreading field');
    if(binding.englishHash!==sha256(entry.source)||!binding.evidenceHash)throw Error('Invalid proofreading source hash');
    const key=`${binding.dataset}/${binding.key}`;
    if(index.has(key))throw Error(`Duplicate proofreading binding: ${key}`);
    index.set(key,{source:entry.source,text:entry.text,reason:entry.reason,status,binding});
   }
  }
 }
 return index;
}
export function proofreadText(index,dataset,key,source){
 const entry=index.get(`${dataset}/${key}`);
 if(!entry)return undefined;
 if(!source||entry.source!==source.text||entry.binding.englishHash!==source.englishHash||entry.binding.evidenceHash!==source.evidenceHash)throw Error(`Stale proofreading binding: ${dataset}/${key}`);
 return entry;
}
