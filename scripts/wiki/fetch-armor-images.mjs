import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { api, binary, readIndex, loadPage, web, evidenceDir } from './client.mjs';
import { templates } from './wikitext.mjs';

const data=JSON.parse(await fs.readFile(path.join(web,'public/data/armor.json'),'utf8')),index=await readIndex();
let manifest={};try{manifest=JSON.parse(await fs.readFile(path.join(evidenceDir,'armor-images.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const wanted=[];
for(const set of data.sets){
  const source=await loadPage(set.reference.title,index),box=templates(source.wikitext,'armor art infobox')[0].fields;
  for(const [sex,suffix] of [['male','m'],['female','f']]) {
    const field=box[sex+'image'], filename=field?/\[\[(?:File|Image):([^\]|]+)/i.exec(field)?.[1]:`${source.title} ${suffix}.jpg`;
    if(filename&&!manifest[set.id]?.sources?.[sex])wanted.push({setId:set.id,sex,filename:'File:'+filename});
  }
}
await fs.mkdir(path.join(web,'public/assets/armor'),{recursive:true});
for(let offset=0;offset<wanted.length;offset+=20){
  const batch=wanted.slice(offset,offset+20),result=await api({action:'query',titles:batch.map(w=>w.filename).join('|'),redirects:1,prop:'imageinfo',iiprop:'url|sha1|timestamp',iiurlwidth:320});
  const aliases=new Map([...(result.query.normalized||[]),...(result.query.redirects||[])].map(a=>[a.from,a.to]));
  const pages=new Map(result.query.pages.map(p=>[p.title,p]));
  const jobs=batch.map(w=>async()=>{
    let title=w.filename;for(let i=0;i<5&&aliases.has(title);i++)title=aliases.get(title);
    const info=pages.get(title)?.imageinfo?.[0];
    manifest[w.setId]||={images:{},sources:{}};
    if(!info){manifest[w.setId].sources[w.sex]={title,missing:true};return;}
    const asset=`assets/armor/${w.setId.split(':').pop()}-${w.sex}.webp`;
    let error;
    for(let attempt=0;attempt<3;attempt++)try{
      const buffer=await binary(info.thumburl||info.url);
      await sharp(buffer).resize({width:400,height:650,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toFile(path.join(web,'public',asset));
      manifest[w.setId].images[w.sex]=asset;
      manifest[w.setId].sources[w.sex]={title,url:info.descriptionurl,originalSha1:info.sha1,timestamp:info.timestamp};return;
    }catch(e){error=e;}
    throw error;
  });
  for(let i=0;i<jobs.length;i+=4){const results=await Promise.allSettled(jobs.slice(i,i+4).map(job=>job()));for(const r of results)if(r.status==='rejected')throw r.reason;}
  await fs.writeFile(path.join(evidenceDir,'armor-images.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(`Armor images ${Math.min(offset+20,wanted.length)}/${wanted.length}`);
}
for(const set of data.sets)set.images=manifest[set.id]?.images||{};
await fs.writeFile(path.join(web,'public/data/armor.json'),JSON.stringify(data)+'\n');
