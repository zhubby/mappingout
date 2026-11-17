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
  await page.locator('.character-button').click();await page.getByLabel('角色名',{exact:true}).fill(name);
  await page.getByRole('dialog').getByRole('button',{name:'创建探索者',exact:true}).click();
  await page.getByRole('button',{name:'关闭弹窗'}).click();
}
async function readyWorker(page:Page){await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));});}
test('campaign and bilingual search persist while difficulty keeps the selected mission',async({page})=>{
  await page.goto(url('The Great Northern Wall'));
  await expect(page.locator('.quest-title [lang=en]')).toHaveText('The Great Northern Wall');
  await selectOption(page.getByLabel('任务难度',{exact:true}),'hard');
  await expect(page.locator('.quest-title [lang=en]')).toHaveText('The Great Northern Wall');
  await expect(page).toHaveURL(/qMode=hard/);
  await selectOption(page.getByLabel('攻略篇章',{exact:true}),'all');
  await page.getByLabel('搜索任务',{exact:true}).fill('Cleansing Bukdek Byway');
  await expect(page.locator('.quest-title [lang=en]')).toHaveText('Cleansing Bukdek Byway (Hard mode)');
  await page.reload();await expect(page.getByLabel('攻略篇章',{exact:true})).toHaveAttribute('data-value','all');
  const chinese=await page.locator('#quest-title').innerText();
  await page.getByLabel('搜索任务',{exact:true}).fill(chinese.trim());
  await expect(page.locator('#quest-title')).toContainText(chinese.trim());
  await selectOption(page.getByLabel('Language / 语言'),'en');
  await expect(page.locator('#quest-title')).toContainText('Cleansing Bukdek Byway (Hard mode)');
  await expect(page.locator('select')).toHaveCount(0);
});
test('character completion and bonus survive reload, isolate modes and round-trip a v3 backup',async({page})=>{
  await page.goto(url('The Great Northern Wall'));await expect(page.locator('#quest-title')).toBeVisible();
  await createCharacter(page,'任务角色甲');
  await page.getByLabel('额外奖励已完成',{exact:true}).check();
  await expect(page.getByLabel('额外奖励已完成',{exact:true})).toBeChecked();
  await expect(page.getByRole('button',{name:'标记任务完成',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'标记任务完成',exact:true}).click();
  await expect(page.getByRole('button',{name:'已完成 · 撤销',exact:true})).toBeVisible();
  await selectOption(page.getByLabel('任务难度',{exact:true}),'hard');
  await expect(page.getByLabel('额外奖励已完成',{exact:true})).not.toBeChecked();
  await selectOption(page.getByLabel('任务难度',{exact:true}),'normal');
  await page.reload();await expect(page.getByLabel('额外奖励已完成',{exact:true})).toBeChecked();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'数据备份',exact:true}).click();await page.getByRole('button',{name:/导出个人数据/}).click();
  const backup=JSON.parse(fs.readFileSync((await (await download).path())!,'utf8'));
  expect(backup.version).toBe(3);expect(backup.data.questProgress).toHaveLength(1);
  await page.getByRole('button',{name:'关闭弹窗'}).click();await createCharacter(page,'任务角色乙');
  await expect(page.getByLabel('额外奖励已完成',{exact:true})).not.toBeChecked();
  await page.getByLabel('导入备份文件').setInputFiles({name:'quests-v3.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await expect(page.getByRole('dialog')).toContainText('1 条任务记录');
  await page.getByRole('button',{name:'确认替换并恢复'}).click();await expect(page.getByLabel('额外奖励已完成',{exact:true})).toBeChecked();
});
test('master rewards and manually confirmed prerequisites belong to the selected character',async({page})=>{
  await page.goto(url('Minister Cho\'s Estate'));await expect(page.locator('#quest-title')).toBeVisible();await createCharacter(page,'大师记录');
  await selectOption(page.getByLabel('任务奖励等级',{exact:true}),'3');
  await expect(page.getByRole('button',{name:'已完成 · 撤销',exact:true})).toBeVisible();
  await page.goto(url('Vizunah Square'));await page.locator('.quest-access>summary').click();
  const condition=page.getByRole('combobox',{name:/确认领取条件/}).first();
  await expect(condition).toHaveAttribute('data-value','');await selectOption(condition,'yes');await page.reload();
  await page.locator('.quest-access>summary').click();await expect(page.getByRole('combobox',{name:/确认领取条件/}).first()).toHaveAttribute('data-value','yes');
});
test('calendar and guides share the current rotation record without conflating permanent completion',async({page})=>{
  await page.clock.setFixedTime(new Date('2026-11-13T15:59:59Z'));await page.goto('/?view=calendar&cKind=mission');
  await expect(page.locator('.activity-card')).toHaveCount(1);await createCharacter(page,'悬赏角色');
  await page.getByRole('button',{name:'打开任务攻略',exact:true}).click();await expect(page.locator('#quest-title')).toBeVisible();
  await page.getByRole('button',{name:'标记本轮已完成',exact:true}).click();await expect(page.getByRole('button',{name:'本轮已完成 · 撤销',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'标记任务完成',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'查看悬赏日历与本期记录',exact:true}).click();
  await expect(page.getByRole('button',{name:'本轮已完成 · 撤销',exact:true})).toBeVisible();
});
test('unvisited guides and route maps open offline on a narrow screen',async({page,context})=>{
  test.setTimeout(60000);await page.setViewportSize({width:390,height:844});await page.goto('/');await readyWorker(page);
  await context.setOffline(true);await page.goto(url('The Great Northern Wall'));
  await expect(page.locator('.quest-article')).toBeVisible();await expect(page.locator('.quest-guide-body')).toContainText(/./);
  await page.locator('.quest-route-maps').scrollIntoViewIfNeeded();
  await expect.poll(()=>page.locator('.quest-images img').evaluateAll(images=>images.length>0&&images.every(img=>(img as HTMLImageElement).naturalWidth>0))).toBe(true);
  await page.getByRole('button',{name:'放大路线图 1',exact:true}).click();await expect(page.getByRole('dialog',{name:'路线图预览'})).toBeVisible();await page.keyboard.press('Escape');
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
  await page.route('**/data/quests.json',route=>route.fulfill({status:404,body:'missing'}));
  await page.goto('/?view=quests');await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('旧版离线资料包可能尚未包含任务攻略。')).toBeVisible();
  await page.getByRole('button',{name:'世界地图',exact:true}).click();await expect(page.locator('.leaflet-container')).toBeVisible();
  await page.getByRole('button',{name:'护甲制作',exact:true}).click();await expect(page.getByRole('heading',{name:'护甲制作',exact:true})).toBeVisible();
});
