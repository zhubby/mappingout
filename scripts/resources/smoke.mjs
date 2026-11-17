/**
 * [INPUT]: 依赖隔离资源 QA 应用、WebView 调试端口与本地断网代理。
 * [OUTPUT]: 验证离线准备、字体、固定资源与进程重启。
 * [POS]: 资源实机验收；拒绝生产应用标识。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { projectPath } from '../lib/paths.mjs';
import {chromium,expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import http from 'node:http';

// Build with the isolated identifier dev.zhubby.mappingout.resourceqa first.
// The test refuses the production application before changing any records.
const executable=path.resolve(process.argv[2]||projectPath('desktop/target/release/mappingout-desktop.exe'));
const out=projectPath('releases/qa');await fs.mkdir(out,{recursive:true});
const profile=await fs.mkdtemp(path.join(out,'resources-webview-'));
const checks=[];let child,browser,page;
// Keep native requests offline, and deliberately stall one request to exercise
// a WebView reload while the resource manager still owns its operation lock.
let holdConnections=false;
const sockets=new Set(),heldSockets=new Set();
const proxy=http.createServer((_request,response)=>{response.writeHead(502);response.end();});
proxy.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>{sockets.delete(socket);heldSockets.delete(socket);});});
proxy.on('connect',(_request,socket)=>{
 if(holdConnections){heldSockets.add(socket);return;}
 socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
});
await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',resolve);});
const proxyUrl=`http://127.0.0.1:${proxy.address().port}`;
const invoke=(command,args={})=>page.evaluate(([c,a])=>window.__TAURI_INTERNALS__.invoke(c,a),[command,args]);
async function launch(){
 child=spawn(executable,[],{windowsHide:true,stdio:'ignore',env:{...process.env,
  HTTP_PROXY:proxyUrl,HTTPS_PROXY:proxyUrl,ALL_PROXY:proxyUrl,NO_PROXY:'localhost,127.0.0.1',
  WEBVIEW2_USER_DATA_FOLDER:profile,
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9231 --proxy-server=http://127.0.0.1:9 --proxy-bypass-list=tauri.localhost'}});
 for(let i=0;i<80;i++){
  try{browser=await chromium.connectOverCDP('http://127.0.0.1:9231');break;}catch{}
  if(child.exitCode!==null)throw Error('Test executable exited: '+child.exitCode);
  await new Promise(r=>setTimeout(r,250));
 }
 assert.ok(browser);page=browser.contexts()[0].pages()[0];await page.waitForURL('http://tauri.localhost/**');
 const info=await invoke('desktop_info');assert.ok(info.backupDirectory.includes('mappingout.resourceqa'),'Refusing production profile');return info;
}
async function close(){
 await invoke('plugin:window|close',{label:'main'}).catch(error=>{if(!/closed|destroyed/i.test(String(error)))throw error;});
 for(let i=0;i<80&&child.exitCode===null;i++)await new Promise(r=>setTimeout(r,100));
 assert.equal(child.exitCode,0);await browser.close().catch(()=>{});browser=undefined;
}
try{
 await launch();
 const initial=await invoke('resources_status');
 if(!initial.ready){
  await expect(page.getByRole('heading',{name:'准备离线资料',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'导入离线资源',exact:true})).toBeVisible({timeout:30000});
  checks.push({check:'first-start-without-network-shows-offline-import',passed:true});
  await page.screenshot({path:path.join(out,'resources-first-start.png')});
  console.log('READY_FOR_NATIVE_IMPORT: choose releases/resources/resources.json in the application.');
 }
 await expect(page.getByRole('button',{name:'客户端设置',exact:true})).toBeVisible({timeout:180000});
 const status=await invoke('resources_status');assert.equal(status.ready,true);
 assert.ok(status.activeGeneration);checks.push({check:initial.ready?'offline-startup-from-verified-cache':'native-dialog-offline-import-and-signature-verification',passed:true});
 await expect.poll(async()=>['checking','downloading','verifying'].includes((await invoke('resources_status')).phase)).toBe(false);
 holdConnections=true;
 await page.evaluate(()=>{void window.__TAURI_INTERNALS__.invoke('resources_check',{force:true}).catch(()=>{});});
 await expect.poll(()=>heldSockets.size).toBeGreaterThan(0);
 assert.equal((await invoke('resources_status')).phase,'checking');
 await page.reload();
 await expect(page.getByRole('button',{name:'客户端设置',exact:true})).toBeVisible({timeout:8000});
 await expect(page.locator('.leaflet-image-layer')).toBeVisible({timeout:8000});
 const duringCheck=await invoke('resources_status');
 assert.equal(duringCheck.phase,'checking','Background check must still hold the operation lock');
 assert.equal(duringCheck.activeGeneration,status.activeGeneration);
 assert.ok(heldSockets.size>0);
 checks.push({check:'webview-reload-opens-current-resources-while-background-check-is-blocked',passed:true});
 await invoke('resources_cancel');
 await expect.poll(async()=>(await invoke('resources_status')).phase).not.toBe('checking');
 holdConnections=false;for(const socket of heldSockets)socket.destroy();
 const maps=await page.evaluate(async()=>{
  const catalog=await (await fetch('/data/catalog.json')).json();
  return Promise.all(catalog.regions.map(async r=>{const response=await fetch('/'+r.image);return response.ok&&(await response.arrayBuffer()).byteLength>0;}));
 });assert.equal(maps.length,20);assert.ok(maps.every(Boolean));
 await page.getByLabel('Language / 语言').selectOption('en');
 await page.getByRole('textbox',{name:'Search information'}).fill('Cleave');
 await page.getByTestId('results').getByRole('button').first().click();
 await expect(page.locator('.detail-title-row h2')).toHaveText('Cleave');
 const session=await browser.contexts()[0].newCDPSession(page);await session.send('DOM.enable');await session.send('CSS.enable');
 for(const [locale,family,title] of [['en','Friz Quadrata Std','Cleave'],['zh-CN','LXGW WenKai Screen','劈击']]){
  await page.getByLabel('Language / 语言').selectOption(locale);await expect(page.locator('.detail-title-row h2')).toHaveText(title);
  await page.evaluate(family=>document.fonts.load(`16px "${family}"`),family);
  const {root}=await session.send('DOM.getDocument');const {nodeId}=await session.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.detail-title-row h2'});
  const {fonts}=await session.send('CSS.getPlatformFontsForNode',{nodeId});assert.ok(fonts.some(f=>f.familyName===family&&f.isCustomFont));
 }await session.detach();checks.push({check:'all-20-maps-search-two-languages-and-packaged-fonts-offline',passed:true});
 await page.getByRole('button',{name:'护甲制作',exact:true}).click();await expect(page.locator('.armor-results')).toBeVisible();
 await page.getByRole('button',{name:'活动日历',exact:true}).click();await expect(page.locator('.current-activities')).toBeVisible();
 await page.getByRole('button',{name:'世界地图',exact:true}).click();
 await page.getByRole('banner').getByRole('button',{name:'创建探索者',exact:true}).click();
 await page.getByRole('textbox',{name:'角色名',exact:true}).fill('资源分包离线验收');
 await page.getByRole('dialog').getByRole('button',{name:'创建探索者',exact:true}).click();await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();
 await close();await launch();
 await expect(page.getByRole('banner').getByRole('button',{name:'资源分包离线验收',exact:true})).toBeVisible();
 await expect(page.locator('.leaflet-image-layer')).toBeVisible();
 assert.equal((await invoke('resources_status')).activeGeneration,status.activeGeneration);
 checks.push({check:'offline-process-restart-reuses-resource-cache-and-preserves-personal-records',passed:true});
 await page.getByRole('button',{name:'客户端设置',exact:true}).click();await expect(page.getByRole('heading',{name:'离线资料',exact:true})).toBeVisible();
 await page.screenshot({path:path.join(out,'resources-settings.png')});
 await close();await fs.writeFile(path.join(out,'resources-smoke.json'),JSON.stringify({executable,profile,checkedAt:new Date().toISOString(),checks},null,2));
 console.log(JSON.stringify(checks,null,2));
}finally{
 await browser?.close().catch(()=>{});if(child&&child.exitCode===null)child.kill();
 for(const socket of sockets)socket.destroy();
 await new Promise(resolve=>proxy.close(resolve));
}
