/**
 * [INPUT]: 依赖双语投影、偏好、备份与资料验证器。
 * [OUTPUT]: 验证四套资料的双语覆盖与 v3 备份语言独立性。
 * [POS]: 国际化回归；不授予资料审校状态。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {afterEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import {getLocale,setLocale,t,displayMessage,localeKey} from '../src/i18n';
import {contentFields,type Dataset} from '../src/i18n/content-fields';
import {projectContent,originalOf,type ContentBundle} from '../src/i18n/content';
import { readFilters, query } from '../src/features/atlas/domain';
import { kindNames } from '../src/shared/game/kinds';
import { type Catalog } from '../src/shared/contracts/catalog';
import { emptyPersonal } from '../src/storage/defaults';
import { makeBackup, parseBackup } from '../src/storage/backup';
import { formatInstant } from '../src/features/calendar/domain';
import {validateI18n} from '../scripts/validate/validate-i18n.mjs';

afterEach(()=>{setLocale('zh-CN');vi.unstubAllGlobals();});
function bundle<T>(original:T,dataset:Dataset):ContentBundle<T>{
 const fields=contentFields(original,dataset);
 const pack=(locale:'zh-CN'|'en')=>({version:1 as const,dataset,locale,sourceHash:'fixture',fields:Object.fromEntries(fields.map(f=>[f.key,locale==='en'?(f.english||'English '+f.key):'中文 '+f.key]))});
 return {original,packs:{'zh-CN':pack('zh-CN'),en:pack('en')}};
}
describe('language preference and labels',()=>{
 it('defaults to Simplified Chinese and updates module-level labels immediately',()=>{
  expect(getLocale()).toBe('zh-CN');expect(kindNames.skill).toBe('技能');
  setLocale('en');expect(kindNames.skill).toBe('Skills');expect(t('护甲制作')).toBe('Armor crafting');
 });
 it('persists separately from backup data, including restore',()=>{
  const saved=new Map<string,string>();vi.stubGlobal('localStorage',{setItem:(k:string,v:string)=>saved.set(k,v),getItem:(k:string)=>saved.get(k)});
  const backup=makeBackup(emptyPersonal());setLocale('en');
  expect(saved.get(localeKey)).toBe('en');parseBackup(JSON.stringify(backup));
  expect(getLocale()).toBe('en');expect(backup.version).toBe(3);expect(JSON.stringify(backup)).not.toContain(localeKey);
 });
 it('can switch with unavailable device storage and relocalizes application errors',()=>{
  vi.stubGlobal('localStorage',{setItem:()=>{throw Error('denied');}});
  const message=t('备份已导出');setLocale('en');expect(displayMessage(message)).toBe('Backup exported');
  expect(displayMessage('native.backup-too-large')).toBe('Backup exceeds 20 MB.');
 });
 it('formats in the chosen language without changing calendar time zone',()=>{
  const instant=Date.UTC(2026,0,2,16);const cn=formatInstant(instant,'Asia/Shanghai');
  setLocale('en');const english=formatInstant(instant,'Asia/Shanghai');
  expect(cn).not.toBe(english);expect(english).toContain('00:00');
 });
});
describe('localized data projections',()=>{
 it('ships complete matching packs while withholding an unreviewed release',()=>{
  expect(validateI18n().errors).toEqual([]);
  const release=validateI18n(undefined,true);
  expect(release.errors).toContain('Font distribution not approved: Friz Quadrata Std');
  expect(release.errors.some((error:string)=>error.includes('still require review'))).toBe(true);
 },20000); // Reads and hashes the complete corpus for normal and release checks.
 it('preserves all shipped coordinates, recipes, progress identities and rotation facts',()=>{
  for(const dataset of ['catalog','armor','calendar','quests','skills'] as const){
   const original=JSON.parse(fs.readFileSync(`public/data/${dataset}.json`,'utf8'));
   const packs=Object.fromEntries((['zh-CN','en'] as const).map(locale=>[locale,JSON.parse(fs.readFileSync(`public/data/i18n/${locale}/${dataset}.json`,'utf8'))]));
   for(const locale of ['zh-CN','en'] as const){
    const localized=projectContent({original,packs} as ContentBundle<typeof original>,locale);
    if(dataset==='catalog'){
     expect(localized.records.map((e:any)=>[e.id,e.campaign,e.profession,e.vanquishable,e.locations.map((p:any)=>[p.id,p.region,p.zone,p.x,p.y,p.valid]),e.wiki])).toEqual(original.records.map((e:any)=>[e.id,e.campaign,e.profession,e.vanquishable,e.locations.map((p:any)=>[p.id,p.region,p.zone,p.x,p.y,p.valid]),e.wiki]));
     for(let i=0;i<original.records.length;i++)if(original.records[i].skill){
      for(const key of ['gameIds','energy','adrenaline','activation','recharge','upkeep','sacrifice','overcast','reference','elite','pveOnly','capturable'])expect(localized.records[i].skill[key]).toEqual(original.records[i].skill[key]);
     }
    }else if(dataset==='armor'){
     expect(localized.offers.map((o:any)=>[o.id,o.armorId,o.armorerId,o.zoneId,o.campaign,o.armorRating,o.ratingByProfession,o.pieces.map((p:any)=>[p.id,p.slot,p.gold,p.materials])])).toEqual(original.offers.map((o:any)=>[o.id,o.armorId,o.armorerId,o.zoneId,o.campaign,o.armorRating,o.ratingByProfession,o.pieces.map((p:any)=>[p.id,p.slot,p.gold,p.materials])]));
    }else if(dataset==='calendar'){
     expect(localized.rotations).toEqual(original.rotations);
     expect(localized.activities.map((a:any)=>[a.id,a.kind,a.zoneId,a.exchange?.perGift,a.references])).toEqual(original.activities.map((a:any)=>[a.id,a.kind,a.zoneId,a.exchange?.perGift,a.references]));
    }else if(dataset==='quests'){
     const facts=(q:any)=>[q.id,q.chapter,q.campaign,q.mode,q.kind,q.allowedOrigins,q.profession,q.references,q.images.map((i:any)=>[i.id,i.file,i.sha256]),JSON.parse(JSON.stringify(q.requirement,(key,value)=>key==='text'?undefined:value))];
     expect(localized.quests.map(facts)).toEqual(original.quests.map(facts));
    }else{
     const facts=(s:any)=>[s.id,s.legacyEntryIds,s.variants.map((v:any)=>[v.id,v.gameIds,v.modes,v.profession,v.campaigns,v.resources,v.effects.map((e:any)=>[e.id,e.axis,e.axisKind,e.values,e.metric,e.unit,e.scope,e.conditional,e.uncertain]),v.acquisition.map((a:any)=>[a.questId,a.zoneIds]),v.reference,v.image])];
     expect(localized.skills.map(facts)).toEqual(original.skills.map(facts));
    }
   }
  }
 });
 it('uses stable entity keys and preserves canonical facts, evidence and originals',()=>{
  const original={records:[{id:'skill:0:1',name:'劈击',englishName:'Cleave',campaign:0,attribute:'精通斧术',description:'说明',details:['伤害 10…34…40'],locations:[{id:'loc:1',x:10,y:20,valid:true,note:'备注'}],skill:{energy:'5',gameIds:[1],description:'English original'},wiki:{revid:123,url:'https://example.com'},legacy:{name:'旧版'}}]};
  const input=JSON.stringify(original),content=bundle(original,'catalog'),english=projectContent(content,'en'),chinese=projectContent(content,'zh-CN');
  expect(english.records[0].name).toBe('Cleave');expect(originalOf(english.records[0])).toBe(original.records[0]);
  expect(english.records[0].locations[0]).toMatchObject({id:'loc:1',x:10,y:20,valid:true});
  expect(english.records[0].skill.energy).toBe('5');expect(english.records[0].wiki).toEqual(original.records[0].wiki);
  expect(chinese.records[0].id).toBe(english.records[0].id);expect(JSON.stringify(original)).toBe(input);
  expect(contentFields(original,'catalog')[0].key).toBe('records/skill:0:1/name');
 });
 it('rejects missing translations instead of showing mixed content',()=>{
  const content=bundle({activities:[{id:'a',name:'任务',objective:'Defeat a foe'}]},'calendar');
  delete content.packs['zh-CN'].fields['activities/a/objective'];
  expect(()=>projectContent(content,'zh-CN')).toThrow('Missing zh-CN translation');
 });
 it('does not treat unresolved English aliases as confirmed identities',()=>{
  const fields=contentFields({records:[{id:'boss:unresolved',name:'身份待核实',englishName:'Hundred Blades',wiki:{identityStatus:'unresolved'}}]},'catalog');
  expect(fields[0].english).toBeUndefined();
 });
 it('preserves old attribute links and searches Chinese aliases in the English view',()=>{
  const data=JSON.parse(fs.readFileSync('public/data/catalog.json','utf8')) as Catalog;
  const filters=readFilters('?kind=skill&attribute='+encodeURIComponent('精通斧术'));
  expect(filters.attribute).toBe('axe-mastery');expect(query(data,filters,emptyPersonal()).length).toBeGreaterThan(0);
  const entry={...data.records[0],name:'Cleave',attribute:'Axe Mastery',searchAliases:['劈击','Cleave']};
  expect(query({...data,records:[entry]},{...filters,q:'劈击'},emptyPersonal())[0].id).toBe(entry.id);
 });
});
