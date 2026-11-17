/**
 * [INPUT]: 依赖公开 Wiki 文本、技能术语和翻译服务。
 * [OUTPUT]: 缓存绑定英文哈希的中文辅助译文；不授予人工审校状态。
 * [POS]: 可选的资料整理命令；离线构建只读取已经保存的译文。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fetch,ProxyAgent} from 'undici';
import {web} from './client.mjs';
import {contentFields} from '../../src/i18n/content-fields.ts';
import {skillTypes} from './skill-facts.mjs';
import {numericSignature} from '../i18n/english-source.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const dataset=process.argv.includes('--skills')?'skills':'quests';
const source=JSON.parse(await fs.readFile(path.join(web,`public/data/${dataset}.json`),'utf8'));
const file=path.join(web,`data/i18n/${dataset==='skills'?'skill':'quest'}-translations.json`);
let cache={version:1,engine:'Google Translate public endpoint; machine draft, not human reviewed',fields:{}};
try{cache=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const normalizeSkillDraft=text=>text.replace(/^拼写[。.]/,'咒文。').replace(/^绑定仪式[。.]/,'缚灵仪式。').replaceAll('十六进制咒语','降咒魔法').replaceAll('十六进制','降咒').replaceAll('党员','队员');
if(dataset==='skills')for(const value of Object.values(cache.fields))value.text=normalizeSkillDraft(value.text);
const dictionary={Walkthrough:'详细攻略',Objectives:'任务目标',Objective:'任务目标',Requirements:'领取条件',Reward:'任务奖励',Rewards:'任务奖励',Notes:'注意事项','Hard mode':'困难模式',Bonus:'额外奖励','Master reward':'大师级奖励','General tips':'通用技巧','Getting there':'抵达方式',Overview:'概览',Prophecies:'预言',Factions:'盟与敌',Nightfall:'黑暗逆袭','Eye of the North':'北方之眼','War in Kryta':'科瑞他战争','Winds of Change':'变换之风','Shared PvE':'通用 PvE','Hearts of the North':'北方之心'};
for(const labelsDataset of ['catalog','calendar','armor']){
 const data=JSON.parse(await fs.readFile(path.join(web,`public/data/${labelsDataset}.json`),'utf8'));
 const zh=JSON.parse(await fs.readFile(path.join(web,`public/data/i18n/zh-CN/${labelsDataset}.json`),'utf8'));
 for(const collection of ['records','activities','materials','sets'])for(const row of data[collection]||[]){const text=zh.fields[`${collection}/${row.id}/name`];if(row.englishName&&text&&/\p{Script=Han}/u.test(text))dictionary[row.englishName]=dataset==='skills'?text.replace(/^旧捕获来源身份待核实：/,''):text;}
}
if(dataset==='skills'){
 const labels=JSON.parse(await fs.readFile(path.join(web,'src/i18n/attribute-labels.json'),'utf8'));
 for(const[zh,en]of labels)dictionary[en]=zh;
 for(const[en,zh]of Object.entries(skillTypes))dictionary[en]=zh;
}
const unique=[...new Set(contentFields(source,dataset).map(field=>field.source))];
for(const text of unique)if(dictionary[text])cache.fields[hash(text)]={source:text,text:dictionary[text],kind:'existing-label'};
const wanted=unique.filter(text=>!cache.fields[hash(text)]);
const proxy=process.env.WIKI_PROXY||process.env.HTTPS_PROXY,dispatcher=proxy?new ProxyAgent(proxy):undefined;
const batches=[];let batch=[],length=0;
for(const source of wanted){
 // 单段过长时单独分段翻译，避免截断攻略。
 const parts=source.match(/[\s\S]{1,3200}(?:\s|$)|[\s\S]{1,3200}/g)||[source];
 for(let index=0;index<parts.length;index++){
  const protectedValues=[];
  const part=dataset==='skills'?parts[index].replace(/\[\[MO:[^\]]+\]\]|[+-]?\d+(?:\.\d+)?(?:…\d+(?:\.\d+)?)*(?:\s*%)?/g,value=>{const token=String(90100+protectedValues.length);protectedValues.push(value);return token;}):parts[index];
  const item={source,part,protectedValues,index,total:parts.length,key:`MAPPINGOUT_${hash(source).slice(0,16)}_${index}`};
  if(length+item.part.length+item.key.length+4>4300||batch.length>=35){batches.push(batch);batch=[];length=0;}
  batch.push(item);length+=item.part.length+item.key.length+4;
 }
}
if(batch.length)batches.push(batch);
const pieces=new Map();let position=0,completed=0,lastStart=0;let saved=Promise.resolve();
const write=()=>{saved=saved.then(()=>fs.writeFile(file,JSON.stringify(cache)+'\n'));return saved;};
async function translate(text){
 let error;
 for(let attempt=0;attempt<5;attempt++){
  const start=Math.max(Date.now(),lastStart+650);lastStart=start;await new Promise(resolve=>setTimeout(resolve,start-Date.now()));
  try{const url=new URL('https://translate.googleapis.com/translate_a/single');for(const[key,value]of Object.entries({client:'gtx',sl:'en',tl:'zh-CN',dt:'t',q:text}))url.searchParams.set(key,value);
   const response=await fetch(url,{dispatcher,signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error(`Translation HTTP ${response.status}`);const result=await response.json();return result[0].map(item=>item[0]||'').join('');
  }catch(failure){error=failure;await new Promise(resolve=>setTimeout(resolve,Math.min(30000,1000*2**attempt)));}
 }
 throw error;
}
async function worker(){while(position<batches.length){const items=batches[position++];const input=items.map(item=>`${item.key}\n${item.part}`).join('\n\n');const output=await translate(input);
 const translated=new Map([...output.matchAll(/MAPPINGOUT_([a-f\d]{16})_(\d+)\s*\n([\s\S]*?)(?=\n?MAPPINGOUT_[a-f\d]{16}_\d+\s*\n|$)/gi)].map(match=>[`MAPPINGOUT_${match[1]}_${match[2]}`,match[3].trim()]));
 for(const item of items){let text=translated.get(item.key);if(!text)text=(await translate(item.part)).trim();if(!text)throw Error('Empty translation');
  if(dataset==='skills'){
   if(item.protectedValues.some((_,n)=>!text.includes(String(90100+n))))text=(await translate(item.part)).trim();
   if(item.protectedValues.some((_,n)=>!text.includes(String(90100+n)))){
    const original=item.part.replace(/90\d{3}/g,token=>item.protectedValues[Number(token)-90100]);
    const direct=await translate(original);
    const tokens=[...original.matchAll(/\[\[MO:[^\]]+\]\]/g)].map(m=>m[0]);
    if(JSON.stringify(numericSignature(original))===JSON.stringify(numericSignature(direct))&&tokens.every(token=>direct.includes(token)))text=direct;
    else{const segments=item.part.split(/(90\d{3})/);text='';for(const segment of segments)text+=/^90\d{3}$/.test(segment)?item.protectedValues[Number(segment)-90100]:segment.trim()?await translate(segment):segment;}
   }else for(let n=0;n<item.protectedValues.length;n++)text=text.replaceAll(String(90100+n),item.protectedValues[n]);
   text=normalizeSkillDraft(text);
  }
  const parts=pieces.get(item.source)||new Array(item.total);parts[item.index]=text;pieces.set(item.source,parts);
  if(parts.filter(Boolean).length===item.total)cache.fields[hash(item.source)]={source:item.source,text:parts.join('\n'),kind:'machine-draft'};
 }
 completed++;if(completed%10===0){await write();console.log(`Quest translation ${completed}/${batches.length}; ${Object.keys(cache.fields).length} cached fields`);}
}}
await Promise.all(Array.from({length:dataset==='skills'?4:2},()=>worker()));await write();console.log(`${dataset} translations saved: ${Object.keys(cache.fields).length} fields`);process.exit(0);
