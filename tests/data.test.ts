import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { decode, rows, jpegSize, stableId } from '../scripts/format.mjs';
import type { Catalog } from '../src/types';
const data: Catalog = JSON.parse(fs.readFileSync('public/data/catalog.json','utf8'));
describe('legacy conversion', () => {
  it('decodes UTF-8, GB18030 and UTF-16 without corrupting Chinese', () => {
    expect(decode(Buffer.from('精英技能')).text).toBe('精英技能');
    expect(decode(Buffer.from([0xbc,0xbc,0xc4,0xdc])).text).toBe('技能');
    expect(decode(Buffer.concat([Buffer.from([255,254]),Buffer.from('地图','utf16le')])).text).toBe('地图');
  });
  it('preserves empty tab columns and source line numbers', () => {
    expect(rows(';comment\r\n01\t\t中文\r\n')[0]).toMatchObject({line:2,fields:['01','','中文']});
  });
  it('provides unique identities and preserves all data categories across chapters', () => {
    expect(new Set(data.records.map(e=>e.id)).size).toBe(data.records.length);
    expect(data.campaigns).toHaveLength(4); expect(data.regions).toHaveLength(20);
    for(const kind of ['skill','boss','green','collector','pet','treasure','zone']) expect(data.records.filter(e=>e.kind===kind).length).toBeGreaterThan(0);
    expect(stableId('x','same')).toBe(stableId('x','same')); expect(stableId('x','a')).not.toBe(stableId('x','b'));
  });
  it('uses exact JPEG dimensions and verified image bounds', () => {
    for(const r of data.regions) { expect(r.verified).toBe(true); expect(jpegSize(fs.readFileSync(`public/${r.image}`))).toEqual({width:r.width,height:r.height}); }
    for(const e of data.records) for(const l of e.locations.filter(l=>l.valid)) { const r=data.regions.find(r=>r.id===l.region)!; expect(r).toBeDefined(); expect(l.x).toBeGreaterThanOrEqual(0);expect(l.y).toBeGreaterThanOrEqual(0);expect(l.x).toBeLessThanOrEqual(r.width);expect(l.y).toBeLessThanOrEqual(r.height); }
  });
  it('resolves shared core skill codes without allowing chapter duplicates to steal locations', () => {
    const core=data.records.find(e=>e.id==='skill:0:1')!, other=data.records.find(e=>e.id==='skill:4:1')!;
    expect(core.locations.length).toBeGreaterThan(0); expect(core.locations.every(l=>!l.region.startsWith('4:'))).toBe(true);
    expect(other.locations.every(l=>l.region.startsWith('4:'))).toBe(true);
  });
  it('does not invent coordinates for ambiguous or absent green drop sources', () => {
    const report=JSON.parse(fs.readFileSync('public/data/report.json','utf8'));
    for(const i of report.issues.filter((i:{kind:string})=>['ambiguous-boss','unlocated-green'].includes(i.kind))) { const rec=data.records.find(e=>e.source.file===i.source&&e.source.line===i.line); expect(rec?.locations).toHaveLength(0); }
  });
});
