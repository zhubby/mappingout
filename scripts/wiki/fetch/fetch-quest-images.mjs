/**
 * [INPUT]: 依赖攻略路线图清单、Wiki 文件元数据与原始图像。
 * [OUTPUT]: 保存本地 WebP 路线图、版权声明和图像哈希。
 * [POS]: 任务媒体采集入口；支持校验后续传和逐项失败报告。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {api,binary,evidenceDir,web} from '../lib/client.mjs';
const hash=(value,kind='sha256')=>createHash(kind).update(value).digest('hex');
const report=JSON.parse(await fs.readFile(path.join(evidenceDir,'quest-coverage.json'),'utf8'));
const filename=path.join(evidenceDir,'quest-images.json');
let manifest={version:1,images:[],errors:[]};try{manifest=JSON.parse(await fs.readFile(filename,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const known=new Map(manifest.images.map(image=>[image.title,image]));
const wanted=[];
for(const title of report.imageTitles){const image=known.get(title);if(image){try{if(hash(await fs.readFile(path.join(web,'public',image.file)))===image.sha256)continue;}catch{}}wanted.push(title);}
const metadata=new Map();
for(let offset=0;offset<wanted.length;offset+=25){
 const result=await api({action:'query',titles:wanted.slice(offset,offset+25).join('|'),prop:'imageinfo|revisions',iiprop:'url|sha1|timestamp|size',rvprop:'ids|timestamp|content',rvslots:'main'});
 for(const page of result.query.pages)metadata.set(page.title,page);
 for(const alias of result.query.normalized||[])metadata.set(alias.from,metadata.get(alias.to));
 console.log(`Quest image metadata ${Math.min(offset+25,wanted.length)}/${wanted.length}`);
}
await fs.mkdir(path.join(web,'public/assets/quests'),{recursive:true});
const errors=[];let completed=0;
async function save(){await fs.writeFile(filename,JSON.stringify({version:1,images:[...known.values()].sort((a,b)=>a.title.localeCompare(b.title)),errors},null,2)+'\n');}
// API 元数据串行限速；静态媒体下载仅保持三个并发。
let position=0;
async function worker(){while(position<wanted.length){const title=wanted[position++];try{
 const page=metadata.get(title),info=page?.imageinfo?.[0],revision=page?.revisions?.[0];
 if(!info||!revision)throw Error('Source image or file revision is missing');
 let bytes;
 for(let attempt=0;attempt<3;attempt++){try{bytes=await binary(info.url);break;}catch(error){if(attempt===2)throw error;}}
 if(hash(bytes,'sha1')!==info.sha1)throw Error('Source image changed while downloading');
 const output=await sharp(bytes,{limitInputPixels:100000000}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:88}).toBuffer();
 const file=`assets/quests/${page.pageid}-${hash(info.sha1).slice(0,12)}.webp`;
 await fs.writeFile(path.join(web,'public',file),output);
 const reference={title:page.title,pageid:page.pageid,revid:revision.revid,url:info.descriptionurl,revisionUrl:`https://wiki.guildwars.com/index.php?title=${encodeURIComponent(page.title)}&oldid=${revision.revid}`,revisedAt:revision.timestamp,retrievedAt:new Date().toISOString()};
 known.set(title,{id:`image:${page.pageid}`,title,file,reference,originalUrl:info.url,originalSha1:info.sha1,uploadedAt:info.timestamp,licenseDeclaration:revision.slots.main.content,modification:'Scaled to fit 1600 by 1600 pixels and encoded as WebP, quality 88.',sha256:hash(output),bytes:output.length});
}catch(error){errors.push({title,error:String(error)});}completed++;if(completed%25===0)console.log(`Quest images ${completed}/${wanted.length}; failures ${errors.length}`);}}
await Promise.all([worker(),worker(),worker()]);await save();
console.log(`Quest images saved: ${known.size}; errors ${errors.length}`);process.exit(errors.length?1:0);
