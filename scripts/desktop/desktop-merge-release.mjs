/**
 * [INPUT]: 依赖三平台安装产物、更新签名与发布说明。
 * [OUTPUT]: 校验当前版本三平台产物后生成更新清单与 SHA256。
 * [POS]: 发布聚合入口；完整性校验失败时不写入输出目录。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { projectPath } from '../lib/paths.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2);
const option=name=>args[args.indexOf(name)+1];
const input=path.resolve(option('--input'));
const out=path.resolve(option('--output'));
const base=new URL(option('--base-url'));
if(base.protocol!=='https:')throw Error('HTTPS release URL required');
if(!base.pathname.endsWith('/'))base.pathname+='/';
const config=JSON.parse(await fs.readFile(projectPath('desktop/tauri.conf.json'),'utf8'));
const notes=await fs.readFile(projectPath('docs/releases/desktop-release-notes.md'),'utf8');
const files=[];
async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else files.push(p)}}
await walk(input);
const names=new Map();
for(const file of files){
 const name=path.basename(file);
 if(/-offline-setup\.exe(?:\.sig)?$/.test(name))throw Error(`Legacy bundled installer is not supported by the resource release pipeline: ${name}`);
 if(names.has(name))throw Error(`Duplicate release asset ${name}`);
 names.set(name,file);
}
const updaters={
 'windows-x86_64':`${config.productName}_${config.version}_x64-setup.exe`,
 'windows-i686':`${config.productName}_${config.version}_x86-setup.exe`,
 'darwin-aarch64':`${config.productName}.app.tar.gz`,
};
for(const name of [...Object.values(updaters),`${config.productName}_${config.version}_aarch64.dmg`]){
 if(!names.has(name))throw Error(`Expected release asset ${name}`);
}
const platforms={};
for(const [platform,name] of Object.entries(updaters)){
 if(!names.has(name+'.sig'))throw Error(`Missing input signature ${name}`);
 const signature=(await fs.readFile(names.get(name+'.sig'),'utf8')).trim();if(!signature)throw Error(`Missing signature ${name}`);
 platforms[platform]={signature,url:new URL(encodeURIComponent(name),base).href};
}
const expected=new Set([...Object.values(updaters).flatMap(name=>[name,name+'.sig']),`${config.productName}_${config.version}_aarch64.dmg`]);
for(const name of names.keys())if(!expected.has(name))throw Error(`Unexpected release asset ${name}`);
await fs.mkdir(out,{recursive:true});
const hashes=[];
for(const [name,file] of names){const bytes=await fs.readFile(file);await fs.writeFile(path.join(out,name),bytes);if(!name.endsWith('.sig'))hashes.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`)}
await fs.writeFile(path.join(out,'latest.json'),JSON.stringify({version:config.version,notes,pub_date:new Date().toISOString(),platforms},null,2)+'\n');
await fs.writeFile(path.join(out,'SHA256SUMS.txt'),hashes.sort().join('\n')+'\n');
console.log(`Prepared ${names.size} assets and three updater platforms`);
