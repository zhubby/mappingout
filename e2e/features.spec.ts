/**
 * [INPUT]: 依赖护甲、日历生产视图和共用菜单操作。
 * [OUTPUT]: 验证职业与材料图标、离线加载和个人进度。
 * [POS]: 功能浏览器回归；复用真实 IndexedDB。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {selectOption} from './select';
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

async function createCharacter(page:any,name:string) {
  await page.locator('.character-button').click();await page.getByLabel('角色名',{exact:true}).fill(name);await page.getByRole('button',{name:'建立探索者',exact:true}).last().click();await page.getByRole('button',{name:'關閉彈窗'}).click();
}
async function readyWorker(page:any) {await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));});}

test('armor variants calculate exact pieces and persist character plans across reload and backup',async({page,context})=>{
  await page.goto('/?view=armor');await expect(page.getByRole('heading',{name:'防具製作',exact:true})).toBeVisible();
  await createCharacter(page,'護甲探索者');
  await page.getByLabel('搜尋護甲或製作商').fill('Warrior Ascalon armor');await page.locator('.armor-result').first().click();
  await selectOption(page.getByLabel('護甲製作方案'), 'offer:6014:78170ed09ab06430');
  await expect(page.getByTestId('armor-gold')).toHaveText('5 白金');await expect(page.getByTestId('armor-materials')).toContainText('200');
  await page.getByLabel('製作頭部',{exact:true}).uncheck();await expect(page.getByTestId('armor-gold')).toHaveText('4 白金');
  await page.getByLabel('製作計劃名稱').fill('凱珊出發裝');await page.getByRole('button',{name:'儲存製作計劃',exact:true}).click();
  await expect(page.locator('.saved-plan')).toHaveCount(1);await page.getByLabel('凱珊出發裝 身體已製作').check();await expect(page.locator('.remaining-total')).toContainText('剩餘 3 個部位 · 3 白金');
  await expect(page.locator('.saved-plan-heading img.armor-profession-icon')).toHaveCount(1);
  await expect.poll(()=>page.locator('.saved-plan .material-chip img').evaluateAll(images=>images.every(image=>(image as HTMLImageElement).naturalWidth>0)&&images.length>0)).toBe(true);
  await page.reload();await expect(page.getByLabel('凱珊出發裝 身體已製作')).toBeChecked();await expect(page.getByLabel('製作頭部',{exact:true})).not.toBeChecked();
  const other=await context.newPage();await other.goto(page.url());await expect(other.getByLabel('凱珊出發裝 身體已製作')).toBeChecked();
  await other.getByLabel('凱珊出發裝 手部已製作').check();await expect(page.getByLabel('凱珊出發裝 手部已製作')).toBeChecked();await other.close();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'資料備份',exact:true}).click();await page.getByRole('button',{name:/匯出個人資料/}).click();const backup=JSON.parse(fs.readFileSync((await (await downloadPromise).path())!,'utf8'));
  expect(backup.version).toBe(3);expect(backup.data.armorPlans[0].completedPieceIds).toEqual(['chest','hands']);await page.getByRole('button',{name:'關閉彈窗'}).click();
  await createCharacter(page,'第二位探索者');await expect(page.locator('.saved-plan')).toHaveCount(0);
  await page.getByLabel('匯入備份檔案').setInputFiles({name:'new-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await expect(page.getByRole('dialog')).toContainText('1 份製作計劃');await page.getByRole('button',{name:'確認替換並恢復'}).click();await expect(page.getByLabel('凱珊出發裝 身體已製作')).toBeChecked();
});

for(const locale of ['zh-TW','en'])test(`armor profession and material icons retain identity in ${locale}`,async({page})=>{
  await page.goto('/?view=armor&aq=Warrior+Obsidian+armor');
  if(locale==='en')await selectOption(page.getByLabel('Language / 語言'),'en');
  const profession=page.getByLabel(locale==='en'?'Armor profession':'護甲職業',{exact:true});
  await profession.click();await expect(page.getByRole('option')).toHaveCount(11);
  await expect.poll(()=>page.locator('.select-menu .select-icon').evaluateAll(images=>images.length===10&&images.every(image=>(image as HTMLImageElement).naturalWidth>0))).toBe(true);
  await page.getByRole('option').filter({has:page.locator('[src*="warrior-"]')}).click();
  await expect(profession.locator('img')).toHaveCount(1);
  await expect(page.locator('.armor-result img.armor-profession-icon')).toHaveCount(1);
  await expect(page.locator('.armor-detail .feature-title img.armor-profession-icon')).toHaveAttribute('title',locale==='en'?'Warrior':'戰士');
  const materials=page.getByTestId('armor-materials');
  await expect(materials.locator('img')).toHaveCount(4);
  for(const material of ['iron-ingot','deldrimor-steel-ingot','glob-of-ectoplasm','obsidian-shard'])await expect(materials.locator(`img[src$="/${material}.png"]`)).toHaveCount(1);
  await expect.poll(()=>page.locator('.material-chip img').evaluateAll(images=>images.length>4&&images.every(image=>(image as HTMLImageElement).naturalWidth>0))).toBe(true);
  await page.goto('/?view=armor&aq=Bandana&armor=armor%3Agww%3A67434');
  await expect(page.locator('.armor-detail .feature-title .armor-common-icon')).toBeVisible();
  await expect(page.locator('.armor-detail .feature-title img.armor-profession-icon')).toHaveCount(0);
});

test('calendar switches exactly at reset, tracks occurrences, shares dates and rejects future completion',async({page})=>{
  await page.clock.setFixedTime(new Date('2026-11-13T15:59:59Z'));await page.goto('/?view=calendar&cKind=mission');await expect(page.locator('.calendar-events .activity-card h3')).toContainText('黑潮');
  await createCharacter(page,'日曆探索者');await page.getByRole('button',{name:'標記本輪已完成',exact:true}).click();await expect(page.getByRole('button',{name:'本輪已完成 · 撤銷'})).toBeVisible();
  await page.clock.setFixedTime(new Date('2026-11-13T16:00:00Z'));await expect(page.locator('.calendar-events .activity-card h3')).toContainText('對抗夏爾');await expect(page.getByRole('button',{name:'標記本輪已完成',exact:true})).toBeVisible();
  await page.getByLabel('選擇日曆日期').fill('2026-11-15');await expect(page.getByRole('button',{name:'尚未開始',exact:true})).toBeDisabled();await page.reload();await expect(page.getByLabel('選擇日曆日期')).toHaveValue('2026-11-15');
  await selectOption(page.getByLabel('日曆時區'), 'UTC');await expect(page).toHaveURL(/tz=UTC/);await page.reload();await expect(page.getByLabel('日曆時區')).toHaveAttribute('data-value', 'UTC');
  await selectOption(page.getByLabel('活動類別'), 'traveler');await expect(page.locator('.calendar-events')).toContainText('每帳號每週最多兌換 5 份');await expect(page.locator('.calendar-events .primary')).toHaveCount(0);
  await selectOption(page.getByLabel('活動類別'), 'pve-bonus');await expect(page.locator('.calendar-events .primary')).toHaveCount(0);
  await selectOption(page.getByLabel('活動類別'), 'mission');await page.getByLabel('搜尋活動').fill('Against the Charr');await expect(page.locator('.activity-card')).toHaveCount(1);await page.locator('.activity-details > summary').click();await page.locator('.activity-card .wiki-reference > summary').first().click();await expect(page.locator('.activity-card a[href*="oldid="]').first()).toBeVisible();
});

test('real v1 database upgrades preserve old progress and v1 backup import previews migration',async({page})=>{
  await page.addInitScript(()=>{
    const request=indexedDB.open('mappingout',1);request.onupgradeneeded=()=>request.result.createObjectStore('personal');request.onsuccess=()=>{const db=request.result;const tx=db.transaction('personal','readwrite');tx.objectStore('personal').put({characters:[{id:'old',name:'舊版角色'}],progress:[{characterId:'old',entryId:'skill:0:1',done:true}],notes:[],preferences:{characterId:'old',layers:['skill']}},'state');tx.oncomplete=()=>db.close();};
  });
  await page.goto('/?view=armor');await expect(page.locator('.character-button')).toContainText('舊版角色');await expect(page.getByRole('heading',{name:'防具製作',exact:true})).toBeVisible();
  const old={format:'mappingout-backup',version:1,exportedAt:'2026-11-13T00:00:00Z',data:{characters:[{id:'restored',name:'備份中的角色'}],progress:[],notes:[],preferences:{characterId:'restored',layers:['skill']}}};
  await page.getByLabel('匯入備份檔案').setInputFiles({name:'v1.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(old))});await expect(page.getByRole('dialog')).toContainText('舊版 v1 備份已校驗');await page.getByRole('button',{name:'確認替換並恢復'}).click();await expect(page.locator('.character-button')).toContainText('備份中的角色');
});

test('feature data, lazy pages and visited armor previews work offline on a narrow screen',async({page,context})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/?view=armor');await expect(page.locator('.armor-previews img').first()).toBeVisible();await readyWorker(page);
  await expect.poll(()=>page.evaluate(()=>Array.from(document.querySelectorAll<HTMLImageElement>('.armor-previews img')).every(img=>img.complete&&img.naturalWidth>0))).toBe(true);
  await expect.poll(()=>page.evaluate(async()=>{const img=document.querySelector<HTMLImageElement>('.armor-previews img');return !!img&&!!await caches.match(img.src);})).toBe(true);
  await expect.poll(()=>page.evaluate(async()=>!!await caches.match(new URL('data/armor.json',location.href)))).toBe(true);
  await expect.poll(()=>page.evaluate(async()=>Promise.all(['data/i18n/zh-TW/armor.json','data/i18n/en/armor.json'].map(path=>caches.match(new URL(path,location.href)))).then(results=>results.every(Boolean)))).toBe(true);
  await page.getByLabel('搜尋護甲或製作商').fill('Warrior Obsidian armor');
  await page.locator('.armor-result').first().click();
  await expect(page.getByTestId('armor-materials').locator('img')).toHaveCount(4);
  await expect.poll(()=>page.getByTestId('armor-materials').locator('img').evaluateAll(images=>images.every(image=>(image as HTMLImageElement).naturalWidth>0))).toBe(true);
  await expect.poll(()=>page.getByTestId('armor-materials').locator('img').evaluateAll(async images=>(await Promise.all(images.map(image=>caches.match((image as HTMLImageElement).src)))).every(Boolean))).toBe(true);
  await page.getByRole('button',{name:'活動日曆',exact:true}).click();await expect(page.locator('.current-activities')).toBeVisible();
  await page.getByRole('button',{name:'防具製作',exact:true}).click();await expect(page.locator('.armor-results')).toBeVisible();
  await context.setOffline(true);await page.reload();await expect(page.getByRole('heading',{name:'防具製作',exact:true})).toBeVisible();await expect.poll(()=>page.evaluate(()=>document.querySelector<HTMLImageElement>('.armor-previews img')?.naturalWidth||0)).toBeGreaterThan(0);
  await page.goto('/?view=armor&aq=Warrior+Obsidian+armor');
  await expect(page.getByTestId('armor-materials').locator('img')).toHaveCount(4);
  await expect.poll(()=>page.getByTestId('armor-materials').locator('img').evaluateAll(images=>images.every(image=>(image as HTMLImageElement).naturalWidth>0))).toBe(true);
  await page.getByRole('button',{name:'活動日曆',exact:true}).click();await expect(page.locator('.month-grid button')).toHaveCount(42);await expect(page.locator('.activity-card').first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
