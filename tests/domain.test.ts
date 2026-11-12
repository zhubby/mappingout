import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { completed, defaultFilters, deleteCharacter, filtersSearch, normalizeFilters, preferredPlace, query, readFilters, setProgress, toggleProgress } from '../src/domain';
import { emptyPersonal, makeBackup, parseBackup, personalStore } from '../src/storage';
import type { Catalog } from '../src/types';
import 'fake-indexeddb/auto';
const catalog: Catalog = JSON.parse(fs.readFileSync('public/data/catalog.json','utf8'));
function personal() { return {...emptyPersonal(),characters:[{id:'a',name:'角色甲'},{id:'b',name:'角色乙'}],preferences:{...emptyPersonal().preferences,characterId:'a'}}; }
describe('queries and progress',()=>{
  it('searches Chinese names, boss names, descriptions, attributes and multiple locations',()=>{
    const f={...defaultFilters,q:'劈击'}; expect(query(catalog,f,personal()).some(e=>e.name==='劈击')).toBe(true);
    const skill=catalog.records.find(e=>e.kind==='skill'&&e.locations.some(l=>l.boss))!;
    expect(query(catalog,{...f,q:skill.locations[0].boss!},personal()).some(e=>e.id===skill.id)).toBe(true);
    expect(query(catalog,{...f,q:'',attribute:'精通斧术',profession:'1'},personal()).every(e=>e.profession===1&&e.attribute==='精通斧术')).toBe(true);
  });
  it('filters a shared skill by the chapter of its actual location',()=>{ const result=query(catalog,{...defaultFilters,campaign:'1'},personal()); expect(result.some(e=>e.campaign===0&&e.locations.length>0)).toBe(true); });
  it('isolates character progress and removes dependent records only for a deleted character',()=>{
    const s=toggleProgress(personal(),'skill:0:1'); expect(completed(s,'skill:0:1')?.done).toBe(true);
    const switched={...s,preferences:{...s.preferences,characterId:'b'}}; expect(completed(switched,'skill:0:1')).toBeUndefined();
    expect(deleteCharacter(s,'a').progress).toHaveLength(0);expect(deleteCharacter(s,'a').preferences.characterId).toBe('b');
    expect(query(catalog,{...defaultFilters,incomplete:true},s).some(e=>e.id==='skill:0:1')).toBe(false);
  });
  it('round trips shareable filters, Unicode, selection and map',()=>{ const f={...defaultFilters,q:'火 & 冰',selected:'skill:0:1',region:'1:6',map:'1:6',incomplete:true}; expect(readFilters(filtersSearch(f))).toEqual(f); });
  it('drops unsupported filters when changing type or opening an old shared URL',()=>{
    const skillFilters = {...defaultFilters,profession:'1',attribute:'精通斧术'};
    expect(normalizeFilters({...skillFilters,kind:'boss'})).toMatchObject({profession:'1',attribute:''});
    expect(normalizeFilters({...skillFilters,kind:'green'})).toMatchObject({profession:'',attribute:''});
    expect(readFilters('?kind=green&profession=1&attribute=精通斧术')).toMatchObject({profession:'',attribute:''});
    for(const kind of ['boss','green','collector','pet','treasure','zone'] as const) {
      const results=query(catalog,{...defaultFilters,kind,attribute:'精通斧术'},personal());
      expect(results.length).toBeGreaterThan(0);
    }
  });
  it('locates the same skill inside the current chapter, region and zone',()=>{
    const entry=catalog.records.find(e=>e.id==='skill:0:1')!;
    const filter={...defaultFilters,campaign:'2',region:'2:2',map:'2:2'};
    expect(preferredPlace(entry,filter)?.region).toBe('2:2');
    const zone=entry.locations.find(l=>l.region==='2:2')!.zone!;
    expect(preferredPlace(entry,{...filter,zone})?.zone).toBe(zone);
    expect(preferredPlace(entry,{...defaultFilters,campaign:'2'})?.region.startsWith('2:')).toBe(true);
    expect(preferredPlace(entry,{...defaultFilters,map:'2:2'})?.region).toBe('2:2');
    expect(preferredPlace(entry,{...filter,zone:'2:nonexistent'})).toBeUndefined();
  });
});
describe('backup and IndexedDB',()=>{
  it('round trips independent progress, treasure dates, notes and layers',async()=>{
    let s=toggleProgress(personal(),'treasure:test','2026-11-12');s.notes=[{id:'n',characterId:'a',region:'1:6',x:123,y:456,text:'下次探索'}];
    const restored=parseBackup(JSON.stringify(makeBackup(s))).data;expect(restored).toEqual(s);
    await personalStore.save(s);expect(await personalStore.load()).toEqual(s);
  });
  it('rejects unsupported versions, malformed data, orphan references, duplicates and invalid dates',()=>{
    const b=makeBackup(personal()); expect(()=>parseBackup('{bad')).toThrow();expect(()=>parseBackup(JSON.stringify({...b,version:99}))).toThrow();
    for(const transform of [
      (s:any)=>s.characters.push({...s.characters[0]}),
      (s:any)=>s.progress.push({characterId:'missing',entryId:'s',done:true}),
      (s:any)=>s.progress.push({characterId:'a',entryId:'s',done:true,date:'2026-02-30'}),
      (s:any)=>s.notes.push({id:'n',characterId:'a',region:'1:6',x:-1,y:3,text:'bad'})
    ]){ const bad=structuredClone(b);transform(bad.data);expect(()=>parseBackup(JSON.stringify(bad))).toThrow(); }
  });
  it('keeps the stored snapshot intact after an invalid replacement',async()=>{ const s=personal();await personalStore.save(s);await expect(personalStore.save({characters:[]} as any)).rejects.toThrow();expect(await personalStore.load()).toEqual(s); });
  it('serializes concurrent progress and preference changes against the latest stored state',async()=>{
    await personalStore.save(personal());
    await Promise.all([
      personalStore.update(s=>setProgress(s,'skill:0:1','a',true)),
      personalStore.update(s=>({...s,preferences:{...s.preferences,layers:s.preferences.layers.filter(k=>k!=='boss')}})),
      personalStore.update(s=>setProgress(s,'skill:0:2','b',true))
    ]);
    const saved=await personalStore.load();
    expect(saved.progress).toEqual(expect.arrayContaining([
      {entryId:'skill:0:1',characterId:'a',done:true},
      {entryId:'skill:0:2',characterId:'b',done:true}
    ]));
    expect(saved.preferences.layers).not.toContain('boss');
  });
  it('keeps an operation attached to its original character and rejects edits to a deleted one',async()=>{
    await personalStore.save(personal());
    await personalStore.update(s=>({...s,preferences:{...s.preferences,characterId:'b'}}));
    await personalStore.update(s=>setProgress(s,'skill:0:1','a',true));
    expect((await personalStore.load()).progress[0].characterId).toBe('a');
    await personalStore.update(s=>deleteCharacter(s,'a'));
    const before=await personalStore.load();
    await expect(personalStore.update(s=>setProgress(s,'skill:0:2','a',true))).rejects.toThrow('删除');
    expect(await personalStore.load()).toEqual(before);
  });
  it('does not undo progress when two pages set the same completed status',async()=>{
    await personalStore.save(personal());
    await Promise.all([personalStore.update(s=>setProgress(s,'skill:0:1','a',true)),personalStore.update(s=>setProgress(s,'skill:0:1','a',true))]);
    expect((await personalStore.load()).progress).toEqual([{entryId:'skill:0:1',characterId:'a',done:true}]);
  });
  it('does not report a committed operation as failed when cross-tab notification throws',async()=>{
    class BrokenChannel { onmessage = null; postMessage() { throw new Error('messaging unavailable'); } close() {} }
    vi.stubGlobal('BroadcastChannel',BrokenChannel);
    const unsubscribe=personalStore.subscribe(()=>{});
    try {
      await personalStore.save(personal());
      await expect(personalStore.update(s=>setProgress(s,'skill:0:1','a',true))).resolves.toMatchObject({progress:[{entryId:'skill:0:1',characterId:'a',done:true}]});
      expect((await personalStore.load()).progress[0].done).toBe(true);
    } finally { unsubscribe();vi.unstubAllGlobals(); }
  });
});
