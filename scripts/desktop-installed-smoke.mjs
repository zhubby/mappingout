import { chromium, expect } from '@playwright/test';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const exec = promisify(execFile);
const executable = path.join(process.env.LOCALAPPDATA, 'MappingOut/mappingout-desktop.exe');
const version=JSON.parse(await fs.readFile('src-tauri/tauri.conf.json','utf8')).version;
const installer = path.resolve(process.env.MAPPINGOUT_TEST_INSTALLER || `releases/${version}/MappingOut_${version}_x64-offline-setup.exe`);
const checks=[];
let child, browser, page;
async function launch(){
  child=spawn(executable,[],{windowsHide:true,stdio:'ignore',env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9227'}});
  for(let i=0;i<80;i++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9227');break}catch{await new Promise(r=>setTimeout(r,250));}}
  page=browser.contexts()[0].pages()[0];await page.waitForURL('http://tauri.localhost/**');await expect(page.getByRole('button',{name:'客户端设置',exact:true})).toBeVisible();
}
async function close(){
  await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('plugin:window|close',{label:'main'})).catch(e=>{if(!/closed|destroyed/i.test(String(e)))throw e});
  for(let i=0;i<60&&child.exitCode===null;i++)await new Promise(r=>setTimeout(r,100));
  assert.equal(child.exitCode,0);await browser.close().catch(()=>{});browser=undefined;
}
async function dialog(title,filePath,cancel=false){
  const args=['-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/desktop-file-dialog.ps1','-Title',title];
  if(cancel)args.push('-Cancel');else args.push('-FilePath',filePath);
  await exec('powershell.exe',args,{windowsHide:true,timeout:20000});
}
const invoke=(command,args={})=>page.evaluate(([c,a])=>window.__TAURI_INTERNALS__.invoke(c,a),[command,args]);
try{
  await launch();
  if(await page.getByRole('banner').getByRole('button',{name:'创建探索者',exact:true}).count()){
  await page.getByRole('banner').getByRole('button',{name:'创建探索者',exact:true}).click();
  await page.getByRole('textbox',{name:'角色名',exact:true}).fill('原生对话框验收');
  await page.getByRole('dialog').getByRole('button',{name:'创建探索者',exact:true}).click();
  await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();
  }
  await expect(page.getByRole('banner').getByRole('button',{name:'原生对话框验收',exact:true})).toBeVisible();
  const folder=path.resolve('releases/qa/中文 备份目录');await fs.mkdir(folder,{recursive:true});
  const filename=path.join(folder,`个人 进度-${Date.now()}.json`);
  await page.getByRole('button',{name:'数据备份',exact:true}).click();
  await page.getByRole('button',{name:'导出个人数据',exact:false}).click();
  await dialog('导出个人数据',filename);
  await expect(page.getByRole('status').filter({hasText:'备份已导出'})).toBeVisible();
  const backup=JSON.parse(await fs.readFile(filename,'utf8'));
  assert.equal(backup.data.characters[0].name,'原生对话框验收');
  const cancelPromise=invoke('save_backup',{content:JSON.stringify(backup)});await dialog('导出个人数据','',true);assert.equal(await cancelPromise,false);
  checks.push({check:'native-export-unicode-space-path-and-cancel',passed:true});
  backup.data.characters[0].name='来自文件的 中文角色';
  const imported=path.join(folder,'导入 文件.json');await fs.writeFile(imported,JSON.stringify(backup));
  await page.getByRole('button',{name:'从备份恢复',exact:false}).click();await dialog('从备份恢复',imported);
  await expect(page.getByText('已校验备份',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'确认替换并恢复',exact:true}).click();
  await expect(page.getByRole('banner').getByRole('button',{name:'来自文件的 中文角色',exact:true})).toBeVisible();
  const damaged=path.join(folder,'损坏 文件.json');await fs.writeFile(damaged,'{broken');
  await page.getByRole('button',{name:'数据备份',exact:true}).click();
  await page.getByRole('button',{name:'从备份恢复',exact:false}).click();await dialog('从备份恢复',damaged);
  await expect(page.getByRole('status').filter({hasText:'无法读取 JSON 备份'})).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button',{name:'来自文件的 中文角色',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'从备份恢复',exact:false}).click();await dialog('从备份恢复','',true);
  await expect(page.getByRole('heading',{name:'数据备份',exact:true})).toBeVisible();
  checks.push({check:'native-import-preview-restore-corrupt-rejection-and-cancel',passed:true});
  await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();
  await close();
  await exec(installer,['/S'],{windowsHide:true,timeout:60000});
  await launch();
  await expect(page.getByRole('banner').getByRole('button',{name:'来自文件的 中文角色',exact:true})).toBeVisible();
  checks.push({check:'silent-install-and-overlay-install-preserve-personal-records',passed:true});
  await page.screenshot({path:'releases/qa/installed-client.png'});
  // Remove only this test's character via the real UI.
  await page.getByRole('banner').getByRole('button',{name:'来自文件的 中文角色',exact:true}).click();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'删除 来自文件的 中文角色',exact:true}).click();
  await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();
  await close();
  await fs.writeFile('releases/qa/installed-check.json',JSON.stringify({checkedAt:new Date().toISOString(),checks},null,2));
  console.log(checks);
}finally{await browser?.close().catch(()=>{});if(child&&child.exitCode===null)child.kill();}
