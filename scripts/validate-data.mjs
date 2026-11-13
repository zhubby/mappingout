import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jpegSize } from './format.mjs';
import { validateFeatureData } from './validate-features.mjs';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kinds = ['skill', 'boss', 'green', 'collector', 'pet', 'treasure', 'zone'];
const requiredCampaigns = [1, 2, 3, 4];

export async function validateDeploymentData(publicDir = path.join(web, 'public')) {
  const fail = message => { throw new Error(`部署资料校验失败：${message}。请提交完整 public/data 和 public/assets；仅在有原始 Campaign 目录时运行 npm run build:data。`); };
  async function json(name) {
    try { return JSON.parse(await fs.readFile(path.join(publicDir, 'data', name), 'utf8')); }
    catch { fail(`缺失或无法解析 data/${name}`); }
  }
  const catalog = await json('catalog.json'), report = await json('report.json');
  if (catalog.version !== 1 || report.version !== 1) fail('不支持的资料版本');
  if (!Array.isArray(catalog.campaigns) || !Array.isArray(catalog.regions) || !Array.isArray(catalog.records) || !Array.isArray(catalog.professions)) fail('资料结构不完整');
  const unique = (values, label) => { if (new Set(values).size !== values.length) fail(`${label}存在重复编号`); };
  unique(catalog.campaigns.map(c => c.id), '章节');
  if (catalog.campaigns.length !== requiredCampaigns.length || requiredCampaigns.some(id => !catalog.campaigns.some(c => c.id === id))) fail('必须包含四个章节');
  const expectedMaps = Object.keys(JSON.parse(await fs.readFile(path.join(web, 'scripts/map-verification.json'), 'utf8')));
  const regions = new Map(catalog.regions.map(r => [r.id, r]));
  unique(catalog.regions.map(r => r.id), '地图');
  if (regions.size !== expectedMaps.length || expectedMaps.some(id => !regions.has(id))) fail('地图目录不完整');
  if (!Array.isArray(report.issues) || !Array.isArray(report.mapVerification) || report.mapVerification.length !== regions.size) fail('校验报告不完整');

  const images = new Map();
  async function image(reference) {
    if (images.has(reference)) return images.get(reference);
    if (typeof reference !== 'string' || !/^assets\/(?:maps|skills)\/[a-zA-Z0-9-]+\.jpg$/.test(reference)) fail(`非法图片引用 ${reference}`);
    let size;
    try { size = jpegSize(await fs.readFile(path.join(publicDir, reference))); }
    catch { fail(`缺失或损坏的图片 ${reference}`); }
    images.set(reference, size);
    return size;
  }
  for (const r of catalog.regions) {
    if (!requiredCampaigns.includes(r.campaign)) fail(`地图 ${r.id} 引用未知章节`);
    if (!r.image) fail(`地图 ${r.id} 缺少图片`);
    const size = await image(r.image);
    if (size.width !== r.width || size.height !== r.height) fail(`地图 ${r.id} 尺寸与图片不一致`);
  }
  const entries = new Map(catalog.records.map(e => [e.id, e]));
  unique(catalog.records.map(e => e.id), '资料');
  function reference(value) {
    try {
      const url = new URL(value.revisionUrl);
      if (url.origin !== 'https://wiki.guildwars.com' || url.pathname !== '/index.php' || url.searchParams.get('oldid') !== String(value.revid) || !Number.isInteger(value.revid) || value.revid <= 0 || !Number.isInteger(value.pageid) || !value.title || !Number.isFinite(Date.parse(value.revisedAt))) throw new Error();
    } catch { fail('Wiki 修订来源无效'); }
  }
  const counts = Object.fromEntries(kinds.map(kind => [kind, 0]));
  for (const e of catalog.records) {
    if (!e.id || !kinds.includes(e.kind) || typeof e.name !== 'string' || !Array.isArray(e.locations) || !Array.isArray(e.details)) fail(`资料结构无效 ${e.id}`);
    if (!requiredCampaigns.includes(e.campaign) && !(e.kind === 'skill' && e.campaign === 0)) fail(`资料 ${e.id} 引用未知章节`);
    counts[e.kind]++;
    if (e.wiki) {
      reference(e.wiki);
      for (const source of e.wiki.references || []) reference(source);
      const wikiAddition = e.origin === 'wiki' && e.kind === 'zone' && e.id === `zone:gww:${e.wiki.pageid}` && e.source?.file === `data/wiki/pages/${e.wiki.pageid}.json` && e.locations.length === 0;
      if (e.origin === 'wiki' && !wikiAddition) fail(`Wiki 新增资料身份无效 ${e.id}`);
      if ((!wikiAddition && (!e.legacy || !Array.isArray(e.legacy.details))) || !e.englishName || !['zh', 'en'].includes(e.descriptionLanguage) || !e.wiki.fields?.length || e.wiki.coordinateStatus !== 'legacy-unverified') fail(`Wiki 校订信息不完整 ${e.id}`);
      if (e.skill?.pvp) reference(e.skill.pvp.reference);
    }
    if (e.image) await image(e.image);
    if (e.area?.atlasRegion && (!regions.has(e.area.atlasRegion) || regions.get(e.area.atlasRegion).campaign !== e.campaign)) fail(`区域 ${e.id} 的地图分组引用不存在或篇章不符`);
    for (const id of e.related || []) if (!entries.has(id)) fail(`资料 ${e.id} 的关联 ${id} 不存在`);
    for (const loc of e.locations) {
      const region = regions.get(loc.region);
      if (loc.positionStatus === 'unconfirmed' && (loc.valid || typeof loc.legacyValid !== 'boolean' || !loc.wiki)) fail(`未确认的地点 ${loc.id} 不能显示为有效坐标`);
      if (loc.bossId && !entries.has(loc.bossId)) fail(`地点 ${loc.id} 的 Boss 引用不存在`);
      if (loc.valid && (!region || !Number.isFinite(loc.x) || !Number.isFinite(loc.y) || loc.x < 0 || loc.y < 0 || loc.x > region.width || loc.y > region.height)) fail(`地点 ${loc.id} 的地图或坐标无效`);
      if (loc.zone && !entries.has(`zone:${loc.zone}`)) fail(`地点 ${loc.id} 的区域引用不存在`);
    }
  }
  for (const kind of kinds) if (!counts[kind] || counts[kind] !== report.counts?.[kind]) fail(`${kind} 数量与报告不一致或为空`);
  for (const id of requiredCampaigns) if (!catalog.records.some(e => e.campaign === id)) fail(`章节 ${id} 资料为空`);
  if (catalog.referenceVersion) {
    const review = await json('wiki-review.json');
    if (review.referenceVersion !== catalog.referenceVersion || report.wiki?.referenceVersion !== catalog.referenceVersion) fail('Wiki 校订版本与报告不一致');
    const coverage = { skills: 'skill', bosses: 'boss', weapons: 'green', collectors: 'collector', pets: 'pet', treasures: 'treasure', zones: 'zone' };
    for (const [key, kind] of Object.entries(coverage)) if (review.coverage[key] !== catalog.records.filter(e => e.kind === kind && e.wiki).length) fail(`Wiki ${kind} 核对数量与报告不一致`);
    if (review.coverage.unresolvedIdentities !== catalog.records.filter(e => e.wiki?.identityStatus === 'unresolved').length) fail('Wiki 未确认身份数量与报告不一致');
    if (review.coverage.vanquishableAreas !== catalog.records.filter(e => e.kind === 'zone' && e.vanquishable).length) fail('Wiki 清剿目标数量与报告不一致');
    if (catalog.stories?.length !== 4 || review.coverage.storylines !== 4) fail('剧情指南必须覆盖四个篇章');
    unique(catalog.stories.map(story => story.campaign), '剧情篇章');
    for (const story of catalog.stories) {
      if (!requiredCampaigns.includes(story.campaign) || !story.arcs?.length || !story.references?.length) fail('剧情资料不完整');
      for (const source of story.references) reference(source);
    }
    try { if (!(await fs.readFile(path.join(publicDir, 'licenses/gfdl-1.3.txt'), 'utf8')).includes('GNU Free Documentation License')) throw new Error(); }
    catch { fail('缺少 Wiki 原创文字的 GFDL 许可证'); }
  }
  const features=await validateFeatureData(publicDir,catalog);
  return { campaigns: catalog.campaigns.length, maps: regions.size, records: entries.size, images: images.size, sourceIssues: report.issues.length, counts, ...features };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('部署资料校验通过', await validateDeploymentData());
}
