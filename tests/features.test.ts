import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import type { ActivityCatalog, ArmorCatalog, ArmorPlan } from '../src/feature-types';
import { armorTotal, dateInZone, dateStart, nextOccurrence, occurrenceAt, occurrencesOnDate, planPieces, saveArmorPlan, setActivityProgress, setArmorPiece } from '../src/features-domain';
import { emptyPersonal, makeBackup, migratePersonalV1, parseBackup, personalStore } from '../src/storage';
import { deleteCharacter } from '../src/domain';
import { armorFacts } from '../scripts/wiki/armor-facts.mjs';
import { validateFeatureData } from '../scripts/validate-features.mjs';

const armor:ArmorCatalog=JSON.parse(fs.readFileSync('public/data/armor.json','utf8'));
const calendar:ActivityCatalog=JSON.parse(fs.readFileSync('public/data/calendar.json','utf8'));
const fixtures=JSON.parse(fs.readFileSync('data/wiki/calendar-fixtures.json','utf8'));
const personal=()=>({...emptyPersonal(),characters:[{id:'a',name:'角色甲'},{id:'b',name:'角色乙'}],preferences:{...emptyPersonal().preferences,characterId:'a'}});
const offers=(title:string)=>armor.offers.filter(o=>o.armorId===armor.sets.find(s=>s.englishName===title)!.id);

describe('reviewed armor recipes',()=>{
  it('validates all professions, image assets, material references and complete cycles',async()=>{expect(await validateFeatureData('public')).toEqual({armorSets:298,armorOffers:1057,activities:430});});
  it('retains different materials and ratings for the same appearance in two campaigns',()=>{
    const variants=offers('Warrior Ascalon armor');
    const early=variants.find(o=>o.campaign===1&&o.armorRating===35)!;
    expect(armorTotal(early.pieces)).toEqual({gold:100,materials:[{materialId:'material:iron-ingot',quantity:8}]});
    const maximum=variants.find(o=>o.campaign===2&&o.armorRating===80)!;
    expect(armorTotal(maximum.pieces)).toEqual({gold:5000,materials:[{materialId:'material:steel-ingot',quantity:32},{materialId:'material:tanned-hide-square',quantity:200}]});
    expect(variants.filter(o=>o.campaign===1).every(o=>o.armorRating<=59)).toBe(true);
  });
  it('keeps the exceptional Vabbian crest cost and no-head sets without fabricating pieces',()=>{
    const offer=offers('Paragon Vabbian armor')[0];
    expect(offer.pieces.find(p=>p.id==='head')!.gold).toBe(1000);
    expect(offer.pieces.filter(p=>p.id!=='head').every(p=>p.gold===5000)).toBe(true);
    expect(armorTotal(offer.pieces).gold).toBe(21000);
    const obsidian=offers('Elementalist Obsidian armor')[0];
    expect(obsidian.pieces).toHaveLength(4);expect(obsidian.pieces.some(p=>p.id==='head')).toBe(false);
    expect(armorTotal(obsidian.pieces).gold).toBe(60000);
  });
  it('preserves partial inventories and independent pieces at their actual crafters',()=>{
    const gladiator=offers('Warrior Gladiator armor');
    expect(gladiator.find(o=>armor.armorers.find(a=>a.id===o.armorerId)!.name==='Corwen')!.pieces.map(p=>p.id)).toEqual(['head']);
    expect(offers('Warrior Heavy Breastplate')[0].pieces.map(p=>p.id)).toEqual(['chest']);
    expect(armor.sets.some(s=>s.englishName==='Destroyer Gauntlets')).toBe(false);
    const drakescale=offers('Ranger Drakescale armor').filter(o=>o.armorRating===55);
    expect(drakescale).toHaveLength(2);for(const o of drakescale){expect(armorTotal(o.pieces).gold).toBe(800);expect(o.notes).toContain('600');}
  });
  it('expands original rowspan tables and preserves rank requirements',()=>{
    const set=armor.sets.find(s=>s.englishName==='Warrior Norn armor')!;
    const source=JSON.parse(fs.readFileSync(`data/wiki/pages/${set.reference.pageid}.json`,'utf8'));
    expect(armorFacts(source).offers[0].pieces).toHaveLength(5);
    expect(armorFacts(source).set.notes).toContain('rank 5');
  });
});

describe('game rotation boundaries and display dates',()=>{
  it.each(fixtures)('matches independent live Wiki template expansion at $at',(fixture:any)=>{
    expect(['mission','bounty','combat','vanquish'].map(kind=>occurrenceAt(calendar,kind,Date.parse(fixture.at))!.activity.englishName)).toEqual(fixture.quests);
  });
  it('changes each daily quest at 16:00 UTC, rather than a browser-local midnight',()=>{
    const before=Date.parse('2026-11-13T15:59:59Z'),after=before+1000;
    expect(occurrenceAt(calendar,'mission',before)!.activity.englishName).toBe('Blacktide Den');
    expect(occurrenceAt(calendar,'mission',after)!.activity.englishName).toBe('Against the Charr');
    expect(dateInZone(after,'Asia/Shanghai')).toBe('2026-11-14');
    expect(occurrencesOnDate(calendar,'2026-11-14','Asia/Shanghai').find(o=>o.activity.kind==='mission')!.start).toBe(after);
    expect(occurrencesOnDate(calendar,'2026-11-13','UTC').find(o=>o.activity.kind==='mission')!.start).toBe(after);
  });
  it('changes weekly schedules at Monday 15:00 UTC and keeps both weekly tracks independent',()=>{
    const after=Date.parse('2026-11-16T15:00:00Z');
    expect(occurrenceAt(calendar,'pve-bonus',after-1)!.activity.englishName).toBe('Zaishen Bounty Bonus');
    expect(occurrenceAt(calendar,'pve-bonus',after)!.activity.englishName).toBe('Factions Elite Bonus');
    expect(occurrenceAt(calendar,'pvp-bonus',after)!.activity.englishName).toBe("Heroes' Ascent Bonus");
    expect(occurrenceAt(calendar,'traveler',after)!.start).toBe(after);
  });
  it('wraps cycles in both directions and finds the next repeat within combat rotations',()=>{
    for(const r of calendar.rotations){expect(occurrenceAt(calendar,r.id,r.epoch+r.sequence.length*r.period)!.activity.id).toBe(r.sequence[0]);expect(occurrenceAt(calendar,r.id,r.epoch-1)!.activity.id).toBe(r.sequence.at(-1));}
    const now=Date.parse('2026-11-13T16:00Z'),a=occurrenceAt(calendar,'combat',now)!;
    const next=nextOccurrence(calendar,a.activity.id,now)!;
    expect(next.start).toBeGreaterThan(now);expect(next.start-now).toBeLessThan(28*86400000);
  });
  it('uses real civil-date boundaries across DST and year changes',()=>{
    expect(dateStart('2026-03-08','America/New_York')).toBe(Date.parse('2026-03-08T05:00Z'));
    expect(dateStart('2026-03-09','America/New_York')-dateStart('2026-03-08','America/New_York')).toBe(23*3600000);
    expect(dateStart('2026-11-02','America/New_York')-dateStart('2026-11-01','America/New_York')).toBe(25*3600000);
    expect(dateInZone(Date.parse('2026-12-31T16:00Z'),'Asia/Shanghai')).toBe('2027-01-01');
  });
});

describe('plans, occurrence records and versioned personal data',()=>{
  function plan():ArmorPlan{return {id:'p',characterId:'a',name:'出发前的护甲',offerId:offers('Warrior Ascalon armor')[0].id,pieceIds:['head','chest'],completedPieceIds:[]};}
  it('saves a character plan and computes only remaining pieces after completion',()=>{
    const offer=offers('Warrior Ascalon armor')[0];let s=saveArmorPlan(personal(),plan());s=setArmorPiece(s,'p','a','head',true);
    expect(armorTotal(planPieces(s.armorPlans[0],offer)).gold).toBe(40);
    expect(armorTotal(planPieces(s.armorPlans[0],offer,true)).gold).toBe(20);
    expect(s.armorPlans[0].characterId).toBe('a');expect(()=>setArmorPiece(s,'p','b','head',true)).toThrow();
    expect(deleteCharacter(s,'a').armorPlans).toEqual([]);
  });
  it('isolates daily completions by character and occurrence without updating permanent progress',()=>{
    const now=Date.parse('2026-11-13T17:00Z'),o=occurrenceAt(calendar,'mission',now)!;
    const state=setActivityProgress(personal(),o,'a',true,now);
    expect(state.progress).toEqual([]);expect(state.activityProgress).toHaveLength(1);
    const later=nextOccurrence(calendar,o.activity.id,now)!;
    expect(()=>setActivityProgress(state,later,'a',true,now)).toThrow('未来');
    expect(()=>setActivityProgress(state,occurrenceAt(calendar,'traveler',now)!,'a',true,now)).toThrow();
    expect(setActivityProgress(state,o,'b',true,now).activityProgress).toHaveLength(2);
    expect(deleteCharacter(state,'a').activityProgress).toEqual([]);
  });
  it('accepts v1 backups explicitly and round trips the v2 additions',()=>{
    const {armorPlans:_plans,activityProgress:_activities,...old}=personal();
    const restored=parseBackup(JSON.stringify({format:'mappingout-backup',version:1,exportedAt:new Date().toISOString(),data:old}));
    expect(restored.migratedFrom).toBe(1);expect(restored.data.armorPlans).toEqual([]);
    const state=saveArmorPlan(restored.data,plan());expect(parseBackup(JSON.stringify(makeBackup(state))).data).toEqual(state);
    const invalid=makeBackup(state);invalid.data.armorPlans[0].completedPieceIds=['feet'];expect(()=>parseBackup(JSON.stringify(invalid))).toThrow();
  });
  it('migrates a real version 1 database and prevents old-version clients from overwriting it',async()=>{
    const previous=globalThis.indexedDB;globalThis.indexedDB=new IDBFactory();
    try{const old=await openDB('mappingout',1,{upgrade(db){db.createObjectStore('personal');}});const {armorPlans:_p,activityProgress:_a,...state}=personal();await old.put('personal',state,'state');old.close();expect(await personalStore.load()).toEqual(migratePersonalV1(state));const upgraded=await openDB('mappingout');expect(upgraded.version).toBe(2);upgraded.close();await expect(openDB('mappingout',1)).rejects.toMatchObject({name:'VersionError'});}finally{globalThis.indexedDB=previous;}
  });
  it('serializes feature edits with older progress operations and refuses invalid replacements',async()=>{
    await personalStore.save(personal());const o=occurrenceAt(calendar,'mission',Date.now())!;
    await Promise.all([personalStore.update(s=>saveArmorPlan(s,plan())),personalStore.update(s=>setActivityProgress(s,o,'b',true)),personalStore.update(s=>({...s,notes:[{id:'note',characterId:'a',region:'1:1',x:1,y:2,text:'路线'}]}))]);
    const saved=await personalStore.load();expect(saved.armorPlans).toHaveLength(1);expect(saved.activityProgress).toHaveLength(1);expect(saved.notes).toHaveLength(1);
    const bad=structuredClone(saved);bad.armorPlans[0].characterId='deleted';await expect(personalStore.save(bad)).rejects.toThrow();expect(await personalStore.load()).toEqual(saved);
  });
});
