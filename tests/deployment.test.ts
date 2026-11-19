/**
 * [INPUT]: 依赖构建校验、公共资料与离线缓存生成器。
 * [OUTPUT]: 验证构建拒绝缺失资源并预缓存任务及技能媒体。
 * [POS]: 分发输入与缓存回归；隔离目录的整库复制与校验共用 30 秒时限。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateDeploymentData } from '../scripts/validate/validate-data.mjs';
import { finalizeBuild } from '../scripts/build/finalize-build.mjs';
import { requireLegacyInputs } from '../scripts/legacy/legacy-inputs.mjs';

const temporary: string[] = [];
async function directory() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mappingout test '));
  temporary.push(dir); return dir;
}
afterEach(async () => { await Promise.all(temporary.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true }))); });
async function fixture() {
  const dir = await directory();
  await fs.cp('public', dir, { recursive: true });
  return dir;
}
async function editCatalog(dir: string, edit: (data: any) => void) {
  const filename = path.join(dir, 'data/catalog.json');
  const data = JSON.parse(await fs.readFile(filename, 'utf8')); edit(data);
  await fs.writeFile(filename, JSON.stringify(data));
}
// 完整离线资料包含数千个文件，复制与校验需要统一时限。
describe('bundled deployment data', { timeout: 30000 }, () => {
  it('validates all shipped chapters and images without original Campaign files', async () => {
    expect(await validateDeploymentData()).toMatchObject({ campaigns: 4, maps: 20, records: 3022, sourceIssues: 74 });
  });
  it('rejects missing JSON with an actionable error', async () => {
    await expect(validateDeploymentData(await directory())).rejects.toThrow(/catalog.json.*public\/data/);
  });
  it('rejects an empty catalog', async () => {
    const dir = await fixture();
    await editCatalog(dir, data => { data.records = []; });
    await expect(validateDeploymentData(dir)).rejects.toThrow(/数量.*为空/);
  });
  it('rejects partially bundled chapters and maps', async () => {
    const dir = await fixture();
    await editCatalog(dir, data => { data.campaigns.pop(); });
    await expect(validateDeploymentData(dir)).rejects.toThrow('四个章节');
    await fs.copyFile('public/data/catalog.json', path.join(dir, 'data/catalog.json'));
    await editCatalog(dir, data => { data.regions.pop(); });
    await expect(validateDeploymentData(dir)).rejects.toThrow('地图目录不完整');
  });
  it('rejects a truncated record set instead of deploying partial data', async () => {
    const dir = await fixture();
    await editCatalog(dir, data => { data.records = data.records.filter((r: any) => r.kind !== 'treasure'); });
    await expect(validateDeploymentData(dir)).rejects.toThrow('treasure 数量');
  });
  it.each(['map', 'skill'])('rejects a missing referenced %s image', async kind => {
    const dir = await fixture();
    const catalog = JSON.parse(await fs.readFile(path.join(dir, 'data/catalog.json'), 'utf8'));
    const image = kind === 'skill' ? catalog.records.find((r: any) => r.image).image : catalog.regions[0].image;
    await fs.unlink(path.join(dir, image));
    await expect(validateDeploymentData(dir)).rejects.toThrow(image);
  });
  it('rejects external asset references and mismatched image dimensions', async () => {
    const dir = await fixture();
    await editCatalog(dir, data => { data.regions[0].image = 'https://example.com/map.jpg'; });
    await expect(validateDeploymentData(dir)).rejects.toThrow('非法图片引用');
    await fs.copyFile('public/data/catalog.json', path.join(dir, 'data/catalog.json'));
    await editCatalog(dir, data => { data.regions[0].width++; });
    await expect(validateDeploymentData(dir)).rejects.toThrow('尺寸与图片不一致');
  });
  it('refuses conversion before writes in a checkout without legacy files', async () => {
    await expect(requireLegacyInputs(await directory())).rejects.toThrow(/原始资料不完整.*npm run build/);
  });
  it('rejects Wiki references without a permanent revision on the source site', async () => {
    const dir = await fixture();
    await editCatalog(dir, data => { data.records.find((record: any) => record.wiki).wiki.revisionUrl = 'https://example.com/index.php?oldid=1'; });
    await expect(validateDeploymentData(dir)).rejects.toThrow('Wiki 修订来源无效');
  });
  it('rejects a catalog that silently loses reviewed provenance', async () => {
    const dir = await fixture();
    await editCatalog(dir, data => { delete data.records.find((record: any) => record.wiki).wiki; });
    await expect(validateDeploymentData(dir)).rejects.toThrow('核对数量与报告不一致');
  });
  it('requires the feature catalogs and validates their recipes and cycles',async()=>{
    const dir=await fixture();await fs.unlink(path.join(dir,'data/armor.json'));await expect(validateDeploymentData(dir)).rejects.toThrow('armor.json');
    await fs.copyFile('public/data/armor.json',path.join(dir,'data/armor.json'));
    const file=path.join(dir,'data/calendar.json'),data=JSON.parse(await fs.readFile(file,'utf8'));data.rotations[0].sequence.pop();await fs.writeFile(file,JSON.stringify(data));await expect(validateDeploymentData(dir)).rejects.toThrow('轮换序列不完整');
  });
  it('separates the small startup cache from the complete offline manifest',async()=>{
    const dir=await buildFixture();await fs.writeFile(path.join(dir,'data/armor.json'),'{}');await fs.writeFile(path.join(dir,'data/calendar.json'),'{}');await fs.writeFile(path.join(dir,'build/armor-123.js'),'lazy');
    await fs.writeFile(path.join(dir,'AGENTS.md'),'project instructions');await fs.writeFile(path.join(dir,'assets/maps/AGENTS.md'),'asset instructions');
    await fs.mkdir(path.join(dir,'assets/materials'));await fs.writeFile(path.join(dir,'assets/materials/iron-ingot.png'),'icon');
    await fs.writeFile(path.join(dir,'data/quests.json'),'{}');await fs.mkdir(path.join(dir,'assets/quests'));await fs.writeFile(path.join(dir,'assets/quests/1-abcdef.webp'),'route');
    await fs.writeFile(path.join(dir,'data/skills.json'),'{}');await fs.mkdir(path.join(dir,'assets/skill-library'));await fs.mkdir(path.join(dir,'assets/skill-resources'));await fs.writeFile(path.join(dir,'assets/skill-library/123.jpg'),'skill');await fs.writeFile(path.join(dir,'assets/skill-resources/energy.png'),'resource');
    const result=await finalizeBuild(dir);
    expect(result.precache).toEqual(['build/content.worker-123.js','build/main-123.css','build/main-123.js']);
    expect(result.offlineAssets).toEqual(expect.arrayContaining(['data/catalog.json','data/armor.json','data/calendar.json','data/quests.json','data/skills.json','build/armor-123.js','assets/materials/iron-ingot.png','assets/quests/1-abcdef.webp','assets/skill-library/123.jpg','assets/skill-resources/energy.png']));
    expect(result.offlineAssets.some(name=>name==='AGENTS.md'||name.endsWith('/AGENTS.md'))).toBe(false);
    expect(JSON.parse(await fs.readFile(path.join(dir,'offline-assets.json'),'utf8'))).toEqual(result.offlineAssets);
  });
});

async function buildFixture() {
  const dir = await directory();
  for (const folder of ['build', 'data', 'assets/maps']) await fs.mkdir(path.join(dir, folder), { recursive: true });
  for (const [name, content] of Object.entries({ 'index.html': '<html><head><link rel="stylesheet" href="./build/main-123.css"></head><body><script type="module" src="./build/main-123.js"></script></body></html>', '_headers': '/build/*\n  Cache-Control: immutable', 'build/main-123.js': 'app', 'build/main-123.css': 'style', 'build/content.worker-123.js':'worker', 'data/catalog.json': '{}', 'assets/maps/1-1.jpg': 'map bytes' })) await fs.writeFile(path.join(dir, name), content);
  return dir;
}
describe('release-specific offline worker', () => {
  it('keeps the declared application favicon in the startup shell cache', async () => {
    const dir = await buildFixture();
    const html = await fs.readFile(path.join(dir,'index.html'),'utf8');
    await fs.writeFile(path.join(dir,'index.html'),html.replace('</head>','<link rel="icon" href="./build/icon-123.svg"></head>'));
    await fs.writeFile(path.join(dir,'build/icon-123.svg'),'<svg/>');
    expect((await finalizeBuild(dir)).precache).toContain('build/icon-123.svg');
  });
  it('generates a stable version and separates startup assets from offline assets', async () => {
    const dir = await buildFixture();
    const first = await finalizeBuild(dir);
    await fs.utimes(path.join(dir, 'index.html'), new Date(), new Date());
    expect(await finalizeBuild(dir)).toEqual(first);
    const sw = await fs.readFile(path.join(dir, 'sw.js'), 'utf8');
    expect(sw).toContain(`mappingout-${first.version}`);
    expect(sw).not.toContain('__BUILD_');
    expect(first.precache).toEqual(['build/content.worker-123.js','build/main-123.css', 'build/main-123.js']);
    expect(first.offlineAssets).toEqual(expect.arrayContaining(['build/content.worker-123.js','build/main-123.css','build/main-123.js','data/catalog.json','assets/maps/1-1.jpg']));
    expect(first.offlineAssets).not.toContain('index.html');
    expect(first.offlineAssets).not.toContain('_headers');
  });
  it.each(['index.html', 'data/catalog.json', 'assets/maps/1-1.jpg', 'build/main-123.js', '_headers'])('changes the version when %s changes', async name => {
    const dir = await buildFixture(), first = await finalizeBuild(dir);
    await fs.appendFile(path.join(dir, name), 'changed');
    expect((await finalizeBuild(dir)).version).not.toBe(first.version);
  });
  it('versions worker behavior changes and filename changes', async () => {
    const dir = await buildFixture(), first = await finalizeBuild(dir);
    const template = path.join(await directory(), 'worker.js');
    await fs.writeFile(template, await fs.readFile('public/sw.js', 'utf8') + '\n// changed behavior');
    expect((await finalizeBuild(dir, template)).version).not.toBe(first.version);
    await fs.rename(path.join(dir, 'assets/maps/1-1.jpg'), path.join(dir, 'assets/maps/1-2.jpg'));
    expect((await finalizeBuild(dir)).version).not.toBe(first.version);
  });
  it('keeps bundled review and license available when offline', async () => {
    const dir = await buildFixture();
    await fs.mkdir(path.join(dir, 'licenses'));
    await fs.writeFile(path.join(dir, 'licenses/gfdl-1.3.txt'), 'license');
    await fs.writeFile(path.join(dir, 'data/wiki-review.json'), '{}');
    expect((await finalizeBuild(dir)).offlineAssets).toEqual(expect.arrayContaining(['data/wiki-review.json', 'licenses/gfdl-1.3.txt']));
  });
});

describe('Workers asset routing and caching rules', () => {
  it('disables SPA fallback and uses the expected standalone Workers configuration', async () => {
    const config = JSON.parse(await fs.readFile('wrangler.jsonc', 'utf8'));
    expect(config).toMatchObject({ name: 'mappingout-web', compatibility_date: '2026-11-12', workers_dev: true, assets: { directory: './dist', not_found_handling: 'none' } });
    expect(config.main).toBeUndefined();
  });
  it('reserves immutable caching for hashed build files, with no overlapping policies', async () => {
    const headers = await fs.readFile('public/_headers', 'utf8');
    const rules = [...headers.matchAll(/^(\/[^\r\n]*)\r?\n\s+Cache-Control: ([^\r\n]+)/gm)];
    for (const file of ['/', '/index.html', '/sw.js', '/offline-assets.json', '/data/catalog.json', '/data/report.json', '/assets/maps/1-1.jpg', '/assets/skills/0-1.jpg', '/build/main-abcd.js', '/build/main-abcd.css']) {
      const policies = rules.filter(([, pattern]) => pattern.endsWith('*') ? file.startsWith(pattern.slice(0, -1)) : file === pattern).map(([, , value]) => value);
      expect(policies, file).toHaveLength(1);
      if (file.startsWith('/build/')) expect(policies[0]).toBe('public, max-age=31536000, immutable');
      else { expect(policies[0]).not.toContain('immutable'); expect(policies[0]).toMatch(/no-cache|must-revalidate/); }
    }
  });
});
