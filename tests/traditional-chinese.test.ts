/**
 * [INPUT]: 依赖真实语言入口、设备偏好与游戏术语字典。
 * [OUTPUT]: 验证旧语言迁移、繁体标签和不可写设备存储。
 * [POS]: 繁体迁移回归；不改变个人备份与游戏实体身份。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {afterEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import {projectContent,translationOf,type ContentBundle} from '../src/i18n/content';
import {attributeId} from '../src/i18n/attributes';
import {searchSkills} from '../src/features/skills/query';
import type {SkillCatalog} from '../src/shared/contracts/skills';

afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
describe('Traditional Chinese locale migration',()=>{
  it.each([null,'zh-CN','invalid','zh-TW'])('migrates %s to persistent Traditional Chinese',async(saved)=>{
    vi.resetModules();
    const storage=new Map(saved?[['mappingout.locale',saved]]:[]);
    vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)});
    const locale=await import('../src/i18n');
    expect(locale.getLocale()).toBe('zh-TW');
    expect(storage.get('mappingout.locale')).toBe('zh-TW');
    expect(locale.t('神唤')).toBe('神喚使');
    expect(locale.t('刺客')).toBe('暗殺者');
    expect(locale.t('客户端设置')).toBe('用戶端設定');
  });
  it('keeps a saved English preference',async()=>{
    vi.resetModules();
    vi.stubGlobal('localStorage',{getItem:()=> 'en',setItem:()=>{throw Error('must not rewrite English');}});
    const locale=await import('../src/i18n');
    expect(locale.getLocale()).toBe('en');
    expect(locale.t('护甲制作')).toBe('Armor crafting');
  });
  it('starts and switches without device storage',async()=>{
    vi.resetModules();
    vi.stubGlobal('localStorage',{getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('denied');}});
    const locale=await import('../src/i18n');
    expect(locale.getLocale()).toBe('zh-TW');
    locale.setLocale('en');expect(locale.getLocale()).toBe('en');
    locale.setLocale('zh-TW' as Parameters<typeof locale.setLocale>[0]);expect(locale.getLocale()).toBe('zh-TW');
  });
});
it('accepts every displayed attribute and title name as a query alias',()=>{
  const read=(file:string)=>JSON.parse(fs.readFileSync(file,'utf8'));
  const original=read('public/data/skills.json') as SkillCatalog;
  const packs={'zh-TW':read('public/data/i18n/zh-TW/skills.json'),en:read('public/data/i18n/en/skills.json')};
  for(const [key,text]of Object.entries(packs.en.fields))if(key.endsWith('/attribute')||key.startsWith('tracks/')&&key.endsWith('/name'))expect(attributeId(packs['zh-TW'].fields[key]),key).toBe(attributeId(text as string));
  const data=projectContent({original,packs},'zh-TW'),options={levels:{attribute:12,titles:{}}};
  for(const english of ['Deldrimor rank','Norn rank','Asura rank']){
    const key=Object.keys(packs.en.fields).find(k=>k.endsWith('/attribute')&&packs.en.fields[k]===english)!;
    const name=packs['zh-TW'].fields[key];
    const expected=searchSkills(data,`屬性:"${english}"`,options);
    expect(expected.length).toBeGreaterThan(0);
    expect(searchSkills(data,`屬性:${name}`,options).map(m=>m.skill.id)).toEqual(expected.map(m=>m.skill.id));
  }
});
it('transfers honest source status and old aliases across the worker clone boundary',()=>{
  const original={skills:[{id:'s',name:'旧译名',englishName:'Example',variants:[]}]};
  const common={version:1 as const,dataset:'skills' as const,sourceHash:'fixture'};
  const pack={...common,locale:'zh-TW' as const,fields:{'skills/s/name':'新譯名'},legacyAliases:{'skills/s/name':['旧译名','補充別名']},unverifiedFields:['skills/s/name'],nameSources:{'skills/s/name':{kind:'wiki-term',references:[{site:'fandom',title:'新譯名',revid:7,revisionUrl:'https://example.test/?oldid=7'}]}}};
  const bundle:ContentBundle<typeof original>={original,packs:{'zh-TW':pack,en:{...common,locale:'en',fields:{'skills/s/name':'Example'}}}};
  const chinese=structuredClone(projectContent(bundle,'zh-TW')).skills[0];
  expect(translationOf(chinese)).toMatchObject({name:{kind:'wiki-term'},englishVerified:false});
  expect((chinese as typeof chinese&{searchAliases:string[]}).searchAliases).toContain('補充別名');
  expect((projectContent(bundle,'en').skills[0] as typeof chinese&{searchAliases:string[]}).searchAliases).toContain('旧译名');
  expect(original.skills[0]).not.toHaveProperty('translationInfo');
});
