/**
 * [INPUT]: 依赖本地公共资源、资源配置与独立签名密钥。
 * [OUTPUT]: 生成三类 ZIP、文件哈希和验签后的资源清单。
 * [POS]: 桌面资源构建边界；不发布产物或更换公钥。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createZip, sha256, verifyEnvelope} from './archive.mjs';
const exec = promisify(execFile);
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export async function signPayload(payload, destination, config) {
  const file = destination + '.payload';
  await fs.writeFile(file, JSON.stringify(payload));
  const key = process.env.MAPPINGOUT_RESOURCE_PRIVATE_KEY;
  const args = [path.join(root,'node_modules/@tauri-apps/cli/tauri.js'),'signer','sign',file];
  if (!key) args.push('--private-key-path',path.join(os.homedir(),'.mappingout/keys/resources.key'));
  const env={...process.env,TAURI_SIGNING_PRIVATE_KEY_PASSWORD:process.env.MAPPINGOUT_RESOURCE_KEY_PASSWORD || ''};
  delete env.TAURI_SIGNING_PRIVATE_KEY; delete env.TAURI_SIGNING_PRIVATE_KEY_PATH;
  if(key)env.TAURI_SIGNING_PRIVATE_KEY=key;
  try {
    await exec(process.execPath,args,{env,windowsHide:true});
    const envelope = {payload:(await fs.readFile(file)).toString('base64'),signature:(await fs.readFile(file+'.sig','utf8')).trim()};
    verifyEnvelope(envelope, config.publicKey);
    await fs.writeFile(destination,JSON.stringify(envelope)+'\n');
    return envelope;
  } finally {await fs.rm(file,{force:true});await fs.rm(file+'.sig',{force:true});}
}
export async function buildResources(directory = root) {
  const config=JSON.parse(await fs.readFile(path.join(directory,'src-tauri/resources.config.json'),'utf8'));
  const output=path.join(directory,'releases/resources'); await fs.mkdir(output,{recursive:true});
  const packs=[];
  for (const [kind,folders] of Object.entries({media:['assets'],data:['data','licenses'],fonts:['fonts']})) {
    const files=[];
    async function walk(folder) {
      for(const entry of (await fs.readdir(path.join(directory,'public',folder),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
        const file=folder+'/'+entry.name;
        if(entry.isSymbolicLink())throw Error('Resource symlinks are forbidden');
        if(entry.isDirectory())await walk(file);else files.push([file,await fs.readFile(path.join(directory,'public',file))]);
      }
    }
    for(const folder of folders)await walk(folder);
    files.sort(([a],[b])=>a<b?-1:a>b?1:0);
    const archive=createZip(files),digest=sha256(archive),name=`${kind}-${digest}.zip`;
    await fs.writeFile(path.join(output,name),archive);
    packs.push({kind,sha256:digest,bytes:archive.length,url:`https://github.com/${config.repository}/releases/download/resources-pack-${digest}/${name}`,files:files.map(([path,bytes])=>({path,bytes:bytes.length,sha256:sha256(bytes)}))});
  }
  const content={schema:1,clientRange:config.clientRange,packs};
  const manifest={...content,generation:sha256(JSON.stringify(content))};
  await signPayload(manifest,path.join(output,'resources.json'),config);
  console.log(JSON.stringify({generation:manifest.generation,packs:packs.map(({kind,bytes,sha256})=>({kind,bytes,sha256}))},null,2));
  return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildResources();
