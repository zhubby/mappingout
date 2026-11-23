/**
 * [INPUT]: 依赖生产任务界面、固定任务目录与真实 IndexedDB。
 * [OUTPUT]: 验证检索、进度、迁移、日历、离线路线图与手机边界。
 * [POS]: 任务攻略用户流程验收；保留真实自定义菜单交互。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {expect,test,type Page} from '@playwright/test';
import fs from 'node:fs';
import {selectOption} from './select';
import type {QuestCatalog} from '../src/shared/contracts/quests';
const data:QuestCatalog=JSON.parse(fs.readFileSync('public/data/quests.json','utf8'));
const quest=(title:string)=>data.quests.find(q=>q.englishName===title)!;
const url=(title:string)=>`/?view=quests&quest=${encodeURIComponent(quest(title).id)}`;
async function createCharacter(page:Page,name:string){
  await page.locator('.character-button').click();await page.getByLabel('角色名稱',{exact:true}).fill(name);
  await page.getByRole('dialog').getByRole('button',{name:'建立探索者',exact:true}).click();
  await page.getByRole('button',{name:'關閉對話框'}).click();
}
async function readyWorker(page:Page){await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));});}
test('campaign and bilingual search persist while difficulty keeps the selected mission',async({page})=>{
  await page.goto(url('The Great Northern Wall'));
  await expect(page.locator('.quest-title [lang=en]')).toHaveText('The Great Northern Wall');
  await selectOption(page.getByLabel('任務難度',{exact:true}),'hard');
  await expect(page.locator('.quest-title [lang=en]')).toHaveText('The Great Northern Wall');
  await expect(page).toHaveURL(/qMode=hard/);
  await selectOption(page.getByLabel('篇章或故事',{exact:true}),'all');
  await page.getByLabel('搜尋任務',{exact:true}).fill('Cleansing Bukdek Byway');
  await expect(page.locator('.quest-title [lang=en]')).toHaveText('Cleansing Bukdek Byway (Hard mode)');
  await page.reload();await expect(page.getByLabel('篇章或故事',{exact:true})).toHaveAttribute('data-value','all');
  const chinese=await page.locator('#quest-title').innerText();
  await page.getByLabel('搜尋任務',{exact:true}).fill(chinese.trim());
  await expect(page.locator('#quest-title')).toContainText(chinese.trim());
  await selectOption(page.getByLabel('Language / 語言'),'en');
  await expect(page.locator('#quest-title')).toContainText('Cleansing Bukdek Byway (Hard mode)');
  await expect(page.locator('select')).toHaveCount(0);
});
test('direct quest links skip unrelated data and defer the large font until the guide is ready',async({page})=>{
  const unrelated:string[]=[];let fontRequestedBeforeGuide=false;
  page.on('request',request=>{
    const url=request.url();
    if(/\/data\/(catalog|calendar)\.json(?:\?|$)/.test(url))unrelated.push(url);
  });
  await page.route('**/fonts/**',async route=>{
    if(!await page.locator('#quest-title').isVisible().catch(()=>false))fontRequestedBeforeGuide=true;
    await route.abort();
  });
  await page.goto(url('The Great Northern Wall'));
  await expect(page.locator('.quest-title [lang=en]')).toHaveText('The Great Northern Wall');
  expect(unrelated).toEqual([]);
  expect(fontRequestedBeforeGuide).toBe(false);
});
test('full offline preparation waits for the user to start it',async({page})=>{
  let manifestRequests=0;
  page.on('request',request=>{if(request.url().includes('/offline-assets.json'))manifestRequests++;});
  await page.goto('/');await expect(page.locator('.leaflet-container')).toBeVisible();await readyWorker(page);
  expect(manifestRequests).toBe(0);
  await page.getByRole('button',{name:'離線資料準備'}).click();
  const dialog=page.getByRole('dialog',{name:'離線資料準備'});
  await expect(dialog.getByRole('button',{name:'開始離線準備'})).toBeEnabled();
  await expect(dialog.getByRole('progressbar')).toHaveCount(0);
  expect(manifestRequests).toBe(0);
});
test('manual full preparation opens previously unvisited feature data offline',async({page,context})=>{
  test.setTimeout(120000);
  await page.goto('/?view=calendar');
  await expect(page.locator('.current-activities')).toBeVisible();
  await readyWorker(page);
  await page.getByRole('button',{name:'離線資料準備'}).click();
  const dialog=page.getByRole('dialog',{name:'離線資料準備'});
  await dialog.getByRole('button',{name:'開始離線準備'}).click();
  await expect(dialog.getByText('離線資料已準備完成。')).toBeVisible({timeout:100000});
  await page.getByRole('button',{name:'關閉對話框'}).click();
  await context.setOffline(true);
  await page.goto(url('The Great Northern Wall'));
  await expect(page.locator('.quest-article')).toBeVisible();
  await page.goto('/?view=skills&sq="Healing Signet"');
  await expect(page.locator('.skill-article')).toContainText('Healing Signet');
  await page.goto('/?view=armor');
  await expect(page.locator('.armor-results')).toBeVisible();
});
test('closing offline preparation cancels the worker task',async({page})=>{
  await page.goto('/');await readyWorker(page);
  const open=page.getByRole('button',{name:'離線資料準備'});
  await open.click();
  let dialog=page.getByRole('dialog',{name:'離線資料準備'});
  await dialog.getByRole('button',{name:'開始離線準備'}).click();
  await expect(dialog.getByRole('button',{name:'取消準備'})).toBeVisible();
  await dialog.getByRole('button',{name:'關閉對話框'}).click();
  await expect(dialog).toHaveCount(0);
  await open.click();
  dialog=page.getByRole('dialog',{name:'離線資料準備'});
  await dialog.getByRole('button',{name:'開始離線準備'}).click();
  await expect(dialog.getByRole('button',{name:'取消準備'})).toBeVisible();
  await dialog.getByRole('button',{name:'取消準備'}).click();
  await expect(dialog.getByText('準備已取消，可繼續準備。')).toBeVisible();
});
test('character completion and bonus survive reload, isolate modes and round-trip a v3 backup',async({page})=>{
  await page.goto(url('The Great Northern Wall'));await expect(page.locator('#quest-title')).toBeVisible();
  await createCharacter(page,'任務角色甲');
  await page.getByLabel('額外獎勵已完成',{exact:true}).check();
  await expect(page.getByLabel('額外獎勵已完成',{exact:true})).toBeChecked();
  await expect(page.getByRole('button',{name:'標記任務完成',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'標記任務完成',exact:true}).click();
  await expect(page.getByRole('button',{name:'已完成 · 撤銷',exact:true})).toBeVisible();
  await selectOption(page.getByLabel('任務難度',{exact:true}),'hard');
  await expect(page.getByLabel('額外獎勵已完成',{exact:true})).not.toBeChecked();
  await selectOption(page.getByLabel('任務難度',{exact:true}),'normal');
  await page.reload();await expect(page.getByLabel('額外獎勵已完成',{exact:true})).toBeChecked();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'資料備份',exact:true}).click();await page.getByRole('button',{name:/匯出個人資料/}).click();
  const backup=JSON.parse(fs.readFileSync((await (await download).path())!,'utf8'));
  expect(backup.version).toBe(3);expect(backup.data.questProgress).toHaveLength(1);
  await page.getByRole('button',{name:'關閉對話框'}).click();await createCharacter(page,'任務角色乙');
  await expect(page.getByLabel('額外獎勵已完成',{exact:true})).not.toBeChecked();
  await page.getByLabel('匯入備份檔案').setInputFiles({name:'quests-v3.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await expect(page.getByRole('dialog')).toContainText('1 條任務記錄');
  await page.getByRole('button',{name:'確認取代並還原'}).click();await expect(page.getByLabel('額外獎勵已完成',{exact:true})).toBeChecked();
});
test('master rewards and manually confirmed prerequisites belong to the selected character',async({page})=>{
  await page.goto(url('Minister Cho\'s Estate'));await expect(page.locator('#quest-title')).toBeVisible();await createCharacter(page,'大師記錄');
  await selectOption(page.getByLabel('任務獎勵等級',{exact:true}),'3');
  await expect(page.getByRole('button',{name:'已完成 · 撤銷',exact:true})).toBeVisible();
  await page.goto(url('Vizunah Square'));await page.locator('.quest-access>summary').click();
  const condition=page.getByRole('combobox',{name:/確認接取條件/}).first();
  await expect(condition).toHaveAttribute('data-value','');await selectOption(condition,'yes');await page.reload();
  await page.locator('.quest-access>summary').click();await expect(page.getByRole('combobox',{name:/確認接取條件/}).first()).toHaveAttribute('data-value','yes');
});
test('calendar and guides share the current rotation record without conflating permanent completion',async({page})=>{
  await page.clock.setFixedTime(new Date('2026-11-13T15:59:59Z'));await page.goto('/?view=calendar&cKind=mission');
  await expect(page.locator('.activity-card')).toHaveCount(1);await createCharacter(page,'懸賞角色');
  await page.getByRole('button',{name:'開啟任務攻略',exact:true}).click();await expect(page.locator('#quest-title')).toBeVisible();
  await page.getByRole('button',{name:'標記本輪已完成',exact:true}).click();await expect(page.getByRole('button',{name:'本輪已完成 · 撤銷',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'標記任務完成',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'檢視懸賞日曆與本期記錄',exact:true}).click();
  await expect(page.getByRole('button',{name:'本輪已完成 · 撤銷',exact:true})).toBeVisible();
});
test('calendar loads without the map catalog until atlas navigation',async({page})=>{
  const catalogRequests:string[]=[];
  page.on('request',request=>{if(new URL(request.url()).pathname.endsWith('/data/catalog.json'))catalogRequests.push(request.url());});
  await page.goto('/?view=calendar&cKind=mission');
  await expect(page.locator('.activity-card').first()).toBeVisible();
  expect(catalogRequests).toEqual([]);
  await page.getByRole('button',{name:'世界地圖',exact:true}).click();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect.poll(()=>catalogRequests.length).toBeGreaterThan(0);
});
test('visited guides and route maps remain available offline on a narrow screen',async({page,context})=>{
  await page.addInitScript(()=>{
    const register=navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register=(...args)=>new Promise<ServiceWorkerRegistration>((resolve,reject)=>{
      (window as unknown as {startOfflineWorker:()=>void}).startOfflineWorker=()=>{void register(...args).then(resolve,reject);};
    });
  });
  test.setTimeout(60000);await page.setViewportSize({width:390,height:844});await page.goto(url('The Great Northern Wall'));
  await expect(page.locator('.quest-article')).toBeVisible();
  await page.evaluate(()=>(window as unknown as {startOfflineWorker:()=>void}).startOfflineWorker());
  await readyWorker(page);
  await page.locator('.quest-route-maps').scrollIntoViewIfNeeded();
  await expect.poll(()=>page.locator('.quest-images img').evaluateAll(images=>images.length>0&&images.every(img=>(img as HTMLImageElement).naturalWidth>0))).toBe(true);
  await expect.poll(()=>page.evaluate(async()=>{
    const paths=['data/quests.json','data/i18n/zh-TW/quests.json','data/i18n/en/quests.json',
      ...performance.getEntriesByType('resource').map(entry=>entry.name).filter(url=>url.includes('/build/')&&/\.(js|css)$/.test(url))];
    return (await Promise.all(paths.map(path=>caches.match(new URL(path,location.href))))).every(Boolean);
  })).toBe(true);
  await context.setOffline(true);await page.reload();
  await expect(page.locator('.quest-article')).toBeVisible();await expect(page.locator('.quest-guide-body')).toContainText(/./);
  await page.locator('.quest-route-maps').scrollIntoViewIfNeeded();
  await expect.poll(()=>page.locator('.quest-images img').evaluateAll(images=>images.length>0&&images.every(img=>(img as HTMLImageElement).naturalWidth>0))).toBe(true);
  await page.getByRole('button',{name:'放大路線圖 1',exact:true}).click();await expect(page.getByRole('dialog',{name:'路線圖預覽'})).toBeVisible();await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('a verified quest region opens its existing map dossier',async({page})=>{
  await page.goto(url('The Great Northern Wall'));
  await page.locator('.quest-map-links button').first().click();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.locator('.detail-panel')).toBeVisible();
  await expect(page).toHaveURL(/selected=zone/);
});
test('a legacy resource set missing guides leaves the map and other tabs usable',async({page})=>{
  await page.context().route('**/data/quests.json',route=>route.fulfill({status:404,body:'missing'}));
  await page.goto('/?view=quests');await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('舊版離線資料包可能尚未包含任務攻略。')).toBeVisible();
  await page.getByRole('button',{name:'世界地圖',exact:true}).click();await expect(page.locator('.leaflet-container')).toBeVisible();
  await page.getByRole('button',{name:'護甲製作',exact:true}).click();await expect(page.getByRole('heading',{name:'護甲製作',exact:true})).toBeVisible();
});
