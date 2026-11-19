/**
 * [INPUT]: 依赖真实生产桌面界面、IndexedDB 与测试 IPC。
 * [OUTPUT]: 验证全局下载、延期重开、编辑延迟和备份屏障。
 * [POS]: 更新界面回归；不声称验证系统安装器。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {expect, test} from '@playwright/test';
import {selectOption} from './select';
import {finishCheck, nativeBridge, updateActions} from './desktop-updates.fixture';

test('download survives settings closure; Escape defers and next startup backs up before cached install', async ({page}, testInfo) => {
  await nativeBridge(page);
  await page.goto('/');
  await expect(page.getByLabel('客户端设置')).toBeVisible();
  await expect.poll(() => updateActions(page)).toHaveLength(2);
  await page.evaluate(() => (window as any).qa.emit({phase:'downloading', downloaded:40, total:100}));
  await expect(page.getByRole('progressbar', {name:'下载进度'})).toHaveAttribute('value', '40');
  await page.getByLabel('客户端设置').click();
  await page.getByLabel('关闭弹窗').click();
  await finishCheck(page);
  const dialog = page.getByRole('dialog', {name:'新版本已准备好'});
  await expect(dialog).toBeVisible();
  const later = dialog.getByRole('button', {name:'下次打开时更新'});
  await expect(later).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByText('版本说明原文')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(later).toBeFocused();
  await page.screenshot({path:testInfo.outputPath('update-ready.png')});
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('新版本 1.3.0 将在下次打开应用时安装。')).toBeVisible();
  await page.getByLabel('客户端设置').click();
  await page.getByLabel('关闭弹窗').click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect.poll(() => updateActions(page)).toEqual([{command:'desktop_update_status'}, {command:'desktop_update_install'}]);
  const actions = await page.evaluate(() => (window as any).qa.actions);
  expect(actions.slice(0,3).map((item: any) => item.command)).toEqual(['desktop_update_status','write_local_backup','desktop_update_install']);
});

test('finishing a download waits for character editing and immediate installation backs up the committed record', async ({page}) => {
  await nativeBridge(page);
  await page.goto('/');
  await page.getByRole('button', {name:'创建探索者', exact:true}).click();
  await page.getByRole('textbox', {name:'角色名'}).fill('更新前的探索者');
  await finishCheck(page);
  await expect(page.getByRole('dialog', {name:'新版本已准备好'})).toHaveCount(0);
  await page.getByRole('button', {name:'创建探索者', exact:true}).last().click();
  await expect(page.getByRole('textbox', {name:'角色名'})).toHaveValue('');
  await page.getByLabel('关闭弹窗').click();
  await page.getByRole('button', {name:'立即重启更新', exact:true}).click();
  await expect.poll(async () => (await updateActions(page)).at(-1)?.command).toBe('desktop_update_install');
  const actions = await page.evaluate(() => (window as any).qa.actions);
  const install = actions.findIndex((action: any) => action.command === 'desktop_update_install');
  const snapshot = actions[install - 1];
  expect(snapshot.command).toBe('write_local_backup');
  expect(snapshot.content.data.characters.map((character: any) => character.name)).toEqual(['更新前的探索者']);
});

test('update prompt waits until the user leaves an active input', async ({page}) => {
  await nativeBridge(page);
  await page.goto('/');
  await page.getByLabel('搜索资料').fill('劈击');
  await finishCheck(page);
  await expect(page.getByRole('dialog', {name:'新版本已准备好'})).toHaveCount(0);
  await page.getByLabel('客户端设置').focus();
  await expect(page.getByRole('dialog', {name:'新版本已准备好'})).toBeVisible();
});

test('installation backup includes committed quest rewards and character conditions', async ({page}) => {
  await nativeBridge(page);
  await page.goto('/?view=quests&quest=quest%3Agww%3A5154');
  await expect(page.locator('#quest-title')).toBeVisible();
  await expect.poll(() => updateActions(page)).toHaveLength(2);
  await page.getByRole('button', {name:'创建探索者', exact:true}).click();
  await page.getByRole('textbox', {name:'角色名'}).fill('任务更新备份');
  await page.getByRole('dialog').getByRole('button', {name:'创建探索者', exact:true}).click();
  await expect(page.getByRole('textbox', {name:'角色名'})).toHaveValue('');
  await page.getByLabel('关闭弹窗').click();
  await page.locator('.quest-character-settings>summary').click();
  await selectOption(page.getByLabel('角色主职业', {exact:true}), '1');
  await expect(page.getByLabel('角色主职业', {exact:true})).toHaveAttribute('data-value', '1');
  await expect(page.getByLabel('角色主职业', {exact:true})).toBeEnabled();
  await page.getByLabel('额外奖励已完成', {exact:true}).check();
  await expect(page.getByRole('button', {name:'标记任务完成', exact:true})).toBeEnabled();
  await page.getByRole('button', {name:'标记任务完成', exact:true}).click();
  await expect(page.getByRole('button', {name:'已完成 · 撤销', exact:true})).toBeVisible();
  await page.getByLabel('客户端设置').focus();
  await finishCheck(page);
  await page.getByRole('button', {name:'立即重启更新', exact:true}).click();
  await expect.poll(async () => (await updateActions(page)).at(-1)?.command).toBe('desktop_update_install');
  const actions = await page.evaluate(() => (window as any).qa.actions);
  const install = actions.findIndex((action: any) => action.command === 'desktop_update_install');
  const snapshot = actions[install - 1];
  expect(snapshot.command).toBe('write_local_backup');
  expect(snapshot.content.version).toBe(3);
  expect(snapshot.content.data.questProgress).toEqual([expect.objectContaining({questId:'quest:gww:5154',mode:'normal',completed:true,bonus:true})]);
  expect(snapshot.content.data.questProfiles).toEqual([expect.objectContaining({profession:1})]);
});

test('update prompt waits while a custom menu has focus', async ({page}) => {
  await nativeBridge(page);
  await page.goto('/');
  await expect(page.getByTestId('atlas-map')).toBeVisible();
  const language = page.getByRole('combobox', {name:'Language / 语言'});
  await language.click();
  await finishCheck(page);
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(page.getByRole('dialog', {name:'新版本已准备好'})).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(language).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('dialog', {name:'新版本已准备好'})).toBeVisible();
});

test('resource preparation language uses the same custom menu', async ({page}) => {
  await nativeBridge(page);
  await page.addInitScript(() => {
    const bridge = (window as any).__TAURI_INTERNALS__;
    const invoke = bridge.invoke.bind(bridge);
    bridge.invoke = (command: string, args: unknown) => {
      if (command === 'resources_status') return Promise.resolve({ready:false, phase:'error', completed:0, total:0});
      if (command === 'resources_download' || command === 'resources_check') return Promise.reject('offline');
      return invoke(command, args);
    };
  });
  await page.goto('/');
  await expect(page.getByRole('heading', {name:'准备离线资料'})).toBeVisible();
  await selectOption(page.getByRole('combobox', {name:'Language / 语言'}), 'en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('select')).toHaveCount(0);
});

test('closing a focused editor with Escape releases the delayed update prompt', async ({page}) => {
  await nativeBridge(page);
  await page.goto('/');
  await page.getByRole('button', {name:'创建探索者', exact:true}).click();
  await page.getByRole('textbox', {name:'角色名'}).fill('尚未提交');
  await finishCheck(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', {name:'新版本已准备好'})).toBeVisible();
});

test('failed backup prevents installation and the user can retry from client settings', async ({page}) => {
  await nativeBridge(page);
  await page.goto('/');
  await expect(page.getByLabel('客户端设置')).toBeVisible();
  await finishCheck(page);
  await page.evaluate(() => { (window as any).qa.backupFailure = true; });
  await page.getByRole('button', {name:'立即重启更新', exact:true}).click();
  await expect(page.getByText('更新未完成，可继续使用当前版本，并在客户端设置中重试。')).toBeVisible();
  expect((await updateActions(page)).some((action: any) => action.command === 'desktop_update_install')).toBe(false);
  await page.evaluate(() => { (window as any).qa.backupFailure = false; });
  await page.getByLabel('客户端设置').click();
  await page.getByRole('button', {name:'检查更新', exact:true}).click();
  await finishCheck(page);
  await page.getByRole('dialog', {name:'新版本已准备好'}).getByRole('button', {name:'立即重启更新', exact:true}).click();
  await expect.poll(async () => (await updateActions(page)).at(-1)?.command).toBe('desktop_update_install');
});

test('interrupted installation keeps the app available without automatic check or install', async ({page}) => {
  await nativeBridge(page, {phase:'error', version:'1.3.0', error:'updates.interrupted'});
  await page.goto('/');
  await expect(page.getByLabel('客户端设置')).toBeVisible();
  await expect(page.getByText('上次更新未完成，请手动重试；当前版本仍可使用。')).toBeVisible();
  expect(await updateActions(page)).toEqual([{command:'desktop_update_status'}]);
  await page.getByLabel('客户端设置').click();
  await page.getByRole('button', {name:'检查更新', exact:true}).click();
  await finishCheck(page);
  await expect(page.getByRole('dialog', {name:'新版本已准备好'})).toBeVisible();
});

test('unfinished download offers a new check without an install action', async ({page}) => {
  await nativeBridge(page);
  await page.goto('/');
  await expect.poll(() => updateActions(page)).toHaveLength(2);
  await page.evaluate(() => (window as any).qa.failCheck());
  await page.getByLabel('客户端设置').click();
  await expect(page.getByRole('button', {name:'检查更新', exact:true})).toBeEnabled();
  await expect(page.getByRole('button', {name:'立即重启更新', exact:true})).toHaveCount(0);
});

test('English update dialog defers through its button and restores focus', async ({page}) => {
  await nativeBridge(page);
  await page.goto('/');
  await selectOption(page.getByLabel('Language / 语言'), 'en');
  await page.getByLabel('Desktop settings').focus();
  await finishCheck(page);
  const dialog = page.getByRole('dialog', {name:'An update is ready'});
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', {name:'Update next time I open the app'}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Desktop settings')).toBeFocused();
});
