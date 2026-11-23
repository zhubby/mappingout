/**
 * [INPUT]: 依赖生产网页、真实筛选数据和自定义菜单交互。
 * [OUTPUT]: 验证三级地图导航、空值联动、键盘和手机边界。
 * [POS]: 下拉菜单的浏览器验收；复用现有 Web 构建。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {expect, test} from '@playwright/test';
import {selectOption} from './select';

test('atlas filters use custom menus and preserve empty values independently of map navigation', async ({page}, testInfo) => {
  await page.goto('/');
  const campaign = page.getByRole('combobox', {name:'篇章篩選'});
  await expect(campaign).toBeVisible();
  await expect(page.locator('select:visible')).toHaveCount(0);
  await selectOption(campaign, '2');
  await selectOption(page.getByRole('combobox', {name:'地區篩選'}), '2:1');
  await selectOption(page.getByRole('combobox', {name:'區域篩選'}), 'gww:10970');
  await selectOption(campaign, '1');
  await expect(page.getByRole('combobox', {name:'地區篩選'})).toHaveAttribute('data-value', '');
  await expect(page.getByRole('combobox', {name:'區域篩選'})).toHaveAttribute('data-value', '');
  await selectOption(campaign, '');
  await expect(page.getByRole('combobox', {name:'篇章選擇'})).toHaveAttribute('data-value', '2');
  const map = page.getByRole('combobox', {name:'地圖地區'});
  await map.click();
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(4);
  await expect(page.getByRole('listbox').getByRole('group')).toHaveCount(0);
  await expect(page.getByRole('listbox').locator('[aria-selected="true"]')).toBeInViewport();
  await page.screenshot({path:testInfo.outputPath('map-menu.png'), animations:'disabled'});
  await page.keyboard.press('Escape');
  await expect(map).toBeFocused();
});

test('map chapters constrain regions and follow shared links, reloads and location jumps', async ({page}) => {
  await page.goto('/?campaign=1&map=3:3');
  const chapter = page.getByRole('combobox', {name:'篇章選擇'});
  const map = page.getByRole('combobox', {name:'地圖地區'});
  const filters = page.getByRole('combobox', {name:'篇章篩選'});
  await expect(page.locator('.breadcrumb > span')).toHaveText('世界地圖');
  await expect(page.locator('.breadcrumb').getByRole('combobox')).toHaveCount(2);
  await expect(chapter).toHaveAttribute('data-value', '3');
  await expect(map).toHaveAttribute('data-value', '3:3');
  for (const [value, regions] of [['2', ['2:1','2:2','2:3','2:4']], ['4', ['4:1','4:2','4:3']]] as const) {
    await selectOption(chapter, value);
    await expect(map).toHaveAttribute('data-value', regions[0]);
    await map.click();
    expect(await page.getByRole('listbox').getByRole('option').evaluateAll(options => options.map(option => option.getAttribute('data-value')))).toEqual([...regions]);
    await page.keyboard.press('Escape');
    await selectOption(map, regions.at(-1)!);
    await expect(chapter).toHaveAttribute('data-value', value);
    await expect(filters).toHaveAttribute('data-value', '1');
    await expect.poll(() => new URL(page.url()).searchParams.get('map')).toBe(regions.at(-1));
  }
  await page.reload();
  await expect(chapter).toHaveAttribute('data-value', '4');
  await expect(map).toHaveAttribute('data-value', '4:3');
  await page.goto('/?campaign=1&map=3:3&selected=skill:0:1');
  await expect(chapter).toHaveAttribute('data-value', '3');
  await page.getByRole('button', {name:'定位地點 1', exact:true}).click();
  await expect(chapter).toHaveAttribute('data-value', '1');
  await expect(map).toHaveAttribute('data-value', /^1:/);
  await expect(page.locator('.atlas-marker.chosen').first()).toBeVisible();
});

test('three map levels remain visible in both languages across viewport sizes', async ({page}, testInfo) => {
  await page.goto('/?map=4:1');
  for (const locale of ['zh-TW', 'en']) {
    await selectOption(page.getByRole('combobox', {name:'Language / 語言'}), locale);
    const chapter = page.getByRole('combobox', {name:locale === 'en' ? 'Campaign selection' : '篇章選擇'});
    const map = page.getByRole('combobox', {name:locale === 'en' ? 'Map region' : '地圖地區'});
    for (const width of [1440, 820, 560, 390, 320]) {
      await page.setViewportSize({width, height:920});
      await expect(page.locator('.breadcrumb > span')).toBeVisible();
      await expect(chapter).toBeInViewport();
      await expect(map).toBeInViewport();
      expect(await page.locator('.map-toolbar').evaluate(toolbar => toolbar.scrollWidth <= toolbar.clientWidth)).toBe(true);
      const chapterBounds = await chapter.boundingBox();
      const mapBounds = await map.boundingBox();
      expect(chapterBounds!.x + chapterBounds!.width).toBeLessThanOrEqual(mapBounds!.x);
      await map.click();
      const menu = page.getByRole('listbox');
      const bounds = await menu.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      if (width === 390 && locale === 'zh-TW') await page.screenshot({path:testInfo.outputPath('map-mobile-menu.png'), animations:'disabled'});
      await page.keyboard.press('Escape');
    }
  }
});

test('menus support keyboard navigation, typeahead, cancellation and outside clicks', async ({page}) => {
  await page.goto('/');
  const language = page.getByRole('combobox', {name:'Language / 語言'});
  await language.focus();
  await language.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(language).toBeFocused();
  await language.press('ArrowDown');
  await page.keyboard.press('Home');
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(language).toBeFocused();
  const profession = page.getByRole('combobox', {name:'Profession filter'});
  await profession.click();
  await page.keyboard.type('Ranger');
  await page.keyboard.press('Enter');
  await expect(profession).toHaveAttribute('data-value', '2');
  await profession.press('Home');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(profession).toHaveAttribute('data-value', '2');
  await expect(profession).not.toBeFocused();
  await profession.click();
  await page.getByRole('textbox', {name:'Search information'}).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
});

test('menus follow viewport resizing without horizontal overflow', async ({page}) => {
  await page.goto('/');
  const language = page.getByRole('combobox', {name:'Language / 語言'});
  for (const width of [1440, 820, 560, 390, 320]) {
    await page.setViewportSize({width, height:920});
    await language.click();
    const menu = page.getByRole('listbox');
    await expect(menu).toBeVisible();
    const bounds = await menu.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
  }
});

test.describe('mobile menus', () => {
  test.use({viewport:{width:390, height:844}, isMobile:true, hasTouch:true});

  test('touch menus stay within the viewport and close after selection', async ({page}, testInfo) => {
    await page.goto('/?view=armor');
    const profession = page.getByRole('combobox', {name:'護甲職業'});
    await profession.tap();
    const menu = page.getByRole('listbox');
    await expect(menu).toBeVisible();
    const bounds = await menu.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    await page.screenshot({path:testInfo.outputPath('mobile-menu.png'), animations:'disabled'});
    await menu.locator('[role="option"][data-value="1"]').tap();
    await expect(profession).toHaveAttribute('data-value', '1');
    await expect(menu).toHaveCount(0);
    await expect(page.locator('select:visible')).toHaveCount(0);
  });
});
