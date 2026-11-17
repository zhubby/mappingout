/**
 * [INPUT]: 依赖固定技能信息框、Wiki 文件元数据和代理客户端。
 * [OUTPUT]: 保存原始技能与资源图标、文件快照和哈希清单。
 * [POS]: 技能媒体采集入口；离线构建只读本地文件。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {api,binary,evidenceDir,web,readIndex,loadPage} from '../lib/client.mjs';
import {templates} from '../lib/wikitext.mjs';
import {reference} from '../lib/content-facts.mjs';
const hash=(bytes,kind='sha256')=>createHash(kind).update(bytes).digest('hex');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const catalog=await read(path.join(web,'public/data/skills.json')),index=await readIndex();
const template=await loadPage('Template:Skill infobox',index);
if(!template.wikitext.includes('[[File:{{{name}}}.jpg'))throw Error('技能图标默认规则已变更');
const filename=path.join(evidenceDir,'skill-library-images.json');
let saved={version:1,images:[],skills:[],icons:[]};try{saved=await read(filename);}catch(error){if(error.code!=='ENOENT')throw error;}
const known=new Map(saved.images.map(image=>[image.title,image])),sources=[];
for(const variant of catalog.skills.flatMap(s=>s.variants)){
 const page=await loadPage(variant.englishName,index),fields=templates(page.wikitext,'Skill infobox')[0].fields;
 const name=fields.image===undefined?`${fields.name||page.title}.jpg`:/\[\[(?:File|Image):([^\]|]+)/i.exec(fields.image)?.[1];
 if(!name)throw Error(`无法解析技能图标：${page.title}`);
 sources.push({pageid:page.pageid,title:`File:${name.replaceAll('_',' ')}`});
}
const resources={energy:'Tango-energy.png',adrenaline:'Tango-adrenaline.png',activation:'Tango-activation-darker.png',recharge:'Tango-recharge-darker.png',upkeep:'Tango-upkeep.png',sacrifice:'Tango-sacrifice.png',overcast:'Tango-overcast.png'};
for(const [key,name]of Object.entries(resources))sources.push({key,title:`File:${name}`});
const wanted=[];
for(const title of new Set(sources.map(s=>s.title))){const image=known.get(title);try{if(image&&hash(await fs.readFile(path.join(web,'public',image.file)))===image.sha256)continue;}catch{}wanted.push(title);}
const metadata=new Map();
const batchSize=wanted.length<5?1:20;
for(let offset=0;offset<wanted.length;offset+=batchSize){
 const result=await api({action:'query',titles:wanted.slice(offset,offset+batchSize).join('|'),prop:'revisions|imageinfo',rvprop:'ids|timestamp|sha1|content',rvslots:'main',iiprop:'url|sha1|timestamp|size'});
 for(const page of result.query.pages)metadata.set(page.title,page);
 for(const alias of result.query.normalized||[])metadata.set(alias.from,metadata.get(alias.to));
 if(offset%100===0)console.log(`技能图标元数据 ${Math.min(offset+20,wanted.length)}/${wanted.length}`);
}
for(const dir of ['skill-library','skill-resources'])await fs.mkdir(path.join(web,'public/assets',dir),{recursive:true});
const errors=[];let position=0,completed=0,writes=Promise.resolve();
function save(){writes=writes.then(async()=>{
 const linked=sources.map(source=>({...source,...known.get(source.title)})).filter(source=>source.file);
 await fs.writeFile(filename,JSON.stringify({version:1,templateReference:reference(template),images:[...known.values()],skills:linked.filter(s=>s.pageid),icons:linked.filter(s=>s.key),errors},null,2)+'\n');
 });return writes;}
async function worker(){while(position<wanted.length){const title=wanted[position++];try{
 const page=metadata.get(title),revision=page?.revisions?.[0];let info=page?.imageinfo?.[0],fallbackFrom;
 if(!info||!revision)throw Error('缺少文件或修订');
 let bytes;
 for(let attempt=0;attempt<3;attempt++)try{bytes=await binary(info.url);break;}catch(error){if(attempt===2)throw error;}
 let expectedSha1=info.sha1.padStart(40,'0');
 if(hash(bytes,'sha1')!==expectedSha1){const url=new URL(info.url);url.searchParams.set('source-sha1',info.sha1);bytes=await binary(url.href);}
 if(hash(bytes,'sha1')!==expectedSha1){
  fallbackFrom={url:info.url,reportedSha1:info.sha1,downloadedSha1:hash(bytes,'sha1'),reason:'Current file bytes disagree with Wiki metadata; use the newest verifiable archived upload.'};
  const history=await api({action:'query',pageids:page.pageid,prop:'imageinfo',iiprop:'url|sha1|timestamp|size',iilimit:10});
  for(const archived of history.query.pages[0].imageinfo.slice(1)){const previous=await binary(archived.url);if(hash(previous,'sha1')===archived.sha1.padStart(40,'0')){info=archived;bytes=previous;expectedSha1=info.sha1.padStart(40,'0');break;}}
 }
 if(hash(bytes,'sha1')!==expectedSha1)throw Error('没有哈希一致的 Wiki 原图');
 const size=await sharp(bytes).metadata();if(size.width!==info.width||size.height!==info.height)throw Error('图像尺寸不符');
 const key=sources.find(s=>s.title===title)?.key,extension=size.format==='jpeg'?'jpg':size.format;
 if(!['png','jpg'].includes(extension))throw Error(`未支持格式 ${extension}`);
 const file=key?`assets/skill-resources/${key}.png`:`assets/skill-library/${page.pageid}.${extension}`;
 const snapshot={title:page.title,pageid:page.pageid,revid:revision.revid,revisedAt:revision.timestamp,sha1:revision.sha1,url:info.descriptionurl,revisionUrl:`https://wiki.guildwars.com/index.php?title=${encodeURIComponent(page.title)}&oldid=${revision.revid}`,retrievedAt:new Date().toISOString(),wikitext:revision.slots.main.content};
 await fs.writeFile(path.join(evidenceDir,`pages/${page.pageid}.json`),JSON.stringify(snapshot,null,2)+'\n');
 await fs.writeFile(path.join(web,'public',file),bytes);
 known.set(title,{title,file,reference:reference(snapshot),originalUrl:info.url,originalSha1:expectedSha1,uploadedAt:info.timestamp,...(fallbackFrom?{fallbackFrom}:{}),licenseDeclaration:snapshot.wikitext,modification:'None; original Wiki file.',width:size.width,height:size.height,bytes:bytes.length,sha256:hash(bytes)});
 }catch(error){errors.push({title,error:String(error)});}completed++;if(completed%50===0){console.log(`技能图标 ${completed}/${wanted.length}；失败 ${errors.length}`);await save();}}}
await Promise.all([worker(),worker(),worker()]);await save();
console.log(`技能媒体已保存 ${known.size}；失败 ${errors.length}`);process.exit(errors.length?1:0);
