/**
 * [INPUT]: 依赖未展开攻略模板、页面语境和模板修订。
 * [OUTPUT]: 保存模板展开文本与修订依据；编译不依赖实时模板。
 * [POS]: 复杂奖励表格的采集适配；不替换原始页面快照。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { projectPath } from '../../lib/paths.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {api,evidenceDir,readIndex,loadPage,fetchPages} from '../lib/client.mjs';
import {templates} from '../lib/wikitext.mjs';
import {reference} from '../lib/content-facts.mjs';
const names=new Set(['template:mission rewards','factions challenge mission reward','nightfall challenge mission reward','cost','research needed']);
const catalog=JSON.parse(await fs.readFile(projectPath('public/data/quests.json'),'utf8'));
let index=await readIndex();const inputs=[];
for(const row of catalog.quests){const page=await loadPage(row.englishName,index);for(const template of templates(page.wikitext))if(names.has(template.name.toLowerCase()))inputs.push({page,template});}
const titles=[...new Set(inputs.map(input=>'Template:'+input.template.name.replace(/^Template:/i,'')))];
index=(await fetchPages(titles)).index;
const file=path.join(evidenceDir,'quest-template-expansions.json');
let cache={version:1,pages:{}};try{cache=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
let done=0;
for(const{page,template}of inputs){
 const source=await loadPage('Template:'+template.name.replace(/^Template:/i,''),index);
 const existing=cache.pages[page.pageid]?.find(item=>item.raw===template.raw&&item.sourceRevid===page.revid&&item.reference.revid===source.revid);
 if(existing)continue;
 const result=await api({action:'expandtemplates',text:template.raw,title:page.title,prop:'wikitext'});
 const expanded=result.expandtemplates.wikitext;
 if(!expanded||expanded.includes('class="error"'))throw Error(`Template expansion failed: ${page.title}/${template.name}`);
 cache.pages[page.pageid]||=[];
 cache.pages[page.pageid]=cache.pages[page.pageid].filter(item=>item.raw!==template.raw);
 cache.pages[page.pageid].push({raw:template.raw,expanded,sourceRevid:page.revid,reference:reference(source),retrievedAt:new Date().toISOString()});
 done++;if(done%10===0){await fs.writeFile(file,JSON.stringify(cache)+'\n');console.log(`Quest template expansions ${done}/${inputs.length}`);}
}
await fs.writeFile(file,JSON.stringify(cache)+'\n');console.log(`Quest template expansions saved: ${done}`);process.exit(0);
