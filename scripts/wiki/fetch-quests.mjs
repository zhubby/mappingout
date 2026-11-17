/**
 * [INPUT]: 依赖 Wiki 客户端、区域任务表和递归分类。
 * [OUTPUT]: 保存任务发现清单和固定修订原始快照。
 * [POS]: 任务数据采集入口；编译过程不读取实时网络。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { api, category, evidenceDir, fetchPages, readIndex, loadPage } from './client.mjs';
import { links } from './wikitext.mjs';
import { supportTitles } from './quest-support.mjs';

export const chapters = [
  { id:'prophecies', campaign:1, name:'Prophecies', list:'List of Prophecies missions and primary quests', quests:'List of Prophecies quests', category:'Prophecies quests' },
  { id:'factions', campaign:2, name:'Factions', list:'List of Factions missions and primary quests', quests:'List of Factions quests', category:'Factions quests' },
  { id:'nightfall', campaign:3, name:'Nightfall', list:'List of Nightfall missions and primary quests', quests:'List of Nightfall quests', category:'Nightfall quests' },
  { id:'eotn', campaign:4, name:'Eye of the North', list:'List of Eye of the North missions and primary quests', quests:'List of Eye of the North quests', category:'Eye of the North quests' },
  { id:'kryta', campaign:1, name:'War in Kryta', list:'War in Kryta/Walkthrough', quests:'The War in Kryta', category:'War in Kryta quests' },
  { id:'winds', campaign:2, name:'Winds of Change', list:'Winds of Change/Walkthrough', quests:'Winds of Change', category:'Winds of Change quests' },
  { id:'core', campaign:0, name:'Shared PvE', list:'List of Core quests', quests:'Elite Mission', category:'Core quests' },
];

async function main(){
  const roots = [...new Set(chapters.flatMap(c=>[c.list,c.quests]).concat(['Hearts of the North','War in Kryta dialogues','Hearts of the North dialogues','Dungeon','Challenge Mission','Elite Mission','The Fissure of Woe','The Underworld','Domain of Anguish','Template:Mission infobox'],supportTitles))];
  let { index, missing } = await fetchPages(roots);
  if(missing.length)throw Error(`Missing quest roots: ${missing.join(', ')}`);
  const membership = new Map(), categories = {};
  const add=(title,chapter,via)=>{
    const current=membership.get(title)||{title,chapters:[],via:[]};
    if(!current.chapters.includes(chapter))current.chapters.push(chapter);
    if(!current.via.includes(via))current.via.push(via);
    membership.set(title,current);
  };
  for(const chapter of chapters){
    const titles=await category(`Category:${chapter.category}`,true);
    categories[chapter.category]=titles;
    titles.forEach(title=>add(title,chapter.id,`Category:${chapter.category}`));
    const page=await loadPage(chapter.list,index);
    // 目录的全部链接仅形成候选；编译器按信息框区分任务和说明页。
    links(page.wikitext).filter(link=>!link.title.includes(':')).forEach(link=>add(link.title,chapter.id,chapter.list));
    console.log(`Quest discovery ${chapter.id}: ${titles.length} category members`);
  }
  for(const [name,chapter]of [['Hearts of the North quests','kryta'],['Dungeons','eotn'],['Elite missions','core'],['Challenge missions','core']]){
    const titles=await category(`Category:${name}`,true);categories[name]=titles;
    titles.forEach(title=>add(title,chapter,`Category:${name}`));
  }
  // 目录由动态表格展开；直接枚举表格引用的区域分类，避免遗漏没有篇章分类的页面。
  for(const chapter of chapters){
    const page=await loadPage(chapter.quests,index);
    for(const match of page.wikitext.matchAll(/^\s*\|\s*category\d*\s*=\s*([^\n}]+)/gm)){
      const name=match[1].trim();if(categories[name])continue;
      const titles=await category(`Category:${name}`,false);categories[name]=titles;
      titles.forEach(title=>add(title,chapter.id,`Category:${name}`));
    }
  }
  const candidates=[...membership.values()].sort((a,b)=>a.title.localeCompare(b.title));
  const result=await fetchPages(candidates.map(c=>c.title));index=result.index;missing=result.missing;
  // 排除节庆、历史和 PvP 必须依据页面分类，而不是标题猜测。
  const classification={};
  const allTitles=[...new Set(candidates.map(c=>index.aliases[c.title]||c.title))];
  for(let offset=0;offset<allTitles.length;offset+=40){
    let continuation;
    do{
      const response=await api({action:'query',titles:allTitles.slice(offset,offset+40).join('|'),redirects:1,prop:'categories',cllimit:500,...continuation});
      for(const page of response.query.pages)classification[page.title]=[...new Set([...(classification[page.title]||[]),...(page.categories||[]).map(c=>c.title)])];
      continuation=response.continue;
    }while(continuation);
  }
  const discovery={version:1,retrievedAt:new Date().toISOString(),chapters,roots,categories,candidates,classification,missing};
  await fs.writeFile(path.join(evidenceDir,'quest-discovery.json'),JSON.stringify(discovery,null,2)+'\n');
  console.log(`Quest discovery saved: ${candidates.length} candidates; ${missing.length} missing pages`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
