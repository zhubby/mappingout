import { expect, test } from '@playwright/test';

test('NPC skills keep mode, mission and level conditions without subsection headings', async ({ page }) => {
  for (const [id, condition] of [
    ['boss:1:18f9e0515f33e488', 'Earth Shaker (elite, Hard mode only)'],
    ['boss:2:11dea906d48da837', 'Shadow Form (elite; only during the Eternal Grove and Unwaking Waters missions)'],
    ['boss:2:609442ae935712a6', 'Shadow Shroud (elite) (levels 25, 28, and 30 only)']
  ]) {
    await page.goto(`/?kind=boss&selected=${encodeURIComponent(id)}`);
    await page.getByText('完整技能与出现条件（英文）', { exact: true }).click();
    await expect(page.locator('.npc-skill-source')).toBeVisible();
    await expect(page.locator('.npc-skill-source')).toContainText(condition);
  }
});

test('area review separates missions, dungeons and genuine vanquishing targets', async ({ page }) => {
  await page.goto('/?kind=zone&selected=zone%3A4%3A330');
  await expect(page.locator('.english-name')).toHaveText('Battledepths');
  await expect(page.locator('.progress-section')).toHaveCount(0);
  await expect(page.locator('.detail-stat').filter({ hasText: '不能清剿' })).toBeVisible();
  await page.goto('/?kind=zone&selected=zone%3A4%3A352');
  await expect(page.locator('.english-name')).toHaveText('Shards of Orr');
  await expect(page.locator('.progress-section')).toHaveCount(0);
  await page.goto('/?kind=zone&selected=zone%3A2%3A146');
  await expect(page.locator('.english-name')).toHaveText('Raisu Palace');
  await expect(page.locator('.progress-section')).toHaveCount(0);
  await page.getByLabel('篇章筛选').selectOption('2');
  await page.getByLabel('地区筛选').selectOption('2:1');
  await page.getByRole('textbox', { name: '搜索资料' }).fill('Raisu Palace (explorable area)');
  await page.locator('.result').first().click();
  await expect(page.locator('.english-name')).toHaveText('Raisu Palace (explorable area)');
  await page.getByLabel('区域筛选').selectOption('gww:10970');
  await expect(page.locator('.result')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '标记已清剿', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /定位地点/ })).toHaveCount(0);
  await page.getByRole('button', { name: '标记已清剿', exact: true }).click();
  await page.getByRole('textbox', { name: '角色名' }).fill('区域核对者');
  await page.getByRole('button', { name: '创建探索者', exact: true }).last().click();
  await page.getByRole('button', { name: '关闭弹窗' }).click();
  await page.getByRole('button', { name: '标记已清剿', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: '已完成 · 点击撤销', exact: true })).toBeVisible();
  await expect(page.locator('.english-name')).toHaveText('Raisu Palace (explorable area)');
  await expect(page.getByLabel('区域筛选')).toHaveValue('gww:10970');
});

test('quest sources retain legacy search and suppress unconfirmed map targets', async ({ page }) => {
  await page.goto('/?kind=boss&selected=boss%3A4%3Ad7559ebaf4f6df63');
  await expect(page.locator('.detail-title-row h2')).toContainText('技能获取');
  await expect(page.locator('.detail-stat').filter({ hasText: 'Prenuptial Disagreement (female)' })).toBeVisible();
  await expect(page.locator('.detail-stat').filter({ hasText: 'Prenuptial Disagreement (male)' })).toBeVisible();
  await expect(page.getByRole('button', { name: '定位地点 1', exact: true })).toBeDisabled();
  await expect(page.locator('.atlas-marker.chosen')).toHaveCount(0);
  await page.getByLabel('搜索资料').fill('奥伦·奥拉夫多蒂尔');
  await expect(page.locator('.result').first()).toBeVisible();
});

test('equipment distinguishes random skins, unique versions and unresolved identities', async ({ page }) => {
  await page.goto('/?kind=green&selected=green%3A4%3A7b9386f35d7ca447');
  await expect(page.locator('.description')).toContainText('随机属性装备');
  await expect(page.locator('.detail-stat').filter({ hasText: '没有一套固定需求与词缀' })).toBeVisible();
  await page.goto('/?kind=green&selected=green%3A4%3Aecf1ba7c4a1af6ae');
  await expect(page.locator('.english-name')).toHaveText('Bonecage Scythe (unique)');
  await expect(page.locator('.description')).toContainText('独特武器');
  await page.goto('/?kind=green&selected=green%3A4%3Afa6b4893b980e1a7');
  await expect(page.locator('.wiki-pending')).toContainText('身份尚未确定');
  await expect(page.getByRole('button', { name: '定位地点 1', exact: true })).toBeDisabled();
});
test('Wiki content supports bilingual search, revisions, PvP differences and skill learning', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: '搜索资料' }).fill('Tainted Flesh');
  await page.locator('.result').first().click();
  await expect(page.locator('.english-name')).toHaveText('Tainted Flesh');
  await expect(page.locator('.wiki-badge')).toContainText('中文校订');
  await expect(page.locator('.wiki-provenance a[href*="oldid="]')).toHaveCount(1);
  await page.getByText('查看旧版资料原文', { exact: true }).click();
  await expect(page.locator('.wiki-disclosure[open]')).toContainText('查看旧版资料原文');
  await page.getByRole('textbox', { name: '搜索资料' }).fill('Hundred Blades');
  await page.locator('.result').first().click();
  await expect(page.getByRole('heading', { name: 'PvP 版本 · 英文原文', exact: true })).toBeVisible();
  await expect(page.locator('.detail-stat').filter({ hasText: '冷却：20 秒' })).toBeVisible();
  await page.goto('/?kind=skill&selected=skill%3A4%3A295');
  await expect(page.getByRole('button', { name: '标记已学会', exact: true })).toBeVisible();
  await page.goto('/?kind=skill&selected=skill%3A3%3A292');
  await expect(page.locator('.english-name')).toHaveText('Junundu Siege');
  await expect(page.locator('.progress-section')).toHaveCount(0);
});

test('story guide keeps plot spoilers collapsed and preserves alternative routes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '剧情指南', exact: true }).click();
  await expect(page.getByRole('heading', { name: '剧情指南', exact: true })).toBeVisible();
  await expect(page.locator('.story-guide')).toHaveCount(4);
  await expect(page.locator('.story-guide[open]')).toHaveCount(0);
  const nightfall = page.locator('.story-guide').nth(2);
  await nightfall.locator('summary').click();
  await expect(nightfall.locator('.story-note').filter({ hasText: '二选一' })).toBeVisible();
  await expect(nightfall.locator('a[href*="oldid="]')).toHaveCount(2);
});

test('collector detail uses the correct NPC and cost-specific trade variant', async ({ page }) => {
  await page.goto('/?kind=collector&selected=collector%3A3%3A128');
  await expect(page.locator('.english-name')).toHaveText('Kaya (collector)');
  await expect(page.locator('.description')).toContainText('Vehtendi Valley');
  await expect(page.locator('.detail-stat').first()).toContainText('5 Heket Tongue');
  await page.goto('/?kind=collector&selected=collector%3A2%3A179');
  await expect(page.locator('.detail-stat').first()).toContainText('3 Imperial Commendation');
  await expect(page.locator('.detail-stat').filter({ hasText: 'Forbidden Key' })).toBeVisible();
  await expect(page.locator('.detail-stat').filter({ hasText: 'Identification Kit · Uses remaining: 25' })).toHaveCount(0);
  await page.goto('/?kind=collector&selected=collector%3A3%3A175');
  await expect(page.locator('.english-name')).toHaveText('Smuggler (mesmer)');
  await expect(page.locator('.detail-stat').first()).toContainText('1 Kournan Coin');
});

test('search, map location, share URL and responsive layout',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/'); await expect(page.getByRole('heading',{name:/探索未知/})).toBeVisible();
  await page.getByRole('textbox',{name:'搜索资料'}).fill('劈击');
  await page.locator('.result').filter({hasText:'劈击'}).first().click();
  await expect(page.locator('.detail-title-row h2')).toHaveText('劈击');
  await page.getByRole('button',{name:'定位地点 1',exact:true}).click();
  await expect(page.locator('.atlas-marker.chosen').first()).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>{const p=document.querySelector('.atlas-marker.chosen')!.getBoundingClientRect(),m=document.querySelector('.leaflet-host')!.getBoundingClientRect();return Math.abs(p.x+13-m.x-m.width/2)+Math.abs(p.y+13-m.y-m.height/2);})).toBeLessThan(3);
  const url=page.url();await page.reload();await expect(page.locator('.detail-title-row h2')).toHaveText('劈击');expect(page.url()).toBe(url);
  await page.getByRole('button',{name:'放大',exact:true}).click();await page.getByRole('button',{name:'显示完整地图'}).click();
  await page.setViewportSize({width:390,height:844});await expect(page.getByTestId('atlas-map')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>{const p=document.querySelector('.atlas-marker.chosen')!.getBoundingClientRect(),m=document.querySelector('.leaflet-host')!.getBoundingClientRect();return Math.abs(p.x+13-m.x-m.width/2)+Math.abs(p.y+13-m.y-m.height/2);})).toBeLessThan(3);
  await page.locator('.mobile-nav').getByRole('button',{name:'查询'}).click();await expect(page.getByRole('textbox',{name:'搜索资料'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);expect(errors).toEqual([]);
});
test('character isolation, notes, backup preview and recovery',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'创建探索者',exact:true}).click();
  await page.getByRole('textbox',{name:'角色名'}).fill('伊洛那旅人');await page.getByRole('button',{name:'创建探索者',exact:true}).last().click();
  await page.getByRole('button',{name:'关闭弹窗'}).click();
  await page.getByRole('textbox',{name:'搜索资料'}).fill('劈击');await page.locator('.result').first().click();
  await page.getByRole('button',{name:'标记已捕获'}).click();await expect(page.getByRole('button',{name:'已完成 · 点击撤销'})).toBeVisible();
  await page.reload();await expect(page.getByRole('button',{name:'已完成 · 点击撤销'})).toBeVisible();
  await page.getByRole('button',{name:'添加笔记'}).click();await page.getByTestId('atlas-map').click({position:{x:300,y:300}});
  await page.getByRole('textbox',{name:'笔记内容'}).fill('从这里开始');await page.getByRole('button',{name:'保存笔记'}).click();
  await page.getByRole('button',{name:'数据备份',exact:true}).click();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:/导出个人数据/}).click();const download=await downloadPromise;const filename=await download.path();
  await page.getByRole('button',{name:'关闭弹窗'}).click();await page.getByRole('button',{name:'管理角色'}).click();
  await page.getByRole('textbox',{name:'角色名'}).fill('第二位角色');await page.getByRole('button',{name:'创建探索者',exact:true}).click();await page.getByRole('button',{name:'关闭弹窗'}).click();
  await expect(page.getByRole('button',{name:'标记已捕获'})).toBeVisible();
  await page.getByRole('button',{name:'数据备份',exact:true}).click();await page.getByLabel('导入备份文件').setInputFiles(filename!);
  await expect(page.getByText('1 位角色', {exact:true})).toBeVisible();await page.getByRole('button',{name:'确认替换并恢复'}).click();
  await expect(page.getByRole('button',{name:'已完成 · 点击撤销'})).toBeVisible();await expect(page.locator('.atlas-marker.note')).toHaveCount(1);
  await page.getByLabel('导入备份文件').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":99}')});await expect(page.getByRole('status')).toContainText('不支持');await expect(page.getByRole('button',{name:'已完成 · 点击撤销'})).toBeVisible();
});
test('all categories and offline visited resources',async({page,context})=>{
  await page.goto('/');await expect(page.locator('.result').first()).toBeVisible();
  for(const name of ['Boss / 来源','装备','收藏家','宠物','宝藏','区域']) { await page.getByRole('button',{name,exact:true}).first().click(); await page.locator('.result').first().click();await expect(page.locator('.detail-title-row h2')).toBeVisible(); }
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise<void>(r=>navigator.serviceWorker.addEventListener('controllerchange',()=>r(),{once:true}));});
  await expect(page.locator('.leaflet-image-layer')).toBeVisible();await page.waitForFunction(()=>{const i=document.querySelector('.leaflet-image-layer') as HTMLImageElement;return i?.complete&&i.naturalWidth>0;});
  await expect.poll(async()=>page.evaluate(async()=>{const i=document.querySelector('.leaflet-image-layer') as HTMLImageElement;return !!await caches.match(i.src);})).toBe(true);
  await context.setOffline(true);await page.reload();await expect(page.getByTestId('atlas-map')).toBeVisible();await expect(page.locator('.result').first()).toBeVisible();
  await page.waitForFunction(()=>{const i=document.querySelector('.leaflet-image-layer') as HTMLImageElement;return i?.complete&&i.naturalWidth>0;});await context.setOffline(false);
});
test('treasure dates, vanquishing, filters and layer switches persist',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'创建探索者',exact:true}).click();await page.getByRole('textbox',{name:'角色名'}).fill('成就记录者');await page.getByRole('button',{name:'创建探索者',exact:true}).last().click();await page.getByRole('button',{name:'关闭弹窗'}).click();
  await page.getByRole('button',{name:'宝藏',exact:true}).first().click();await page.locator('.result').first().click();await page.getByLabel('宝藏开启日期').fill('2026-01-15');await page.getByRole('button',{name:'标记已开启'}).click();await page.reload();await expect(page.getByText('上次开启：2026-01-15')).toBeVisible();
  await page.getByRole('button',{name:'区域',exact:true}).first().click();await page.getByText('仅显示可追踪的未完成目标').click();await page.locator('.result').first().click();await page.getByRole('button',{name:'标记已清剿'}).click();await expect(page.getByRole('button',{name:'已完成 · 点击撤销'})).toBeVisible();
  await page.getByText('仅显示可追踪的未完成目标').click();await page.getByRole('button',{name:'技能',exact:true}).first().click();await page.getByLabel('篇章筛选').selectOption('2');await page.getByLabel('地区筛选').selectOption('2:2');await page.getByLabel('职业筛选').selectOption('7');
  await expect(page.locator('.result').first()).toBeVisible();await expect(page.getByLabel('地图地区')).toHaveValue('2:2');
  await page.locator('.result').first().click();await expect(page.locator('.atlas-marker.skill.chosen').first()).toBeVisible();
  const layer=page.locator('.legend-items').getByRole('button',{name:'技能',exact:false});await layer.click();await expect(layer).toHaveAttribute('aria-pressed','false');await expect(page.locator('.atlas-marker.skill')).toHaveCount(0);await page.reload();await expect(page.locator('.legend-items').getByRole('button',{name:'技能',exact:false})).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('.atlas-marker.skill')).toHaveCount(0);
});
test('type changes clear hidden filters and regional results locate within their region',async({page})=>{
  await page.goto('/');await page.locator('.result').first().waitFor();
  await page.getByLabel('职业筛选').selectOption('1');await page.getByLabel('技能属性筛选').selectOption('精通斧术');
  await page.getByRole('button',{name:'Boss / 来源',exact:true}).first().click();
  await expect(page.getByLabel('技能属性筛选')).toHaveCount(0);await expect(page.locator('.result').first()).toBeVisible();
  expect(new URL(page.url()).searchParams.has('attribute')).toBe(false);
  await page.getByRole('button',{name:'装备',exact:true}).first().click();
  await expect(page.getByLabel('职业筛选')).toHaveCount(0);await expect(page.locator('.result').first()).toBeVisible();
  expect(new URL(page.url()).searchParams.has('profession')).toBe(false);
  await page.goto('/?kind=skill&campaign=2&region=2%3A2&map=2%3A2&q='+encodeURIComponent('劈击'));
  await page.locator('.result').first().click();
  await expect(page.getByLabel('地图地区')).toHaveValue('2:2');await expect(page.getByLabel('地区筛选')).toHaveValue('2:2');
  await expect(page.locator('.atlas-marker.chosen').first()).toBeVisible();
  await page.reload();await expect(page.getByLabel('地图地区')).toHaveValue('2:2');
  await page.goto('/?kind=boss&attribute='+encodeURIComponent('精通斧术'));
  await expect(page.locator('.result').first()).toBeVisible();
  expect(new URL(page.url()).searchParams.has('attribute')).toBe(false);
});
test('tabs synchronize progress and a stale tab cannot overwrite it',async({page,context})=>{
  await page.goto('/');await page.getByRole('button',{name:'创建探索者',exact:true}).click();
  await page.getByRole('textbox',{name:'角色名'}).fill('跨页探索者');await page.getByRole('button',{name:'创建探索者',exact:true}).last().click();await page.getByRole('button',{name:'关闭弹窗'}).click();
  const other=await context.newPage();await other.goto('/');await other.locator('.result').first().waitFor();
  const stale=await context.newPage();
  await stale.addInitScript(()=>Object.defineProperty(globalThis,'BroadcastChannel',{value:undefined,configurable:true}));
  await stale.goto('/');await stale.locator('.result').first().waitFor();
  await page.getByLabel('搜索资料').fill('劈击');await page.locator('.result').first().click();await page.getByRole('button',{name:'标记已捕获'}).click();
  await expect(other.locator('.character-summary small')).toHaveText('已记录 1 个技能');
  await expect(stale.locator('.character-summary small')).toHaveText('已记录 0 个技能');
  const layer=stale.locator('.legend-items').getByRole('button',{name:'Boss / 来源',exact:false});await layer.click();await expect(layer).toHaveAttribute('aria-pressed','false');
  await expect(stale.locator('.character-summary small')).toHaveText('已记录 1 个技能');
  await page.reload();await expect(page.getByRole('button',{name:'已完成 · 点击撤销'})).toBeVisible();
  await page.getByLabel('搜索资料').fill('毁灭之鎚');await page.locator('.result').first().click();
  await other.getByLabel('搜索资料').fill('战斗愤怒');await other.locator('.result').first().click();
  await Promise.all([page.getByRole('button',{name:'标记已捕获'}).click(),other.getByRole('button',{name:'标记已捕获'}).click()]);
  await expect(page.locator('.character-summary small')).toHaveText('已记录 3 个技能');await expect(other.locator('.character-summary small')).toHaveText('已记录 3 个技能');
  await page.reload();await expect(page.locator('.character-summary small')).toHaveText('已记录 3 个技能');
  await other.close();await stale.close();
});
test('opening the report preserves the HTML shell for offline reloads',async({page,context})=>{
  await page.goto('/');await page.locator('.result').first().waitFor();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise<void>(r=>navigator.serviceWorker.addEventListener('controllerchange',()=>r(),{once:true}));});
  await page.getByRole('button',{name:'资料说明'}).click();
  const popupPromise=page.waitForEvent('popup');await page.getByRole('link',{name:'查看完整数据校验报告'}).click();const popup=await popupPromise;await popup.waitForLoadState();
  await expect.poll(()=>page.evaluate(async()=>!!await caches.match(new URL('data/report.json',location.href)))).toBe(true);
  expect(await page.evaluate(async()=>(await caches.match(location.origin+'/'))?.headers.get('content-type'))).toContain('text/html');
  await popup.close();await context.setOffline(true);await page.reload();await expect(page.getByTestId('atlas-map')).toBeVisible();await expect(page.locator('.result').first()).toBeVisible();
  await context.setOffline(false);
});
