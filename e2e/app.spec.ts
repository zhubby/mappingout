/**
 * [INPUT]: 依赖生产网页、地图数据和共用菜单操作。
 * [OUTPUT]: 验证职业图例浮框、地图筛选、角色与离线交互。
 * [POS]: 地图浏览器回归；菜单通过可见选项选择。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {selectOption} from './select';
import { expect, test, type Page } from '@playwright/test';

async function expectOriginalName(page:Page,name:string) {
  const source=page.locator('.detail-scroll .original-content');
  await source.locator(':scope > summary').click();
  await expect(source.locator('pre')).toContainText('"englishName": "'+name+'"');
  await source.locator(':scope > summary').click();
  await expect(page.locator('.detail-scroll .english-name')).toHaveCount(0);
}


test('skill markers match all ten professions and keep their collapsed legend available offline on mobile', async ({ page, context, request }, testInfo) => {
  await page.setViewportSize({width:1440, height:900});
  const catalog = await (await request.get('/data/catalog.json')).json();
  const chinese = await (await request.get('/data/i18n/zh-TW/catalog.json')).json();
  const skills = new Map<string, Set<number>>();
  for (const entry of catalog.records.filter((entry: any) => entry.kind === 'skill')) {
    const name = chinese.fields[`records/${entry.id}/name`];
    const professions = skills.get(name) ?? new Set<number>();
    professions.add(entry.profession);
    skills.set(name, professions);
  }
  await page.goto('/?kind=skill&region=3%3A3&map=3%3A3');
  await expect(page.locator('.atlas-marker.skill').first()).toBeVisible();
  const markers = await page.locator('.atlas-marker.skill').evaluateAll(elements => elements.map(element => ({ name: element.getAttribute('aria-label')!.replace(/^技能：/, ''), profession: Number((element as HTMLElement).dataset.profession) })));
  expect([...new Set(markers.map(marker => marker.profession))].sort((a, b) => a - b)).toEqual([1,2,3,4,5,6,7,8,9,10]);
  for (const marker of markers) expect(skills.get(marker.name), marker.name).toContain(marker.profession);
  await page.waitForFunction(() => Array.from(document.querySelectorAll<HTMLImageElement>('.atlas-marker.skill img')).every(image => image.complete && image.naturalWidth > 0));
  const toggle = page.getByRole('button', { name: /技能點 · 職業圖例/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.profession-legend-items')).toBeHidden();
  await expect(page.locator('.map-heading .profession-legend-toggle')).toHaveCount(1);
  await expect(page.getByText('原始地圖 · 地標已核對', {exact:true})).toHaveCount(0);
  await expect(toggle).toHaveText('');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.profession-legend-items li')).toHaveCount(10);
  await page.screenshot({path:testInfo.outputPath('profession-legend-desktop.png'), animations:'disabled'});
  await page.keyboard.press('Escape');
  await expect(page.locator('.profession-legend-items')).toBeHidden();
  await expect(toggle).toBeFocused();
  await toggle.press('Enter');
  await expect(page.locator('.profession-legend-items')).toBeVisible();
  await toggle.press('Tab');
  await expect(page.locator('.profession-legend-items')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(page.locator('.profession-legend-items')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
  });
  await expect.poll(() => page.evaluate(async () => {
    const images = Array.from(document.querySelectorAll<HTMLImageElement>('.profession-legend-items img'));
    return images.length === 10 && (await Promise.all(images.map(async image => image.src.startsWith('data:') || !!await caches.match(image.src, { ignoreVary: true })))).every(Boolean);
  })).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await toggle.click();
  await page.waitForFunction(() => Array.from(document.querySelectorAll<HTMLImageElement>('.profession-legend-items img, .atlas-marker.skill img')).every(image => image.complete && image.naturalWidth > 0));
  await context.setOffline(false);
  await page.locator('.legend-items').getByRole('button', { name: '技能', exact: false }).click();
  await expect(page.locator('.atlas-marker.skill')).toHaveCount(0);
  await expect(page.getByRole('region', { name: '技能職業圖例' })).toHaveCount(0);
  await page.locator('.legend-items').getByRole('button', { name: '技能', exact: false }).click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test.describe('profession legend touch layout', () => {
  test.use({viewport:{width:390, height:844}, isMobile:true, hasTouch:true});

  test('legend stays two rows of five in both languages and closes on outside taps', async ({page}, testInfo) => {
    await page.goto('/?kind=skill&map=3:3');
    for (const locale of ['zh-TW', 'en']) {
      await selectOption(page.getByRole('combobox', {name:'Language / 語言'}), locale);
      const toggle = page.getByRole('button', {name:locale === 'en' ? 'Skill locations · Professions' : '技能點 · 職業圖例', exact:true});
      for (const width of [1440, 820, 390, 320]) {
        await page.setViewportSize({width, height:844});
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await toggle.tap();
        const panel = page.locator('.profession-legend-items');
        await expect(panel).toBeVisible();
        const items = await panel.locator('li').evaluateAll(elements => elements.map(element => {
          const bounds = element.getBoundingClientRect(); return {x:Math.round(bounds.x), y:Math.round(bounds.y)};
        }));
        expect(items).toHaveLength(10);
        expect(new Set(items.map(item => item.x)).size).toBe(5);
        expect(new Set(items.map(item => item.y)).size).toBe(2);
        const bounds = await panel.boundingBox();
        const map = await page.locator('.map-stage').boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(map!.x);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(map!.x + map!.width);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(map!.y + map!.height);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (width === 390 && locale === 'zh-TW') await page.screenshot({path:testInfo.outputPath('profession-legend-mobile.png'), animations:'disabled'});
        await toggle.tap();
        await expect(panel).toBeHidden();
        await toggle.tap();
        await page.getByRole('button', {name:locale === 'en' ? 'Zoom in' : '放大', exact:true}).tap();
        await expect(panel).toBeHidden();
      }
    }
  });
});

test('NPC skills keep mode, mission and level conditions without subsection headings', async ({ page }) => {
  for (const [id, condition] of [
    ['boss:1:18f9e0515f33e488', 'Earth Shaker (elite, Hard mode only)'],
    ['boss:2:11dea906d48da837', 'Shadow Form (elite; only during the Eternal Grove and Unwaking Waters missions)'],
    ['boss:2:609442ae935712a6', 'Shadow Shroud (elite) (levels 25, 28, and 30 only)']
  ]) {
    await page.goto(`/?kind=boss&selected=${encodeURIComponent(id)}`);
    await selectOption(page.getByLabel('Language / 語言'), 'en');
    await page.getByText('Skills and appearance conditions', { exact: true }).click();
    await expect(page.locator('.npc-skill-source')).toBeVisible();
    await expect(page.locator('.npc-skill-source')).toContainText(condition);
  }
});

test('area review separates missions, dungeons and genuine vanquishing targets', async ({ page }) => {
  await page.goto('/?kind=zone&selected=zone%3A4%3A330');
  await selectOption(page.getByLabel('Language / 語言'), 'en');
  await expectOriginalName(page,'Battledepths');
  await expect(page.locator('.progress-section')).toHaveCount(0);
  await expect(page.locator('.detail-stat').filter({ hasText: 'not a vanquishing target' })).toBeVisible();
  await page.goto('/?kind=zone&selected=zone%3A4%3A352');
  await expectOriginalName(page,'Shards of Orr');
  await expect(page.locator('.progress-section')).toHaveCount(0);
  await page.goto('/?kind=zone&selected=zone%3A2%3A146');
  await expectOriginalName(page,'Raisu Palace');
  await expect(page.locator('.progress-section')).toHaveCount(0);
  await selectOption(page.getByLabel('Campaign filter'), '2');
  await selectOption(page.getByLabel('Region filter'), '2:1');
  await page.getByRole('textbox', { name: 'Search information' }).fill('Raisu Palace (explorable area)');
  await page.locator('.result').first().click();
  await expectOriginalName(page,'Raisu Palace (explorable area)');
  await selectOption(page.getByLabel('Area filter'), 'gww:10970');
  await expect(page.locator('.result')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Mark as vanquished', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /定位地點/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mark as vanquished', exact: true }).click();
  await page.getByRole('textbox', { name: 'Character name' }).fill('區域核對者');
  await page.getByRole('button', { name: 'Create an explorer', exact: true }).last().click();
  await page.getByRole('button', { name: 'Close pop-up window' }).click();
  await page.getByRole('button', { name: 'Mark as vanquished', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Completed · Click Undo', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Completed · Click Undo', exact: true })).toBeVisible();
  await expectOriginalName(page,'Raisu Palace (explorable area)');
  await expect(page.getByLabel('Area filter')).toHaveAttribute('data-value', 'gww:10970');
});

test('quest sources retain legacy search and suppress unconfirmed map targets', async ({ page }) => {
  await page.goto('/?kind=boss&selected=boss%3A4%3Ad7559ebaf4f6df63');
  await expect(page.locator('.detail-title-row h2')).toContainText('破碎的婚約');
  const source=page.locator('.detail-scroll .original-content');
  await source.locator(':scope > summary').click();
  await expect(source.locator('pre')).toContainText('Prenuptial Disagreement (female)');
  await expect(source.locator('pre')).toContainText('Prenuptial Disagreement (male)');
  await expect(page.getByRole('button', { name: '定位地點 1', exact: true })).toBeDisabled();
  await expect(page.locator('.atlas-marker.chosen')).toHaveCount(0);
  await page.getByLabel('搜尋資料').fill('奥伦·奥拉夫多蒂尔');
  await expect(page.locator('.result').first()).toBeVisible();
});

test('equipment distinguishes random skins, unique versions and unresolved identities', async ({ page }) => {
  await page.goto('/?kind=green&selected=green%3A4%3A7b9386f35d7ca447');
  await selectOption(page.getByLabel('Language / 語言'), 'en');
  await expect(page.locator('.detail-stat').first()).toContainText('variable stats');
  await expect(page.locator('.detail-stat').filter({ hasText: 'not guaranteed drops' })).toBeVisible();
  await page.goto('/?kind=green&selected=green%3A4%3Aecf1ba7c4a1af6ae');
  await expectOriginalName(page,'Bonecage Scythe (unique)');
  await expect(page.locator('.description')).toContainText('unique scythe');
  await page.goto('/?kind=green&selected=green%3A4%3Afa6b4893b980e1a7');
  await expect(page.locator('.wiki-pending')).toContainText('has not yet been identified');
  await expect(page.getByRole('button', { name: 'Locate location 1', exact: true })).toBeDisabled();
});
test('Wiki content supports bilingual search, revisions, PvP differences and skill learning', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: '搜尋資料' }).fill('Tainted Flesh');
  await page.locator('.result').first().click();
  await expectOriginalName(page,'Tainted Flesh');
  await expect(page.locator('.wiki-badge')).toContainText('本地化資料');
  await expect(page.locator('.wiki-provenance a[href*="oldid="]')).toHaveCount(1);
  await page.getByText('檢視舊版資料原文', { exact: true }).click();
  await expect(page.locator('.wiki-disclosure[open]')).toContainText('檢視舊版資料原文');
  await page.getByRole('textbox', { name: '搜尋資料' }).fill('Hundred Blades');
  await page.locator('.result').first().click();
  await expect(page.getByRole('heading', { name: 'PvP 版本', exact: true })).toBeVisible();
  await expect(page.locator('.detail-stat').filter({ hasText: '冷卻 20 秒' })).toBeVisible();
  await page.goto('/?kind=skill&selected=skill%3A4%3A295');
  await expect(page.getByRole('button', { name: '標記已學會', exact: true })).toBeVisible();
  await page.goto('/?kind=skill&selected=skill%3A3%3A292');
  await expectOriginalName(page,'Junundu Siege');
  await expect(page.locator('.progress-section')).toHaveCount(0);
});

test('story guide keeps plot spoilers collapsed and preserves alternative routes', async ({ page }) => {
  await page.goto('/');
  await selectOption(page.getByLabel('Language / 語言'), 'en');
  await page.getByRole('button', { name: 'Story guides', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Story guides', exact: true })).toBeVisible();
  await expect(page.locator('.story-guide')).toHaveCount(4);
  await expect(page.locator('.story-guide[open]')).toHaveCount(0);
  const nightfall = page.locator('.story-guide').nth(2);
  await nightfall.locator(':scope > summary').click();
  await expect(nightfall.locator('.story-note').filter({ hasText: 'alternative route' })).toBeVisible();
  await expect(nightfall.locator('a[href*="oldid="]')).toHaveCount(2);
});

test('collector detail uses the correct NPC and cost-specific trade variant', async ({ page }) => {
  await page.goto('/?kind=collector&selected=collector%3A3%3A128');
  await selectOption(page.getByLabel('Language / 語言'), 'en');
  await expectOriginalName(page,'Kaya (collector)');
  await expect(page.locator('.description')).toContainText('Vehtendi Valley');
  await expect(page.locator('.detail-stat').first()).toContainText('5 Heket Tongue');
  await page.goto('/?kind=collector&selected=collector%3A2%3A179');
  await expect(page.locator('.detail-stat').first()).toContainText('3 Imperial Commendation');
  await expect(page.locator('.detail-stat').filter({ hasText: 'Forbidden Key' })).toBeVisible();
  await expect(page.locator('.detail-stat').filter({ hasText: 'Identification Kit · Uses remaining: 25' })).toHaveCount(0);
  await page.goto('/?kind=collector&selected=collector%3A3%3A175');
  await expectOriginalName(page,'Smuggler (mesmer)');
  await expect(page.locator('.detail-stat').first()).toContainText('1 Kournan Coin');
});

test('search, map location, share URL and responsive layout',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/'); await expect(page.getByRole('textbox',{name:'搜尋資料'})).toBeVisible();
  await page.getByRole('textbox',{name:'搜尋資料'}).fill('劈擊');
  await page.locator('.result').filter({hasText:'劈擊'}).first().click();
  await expect(page.locator('.detail-title-row h2')).toHaveText('劈擊');
  await page.getByRole('button',{name:'定位地點 1',exact:true}).click();
  await expect(page.locator('.atlas-marker.chosen').first()).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>{const p=document.querySelector('.atlas-marker.chosen')!.getBoundingClientRect(),m=document.querySelector('.leaflet-host')!.getBoundingClientRect();return Math.abs(p.x+13-m.x-m.width/2)+Math.abs(p.y+13-m.y-m.height/2);})).toBeLessThan(3);
  const url=page.url();await page.reload();await expect(page.locator('.detail-title-row h2')).toHaveText('劈擊');expect(page.url()).toBe(url);
  await page.getByRole('button',{name:'放大',exact:true}).click();await page.getByRole('button',{name:'顯示完整地圖'}).click();
  await page.setViewportSize({width:390,height:844});await expect(page.getByTestId('atlas-map')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>{const p=document.querySelector('.atlas-marker.chosen')!.getBoundingClientRect(),m=document.querySelector('.leaflet-host')!.getBoundingClientRect();return Math.abs(p.x+13-m.x-m.width/2)+Math.abs(p.y+13-m.y-m.height/2);})).toBeLessThan(3);
  await page.locator('.mobile-nav').getByRole('button',{name:'查詢'}).click();await expect(page.getByRole('textbox',{name:'搜尋資料'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);expect(errors).toEqual([]);
});
test('character isolation, notes, backup preview and recovery',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'建立探索者',exact:true}).click();
  await page.getByRole('textbox',{name:'角色名'}).fill('伊洛那旅人');await page.getByRole('button',{name:'建立探索者',exact:true}).last().click();
  await page.getByRole('button',{name:'關閉彈窗'}).click();
  await page.getByRole('textbox',{name:'搜尋資料'}).fill('劈擊');await page.locator('.result').first().click();
  await page.getByRole('button',{name:'標記已捕獲'}).click();await expect(page.getByRole('button',{name:'已完成 · 點選撤銷'})).toBeVisible();
  await page.reload();await expect(page.getByRole('button',{name:'已完成 · 點選撤銷'})).toBeVisible();
  await page.getByRole('button',{name:'新增筆記'}).click();await page.getByTestId('atlas-map').click({position:{x:300,y:300}});
  await page.getByRole('textbox',{name:'筆記內容'}).fill('從這裡開始');await page.getByRole('button',{name:'儲存筆記'}).click();
  await page.getByRole('button',{name:'資料備份',exact:true}).click();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:/匯出個人資料/}).click();const download=await downloadPromise;const filename=await download.path();
  await page.getByRole('button',{name:'關閉彈窗'}).click();await page.getByRole('button',{name:'管理角色'}).click();
  await page.getByRole('textbox',{name:'角色名'}).fill('第二位角色');await page.getByRole('button',{name:'建立探索者',exact:true}).click();await page.getByRole('button',{name:'關閉彈窗'}).click();
  await expect(page.getByRole('button',{name:'標記已捕獲'})).toBeVisible();
  await page.getByRole('button',{name:'資料備份',exact:true}).click();await page.getByLabel('匯入備份檔案').setInputFiles(filename!);
  await expect(page.getByText('1 位角色', {exact:true})).toBeVisible();await page.getByRole('button',{name:'確認替換並恢復'}).click();
  await expect(page.getByRole('button',{name:'已完成 · 點選撤銷'})).toBeVisible();await expect(page.locator('.atlas-marker.note')).toHaveCount(1);
  await page.getByLabel('匯入備份檔案').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":99}')});await expect(page.getByRole('status')).toContainText('不支援');await expect(page.getByRole('button',{name:'已完成 · 點選撤銷'})).toBeVisible();
});
test('all categories and offline visited resources',async({page,context})=>{
  await page.goto('/');await expect(page.locator('.result').first()).toBeVisible();
  for(const name of ['Boss / 來源','裝備','收藏家','寵物','寶藏','區域']) { await page.getByRole('button',{name,exact:true}).first().click(); await page.locator('.result').first().click();await expect(page.locator('.detail-title-row h2')).toBeVisible(); }
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise<void>(r=>navigator.serviceWorker.addEventListener('controllerchange',()=>r(),{once:true}));});
  await expect(page.locator('.leaflet-image-layer')).toBeVisible();await page.waitForFunction(()=>{const i=document.querySelector('.leaflet-image-layer') as HTMLImageElement;return i?.complete&&i.naturalWidth>0;});
  await expect.poll(async()=>page.evaluate(async()=>{const i=document.querySelector('.leaflet-image-layer') as HTMLImageElement;return !!await caches.match(i.src);})).toBe(true);
  await context.setOffline(true);await page.reload();await expect(page.getByTestId('atlas-map')).toBeVisible();await expect(page.locator('.result').first()).toBeVisible();
  await page.waitForFunction(()=>{const i=document.querySelector('.leaflet-image-layer') as HTMLImageElement;return i?.complete&&i.naturalWidth>0;});await context.setOffline(false);
});
test('treasure dates, vanquishing, filters and layer switches persist',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'建立探索者',exact:true}).click();await page.getByRole('textbox',{name:'角色名'}).fill('成就記錄者');await page.getByRole('button',{name:'建立探索者',exact:true}).last().click();await page.getByRole('button',{name:'關閉彈窗'}).click();
  await page.getByRole('button',{name:'寶藏',exact:true}).first().click();await page.locator('.result').first().click();await page.getByLabel('寶藏開啟日期').fill('2026-01-15');await page.getByRole('button',{name:'標記已開啟'}).click();await expect(page.getByText('上次開啟：2026-01-15')).toBeVisible();await page.reload();await expect(page.getByText('上次開啟：2026-01-15')).toBeVisible();
  await page.getByRole('button',{name:'區域',exact:true}).first().click();await page.getByText('僅顯示可追蹤的未完成目標').click();await page.locator('.result').first().click();await page.getByRole('button',{name:'標記已清剿'}).click();await expect(page.getByRole('button',{name:'已完成 · 點選撤銷'})).toBeVisible();
  await page.getByText('僅顯示可追蹤的未完成目標').click();await page.getByRole('button',{name:'技能',exact:true}).first().click();await selectOption(page.getByLabel('篇章篩選'), '2');await selectOption(page.getByLabel('地區篩選'), '2:2');await selectOption(page.getByLabel('職業篩選'), '7');
  await expect(page.locator('.result').first()).toBeVisible();await expect(page.getByLabel('地圖地區')).toHaveAttribute('data-value', '2:2');
  await page.locator('.result').first().click();await expect(page.locator('.atlas-marker.skill.chosen').first()).toBeVisible();
  const layer=page.locator('.legend-items').getByRole('button',{name:'技能',exact:false});await layer.click();await expect(layer).toHaveAttribute('aria-pressed','false');await expect(page.locator('.atlas-marker.skill')).toHaveCount(0);await page.reload();await expect(page.locator('.legend-items').getByRole('button',{name:'技能',exact:false})).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('.atlas-marker.skill')).toHaveCount(0);
});
test('type changes clear hidden filters and regional results locate within their region',async({page})=>{
  await page.goto('/');await page.locator('.result').first().waitFor();
  await selectOption(page.getByLabel('職業篩選'), '1');await selectOption(page.getByLabel('技能屬性篩選'), 'axe-mastery');
  await page.getByRole('button',{name:'Boss / 來源',exact:true}).first().click();
  await expect(page.getByLabel('技能屬性篩選')).toHaveCount(0);await expect(page.locator('.result').first()).toBeVisible();
  expect(new URL(page.url()).searchParams.has('attribute')).toBe(false);
  await page.getByRole('button',{name:'裝備',exact:true}).first().click();
  await expect(page.getByLabel('職業篩選')).toHaveCount(0);await expect(page.locator('.result').first()).toBeVisible();
  expect(new URL(page.url()).searchParams.has('profession')).toBe(false);
  await page.goto('/?kind=skill&campaign=2&region=2%3A2&map=2%3A2&q='+encodeURIComponent('劈擊'));
  await page.locator('.result').first().click();
  await expect(page.getByLabel('地圖地區')).toHaveAttribute('data-value', '2:2');await expect(page.getByLabel('地區篩選')).toHaveAttribute('data-value', '2:2');
  await expect(page.locator('.atlas-marker.chosen').first()).toBeVisible();
  await page.reload();await expect(page.getByLabel('地圖地區')).toHaveAttribute('data-value', '2:2');
  await page.goto('/?kind=boss&attribute='+encodeURIComponent('精通斧術'));
  await expect(page.locator('.result').first()).toBeVisible();
  expect(new URL(page.url()).searchParams.has('attribute')).toBe(false);
});
test('tabs synchronize progress and a stale tab cannot overwrite it',async({page,context})=>{
  await page.goto('/');await page.getByRole('button',{name:'建立探索者',exact:true}).click();
  await page.getByRole('textbox',{name:'角色名'}).fill('跨頁探索者');await page.getByRole('button',{name:'建立探索者',exact:true}).last().click();await page.getByRole('button',{name:'關閉彈窗'}).click();
  const other=await context.newPage();await other.goto('/');await other.locator('.result').first().waitFor();
  const stale=await context.newPage();
  await stale.addInitScript(()=>Object.defineProperty(globalThis,'BroadcastChannel',{value:undefined,configurable:true}));
  await stale.goto('/');await stale.locator('.result').first().waitFor();
  await page.getByLabel('搜尋資料').fill('劈擊');await page.locator('.result').first().click();await page.getByRole('button',{name:'標記已捕獲'}).click();
  await expect(other.locator('.character-summary small')).toHaveText('已記錄 1 個技能');
  await expect(stale.locator('.character-summary small')).toHaveText('已記錄 0 個技能');
  const layer=stale.locator('.legend-items').getByRole('button',{name:'Boss / 來源',exact:false});await layer.click();await expect(layer).toHaveAttribute('aria-pressed','false');
  await expect(stale.locator('.character-summary small')).toHaveText('已記錄 1 個技能');
  await page.reload();await expect(page.getByRole('button',{name:'已完成 · 點選撤銷'})).toBeVisible();
  await page.getByLabel('搜尋資料').fill('毁灭之鎚');await page.locator('.result').first().click();
  await other.getByLabel('搜尋資料').fill('战斗愤怒');await other.locator('.result').first().click();
  await Promise.all([page.getByRole('button',{name:'標記已捕獲'}).click(),other.getByRole('button',{name:'標記已捕獲'}).click()]);
  await expect(page.locator('.character-summary small')).toHaveText('已記錄 3 個技能');await expect(other.locator('.character-summary small')).toHaveText('已記錄 3 個技能');
  await page.reload();await expect(page.locator('.character-summary small')).toHaveText('已記錄 3 個技能');
  await other.close();await stale.close();
});
test('opening the report preserves the HTML shell for offline reloads',async({page,context})=>{
  await page.goto('/');await page.locator('.result').first().waitFor();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise<void>(r=>navigator.serviceWorker.addEventListener('controllerchange',()=>r(),{once:true}));});
  await page.getByRole('button',{name:'資料說明'}).click();
  const popupPromise=page.waitForEvent('popup');await page.getByRole('link',{name:'檢視完整資料校驗報告'}).click();const popup=await popupPromise;await popup.waitForLoadState();
  await expect.poll(()=>page.evaluate(async()=>!!await caches.match(new URL('data/report.json',location.href)))).toBe(true);
  expect(await page.evaluate(async()=>(await caches.match(location.origin+'/'))?.headers.get('content-type'))).toContain('text/html');
  await popup.close();await context.setOffline(true);await page.reload();await expect(page.getByTestId('atlas-map')).toBeVisible();await expect(page.locator('.result').first()).toBeVisible();
  await context.setOffline(false);
});
