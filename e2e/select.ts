/**
 * [INPUT]: 依赖 Playwright Locator 和下拉选项的业务值。
 * [OUTPUT]: 提供通过可见自定义菜单选择选项的测试步骤。
 * [POS]: 浏览器回归共用操作；不直接修改组件状态。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {expect, type Locator} from '@playwright/test';

export async function selectOption(trigger: Locator, value: string) {
  await trigger.click();
  const menu = trigger.page().getByRole('listbox');
  await expect(menu).toBeVisible();
  await menu.locator(`[role="option"][data-value=${JSON.stringify(value)}]`).click();
  await expect(menu).toHaveCount(0);
}
