import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, rows, jpegSize, stableId } from './format.mjs';
import { requireLegacyInputs } from './legacy-inputs.mjs';
import { applyWikiCorrections, writeWikiReview } from './wiki/apply.mjs';
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(web, '..'), out = path.join(web, 'public');
const campaigns = await requireLegacyInputs(root);
await fs.mkdir(path.join(out, 'data'), { recursive: true });
const report = { version: 1, sources: [], excluded: [], issues: [], counts: {}, mapVerification: [] };
const data = { version: 1, campaigns: [], regions: [], professions: [], records: [] };
const skills = new Map(), pets = new Map();
const issue = (kind, source, line, detail) => report.issues.push({ kind, source, line, detail });
async function read(dir, file) {
  const source = `${dir}/${file}`;
  try { const b = await fs.readFile(path.join(root, dir, file)); const decoded = decode(b); report.sources.push({ source, encoding: decoded.encoding, bytes: b.length }); return rows(decoded.text); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
}
async function asset(dir, file, dest) {
  const b = await fs.readFile(path.join(root, dir, file)); const target = path.join(out, 'assets', dest);
  await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, b); return `assets/${dest.replaceAll('\\', '/')}`;
}
for (const dir of campaigns) {
  const c = Number(dir.match(/^Campaign\.(\d+)/)[1]);
  for (const r of await read(dir, 'Elitelist.txt')) {
    const f = r.fields;
    if (f.length < 11 || !/^\d+$/.test(f[0])) { issue('malformed', `${dir}/Elitelist.txt`, r.line, r.raw); continue; }
    if (Number(f[0]) === 0) continue;
    const id = `skill:${c}:${Number(f[0])}`;
    if ([...skills.values()].some(s => Number(s.code) === Number(f[0]))) issue('duplicate-skill-code', dir, r.line, f[0]);
    let image;
    try { image = await asset(`${dir}/ImgElite`, `${f[0].padStart(4, '0')}.jpg`, `skills/${c}-${f[0]}.jpg`); } catch { issue('missing-image', dir, r.line, f[0]); }
    const rec = { id, kind: 'skill', name: f[2], campaign: c, code: f[0], profession: Number(f[1]), attribute: f[3], description: f[10], details: [f[4], `维持：${f[5]} · 怒气：${f[6]} · 能量：${f[7]} · 施放：${f[8]} · 冷却：${f[9]}`], image, locations: [], source: { file: `${dir}/Elitelist.txt`, line: r.line } };
    data.records.push(rec); skills.set(`${c}:${Number(f[0])}`, rec);
  }
  if (c === 0) for (const r of await read(dir, 'PetsList.txt')) pets.set(Number(r.fields[0]), { code: r.fields[0], name: r.fields[1], description: `等级：${r.fields[2] || '未知'}` });
}
for (const dir of campaigns) {
  const c = Number(dir.match(/^Campaign\.(\d+)/)[1]); if (!c) continue;
  data.campaigns.push({ id: c, name: dir.replace(/^Campaign\.\d+\./, ''), shortName: ['','预言','盟与敌','黑暗逆袭','北方之眼'][c] });
  const entries = await fs.readdir(path.join(root, dir));
  report.excluded.push(...entries.filter(n => /副本|附件/.test(n)).map(n => `${dir}/${n}`));
  const regions = new Map(), zones = new Map(), collectors = new Map(), bosses = [];
  for (const r of await read(dir, 'Regions.txt')) {
    const n = Number(r.fields[0]), file = `${String(n).padStart(2, '0')}.JPG`;
    const region = { id: `${c}:${n}`, code: n, campaign: c, name: r.fields[1], verified: false };
    try { const b = await fs.readFile(path.join(root, dir, file)); Object.assign(region, jpegSize(b), { image: await asset(dir, file, `maps/${c}-${n}.jpg`) }); }
    catch { issue('missing-map', dir, r.line, file); }
    regions.set(n, region); data.regions.push(region);
  }
  for (const r of await read(dir, 'Professions.txt')) if (!data.professions.some(p => p.id === Number(r.fields[0]))) data.professions.push({ id: Number(r.fields[0]), name: ['','战士','游侠','僧侣','死灵','幻术','元素','刺客','祭祀','圣言','游侠之风'][Number(r.fields[0])] || r.fields[1], originalName: r.fields[1] });
  // Profession codes 9/10 are Paragon/Dervish, independent of translated source labels.
  const source = (file, r) => ({ file: `${dir}/${file}`, line: r.line });
  function location(f, ri, xi, yi, zi, src, note = '') {
    const region = regions.get(Number(f[ri])), x = Number(f[xi]), y = Number(f[yi]);
    const valid = !!region?.image && f[xi] !== '' && f[yi] !== '' && Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= region.width && y <= region.height;
    if (!region) issue('missing-region', src.file, src.line, f[ri]);
    if (region && !valid) issue('out-of-bounds', src.file, src.line, { region: region.id, x, y });
    return { id: stableId('loc', `${src.file}:${src.line}`), region: region?.id || `${c}:${Number(f[ri])}`, zone: zi == null ? undefined : `${c}:${Number(f[zi])}`, x, y, valid, note, source: src };
  }
  for (const r of await read(dir, 'Zones.txt')) {
    const f = r.fields;
    if (f.length < 7 || !/^\d+$/.test(f[0])) { issue('malformed', `${dir}/Zones.txt`, r.line, r.raw); continue; }
    const rec = { id: `zone:${c}:${Number(f[0])}`, kind: 'zone', name: f[6], campaign: c, code: f[0], description: ['','探索区域','前哨站','任务','城镇','挑战任务','地下城入口'][Number(f[2])] || '区域', vanquishable: f[3] === '1', details: [], locations: [location(f, 1, 4, 5, null, source('Zones.txt', r))], source: source('Zones.txt', r) };
    zones.set(Number(f[0]), rec); data.records.push(rec);
  }
  for (const r of await read(dir, 'EliteLocations.txt')) {
    const f = r.fields;
    if (f.length < 7 || !/^\d+$/.test(f[0])) { issue('malformed', `${dir}/EliteLocations.txt`, r.line, r.raw); continue; }
    const loc = location(f, 1, 2, 3, 6, source('EliteLocations.txt', r), f[7] || '');
    const code = Number(f[0]);
    const candidates = [...skills.values()].filter(s => Number(s.code) === code);
    const skill = skills.get(`${c}:${code}`) || skills.get(`0:${code}`) || (candidates.length === 1 ? candidates[0] : undefined);
    const boss = { id: stableId(`boss:${c}`, r.raw), kind: 'boss', campaign: c, name: f[4] || '未命名 Boss', profession: skill?.profession, description: f[7] || '', details: f[5] ? [`原始图例：${f[5]}`] : [], locations: [loc], related: skill ? [skill.id] : [], source: source('EliteLocations.txt', r) };
    if (skill) { skill.locations.push({ ...loc, boss: boss.name, bossId: boss.id }); skill.related = [...(skill.related || []), boss.id]; }
    else if (code !== 0) issue('missing-skill', `${dir}/EliteLocations.txt`, r.line, f[0]);
    data.records.push(boss); bosses.push(boss);
  }
  for (const r of await read(dir, 'Greens.txt')) {
    const f = r.fields;
    if (f.length < 3) issue('incomplete-green', `${dir}/Greens.txt`, r.line, r.raw);
    const matches = bosses.filter(b => b.name === f[1]);
    // Exact name matches are candidates only; ambiguous identities never become coordinates.
    const related = matches.length === 1 ? [matches[0].id] : [];
    if (matches.length !== 1) issue(matches.length ? 'ambiguous-boss' : 'unlocated-green', `${dir}/Greens.txt`, r.line, f[1]);
    const rec = { id: stableId(`green:${c}`, r.raw), kind: 'green', campaign: c, name: f[0], description: `原始掉落来源：${f[1] || '未提供'}`, details: [...f.slice(2).filter(Boolean), ...(matches.length === 1 ? ['地点依据本篇章唯一同名 Boss 关联，未在游戏中核验。'] : [])], locations: matches.length === 1 ? matches[0].locations : [], related, source: source('Greens.txt', r) };
    data.records.push(rec); if (matches.length === 1) matches[0].related.push(rec.id);
  }
  const cr = await read(dir, 'Collectors.txt');
  for (let i = 0; i < cr.length; i++) {
    const r = cr[i], f = r.fields;
    if (!/^\d+$/.test(f[0]) || f.length < 3) { issue('malformed-collector', `${dir}/Collectors.txt`, r.line, r.raw); continue; }
    const block = []; while (i + 1 < cr.length && !/^\d+\t/.test(cr[i + 1].raw)) block.push(cr[++i]);
    const rec = { id: `collector:${c}:${Number(f[0])}`, kind: 'collector', name: f[1], campaign: c, code: f[0], description: block[0]?.raw || '', details: [block[1] ? `兑换材料：${block[1].raw}` : '', ...block.slice(2).map(b => b.fields.join(' · '))].filter(Boolean), locations: [], source: source('Collectors.txt', r) };
    collectors.set(Number(f[0]), rec); data.records.push(rec);
  }
  for (const r of await read(dir, 'CollectorsLocations.txt')) {
    const rec = collectors.get(Number(r.fields[0]));
    if (rec) rec.locations.push(location(r.fields, 1, 2, 3, 4, source('CollectorsLocations.txt', r)));
    else issue('missing-collector', `${dir}/CollectorsLocations.txt`, r.line, r.fields[0]);
  }
  const localPets = new Map();
  for (const r of await read(dir, 'PetsLocations.txt')) {
    const f = r.fields, pet = pets.get(Number(f[0]));
    if (!pet) { issue('missing-pet', `${dir}/PetsLocations.txt`, r.line, f[0]); continue; }
    let rec = localPets.get(f[0]);
    if (!rec) { rec = { ...pet, id: `pet:${c}:${Number(f[0])}`, campaign: c, kind: 'pet', details: [], locations: [], source: source('PetsLocations.txt', r) }; localPets.set(f[0], rec); data.records.push(rec); }
    rec.locations.push(location(f, 1, 3, 4, 2, source('PetsLocations.txt', r), f[5] || ''));
  }
  for (const r of await read(dir, 'Treasures.txt')) {
    const f = r.fields;
    data.records.push({ id: stableId(`treasure:${c}`, r.raw), campaign: c, kind: 'treasure', name: f[0], description: '记录每位角色的开启进度与日期', details: [], locations: [location(f, 3, 1, 2, 4, source('Treasures.txt', r))], source: source('Treasures.txt', r) });
  }
  for (const record of data.records) for (const loc of record.locations.filter(l => l.region.startsWith(`${c}:`))) if (loc.zone && !zones.has(Number(loc.zone.split(':')[1]))) issue('missing-zone', loc.source.file, loc.source.line, loc.zone);
}
// Map identity is approved only after visual landmark inspection; bounds alone do not establish identity.
let verified = {};
try { verified = JSON.parse(await fs.readFile(path.join(web, 'scripts/map-verification.json'), 'utf8')); } catch {}
for (const r of data.regions) {
  r.verified = !!verified[r.id];
  report.mapVerification.push({ region: r.id, name: r.name, image: r.image, width: r.width, height: r.height, verified: r.verified, evidence: verified[r.id] || null });
}
const ids = new Set();
for (const r of data.records) {
  if (ids.has(r.id)) { issue('duplicate-record', r.source.file, r.source.line, r.id); r.id = `${r.id}:line-${r.source.line}`; }
  ids.add(r.id); report.counts[r.kind] = (report.counts[r.kind] || 0) + 1;
}
// Deduplicate repeated diagnostics from shared locations while preserving distinct source lines.
report.issues = [...new Map(report.issues.map(i => [JSON.stringify(i), i])).values()];
data.professions.forEach(p => { if (p.id === 9) p.name = '圣言者'; if (p.id === 10) p.name = '神唤'; });
await applyWikiCorrections(data, report);
await writeWikiReview(path.join(out, 'data/wiki-review.json'));
await fs.writeFile(path.join(out, 'data/catalog.json'), JSON.stringify(data));
await fs.writeFile(path.join(out, 'data/report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ counts: report.counts, issues: report.issues.length, verifiedMaps: data.regions.filter(r => r.verified).length, totalMaps: data.regions.length }, null, 2));
