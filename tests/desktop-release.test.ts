/**
 * [INPUT]: 依赖发布聚合 CLI、当前版本和隔离安装包目录。
 * [OUTPUT]: 验证三平台版本、签名、安装盘与下载地址。
 * [POS]: 发布产物门禁回归；不读取私钥或发布资产。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { test, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { projectPath } from '../scripts/lib/paths.mjs';

const exec = promisify(execFile);
const { version, productName } = JSON.parse(await fs.readFile(projectPath('desktop/tauri.conf.json'), 'utf8'));
const installers = [`${productName}_${version}_x64-setup.exe`, `${productName}_${version}_x86-setup.exe`, `${productName}.app.tar.gz`];
const dmg = `${productName}_${version}_aarch64.dmg`;
const base = `https://example.com/releases/v${version}`;

async function fixture(check: (input: string, output: string, run: (url?: string) => Promise<unknown>) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mappingout release '));
  try {
    const input = path.join(dir, 'input'), output = path.join(dir, 'out');
    await fs.mkdir(input);
    for (const name of installers) {
      await fs.writeFile(path.join(input, name), `fixture-${name}`);
      await fs.writeFile(path.join(input, name + '.sig'), `signature-${name}`);
    }
    await fs.writeFile(path.join(input, dmg), 'disk-image');
    const run = (url = base + '/') => exec(process.execPath, [projectPath('scripts/desktop/desktop-merge-release.mjs'), '--input', input, '--output', output, '--base-url', url], { cwd: dir });
    await check(input, output, run);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

test.each([base + '/', base])('merges the current release at %s from a foreign working directory', async url => {
  await fixture(async (_input, output, run) => {
    await run(url);
    const manifest = JSON.parse(await fs.readFile(path.join(output, 'latest.json'), 'utf8'));
    expect(manifest.version).toBe(version);
    expect(Object.keys(manifest.platforms).sort()).toEqual(['darwin-aarch64', 'windows-i686', 'windows-x86_64']);
    for (const [platform, name] of [['windows-x86_64', installers[0]], ['windows-i686', installers[1]], ['darwin-aarch64', installers[2]]]) {
      expect(manifest.platforms[platform]).toEqual({ url: `${base}/${name}`, signature: `signature-${name}` });
    }
    expect((await fs.readFile(path.join(output, 'SHA256SUMS.txt'), 'utf8')).trim().split('\n')).toHaveLength(4);
  });
});

test.each(installers.slice(0, 2))('rejects a stale Windows installer instead of relabeling %s', async name => {
  await fixture(async (input, output, run) => {
    const stale = name.replace(version, '0.0.0');
    for (const suffix of ['', '.sig']) await fs.rename(path.join(input, name + suffix), path.join(input, stale + suffix));
    await expect(run()).rejects.toThrow('Expected release asset');
    await expect(fs.stat(output)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

test.each(['missing', 'stale'])('rejects a %s macOS installation disk', async kind => {
  await fixture(async (input, output, run) => {
    if (kind === 'missing') await fs.unlink(path.join(input, dmg));
    else await fs.rename(path.join(input, dmg), path.join(input, dmg.replace(version, '0.0.0')));
    await expect(run()).rejects.toThrow('Expected release asset');
    await expect(fs.stat(output)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

test('rejects an updater without its signature', async () => {
  await fixture(async (input, output, run) => {
    await fs.unlink(path.join(input, installers[1] + '.sig'));
    await expect(run()).rejects.toThrow('Missing input signature');
    await expect(fs.stat(output)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

test('rejects legacy bundled installers', async () => {
  await fixture(async (input, _output, run) => {
    await fs.writeFile(path.join(input, `${productName}_${version}_x86-offline-setup.exe`), 'legacy');
    await expect(run()).rejects.toThrow('Legacy bundled installer');
  });
});
