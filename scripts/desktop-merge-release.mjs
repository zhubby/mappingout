import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2);
const option=name=>args[args.indexOf(name)+1];
const input=path.resolve(option('--input'));
const out=path.resolve(option('--output'));
const base=new URL(option('--base-url'));
if(base.protocol!=='https:')throw Error('HTTPS release URL required');
const config=JSON.parse(await fs.readFile('src-tauri/tauri.conf.json','utf8'));
const notes=await fs.readFile('docs/desktop-release-notes.md','utf8');
const files=[];
async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else files.push(p)}}
await walk(input);await fs.mkdir(out,{recursive:true});
const hashes=[];const names=new Set();
for(const file of files){const name=path.basename(file);if(names.has(name))throw Error(`Duplicate release asset ${name}`);names.add(name);const bytes=await fs.readFile(file);await fs.writeFile(path.join(out,name),bytes);if(!name.endsWith('.sig'))hashes.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`)}
const platforms={};
for(const [platform,match] of Object.entries({'windows-x86_64':/_x64-offline-setup\.exe$/,'windows-i686':/_x86-offline-setup\.exe$/,'darwin-aarch64':/\.app\.tar\.gz$/})){
 const matches=[...names].filter(n=>match.test(n));if(matches.length!==1)throw Error(`Expected one updater for ${platform}: ${matches}`);
 const name=matches[0];const signature=(await fs.readFile(path.join(out,name+'.sig'),'utf8')).trim();if(!signature)throw Error(`Missing signature ${name}`);
 platforms[platform]={signature,url:new URL(encodeURIComponent(name),base).href};
}
await fs.writeFile(path.join(out,'latest.json'),JSON.stringify({version:config.version,notes,pub_date:new Date().toISOString(),platforms},null,2)+'\n');
await fs.writeFile(path.join(out,'SHA256SUMS.txt'),hashes.sort().join('\n')+'\n');
console.log(`Prepared ${names.size} assets and three updater platforms`);
