import {expect,test} from '@playwright/test';

test('language switch preserves links, view, filters, search and installed fonts',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/?kind=skill&map=1:2&selected=skill:0:1&attribute='+encodeURIComponent('精通斧术')+'&tz=UTC');
 await expect(page.locator('.detail-title-row h2')).toHaveText('劈击');
 await page.getByRole('button',{name:'放大',exact:true}).click();
 const position=()=>page.evaluate(()=>{
  const host=document.querySelector('.leaflet-host')!.getBoundingClientRect(),marker=document.querySelector('.atlas-marker.chosen')!.getBoundingClientRect();
  return {x:marker.x-host.x-host.width/2,y:marker.y-host.y-host.height/2,width:marker.width};
 });
 const originalPosition=await position();
 const before=new URL(page.url()).search;
 await page.getByLabel('Language / 语言').selectOption('en');
 await expect(page.locator('html')).toHaveAttribute('lang','en');
 await expect(page.locator('.detail-title-row h2')).toHaveText('Cleave');
 await expect(page.locator('.module-nav').getByRole('button',{name:'Armor crafting',exact:true})).toBeVisible();
 expect(new URL(page.url()).search).toBe(before);
 const switchedPosition=await position();
 expect(Math.abs(originalPosition.x-switchedPosition.x)).toBeLessThan(2);
 expect(Math.abs(originalPosition.y-switchedPosition.y)).toBeLessThan(2);
 expect(switchedPosition.width).toBe(originalPosition.width);
 await page.getByRole('textbox',{name:'Search information'}).fill('劈击');
 await expect(page.getByTestId('results').getByRole('button').first()).toContainText('Cleave');
 expect(await page.locator('.detail-scroll .english-name').count()).toBe(0);
 await page.evaluate(async()=>{await document.fonts.load('16px "Friz Quadrata Std"');await document.fonts.load('16px "LXGW WenKai Screen"');});
 const cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
 const {root}=await cdp.send('DOM.getDocument');
 const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.detail-title-row h2'});
 const {fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
 expect(fonts.some(font=>font.familyName==='Friz Quadrata Std'&&font.isCustomFont)).toBe(true);
 await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','en');
 await expect(page.locator('.detail-title-row h2')).toHaveText('Cleave');
 await page.getByLabel('Language / 语言').selectOption('zh-CN');
 const documentNode=await cdp.send('DOM.getDocument');
 const chineseNode=await cdp.send('DOM.querySelector',{nodeId:documentNode.root.nodeId,selector:'.detail-title-row h2'});
 const chineseFonts=await cdp.send('CSS.getPlatformFontsForNode',{nodeId:chineseNode.nodeId});
 expect(chineseFonts.fonts.some(font=>font.familyName==='LXGW WenKai Screen'&&font.isCustomFont)).toBe(true);
 expect(errors).toEqual([]);
});

test('both language packs and fonts work after going offline',async({page,context})=>{
 test.setTimeout(90000);
 await page.goto('/');await expect(page.getByTestId('atlas-map')).toBeVisible();
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await context.setOffline(true);
 await page.getByLabel('Language / 语言').selectOption('en');
 await page.locator('.module-nav').getByRole('button',{name:'Armor crafting',exact:true}).click();
 await expect(page.locator('.armor-results')).toBeVisible();
 await page.locator('.module-nav').getByRole('button',{name:'Activity calendar',exact:true}).click();
 await expect(page.locator('.current-activities')).toBeVisible();
 await page.getByLabel('Language / 语言').selectOption('zh-CN');
 await expect(page.locator('.feature-heading h1')).toContainText('活动日历');
 await page.reload();await expect(page.locator('.feature-heading h1')).toContainText('活动日历');
 await context.setOffline(false);
});

for(const scale of [1,1.5,2])test(`English and Chinese controls fit at ${scale*100}%`,async({page})=>{
 await page.setViewportSize({width:Math.round(1440/scale),height:Math.round(1000/scale)});
 await page.goto('/');await expect(page.getByTestId('atlas-map')).toBeVisible();
 for(const locale of ['en','zh-CN']){
  await page.getByLabel('Language / 语言').selectOption(locale);
  await expect(page.getByLabel('Language / 语言')).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});
