/**
 * [INPUT]: 依赖容器 HTTP 服务、Docker CLI 与共用分发回归。
 * [OUTPUT]: 验证 HTTP 兼容、容器分发与重建后的角色记录。
 * [POS]: 容器验收入口；仅重建显式指定的隔离测试容器。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import { distributionTests } from './distribution';

const exec = promisify(execFile);

distributionTests();

test('HTTP without secure-context Crypto APIs loads data and saves character progress', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis.crypto, 'subtle', { value: undefined });
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined });
  });
  await page.goto('/?kind=skill&q=' + encodeURIComponent('劈击'));
  await expect(page.getByRole('heading', { name: '无法打开探索志', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '创建探索者', exact: true }).click();
  await page.getByRole('textbox', { name: '角色名' }).fill('HTTP 探索者');
  await page.getByRole('button', { name: '创建探索者', exact: true }).last().click();
  await page.getByRole('button', { name: '关闭弹窗' }).click();
  await page.locator('.result').first().click();
  await page.getByRole('button', { name: '标记已捕获', exact: true }).click();
  await expect(page.locator('.character-summary small')).toHaveText('已记录 1 个技能');
  await page.reload();
  await expect(page.locator('.character-summary')).toContainText('HTTP 探索者');
  await expect(page.locator('.character-summary small')).toHaveText('已记录 1 个技能');
});

test('container exposes health, font types, conditional and partial responses', async ({ request }) => {
  const health = await request.get('/healthz');
  expect(health.status()).toBe(200);
  const font = await request.get('/fonts/friz/friz-quadrata-std-medium-5870338ec7ef8.woff');
  expect(font.status()).toBe(200);
  expect(font.headers()['content-type']).toBe('font/woff');
  const map = await request.get('/assets/maps/1-1.jpg');
  const etag = map.headers().etag;
  expect(etag).toBeTruthy();
  expect((await request.get('/assets/maps/1-1.jpg', { headers: { 'If-None-Match': etag } })).status()).toBe(304);
  const partial = await request.get('/assets/maps/1-1.jpg', { headers: { Range: 'bytes=0-15' } });
  expect(partial.status()).toBe(206);
  expect(partial.headers()['content-range']).toMatch(/^bytes 0-15\/\d+$/);
  expect(await partial.body()).toHaveLength(16);
  for (const path of ['/build/missing.js', '/assets/maps/missing.jpg', '/data/missing.json', '/missing-route']) {
    const missing = await request.get(path);
    expect(missing.status()).toBe(404);
    expect(missing.headers()['cache-control'] || '').not.toContain('immutable');
  }
});

test('character progress survives container recreation at the same origin', async ({ page, request, baseURL }) => {
  test.setTimeout(120000);
  const name = process.env.MAPPINGOUT_CONTAINER_NAME;
  test.skip(!name, 'Set MAPPINGOUT_CONTAINER_NAME to an isolated mappingout-e2e-* container to verify recreation.');
  expect(name).toMatch(/^mappingout-e2e-[a-zA-Z0-9_.-]+$/);
  const docker = async (...args: string[]) => (await exec('docker', args, { timeout: 60000 })).stdout.trim();
  const [container] = JSON.parse(await docker('inspect', name!));
  expect(container.Config.Image).toBe('mappingout:test');
  expect(container.State.Running).toBe(true);
  expect(container.HostConfig.ReadonlyRootfs).toBe(true);
  expect(container.HostConfig.CapDrop).toContain('ALL');
  expect(container.HostConfig.SecurityOpt).toEqual(expect.arrayContaining([expect.stringMatching(/^no-new-privileges(?::true|=true)?$/)]));
  expect(Object.keys(container.HostConfig.Tmpfs || {})).toEqual(['/tmp']);
  expect((container.Mounts || []).every((mount: { Type: string; Destination: string }) => mount.Type === 'tmpfs' && mount.Destination === '/tmp')).toBe(true);
  expect(Object.keys(container.HostConfig.PortBindings || {})).toEqual(['8080/tcp']);
  const bindings = container.HostConfig.PortBindings['8080/tcp'];
  expect(bindings).toHaveLength(1);
  const binding = bindings[0];
  expect(binding.HostIp || '0.0.0.0').toMatch(/^(127\.0\.0\.1|0\.0\.0\.0|::1|::)$/);
  const origin = new URL(baseURL!);
  expect(origin.protocol).toBe('http:');
  expect(origin.hostname).toMatch(/^(127\.0\.0\.1|localhost|\[::1\])$/);
  expect(origin.port || '80').toBe(binding.HostPort);

  await page.goto('/?kind=skill&q=' + encodeURIComponent('劈击'));
  await page.getByRole('button', { name: '创建探索者', exact: true }).click();
  await page.getByRole('textbox', { name: '角色名' }).fill('容器重建后的探索者');
  await page.getByRole('button', { name: '创建探索者', exact: true }).last().click();
  await page.getByRole('button', { name: '关闭弹窗' }).click();
  await page.locator('.result').first().click();
  await page.getByRole('button', { name: '标记已捕获', exact: true }).click();
  await expect(page.locator('.character-summary small')).toHaveText('已记录 1 个技能');
  await page.reload();
  await expect(page.getByRole('button', { name: '已完成 · 点击撤销', exact: true })).toBeVisible();

  await docker('rm', '--force', container.Id);
  const host = binding.HostIp || '0.0.0.0';
  const publish = `${host.includes(':') ? `[${host}]` : host}:${binding.HostPort}:8080`;
  const tmpfs = container.HostConfig.Tmpfs['/tmp'];
  const recreatedId = await docker('run', '--detach', '--name', name!, '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--tmpfs', tmpfs ? `/tmp:${tmpfs}` : '/tmp', '--publish', publish, 'mappingout:test');
  expect(recreatedId).not.toBe(container.Id);
  const [recreated] = JSON.parse(await docker('inspect', recreatedId));
  expect(recreated.Image).toBe(container.Image);
  // 请求上下文直接访问容器，避免 Service Worker 掩盖服务未恢复。
  await expect.poll(async () => {
    try { return (await request.get('/healthz', { timeout: 2000 })).status(); }
    catch { return 0; }
  }, { timeout: 30000 }).toBe(200);
  expect((await request.get('/?recreated=' + recreatedId)).status()).toBe(200);
  await page.reload();
  await expect(page.locator('.character-summary')).toContainText('容器重建后的探索者');
  await expect(page.locator('.character-summary small')).toHaveText('已记录 1 个技能');
  await expect(page.getByRole('button', { name: '已完成 · 点击撤销', exact: true })).toBeVisible();
});
