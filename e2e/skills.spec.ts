/**
 * [INPUT]: 依赖生产技能页、自定义菜单与本地资料。
 * [OUTPUT]: 验证检索边界、任务跳转、成长与手机离线流程。
 * [POS]: 技能功能浏览器验收；不模拟技能目录或计算结果。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {test,expect} from '@playwright/test';
import {selectOption} from './select';
test('Traditional query guidance and point units work with displayed title names',async({page},testInfo)=>{
 await page.goto('/?view=skills');
 const search=page.getByRole('textbox',{name:'搜尋技能'});
 await expect(search).toHaveAttribute('placeholder','Healing Signet · 職業:戰士 治療>=150');
 await page.locator('.skill-query-help > summary').click();
 await expect(page.locator('.skill-query-help button').first()).toHaveText('職業:戰士 治療>=150');
 await expect(page.locator('.skill-query-help')).not.toContainText('标签');
 await search.fill('屬性:戴爾狄摩排名');
 await expect(page.locator('.skill-result')).toHaveCount(14);
 await search.fill('屬性:戴爾狄摩排名 能量>=5點');
 await expect(page.locator('.skill-result')).toHaveCount(11);
 await expect(page.locator('.skill-query-error')).toHaveCount(0);
 await page.screenshot({path:testInfo.outputPath('traditional-query.png'),animations:'disabled'});
});
test('resource ranges accept scientific notation without losing the page',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/?view=skills&sq=名称:"Distracting Shot"');
 await expect(page.locator('.skill-result')).toHaveCount(1);
 await page.locator('.skill-filter-panel > summary').click();
 await page.locator('.skill-resource-ranges > summary').click();
 const minimum=page.getByRole('spinbutton',{name:'能量 最低',exact:true});
 await minimum.fill('1e-7');
 await expect(minimum).toHaveValue('1e-7');
 await expect(page.locator('.skill-result')).toHaveCount(1);
 await minimum.fill('1e21');
 await expect(page.locator('.skill-result')).toHaveCount(0);
 await page.reload();
 await expect(page.getByRole('heading',{name:'職業技能',exact:true})).toBeVisible();
 await expect(page.locator('.skill-result')).toHaveCount(0);
 expect(errors).toEqual([]);
});
test('skill acquisition opens the requested normal quest after browsing hard mode',async({page})=>{
 await page.goto('/?view=skills&qMode=hard&sq=名称:"Healing Signet"');
 await expect(page.locator('.skill-acquisition')).toBeVisible();
 await page.locator('.skill-acquisition-links').first().getByRole('button',{name:'任務攻略',exact:true}).click();
 await expect(page.locator('.quest-title')).toContainText('Warrior Test');
 await expect(page.getByRole('combobox',{name:'任務難度'})).toHaveAttribute('data-value','normal');
 await expect(page).toHaveURL(/quest=quest%3Agww%3A11772(?:&|$)/);
});
test('signed armor penalties remain negative in effects and numeric searches',async({page})=>{
 await page.goto('/?view=skills&sq=名称:"Healing Signet" 护甲<=-40');
 await expect(page.locator('.skill-result')).toHaveCount(1);
 await expect(page.locator('.skill-effect-number').filter({hasText:'-40'})).toBeVisible();
});
test('skill tab searches names, numeric effects and restores share links',async({page})=>{
 await page.goto('/?view=skills&sq="Healing Signet"');
 await expect(page.getByRole('heading',{name:'職業技能',exact:true})).toBeVisible();
 await expect(page.locator('.skill-article')).toContainText('Healing Signet');
 await page.getByRole('textbox',{name:'搜尋技能'}).fill('名称:"Healing Signet" 治疗>=150');
 await expect(page.locator('.skill-result')).toHaveCount(1);
 await page.getByRole('spinbutton',{name:'屬性等級'}).fill('0');
 await expect(page.locator('.skill-result')).toHaveCount(0);
 await page.getByRole('spinbutton',{name:'屬性等級'}).fill('12');
 await expect(page.locator('.skill-result')).toHaveCount(1);
 await page.reload();
 await expect(page.getByRole('textbox',{name:'搜尋技能'})).toHaveValue('名称:"Healing Signet" 治疗>=150');
 await expect(page.locator('.skill-result')).toHaveCount(1);
});
test('skill version comparison and syntax errors are explicit',async({page})=>{
 await page.goto('/?view=skills&sq=Empathy');
 await expect(page.locator('.skill-article')).toContainText('Empathy');
 await page.locator('.skill-result').first().click();
 await page.getByRole('checkbox',{name:'對照 PvE／PvP'}).check();
 await expect(page.locator('.skill-version-card')).toHaveCount(2);
 await page.getByRole('textbox',{name:'搜尋技能'}).fill('energy<=');
 await expect(page.locator('.skill-query-error')).toBeVisible();
 await page.getByRole('textbox',{name:'搜尋技能'}).fill('版本:PvP 名稱:Empathy');
 await expect(page.locator('.skill-result')).toHaveCount(1);
 await page.getByRole('checkbox',{name:'對照 PvE／PvP'}).uncheck();
 await expect(page.locator('.skill-version-card')).toHaveAttribute('aria-label',/^pvp$/i);
 await expect(page.locator('.skill-result')).toContainText('PvP');
});
test('Wiki resource icons and all menus use local themed controls',async({page})=>{
 await page.goto('/?view=skills&sq=名称:"Distracting Shot"');
 await expect(page.locator('.skill-article')).toContainText('Distracting Shot');
 await expect(page.locator('.skill-article .skill-resources img')).toHaveCount(3);
 const icons=await page.locator('.skill-article .skill-resources img').evaluateAll(images=>images.map(image=>({loaded:(image as HTMLImageElement).naturalWidth>0,src:image.getAttribute('src')})));
 expect(icons.every(icon=>icon.loaded&&icon.src?.includes('assets/skill-resources/'))).toBe(true);
 expect(await page.locator('select').count()).toBe(0);
 await selectOption(page.getByRole('combobox',{name:'技能版本'}),'pvp');
 await expect(page.locator('.skill-result')).toHaveCount(1);
});
test('visited skill details and icons remain usable offline',async({page,context})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/?view=skills&sq="Healing Signet"');
 await expect(page.locator('.skill-article')).toBeVisible();
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));});
 await page.getByRole('textbox',{name:'搜尋技能'}).fill('名称:"Resurrection Signet"');
 await expect(page.locator('.skill-result')).toHaveCount(1);await page.locator('.skill-result').click();
 await expect.poll(()=>page.locator('.skill-article .skill-portrait').evaluate(image=>(image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
 await context.setOffline(true);
 await page.reload();
 await expect(page.locator('.skill-article')).toContainText('Resurrection Signet');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
 expect(await page.locator('.skill-article .skill-portrait').evaluate(image=>(image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});
test('missing legacy skill resources allow other tabs and a successful retry',async({page})=>{
 await page.context().route('**/data/skills.json',route=>route.fulfill({status:404,body:'missing'}));
 await page.goto('/?view=skills');await expect(page.getByRole('alert')).toBeVisible();
 await expect(page.getByText('技能資料未安裝；請更新離線資源後重試。')).toBeVisible();
 await page.getByRole('button',{name:'世界地圖',exact:true}).click();await expect(page.locator('.map-panel')).toBeVisible();
 await page.context().unroute('**/data/skills.json');await page.getByRole('button',{name:'職業技能',exact:true}).click();
 await expect(page.getByRole('heading',{name:'職業技能',exact:true})).toBeVisible();
});
