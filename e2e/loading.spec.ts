/**
 * [INPUT]: 依赖生产界面、真实资料与可暂停的 HTTP 字节流。
 * [OUTPUT]: 验证真实下载进度、双语窄屏、减弱动效和失败重试。
 * [POS]: 共用资料等待界面的浏览器回归；不替换内容 worker。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { expect, test } from '@playwright/test';

test.use({serviceWorkers:'block'});

for(const variant of [
  {name:'desktop',locale:'zh-TW',width:1440,height:1000,knownTotal:true},
  {name:'mobile',locale:'zh-TW',width:390,height:844,knownTotal:true},
  {name:'english-mobile',locale:'en',width:390,height:844,knownTotal:true},
  {name:'unknown-total',locale:'zh-TW',width:1440,height:1000,knownTotal:false},
])test(`shows real loading progress on ${variant.name}`,async({page,context},testInfo)=>{
  const paths=['catalog.json','i18n/zh-TW/catalog.json','i18n/en/catalog.json'];
  const bodies=new Map(await Promise.all(paths.map(async path=>[`/data/${path}`,await readFile(new URL(`../public/data/${path}`,import.meta.url))] as const)));
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const server=createServer(async(request,response)=>{
    const body=bodies.get(request.url??'');
    if(!body){response.writeHead(404).end();return;}
    response.writeHead(200,{'content-type':'application/json','access-control-allow-origin':'*',...(variant.knownTotal?{'content-length':body.length}:{})});
    const split=Math.floor(body.length/2);
    response.write(body.subarray(0,split));
    await gate;
    if(!response.destroyed)response.end(body.subarray(split));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  if(!address||typeof address==='string')throw Error('Missing loading fixture address');
  await context.route('**/data/**',route=>{
    const path=new URL(route.request().url()).pathname;
    return bodies.has(path)?route.continue({url:`http://127.0.0.1:${address.port}${path}`}):route.continue();
  });
  try{
    await page.setViewportSize({width:variant.width,height:variant.height});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.addInitScript(locale=>localStorage.setItem('mappingout.locale',locale),variant.locale);
    await page.goto('/');
    const status=page.locator('.data-status');
    const progress=status.getByRole('progressbar');
    await expect(status.getByRole('heading')).toHaveText(variant.locale==='en'?'Preparing your exploration data':'正在準備探索資料');
    if(variant.knownTotal){
      await expect.poll(async()=>Number(await progress.getAttribute('value'))).toBeGreaterThan(49);
      await expect.poll(async()=>Number(await progress.getAttribute('value'))).toBeLessThanOrEqual(50);
    }else{
      await expect(status.locator('.data-status__detail')).toContainText('9.1 MB');
      await expect(progress).not.toHaveAttribute('value');
      await expect(status.locator('.data-status__track--flow')).toHaveCount(1);
      await expect(status.locator('.data-status__value')).not.toContainText('%');
    }
    await expect(status.locator('[aria-current="step"]')).toHaveCount(1);
    await expect(status).not.toContainText('.json');
    expect(await status.locator('.data-status__orbit').evaluate(element=>getComputedStyle(element).animationName)).toBe('none');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(status.locator('.data-status__stages')).toBeInViewport();
    await page.screenshot({path:testInfo.outputPath(`loading-${variant.name}.png`),animations:'disabled'});
    release();
    await expect(page.getByTestId('atlas-map')).toBeVisible();
    await expect(status).toHaveCount(0);
  }finally{
    release();
    server.closeAllConnections();
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});

test('shows a clear error and retries the same data request',async({page,context},testInfo)=>{
  const pattern='**/data/catalog.json';
  await context.route(pattern,route=>route.fulfill({status:503,body:'Unavailable'}));
  await page.goto('/');
  await expect(page.locator('.data-status').getByRole('alert')).toContainText('HTTP 503');
  await expect(page.locator('.data-status').getByRole('progressbar')).toHaveCount(0);
  await page.screenshot({path:testInfo.outputPath('loading-error.png'),animations:'disabled'});
  await context.unroute(pattern);
  await page.getByRole('button',{name:'重新載入',exact:true}).click();
  await expect(page.getByTestId('atlas-map')).toBeVisible();
});
