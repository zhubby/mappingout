/**
 * [INPUT]: 依赖真实个人存储、任务领域规则和内存 IndexedDB。
 * [OUTPUT]: 验证任务分支、角色隔离、奖励独立与 v3 数据迁移。
 * [POS]: 任务持久化与前置语义的回归边界。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { changeQuest, changeQuestProfile, questRecord, requirementState } from '../src/quests-domain';
import { emptyPersonal, makeBackup, parseBackup, personalStore, validatePersonal } from '../src/storage';
import { deleteCharacter } from '../src/domain';
import type { QuestRequirement } from '../src/quest-types';
const state = () => ({ ...emptyPersonal(), characters:[{id:'a',name:'甲'},{id:'b',name:'乙'}], preferences:{...emptyPersonal().preferences,characterId:'a'} });
const done = (id:string):QuestRequirement => ({op:'quest',questId:id});

describe('quest relationships and records',()=>{
  it('requires all desert trials but accepts either faction branch',()=>{
    let personal=changeQuest(state(),'a','dunes','normal',{completed:true});
    personal=changeQuest(personal,'a','river','hard',{completed:true});
    const trials:QuestRequirement={op:'all',items:[done('dunes'),done('river'),done('reach')]};
    expect(requirementState(trials,personal)).toBe('blocked');
    personal=changeQuest(personal,'a','reach','normal',{completed:true});
    expect(requirementState(trials,personal)).toBe('ready');
    expect(requirementState({op:'any',items:[done('dunes'),done('other')]},personal)).toBe('ready');
    expect(requirementState(trials,personal,'b')).toBe('blocked');
  });
  it('keeps unconfirmed dialogue conditions distinct from incomplete quests',()=>{
    const requirement:QuestRequirement={op:'all',items:[{op:'condition',id:'dialogue',text:'Speak to Gwen'}]};
    expect(requirementState(requirement,state())).toBe('unknown');
    const personal=changeQuestProfile(state(),'a',profile=>({...profile,conditions:{dialogue:true}}));
    expect(requirementState(requirement,personal)).toBe('ready');
    expect(requirementState(requirement,personal,'b')).toBe('unknown');
  });
  it('checks an explicit normal prerequisite against normal records only',()=>{
    const personal=changeQuest(state(),'a','quest','hard',{completed:true});
    expect(requirementState({op:'quest',questId:'quest',mode:'normal'},personal)).toBe('blocked');
    expect(requirementState({op:'quest',questId:'quest',mode:'hard'},personal)).toBe('ready');
  });
  it('preserves bonus without main completion and normal progress when hard mode changes',()=>{
    let personal=changeQuest(state(),'a','mission','normal',{bonus:true});
    expect(questRecord(personal,'mission','normal')).toMatchObject({bonus:true,completed:false});
    personal=changeQuest(personal,'a','mission','hard',{mastery:3});
    expect(questRecord(personal,'mission','hard')).toMatchObject({completed:true,mastery:3});
    expect(questRecord(personal,'mission','normal')?.completed).toBe(false);
    personal=changeQuest(personal,'a','mission','hard',{active:true});
    expect(questRecord(personal,'mission','hard')).toMatchObject({completed:true,active:true,mastery:3});
    expect(questRecord(personal,'mission','hard','b')).toBeUndefined();
    expect(()=>changeQuest(personal,'missing','mission','normal',{completed:true})).toThrow();
  });
  it('round-trips task progress and removes every task record when a character is deleted',()=>{
    let personal=changeQuest(state(),'a','mission','normal',{completed:true});
    personal=changeQuestProfile(personal,'a',p=>({...p,profession:1,originCampaign:2,conditions:{hero:true}}));
    expect(parseBackup(JSON.stringify(makeBackup(personal))).data).toEqual(personal);
    expect(deleteCharacter(personal,'a')).toMatchObject({questProgress:[],questProfiles:[],preferences:{characterId:'b'}});
  });
  it('rejects orphan records, duplicate modes, invalid dates and prototype keys',()=>{
    const personal=changeQuest(state(),'a','mission','normal',{completed:true});
    expect(()=>validatePersonal({...personal,questProgress:[...personal.questProgress,...personal.questProgress]})).toThrow();
    expect(()=>validatePersonal({...personal,characters:[]})).toThrow();
    expect(()=>validatePersonal({...personal,questProgress:[{...personal.questProgress[0],updatedAt:'2026-02-30'}]})).toThrow();
    expect(()=>validatePersonal({...personal,questProfiles:[{characterId:'a',conditions:JSON.parse('{"__proto__":true}')}]})).toThrow();
    const imported=JSON.parse(JSON.stringify(personal));imported.questProgress[0].unexpected='discard';
    expect(validatePersonal(imported).questProgress[0]).not.toHaveProperty('unexpected');
  });
});
describe('v3 migration',()=>{
  it('imports v1 and v2 backups without losing existing records or inventing completed quests',()=>{
    const {questProgress:_q,questProfiles:_p,...old}=state();
    old.progress=[{characterId:'a',entryId:'skill:1',done:true}];
    const backup={format:'mappingout-backup',version:2,exportedAt:'2026-11-16T00:00:00Z',data:old};
    expect(parseBackup(JSON.stringify(backup))).toMatchObject({version:3,migratedFrom:2,data:{progress:old.progress,questProgress:[],questProfiles:[]}});
    const {armorPlans:_a,activityProgress:_c,...v1}=old;
    expect(parseBackup(JSON.stringify({...backup,version:1,data:v1}))).toMatchObject({version:3,migratedFrom:1,data:{progress:old.progress,armorPlans:[],activityProgress:[],questProgress:[]}});
    expect(()=>parseBackup(JSON.stringify({...backup,version:4}))).toThrow();
  });
  it('upgrades a real v2 database atomically and rejects older writer versions',async()=>{
    const previous=globalThis.indexedDB;globalThis.indexedDB=new IDBFactory();
    try{
      const old=await openDB('mappingout',2,{upgrade(db){db.createObjectStore('personal');}});
      const {questProgress:_q,questProfiles:_p,...saved}=state();
      await old.put('personal',saved,'state');old.close();
      expect(await personalStore.load()).toEqual({...saved,questProgress:[],questProfiles:[]});
      const db=await openDB('mappingout');expect(db.version).toBe(3);db.close();
      await expect(openDB('mappingout',2)).rejects.toMatchObject({name:'VersionError'});
      await Promise.all([personalStore.update(s=>changeQuest(s,'a','one','normal',{completed:true})),personalStore.update(s=>changeQuest(s,'b','two','hard',{completed:true}))]);
      expect((await personalStore.load()).questProgress).toHaveLength(2);
    }finally{globalThis.indexedDB=previous;}
  });
});
