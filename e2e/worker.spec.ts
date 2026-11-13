import { expect, test } from '@playwright/test';

test('the first map stays available offline when it loads before worker activation', async ({ page, context }) => {
  await page.addInitScript(() => {
    const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    const gate = new Promise<void>(resolve => {
      (window as any).allowWorkerRegistration = resolve;
    });
    navigator.serviceWorker.register = async (...args) => {
      await gate;
      return register(...args);
    };
  });
  await page.goto('/');
  await expect(page.locator('.result').first()).toBeVisible();
  await page.waitForFunction(() => {
    const image = document.querySelector<HTMLImageElement>('.leaflet-image-layer');
    return image?.complete && image.naturalWidth > 0;
  });
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  await page.evaluate(() => (window as any).allowWorkerRegistration());
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
    }
  });
  await expect.poll(() => page.evaluate(async () => {
    const image = document.querySelector<HTMLImageElement>('.leaflet-image-layer')!;
    return !!await caches.match(image.src);
  })).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.result').first()).toBeVisible();
  await page.waitForFunction(() => {
    const image = document.querySelector<HTMLImageElement>('.leaflet-image-layer');
    return image?.complete && image.naturalWidth > 0;
  });
});

test('Workers serves query routes, typed assets, revalidation headers and real 404s', async ({ request }) => {
  for (const url of ['/', '/?kind=skill&map=2%3A2&q=%E5%8A%88%E5%87%BB']) {
    const response = await request.get(url);
    expect(response.status(), url).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    expect(response.headers()['cache-control']).toBe('no-cache');
  }
  const catalog = await request.get('/data/catalog.json');
  expect(catalog.status()).toBe(200);
  expect(catalog.headers()['content-type']).toContain('application/json');
  expect(catalog.headers()['cache-control']).toBe('public, max-age=0, must-revalidate');
  expect((await catalog.json()).campaigns).toHaveLength(4);
  const report = await request.get('/data/report.json');
  expect(report.status()).toBe(200);
  expect(report.headers()['cache-control']).toBe('public, max-age=0, must-revalidate');
  const map = await request.get('/assets/maps/1-1.jpg');
  expect(map.status()).toBe(200);
  expect(map.headers()['content-type']).toContain('image/jpeg');
  expect(map.headers()['cache-control']).toBe('public, max-age=0, must-revalidate');
  const sw = await request.get('/sw.js');
  expect(sw.status()).toBe(200);
  expect(sw.headers()['content-type']).toMatch(/javascript/);
  expect(sw.headers()['cache-control']).toBe('no-cache');
  expect(await sw.text()).toMatch(/mappingout-[a-f0-9]{24}/);
  const html = await (await request.get('/')).text();
  const built = [...html.matchAll(/(?:src|href)="\.?(\/build\/[^\"]+\.(?:js|css))"/g)].map(m => m[1]);
  expect(built).toHaveLength(2);
  for (const asset of built) {
    const response = await request.get(asset);
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(response.headers()['content-type']).toMatch(asset.endsWith('.css') ? /text\/css/ : /javascript/);
  }
  for (const url of ['/data/missing.json', '/assets/maps/missing.jpg', '/build/missing.js', '/missing-route']) {
    const response = await request.get(url);
    expect(response.status(), url).toBe(404);
    expect(await response.text()).not.toContain('<div id="root">');
  }
});

test('worker activation cleans old release caches and preserves local characters', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '创建探索者', exact: true }).click();
  await page.getByRole('textbox', { name: '角色名' }).fill('发布后仍保留的角色');
  await page.getByRole('button', { name: '创建探索者', exact: true }).last().click();
  await page.getByRole('button', { name: '关闭弹窗' }).click();
  const result = await page.evaluate(async () => {
    async function activated(worker: ServiceWorker) {
      if (worker.state === 'activated') return;
      await new Promise<void>(resolve => worker.addEventListener('statechange', () => { if (worker.state === 'activated') resolve(); }));
    }
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
    await activated(navigator.serviceWorker.controller!);
    const before = (await caches.keys()).filter(key => key.startsWith('mappingout-'));
    await (await caches.open('mappingout-previous-release')).put('/', new Response('stale shell'));
    await (await caches.open('unrelated-app')).put('/sentinel', new Response('keep'));
    // A changed script URL triggers a real install/activate cycle without altering
    // production files. The generated-version tests separately verify byte changes.
    const updated = new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
    await navigator.serviceWorker.register('/sw.js?upgrade-verification');
    await updated;
    // controllerchange can precede completion of activate's waitUntil cleanup.
    await activated(navigator.serviceWorker.controller!);
    return { before, after: await caches.keys(), script: navigator.serviceWorker.controller!.scriptURL };
  });
  expect(result.before).toHaveLength(1);
  expect(result.after).not.toContain('mappingout-previous-release');
  expect(result.after).toContain(result.before[0]);
  expect(result.after).toContain('unrelated-app');
  expect(result.script).toContain('?upgrade-verification');
  await page.reload();
  await expect(page.locator('.character-summary')).toContainText('发布后仍保留的角色');
});
