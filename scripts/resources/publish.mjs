/**
 * [INPUT]: 依赖受信资源清单、归档与 GitHub Release 接口。
 * [OUTPUT]: 发布不可变资源包和签名兼容频道。
 * [POS]: 资源发布入口；所有不可变产物存在后才替换频道。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {root, signPayload} from './build.mjs';
import {sha256,verifyEnvelope} from './archive.mjs';
import {checkRelease} from '../validate/check-release.mjs';
const exec=promisify(execFile);
export function combineChannel(existing,manifest){
  const channel={schema:1,releases:[manifest,...existing.filter(m=>m.generation!==manifest.generation)].slice(0,100)};
  while(Buffer.byteLength(JSON.stringify(channel))>16_000_000&&channel.releases.length>1)channel.releases.pop();
  if(Buffer.byteLength(JSON.stringify(channel))>16_000_000)throw Error('Resource manifest exceeds client channel limit');
  return channel;
}
export async function publishResources({directory=root,runGh,sign=signPayload,validate=checkRelease}={}){
  const readiness=validate(directory);
  if(readiness.errors.length)throw Error('Resource release blocked:\n'+readiness.errors.join('\n'));
  const config=JSON.parse(await fs.readFile(path.join(directory,'desktop/resources.config.json'),'utf8'));
  const output=path.join(directory,'releases/resources');
  const envelope=JSON.parse(await fs.readFile(path.join(output,'resources.json'),'utf8'));
  const manifest=verifyEnvelope(envelope,config.publicKey);
  const gh=runGh|| (async(...args)=>(await exec(process.env.MAPPINGOUT_GH || 'gh',[...args,'--repo',config.repository],{windowsHide:true,maxBuffer:10_000_000})).stdout);
  async function release(tag){try{return JSON.parse(await gh('release','view',tag,'--json','assets,isDraft'));}catch(error){if(/release not found|404/i.test(error.stderr||''))return null;throw error;}}
  for(const p of manifest.packs){
    const tag='resources-pack-'+p.sha256,name=`${p.kind}-${p.sha256}.zip`,file=path.join(output,name);
    const bytes=await fs.readFile(file);if(sha256(bytes)!==p.sha256||bytes.length!==p.bytes)throw Error('Local resource archive changed');
    let published=await release(tag);
    if(!published){await gh('release','create',tag,'--draft','--latest=false','--title',`MappingOut ${p.kind} ${p.sha256.slice(0,12)}`,'--notes','Immutable shared resource package.');published={assets:[],isDraft:true};}
    const asset=published.assets.find(a=>a.name===name);
    if(asset){if(asset.size!==p.bytes||asset.digest!=='sha256:'+p.sha256)throw Error('Published content-addressed asset differs');}
    else {if(!published.isDraft)throw Error('Incomplete published resource release');await gh('release','upload',tag,file);}
    if(published.isDraft)await gh('release','edit',tag,'--draft=false','--latest=false');
  }
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'mappingout-channel-'));
  try{
    const notes=path.join(temporary,'notes.md');
    await fs.writeFile(notes,`MappingOut shared offline resources\n\nCompatible clients: \`${manifest.clientRange}\`\n\nDownload resources.json below and these packages into the same folder, then choose Import offline resources in the client.\n\n${manifest.packs.map(p=>`- [${p.kind} (${(p.bytes/1048576).toFixed(2)} MiB)](${p.url})`).join('\n')}\n\nPackage URLs are immutable and shared across client architectures.\n`);
    const setTag='resources-set-'+manifest.generation;
    let resourceSet=await release(setTag);
    if(!resourceSet){await gh('release','create',setTag,'--draft','--latest=false','--title',`MappingOut resources ${manifest.generation.slice(0,12)}`,'--notes-file',notes);resourceSet={assets:[],isDraft:true};}
    if(resourceSet.assets.some(a=>a.name==='resources.json')){
      await gh('release','download',setTag,'--pattern','resources.json','--dir',temporary);
      const existing=verifyEnvelope(JSON.parse(await fs.readFile(path.join(temporary,'resources.json'),'utf8')),config.publicKey);
      if(JSON.stringify(existing)!==JSON.stringify(manifest))throw Error('Published immutable resource manifest differs');
    }else{
      if(!resourceSet.isDraft)throw Error('Incomplete published resource set');
      await gh('release','upload',setTag,path.join(output,'resources.json'));
    }
    if(resourceSet.isDraft)await gh('release','edit',setTag,'--draft=false','--latest=false');
    const channelTag='resources-channel-v1',published=await release(channelTag);let previous=[];
    if(published?.assets.some(a=>a.name==='channel.json')){
      await gh('release','download',channelTag,'--pattern','channel.json','--dir',temporary);
      const existing=verifyEnvelope(JSON.parse(await fs.readFile(path.join(temporary,'channel.json'),'utf8')),config.publicKey);
      if(existing.schema!==1||!Array.isArray(existing.releases))throw Error('Invalid existing resource channel');previous=existing.releases;
    }
    if(!published)await gh('release','create',channelTag,'--draft','--latest=false','--title','MappingOut resource channel v1','--notes','Signed index of compatible immutable resource sets.');
    const channel=combineChannel(previous,manifest);
    await sign(channel,path.join(output,'channel.json'),config);
    // Replace the single signed envelope last, after every immutable asset exists.
    await gh('release','upload',channelTag,path.join(output,'channel.json'),'--clobber');
    if(!published||published.isDraft)await gh('release','edit',channelTag,'--draft=false','--latest=false');
  }finally{await fs.rm(temporary,{recursive:true,force:true});}
  console.log(`Published resource set ${manifest.generation}; unchanged archives were reused.`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await publishResources();
