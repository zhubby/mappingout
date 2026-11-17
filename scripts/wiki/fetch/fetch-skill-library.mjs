/**
 * [INPUT]: 依赖共用 Wiki 客户端、职业目录与现有固定快照。
 * [OUTPUT]: 保存全技能候选、分类证据、目录交叉核对及成长模板。
 * [POS]: 技能百科唯一页面采集入口；离线编译不访问网络。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {api,category,evidenceDir,fetchPages,loadPage} from '../lib/client.mjs';
import {templates,links} from '../lib/wikitext.mjs';
import {skillEligibility} from '../lib/skill-library-facts.mjs';
const professions=['Warrior','Ranger','Monk','Necromancer','Mesmer','Elementalist','Assassin','Ritualist','Paragon','Dervish'];
const roots=[...professions.map(p=>`List of ${p.toLowerCase()} skills`),'List of common skills','List of PvE-only skills','List of PvP versions of skills','List of Anniversary Celebration elite skills','Template:Skill infobox','Template:Gr','Template:Gr2'];
const file=path.join(evidenceDir,'skill-library-discovery.json');
let discovery;
try{discovery=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const refresh=process.argv.includes('--refresh');
let {index}=await fetchPages(roots);
if(!discovery||refresh){
 const categories={},membership=new Map();
 for(const name of [...professions.map(p=>`${p} skills`),'Common skills','PvP versions of skills','PvE-only skills']){
  const members=await category(`Category:${name}`,name==='PvE-only skills');categories[name]=members;
  for(const title of members){const entry=membership.get(title)||{title,via:[]};entry.via.push(`Category:${name}`);membership.set(title,entry);}
  console.log(`Skill discovery ${name}: ${members.length}`);
 }
 const directories={},pending=roots.filter(t=>t.startsWith('List of '));
 // 目录使用动态分类表。读取固定目录规则，避免依赖实时 HTML 展开。
 for(let position=0;position<pending.length;position++){
  const title=pending[position];if(directories[title])continue;
  if(!index.pages[index.aliases[title]||title])index=(await fetchPages([title])).index;
  const source=await loadPage(title,index);if(!source)throw Error(`Missing skill directory: ${title}`);
  const titles=new Set(links(source.wikitext).filter(link=>!link.title.includes(':')).map(link=>link.title));
  for(const item of templates(source.wikitext)){
   if(/^:List of /i.test(item.name)){const sub=item.name.slice(1);if(!pending.includes(sub))pending.push(sub);}
   if(!/^skill table$/i.test(item.name))continue;
   for(const [key,value]of Object.entries(item.fields)){
    if(/^category\d*$/.test(key))for(const name of value.replace(/\{\{(?:pipe|!)\}\}/gi,'¦').split(/[¦|]/).map(v=>v.trim())){
     if(!categories[name])categories[name]=await category(`Category:${name}`);
     categories[name].forEach(candidate=>titles.add(candidate));
    }
    if(key==='titlematch')for(const candidate of value.replace(/\{\{(?:pipe|!)\}\}/gi,'¦').split(/[¦|]/).map(v=>v.trim()))if(!/[%*{}]/.test(candidate))titles.add(candidate);
   }
  }
  directories[title]=[...titles];
  for(const candidate of titles){const entry=membership.get(candidate)||{title:candidate,via:[]};entry.via.push(title);membership.set(candidate,entry);}
 }
 discovery={version:1,retrievedAt:new Date().toISOString(),roots,categories,directories,candidates:[...membership.values()].sort((a,b)=>a.title.localeCompare(b.title)),classification:{},missing:[]};
 await fs.writeFile(file,JSON.stringify(discovery,null,2)+'\n');
}
const fetched=await fetchPages(discovery.candidates.map(c=>c.title));index=fetched.index;discovery.missing=fetched.missing;
const titles=[...new Set(discovery.candidates.map(c=>index.aliases[c.title]||c.title))];
for(let offset=0;offset<titles.length;offset+=30){
 const batch=titles.slice(offset,offset+30).filter(title=>refresh||!discovery.classification[title]);if(!batch.length)continue;
 let continuation;
 do{
  const result=await api({action:'query',titles:batch.join('|'),redirects:1,prop:'categories',cllimit:500,...continuation});
  for(const page of result.query.pages)discovery.classification[page.title]=[...new Set([...(discovery.classification[page.title]||[]),...(page.categories||[]).map(c=>c.title)])];
  continuation=result.continue;
 }while(continuation);
 await fs.writeFile(file,JSON.stringify(discovery,null,2)+'\n');
 console.log(`Skill classification ${Math.min(offset+30,titles.length)}/${titles.length}`);
}
const progression=new Set();
for(const title of titles){const page=await loadPage(title,index);if(!page||!skillEligibility(page,discovery.classification[page.title]).included)continue;for(const item of templates(page.wikitext))if(/^skill progression/i.test(item.name))progression.add(`Template:${item.name}`);}
const dependency=await fetchPages([...progression]);
if(dependency.missing.length)throw Error(`Missing growth templates: ${dependency.missing.join(', ')}`);
discovery.progressionTemplates=[...progression];
await fs.writeFile(file,JSON.stringify(discovery,null,2)+'\n');
console.log(`Skill discovery complete: ${discovery.candidates.length} candidates, ${progression.size} progression templates`);
