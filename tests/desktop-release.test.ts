import { test, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
test('merges only complete offline platform releases and rejects missing signatures',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mappingout-release-'));
 try{
  const input=path.join(dir,'input'),output=path.join(dir,'out');await fs.mkdir(input);
  const names=['MappingOut_1.1.0_x64-offline-setup.exe','MappingOut_1.1.0_x86-offline-setup.exe','MappingOut.app.tar.gz'];
  for(const name of names){await fs.writeFile(path.join(input,name),'fixture-'+name);await fs.writeFile(path.join(input,name+'.sig'),'signature-'+name)}
  await fs.writeFile(path.join(input,'MappingOut_1.1.0_aarch64.dmg'),'disk-image');
  const args=['scripts/desktop-merge-release.mjs','--input',input,'--output',output,'--base-url','https://example.com/releases/v1.1.0/'];
  await exec(process.execPath,args);
  const manifest=JSON.parse(await fs.readFile(path.join(output,'latest.json'),'utf8'));
  expect(Object.keys(manifest.platforms).sort()).toEqual(['darwin-aarch64','windows-i686','windows-x86_64']);
  expect(manifest.platforms['windows-i686'].url).toBe('https://example.com/releases/v1.1.0/MappingOut_1.1.0_x86-offline-setup.exe');
  expect((await fs.readFile(path.join(output,'SHA256SUMS.txt'),'utf8')).trim().split('\n')).toHaveLength(4);
  await fs.unlink(path.join(input,names[1]+'.sig'));
  await expect(exec(process.execPath,args)).rejects.toThrow();
  await fs.writeFile(path.join(input,names[1]+'.sig'),'signature');
  await fs.writeFile(path.join(input,'MappingOut_1.1.0_x86-setup.exe'),'online');
  await expect(exec(process.execPath,args)).rejects.toThrow();
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
