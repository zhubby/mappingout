/**
 * [INPUT]: 依赖资源归档、签名验证、发布函数和固定签名样本。
 * [OUTPUT]: 验证归档约束、签名拒绝和发布中断恢复。
 * [POS]: 资源分发回归；使用本地发布替身保护不可变包。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {test,expect} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createZip,sha256,verifyEnvelope} from '../scripts/resources/archive.mjs';
import {combineChannel,publishResources} from '../scripts/resources/publish.mjs';
import fixture from './fixtures/resources.json';

test('archives are deterministic, portable and reject traversal or duplicate names',()=>{
 const a=['assets/a.txt',Buffer.from('a')] as const,b=['assets/b.txt',Buffer.from('b')] as const;
 expect(createZip([b,a])).toEqual(createZip([a,b]));
 for(const name of ['../escape','/absolute','C:/file','a\\b','a//b'])expect(()=>createZip([[name,Buffer.from('x')]])).toThrow();
 expect(()=>createZip([a,['ASSETS/A.TXT',Buffer.from('bad')]])).toThrow();
});
test('signed envelope rejects changed data, key, signature and trusted comment',()=>{
 const envelope=fixture.manifests[0];
 expect(verifyEnvelope(envelope,fixture.config.publicKey).packs).toHaveLength(3);
 expect(()=>verifyEnvelope({...envelope,payload:Buffer.from('{}').toString('base64')},fixture.config.publicKey)).toThrow();
 const lines=Buffer.from(envelope.signature,'base64').toString().split('\n');lines[2]+='changed';
 expect(()=>verifyEnvelope({...envelope,signature:Buffer.from(lines.join('\n')).toString('base64')},fixture.config.publicKey)).toThrow();
});
test('channel keeps old compatibility ranges without duplicate generations',()=>{
 const manifests=fixture.manifests.map(e=>verifyEnvelope(e,fixture.config.publicKey));
 const channel=combineChannel([manifests[0],manifests[1]],manifests[1]);expect(channel.releases.map(m=>m.generation)).toEqual([manifests[1].generation,manifests[0].generation]);
 expect(combineChannel(Array.from({length:110},(_,i)=>({generation:String(i)})),manifests[2]).releases).toHaveLength(100);
});
test('publisher reuses immutable packs, recovers drafts and changes only the signed channel',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mappingout-publish-'));const output=path.join(dir,'releases/resources');
 const releases=new Map<string,{isDraft:boolean;assets:Map<string,Buffer>}>();const uploads:string[]=[];
 let interrupt=true;
 const runGh=async(...args:string[])=>{
  const [command,action,tag]=args;expect(command).toBe('release');
  if(action==='view'){
   const release=releases.get(tag);if(!release)throw Object.assign(Error('missing'),{stderr:'release not found'});
   return JSON.stringify({isDraft:release.isDraft,assets:[...release.assets].map(([name,bytes])=>({name,size:bytes.length,digest:'sha256:'+sha256(bytes)}))});
  }
  if(action==='create'){expect(args).toContain('--latest=false');releases.set(tag,{isDraft:args.includes('--draft'),assets:new Map()});return '';}
  const release=releases.get(tag)!;
  if(action==='edit'){expect(args).toContain('--latest=false');release.isDraft=false;return '';}
  if(action==='download'){const name=args[args.indexOf('--pattern')+1],folder=args[args.indexOf('--dir')+1];await fs.writeFile(path.join(folder,name),release.assets.get(name)!);return '';}
  if(action==='upload'){
   const name=path.basename(args[3]);if(release.assets.has(name)&&!args.includes('--clobber'))throw Error('duplicate upload');
   if(tag.startsWith('resources-pack-'))expect(args).not.toContain('--clobber');
   release.assets.set(name,await fs.readFile(args[3]));uploads.push(name);
   if(interrupt&&tag.startsWith('resources-set-')){interrupt=false;throw Error('simulated interruption after manifest upload');}return '';
  }throw Error('unexpected action '+action);
 };
 const sign=async(payload:unknown,destination:string)=>{
  // The publisher is tested separately from the real signing implementation.
  await fs.writeFile(destination,JSON.stringify(payload));
 };
 const validate=()=>({errors:[]});
 try{
  await fs.mkdir(path.join(dir,'desktop'),{recursive:true});await fs.mkdir(output,{recursive:true});
  await fs.writeFile(path.join(dir,'desktop/resources.config.json'),JSON.stringify(fixture.config));
  await fs.writeFile(path.join(output,'resources.json'),JSON.stringify(fixture.manifests[0]));
  for(const [name,bytes] of Object.entries(fixture.archives))await fs.writeFile(path.join(output,name),Buffer.from(bytes,'base64'));
  await expect(publishResources({directory:dir,runGh,sign,validate:()=>({errors:['review required']})})).rejects.toThrow('Resource release blocked');
  expect(releases.size).toBe(0);
  await expect(publishResources({directory:dir,runGh,sign,validate})).rejects.toThrow('simulated interruption');
  await publishResources({directory:dir,runGh,sign,validate});
  expect(uploads.filter(n=>n.endsWith('.zip'))).toHaveLength(3);
  expect([...releases.values()].every(r=>!r.isDraft)).toBe(true);
  // A later invocation verifies a real signed channel and uploads no ZIPs.
  releases.get('resources-channel-v1')!.assets.set('channel.json',Buffer.from(JSON.stringify(fixture.channel)));
  await publishResources({directory:dir,runGh,sign,validate});
  expect(uploads.filter(n=>n.endsWith('.zip'))).toHaveLength(3);
  const pack=[...releases].find(([tag])=>tag.startsWith('resources-pack-'))![1];
  const name=[...pack.assets.keys()][0];pack.assets.set(name,Buffer.from('damaged'));
  await expect(publishResources({directory:dir,runGh,sign,validate})).rejects.toThrow('differs');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
