/**
 * [INPUT]: 依赖本地资源私钥、Tauri signer 与资源公钥配置。
 * [OUTPUT]: 初始化新库的资源密钥或核对已有公钥。
 * [POS]: 资源密钥维护入口；已有配置禁止静默更换密钥。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { projectPath } from '../lib/paths.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const key=path.join(os.homedir(),'.mappingout/keys/resources.key');
const configPath=projectPath('desktop/resources.config.json');
const existing=await fs.readFile(configPath,'utf8').then(JSON.parse).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
await fs.mkdir(path.dirname(key),{recursive:true});
try {await fs.access(key);} catch {
  if(existing)throw Error('Restore the existing resource signing key; generating a new key would invalidate installed clients.');
  // Capture signer output so private material can never appear in task logs.
  await promisify(execFile)(process.execPath,[projectPath('node_modules/@tauri-apps/cli/tauri.js'),'signer','generate','--ci','--write-keys',key],{env:{...process.env,TAURI_SIGNING_PRIVATE_KEY_PASSWORD:''},windowsHide:true});
}
const publicKey=(await fs.readFile(key+'.pub','utf8')).trim();
if(existing&&existing.publicKey!==publicKey)throw Error('Local resource key does not match the configured public key.');
const config={schema:1,repository:'zhubby/mappingout',channelUrl:'https://github.com/zhubby/mappingout/releases/download/resources-channel-v1/channel.json',clientRange:'>=1.2.0, <2.0.0',publicKey};
// Tauri public key files already use its base64 envelope format.
if(!existing)await fs.writeFile(configPath,JSON.stringify(config,null,2)+'\n');
console.log('Resource signing key is available; only its public key was saved to the repository.');
