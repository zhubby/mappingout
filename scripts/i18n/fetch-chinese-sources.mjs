/**
 * [INPUT]: 依赖公开 Fandom API、可选 WIKI_PROXY 与已有采集断点。
 * [OUTPUT]: 保存中文固定修订正文、授权入口与英文身份术语证据。
 * [POS]: 维护期中文来源采集；应用与离线构建不访问网络。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fetch,ProxyAgent} from 'undici';
import {projectPath} from '../lib/paths.mjs';
import {extractChineseTerms} from './chinese-sources.mjs';
const file=projectPath('data/i18n/chinese-sources.json');
let archive={version:1,site:'https://guildwars.fandom.com/zh-tw',pages:[],completedNamespaces:[],continuation:{}};
try{archive=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const proxy=process.env.WIKI_PROXY||process.env.HTTPS_PROXY||'http://127.0.0.1:7890';
const dispatcher=new ProxyAgent(proxy);
const save=async()=>{await fs.writeFile(file+'.tmp',JSON.stringify(archive)+'\n');await fs.rename(file+'.tmp',file);};
async function api(parameters){
  const url=new URL(archive.site+'/api.php');
  for(const [key,value]of Object.entries({action:'query',format:'json',formatversion:2,...parameters}))url.searchParams.set(key,String(value));
  let failure;
  for(let attempt=0;attempt<4;attempt++){
    try{
      const response=await fetch(url,{dispatcher,headers:{'User-Agent':'Mozilla/5.0 MappingOut-TranslationReview/1.0 (read-only)'},signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw Error(`Chinese Wiki HTTP ${response.status}`);
      const result=await response.json();if(result.error)throw Error(JSON.stringify(result.error));return result;
    }catch(error){failure=error;await new Promise(resolve=>setTimeout(resolve,1500*(attempt+1)));}
  }
  throw failure;
}
try{
  if(!archive.rightsinfo){const info=await api({meta:'siteinfo',siprop:'rightsinfo|statistics'});archive.rightsinfo=info.query.rightsinfo;archive.statistics=info.query.statistics;}
  for(const namespace of [0,10]){
    if(archive.completedNamespaces.includes(namespace))continue;
    let next=archive.continuation[namespace]??{};
    do{
      const result=await api({generator:'allpages',gapnamespace:namespace,gaplimit:50,prop:'revisions',rvprop:'ids|timestamp|content',rvslots:'main',...next});
      for(const page of result.query?.pages??[]){
        const revision=page.revisions?.[0],wikitext=revision?.slots?.main?.content;
        if(typeof wikitext!=='string')continue;
        const source={site:'fandom',title:page.title,pageid:page.pageid,revid:revision.revid,revisedAt:revision.timestamp,
          url:archive.site+'/wiki/'+encodeURIComponent(page.title),revisionUrl:archive.site+'/index.php?oldid='+revision.revid,
          historyUrl:archive.site+'/index.php?title='+encodeURIComponent(page.title)+'&action=history',retrievedAt:new Date().toISOString(),
          sha256:createHash('sha256').update(wikitext).digest('hex'),wikitext};
        const i=archive.pages.findIndex(p=>p.site==='fandom'&&p.pageid===page.pageid);if(i<0)archive.pages.push(source);else archive.pages[i]=source;
      }
      next=result.continue;archive.continuation[namespace]=next;
      if(!next)archive.completedNamespaces.push(namespace);
      await save();console.log(`Fandom namespace ${namespace}: ${archive.pages.length} pinned pages`);
      await new Promise(resolve=>setTimeout(resolve,450));
    }while(next);
  }
  let huiji=[];try{huiji=JSON.parse(await fs.readFile(projectPath('data/i18n/huiji-sources.json'),'utf8')).pages;}catch(error){if(error.code!=='ENOENT')throw error;}
  const terms=extractChineseTerms([...archive.pages,...huiji]);
  await fs.writeFile(projectPath('data/i18n/zh-TW-terms.json'),JSON.stringify(terms)+'\n');
  console.log({pages:archive.pages.length,terms:Object.keys(terms.terms).length,conflicts:Object.keys(terms.conflicts).length});
}finally{await dispatcher.close();}
