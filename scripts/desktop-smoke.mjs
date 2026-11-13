import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// Runs the real Windows executable. CDP is enabled only in this test process's environment.
// Use a fresh Windows profile: the mutation tests refuse to touch existing character records.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executable = path.resolve(root, process.argv[2] || 'src-tauri/target/release/mappingout-desktop.exe');
const port = 9227;
const output = path.join(root, 'releases/qa');
await fs.mkdir(output, { recursive: true });
const checks = [];
let child;
let browser;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function launch() {
  child = spawn(executable, [], {
    cwd: root, windowsHide: true,
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --proxy-server=http://127.0.0.1:9 --proxy-bypass-list=tauri.localhost` },
    stdio: 'ignore',
  });
  child.on('error', error => console.error(error));
  let endpoint;
  for (let i = 0; i < 120; i++) {
    try { endpoint = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); if (endpoint.webSocketDebuggerUrl) break; } catch {}
    if (child.exitCode !== null) throw Error(`客户端提前退出：${child.exitCode}`);
    await delay(500);
  }
  if (!endpoint?.webSocketDebuggerUrl) throw Error('WebView2 调试端口未启动。请先关闭其他 MappingOut 实例。');
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  let page;
  for (let i = 0; i < 60; i++) {
    page = context.pages().find(page => page.url().includes('tauri.localhost'));
    if (page) break;
    await delay(500);
  }
  if (!page) throw Error('没有找到 Tauri 应用页面。');
  page.setDefaultTimeout(15_000);
  await expect(page.getByRole('button', { name: '客户端设置', exact: true })).toBeVisible();
  await expect(page.locator('.leaflet-image-layer')).toBeVisible();
  return { page, context };
}
async function stop(page) {
  // Ask the real window to close so window-state persistence executes.
  await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|close', { label: 'main' })).catch(error => {
    if (!/closed|destroyed/i.test(String(error))) throw error;
  });
  await new Promise((resolve, reject) => {
    if (child.exitCode !== null) return resolve();
    const timeout = setTimeout(() => reject(Error('窗口关闭后客户端未退出。')), 15_000);
    child.once('exit', () => { clearTimeout(timeout); resolve(); });
  });
  await browser.close().catch(() => {}); browser = undefined;
}
const invoke = (page, command, args = {}) => page.evaluate(([command, args]) => window.__TAURI_INTERNALS__.invoke(command, args), [command, args]);
async function state(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('mappingout', 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('personal', 'readonly'), read = tx.objectStore('personal').get('state');
      read.onsuccess = () => resolve(read.result || null);
      read.onerror = () => reject(read.error);
      tx.oncomplete = () => db.close();
    };
  }));
}
try {
  let { page, context } = await launch();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: '客户端设置', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '最近自动备份' })).toBeVisible();
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  const original = await state(page);
  if (original?.characters?.length) throw Error('此 Windows 配置已有角色记录；请换干净测试配置运行，测试未改动记录。');
  const info = await invoke(page, 'desktop_info');
  const existing = await invoke(page, 'list_local_backups');
  const baseline = new Map();
  for (const item of existing) {
    const content = await fs.readFile(path.join(info.backupDirectory, item.name), 'utf8');
    if (JSON.parse(content).data.characters.length) throw Error('此配置已有角色备份；请使用干净 Windows 配置测试轮换，测试未改动备份。');
    baseline.set(item.name, content);
  }
  checks.push({ check: 'startup-with-network-proxy-unreachable', version: info.version, passed: true });
  const resources = await page.evaluate(async () => {
    const catalog = await (await fetch('/data/catalog.json')).json();
    const maps = await Promise.all(catalog.regions.map(async region => {
      const response = await fetch(`/${region.image}`);
      const bytes = await response.arrayBuffer();
      return response.ok && bytes.byteLength > 0;
    }));
    for (const name of ['armor', 'calendar', 'wiki-review']) {
      const response = await fetch(`/data/${name}.json`);
      if (!response.ok) throw Error(name); await response.json();
    }
    return { maps: maps.length, allLoaded: maps.every(Boolean), workers: (await navigator.serviceWorker.getRegistrations()).length };
  });
  assert.equal(resources.maps, 20); assert.equal(resources.allLoaded, true); assert.equal(resources.workers, 0);
  checks.push({ check: 'all-maps-and-feature-data-offline-no-service-worker', ...resources, passed: true });
  await page.getByRole('banner').getByRole('button', { name: '创建探索者', exact: true }).click();
  await page.getByRole('textbox', { name: '角色名', exact: true }).fill('桌面验收 中文角色');
  await page.getByRole('dialog').getByRole('button', { name: '创建探索者', exact: true }).click();
  await expect.poll(async () => (await state(page))?.characters?.length).toBe(1);
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  const saved = await state(page);
  const backup = { format: 'mappingout-backup', version: 2, exportedAt: new Date().toISOString(), data: saved };
  // Native commands cross actual WebView IPC and use the real filesystem.
  for (let i = 0; i < 23; i++) await invoke(page, 'write_local_backup', { kind: 'auto', content: JSON.stringify(backup) });
  const list = await invoke(page, 'list_local_backups');
  assert.equal(list.filter(item => item.kind === 'auto').length, 20);
  const text = await invoke(page, 'read_local_backup', { name: list[0].name });
  assert.equal(JSON.parse(text).data.characters[0].name, '桌面验收 中文角色');
  await assert.rejects(() => invoke(page, 'read_local_backup', { name: '../outside.json' }));
  await assert.rejects(() => invoke(page, 'write_local_backup', { kind: 'auto', content: '{}' }));
  checks.push({ check: 'native-backup-roundtrip-rotation-and-path-validation', retained: 20, passed: true });
  const restored = structuredClone(saved);
  restored.characters[0].name = '恢复后的 中文角色';
  await invoke(page, 'write_local_backup', { kind: 'auto', content: JSON.stringify({ ...backup, data: restored }) });
  await page.getByRole('button', { name: '客户端设置', exact: true }).click();
  await expect(page.getByRole('heading', { name: '客户端设置', exact: true })).toBeVisible();
  await expect(page.locator('.desktop-backups .backup-action')).toHaveCount(20);
  await page.screenshot({ path: path.join(output, 'desktop-settings.png') });
  await page.locator('.desktop-backups .backup-action').first().click();
  await expect(page.getByText('已校验备份', { exact: false })).toBeVisible();
  // A blocked backup directory must prevent destructive replacement.
  const held = `${info.backupDirectory}-qa-held`;
  await fs.rename(info.backupDirectory, held);
  try {
    await fs.writeFile(info.backupDirectory, 'QA: directory intentionally unavailable');
    await page.getByRole('button', { name: '确认替换并恢复', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '恢复未完成' })).toBeVisible();
    assert.deepEqual(await state(page), saved);
  } finally {
    await fs.rm(info.backupDirectory, { force: true });
    await fs.rename(held, info.backupDirectory);
  }
  checks.push({ check: 'backup-write-failure-blocks-restore-and-preserves-current-data', passed: true });
  await page.getByRole('button', { name: '确认替换并恢复', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const after = await invoke(page, 'list_local_backups');
  const recovery = after.find(item => item.kind === 'restore');
  assert.ok(recovery);
  assert.deepEqual(JSON.parse(await invoke(page, 'read_local_backup', { name: recovery.name })).data, saved);
  assert.deepEqual(await state(page), restored);
  checks.push({ check: 'preview-confirm-and-native-pre-restore-backup', passed: true });
  await page.getByRole('button', { name: '护甲制作', exact: true }).click();
  await expect(page.locator('.feature-status')).toHaveCount(0);
  await page.getByRole('button', { name: '活动日历', exact: true }).click();
  await expect(page.locator('.feature-status')).toHaveCount(0);
  await page.getByRole('button', { name: '世界地图', exact: true }).click();
  await page.reload();
  await expect(page.locator('.leaflet-image-layer')).toBeVisible();
  assert.deepEqual(await state(page), restored);
  const session = await context.newCDPSession(page);
  for (const scale of [1, 1.5, 2]) {
    await session.send('Emulation.setDeviceMetricsOverride', { width: Math.round(1440 / scale), height: Math.round(920 / scale), deviceScaleFactor: scale, mobile: false });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, `desktop-scale-${scale}.png`) });
  }
  await session.send('Emulation.clearDeviceMetricsOverride');
  await session.detach();
  const second = spawn(executable, [], { windowsHide: true, stdio: 'ignore' });
  await new Promise((resolve, reject) => { const timer = setTimeout(() => { second.kill(); reject(Error('单实例检查超时')); }, 15_000); second.on('exit', () => { clearTimeout(timer); resolve(); }); });
  await expect(page.locator('.leaflet-image-layer')).toBeVisible();
  checks.push({ check: 'feature-pages-reload-dpi-and-single-instance', passed: true });
  await stop(page);
  ({ page, context } = await launch());
  assert.deepEqual(await state(page), restored);
  checks.push({ check: 'process-restart-preserves-indexeddb', passed: true });
  assert.deepEqual(errors, []);
  // Restore the initially empty DB after mutation testing. Backup files remain QA evidence.
  await page.evaluate(original => new Promise((resolve, reject) => {
    const request = indexedDB.open('mappingout', 2);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('personal', 'readwrite');
      if (original) tx.objectStore('personal').put(original, 'state'); else tx.objectStore('personal').delete('state');
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  }), original);
  await stop(page);
  for (const name of await fs.readdir(info.backupDirectory)) {
    if (!baseline.has(name) && /^(auto|restore)-[0-9]+\.json$/.test(name)) await fs.rm(path.join(info.backupDirectory, name));
  }
  for (const [name, content] of baseline) await fs.writeFile(path.join(info.backupDirectory, name), content);
  await fs.writeFile(path.join(output, 'desktop-smoke.json'), JSON.stringify({ executable, checkedAt: new Date().toISOString(), checks }, null, 2));
  console.log(JSON.stringify(checks, null, 2));
} finally {
  await browser?.close().catch(() => {});
  if (child && child.exitCode === null) child.kill();
}
