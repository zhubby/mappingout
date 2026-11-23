/**
 * [INPUT]: 依赖双语界面、资料投影和共用语言菜单。
 * [OUTPUT]: 验证语言切换、字体、离线与个人记录。
 * [POS]: 双语浏览器回归；保留用户业务状态。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {selectOption} from './select';
import {expect,test} from '@playwright/test';

test('upgrades a saved Simplified preference and exposes Traditional game terms',async({page},testInfo)=>{
 await page.addInitScript(()=>{if(!localStorage.getItem('mappingout.locale'))localStorage.setItem('mappingout.locale','zh-CN');});
 await page.goto('/?kind=skill&selected=skill:0:1');
 await expect(page.locator('.detail-title-row h2')).toHaveText('劈擊');
 await expect(page.locator('html')).toHaveAttribute('lang','zh-TW');
 await expect(page.getByLabel('Language / 語言')).toHaveText('繁體中文');
 expect(await page.evaluate(()=>localStorage.getItem('mappingout.locale'))).toBe('zh-TW');
 await expect(page.locator('.translation-notice')).toContainText('中文 Wiki 佐證');
 await page.screenshot({path:testInfo.outputPath('traditional-desktop.png'),animations:'disabled'});
 await selectOption(page.getByLabel('Language / 語言'),'en');
 await page.reload();
 await expect(page.locator('html')).toHaveAttribute('lang','en');
 await selectOption(page.getByLabel('Language / 語言'),'zh-TW');
 await expect(page.locator('.detail-title-row h2')).toHaveText('劈擊');
 await page.setViewportSize({width:390,height:844});
 await expect(page.getByTestId('atlas-map')).toBeVisible();
 await page.waitForFunction(()=>{const image=document.querySelector<HTMLImageElement>('.leaflet-image-layer');return !!image&&image.complete&&image.naturalWidth>0;});
 await page.screenshot({path:testInfo.outputPath('traditional-mobile.png'),animations:'disabled'});
});

test('language switch preserves links, view, filters, search and installed fonts',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/?kind=skill&map=1:2&selected=skill:0:1&attribute='+encodeURIComponent('精通斧術')+'&tz=UTC');
 await expect(page.locator('.detail-title-row h2')).toHaveText('劈擊');
 await page.getByRole('button',{name:'放大',exact:true}).click();
 const position=()=>page.evaluate(()=>{
  const host=document.querySelector('.leaflet-host')!.getBoundingClientRect(),marker=document.querySelector('.atlas-marker.chosen')!.getBoundingClientRect();
  return {x:marker.x-host.x-host.width/2,y:marker.y-host.y-host.height/2,width:marker.width};
 });
 const originalPosition=await position();
 const before=new URL(page.url()).search;
 await selectOption(page.getByLabel('Language / 語言'), 'en');
 await expect(page.locator('html')).toHaveAttribute('lang','en');
 await expect(page.locator('.detail-title-row h2')).toHaveText('Cleave');
 await expect(page.locator('.module-nav').getByRole('button',{name:'Armor crafting',exact:true})).toBeVisible();
 expect(new URL(page.url()).search).toBe(before);
 const switchedPosition=await position();
 expect(Math.abs(originalPosition.x-switchedPosition.x)).toBeLessThan(2);
 expect(Math.abs(originalPosition.y-switchedPosition.y)).toBeLessThan(2);
 expect(switchedPosition.width).toBe(originalPosition.width);
 await page.getByRole('textbox',{name:'Search information'}).fill('劈擊');
 await expect(page.getByTestId('results').getByRole('button').first()).toContainText('Cleave');
 expect(await page.locator('.detail-scroll .english-name').count()).toBe(0);
 await expect.poll(()=>page.evaluate(()=>Array.from(document.styleSheets).some(sheet=>sheet.href?.includes('/build/fonts-')))).toBe(true);
 await page.evaluate(async()=>{await document.fonts.load('16px "Friz Quadrata Std"');await document.fonts.load('16px "LXGW WenKai Screen"');});
 const cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
 const {root}=await cdp.send('DOM.getDocument');
 const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.detail-title-row h2'});
 const {fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
 expect(fonts.some(font=>font.familyName==='Friz Quadrata Std'&&font.isCustomFont)).toBe(true);
 await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','en');
 await expect(page.locator('.detail-title-row h2')).toHaveText('Cleave');
 await selectOption(page.getByLabel('Language / 語言'), 'zh-TW');
 await expect(page.locator('.detail-title-row h2')).toHaveText('劈擊');
 await expect.poll(()=>page.evaluate(()=>Array.from(document.styleSheets).some(sheet=>sheet.href?.includes('/build/fonts-')))).toBe(true);
 await page.evaluate(async()=>{await document.fonts.load('16px "LXGW WenKai Screen"');});
 const documentNode=await cdp.send('DOM.getDocument');
 const chineseNode=await cdp.send('DOM.querySelector',{nodeId:documentNode.root.nodeId,selector:'.detail-title-row h2'});
 const chineseFonts=await cdp.send('CSS.getPlatformFontsForNode',{nodeId:chineseNode.nodeId});
 expect(chineseFonts.fonts.some(font=>font.familyName==='LXGW WenKai Screen'&&font.isCustomFont)).toBe(true);
 expect(errors).toEqual([]);
});

test('both language packs and fonts work after going offline',async({page,context})=>{
 test.setTimeout(90000);
 const fontLoaded=page.waitForResponse(response=>response.url().endsWith('/fonts/lxgw/LXGWWenKaiScreen.ttf'));
 await page.goto('/');await expect(page.getByTestId('atlas-map')).toBeVisible();
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await page.locator('.module-nav').getByRole('button',{name:'護甲製作',exact:true}).click();
 await expect(page.locator('.armor-results')).toBeVisible();
 await page.locator('.module-nav').getByRole('button',{name:'活動日曆',exact:true}).click();
 await expect(page.locator('.current-activities')).toBeVisible();
 await fontLoaded;
 await page.evaluate(async()=>{await document.fonts.ready;});
 await context.setOffline(true);
 await selectOption(page.getByLabel('Language / 語言'), 'en');
 await page.locator('.module-nav').getByRole('button',{name:'Armor crafting',exact:true}).click();
 await expect(page.locator('.armor-results')).toBeVisible();
 await page.locator('.module-nav').getByRole('button',{name:'Activity calendar',exact:true}).click();
 await expect(page.locator('.current-activities')).toBeVisible();
 await selectOption(page.getByLabel('Language / 語言'), 'zh-TW');
 await expect(page.locator('.feature-heading h1')).toContainText('活動日曆');
 await page.reload();await expect(page.locator('.feature-heading h1')).toContainText('活動日曆');
 await context.setOffline(false);
});

for(const scale of [1,1.5,2])test(`English and Chinese controls fit at ${scale*100}%`,async({page})=>{
 await page.setViewportSize({width:Math.round(1440/scale),height:Math.round(1000/scale)});
 await page.goto('/');await expect(page.getByTestId('atlas-map')).toBeVisible();
 for(const locale of ['en','zh-TW']){
  await selectOption(page.getByLabel('Language / 語言'), locale);
  await expect(page.getByLabel('Language / 語言')).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});
