/**
 * [INPUT]: 依赖固定英文语言包、中文 Wiki 术语和公开文本翻译接口。
 * [OUTPUT]: 生成可续跑译稿；按需重译含术语格式污染的快取。
 * [POS]: 维护期英文到繁体翻译；保护游戏名称、数值和成长占位符。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Converter} from 'opencc-js';
import {projectPath} from '../lib/paths.mjs';
import {translate,translateBatch} from './translate-public-text.mjs';
import {numericIssues} from './english-source.mjs';
const hash=text=>createHash('sha256').update(text).digest('hex');
const traditional=Converter({from:'cn',to:'twp'});
const terms=JSON.parse(await fs.readFile(projectPath('data/i18n/zh-TW-terms.json'),'utf8')).terms;
const editorial=JSON.parse(await fs.readFile(projectPath('data/i18n/zh-TW-editorial.json'),'utf8'));
const dictionary={...Object.fromEntries(Object.entries(terms).map(([key,value])=>[key,traditional(value.text)])),...editorial.terms};
const file=projectPath('data/i18n/zh-TW-translations.json');
let cache={version:1,locale:'zh-TW',engine:'Google Translate en → zh-TW with pinned Wiki term and numeric protection; machine-assisted draft, not human reviewed',fields:{}};
try{cache=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const sources=new Set();
for(const dataset of ['catalog','armor','calendar','quests','skills']){
  const pack=JSON.parse(await fs.readFile(projectPath(`public/data/i18n/en/${dataset}.json`),'utf8'));
  for(const text of Object.values(pack.fields))sources.add(text);
}
const repair=process.argv.includes('--repair');
const repairTerms=process.argv.includes('--repair-terms');
if(repairTerms)for(const [key,draft]of Object.entries(cache.fields)){
  if(/<br\s*\/?\s*>|(?:影像|圖像|檔案):/i.test(draft.text))delete cache.fields[key];
}
if(repair)for(const [key,draft]of Object.entries(cache.fields)){
  if(draft.provider?.includes('Argos')||/MOPROTECT|(?:PROT)?ECT\d+(?:END)?|<unk>|\u2581/.test(draft.text)||numericIssues(draft.source,draft.text).includes('quantity-or-unit'))delete cache.fields[key];
}
for(const source of sources){
  if(dictionary[source])cache.fields[hash(source)]={source,text:dictionary[source],kind:terms[source]?'wiki-term':'editorial-label'};
  else if(!/[A-Za-z\p{Script=Han}]/u.test(source))cache.fields[hash(source)]={source,text:source,kind:'invariant'};
}
const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const names=Object.keys(dictionary).filter(name=>name.length>=3&&!/\p{Script=Han}/u.test(name)).sort((a,b)=>b.length-a.length);
const protectPattern=new RegExp(`\\[\\[MO:[^\\]]+\\]\\]|\\{\\{\\w+\\}\\}|\\b(?:${names.map(escape).join('|')})\\b|[+-]?\\d+(?:,\\d{3})*(?:\\.\\d+)?(?:…\\d+(?:\\.\\d+)?)*(?:\\s*%)?`,'g');
const items=[...sources].filter(source=>!cache.fields[hash(source)]).map(source=>{
  const tokens=[];
  const input=source.replace(protectPattern,value=>{const token=`MOPROTECT${tokens.length}END`;tokens.push(dictionary[value]??value);return token;});
  return {source,input,tokens};
});
const exportAt=process.argv.indexOf('--export-local');
if(exportAt>=0){
  await fs.writeFile(process.argv[exportAt+1],JSON.stringify({cacheFile:file,items})+'\n');
  console.log(`Exported ${items.length} English drafts for the local model`);
  process.exit(0);
}
const batches=[];let batch=[],length=0;
for(const item of items){
  if(length+item.input.length+20>3800||batch.length>=28){if(batch.length)batches.push(batch);batch=[];length=0;}
  batch.push(item);length+=item.input.length+20;
}
if(batch.length)batches.push(batch);
let write=Promise.resolve(),position=0,completed=0,lastStart=0;
const save=()=>{write=write.then(async()=>{await fs.writeFile(file+'.tmp',JSON.stringify(cache)+'\n');await fs.rename(file+'.tmp',file);});return write;};
const interval=Number(process.env.TRANSLATION_INTERVAL_MS)||1200;
const pace=async()=>{const start=Math.max(Date.now(),lastStart+interval);lastStart=start;await new Promise(resolve=>setTimeout(resolve,Math.max(0,start-Date.now())));};
function restore(text,item){
  for(let i=0;i<item.tokens.length;i++){
    const pattern=new RegExp(`MO\\s*PROTECT\\s*${i}\\s*END`,'gi');
    if([...text.matchAll(new RegExp(pattern.source,'gi'))].length!==1)throw Error(`Protected token missing or duplicated: ${i}`);
    text=text.replace(pattern,()=>item.tokens[i]);
  }
  if(/MOPROTECT|(?:PROT)?ECT\d+(?:END)?|\[MO\d+\]|<unk>|\u2581/.test(text))throw Error('Unrestored translation marker');
  return traditional(text.trim());
}
async function segmented(item){
  // A damaged marker never enters a draft. Translate text spans separately
  // when the public service repeatedly rewrites a protected game value.
  const parts=item.input.split(/(MOPROTECT\d+END)/g),texts=parts.filter(part=>part.trim()&&!/^MOPROTECT\d+END$/.test(part));
  await pace();
  let translated;
  try{translated=await translateBatch(texts,'zh-TW');}
  catch{translated=[];for(const text of texts){await pace();translated.push(await translate(text,'zh-TW'));}}
  let position=0;
  return traditional(parts.map(part=>{
    const marker=/^MOPROTECT(\d+)END$/.exec(part);
    return marker?item.tokens[Number(marker[1])]:part.trim()?translated[position++]:part;
  }).join(' ').trim());
}
await save();
console.log({unique:sources.size,cached:Object.keys(cache.fields).length,batches:batches.length});
async function worker(){
  while(position<batches.length){
    const index=position++,group=batches[index];let translated;
    await pace();
    try{translated=await translateBatch(group.map(item=>item.input),'zh-TW');}
    catch{translated=[];for(const item of group){await pace();translated.push(await translate(item.input,'zh-TW'));}}
    for(let i=0;i<group.length;i++){
      const item=group[i];let text;
      try{text=restore(translated[i],item);}catch{
        await pace();
        try{text=restore(await translate(item.input,'zh-TW'),item);}catch{text=await segmented(item);}
      }
      cache.fields[hash(item.source)]={source:item.source,text,kind:'english-retranslation',provider:'Google Translate en → zh-TW; protected terms and quantities; pending review'};
    }
    completed++;
    if(completed%10===0){await save();console.log(`繁体重新翻译 ${completed}/${batches.length}; ${Object.keys(cache.fields).length}/${sources.size} strings`);}
  }
}
try{await Promise.all(Array.from({length:4},()=>worker()));}finally{await save();}
cache.engine='English to Traditional Chinese drafts: Google Translate with pinned terms and quantities; not human reviewed';
if(!Object.values(cache.fields).some(draft=>draft.provider?.includes('Argos')))delete cache.localModel;
await save();
console.log(`Traditional Chinese drafts saved: ${Object.keys(cache.fields).length}`);
process.exit(0);
