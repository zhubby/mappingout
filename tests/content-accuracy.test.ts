/**
 * [INPUT]: 依赖固定 Wiki 事实、双语资料和翻译审校规则。
 * [OUTPUT]: 验证英文来源、数值签名和审校绑定。
 * [POS]: 资料准确性回归；防止译文覆盖事实或沿用失效审校。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {englishSource,numericIssues,numericSignature,translationReviewMatches} from '../scripts/i18n/english-source.mjs';
import {contentFields} from '../src/i18n/content-fields';
import {loadContent} from '../src/i18n/content';

const read=(file:string)=>JSON.parse(fs.readFileSync(file,'utf8'));
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
afterEach(()=>vi.unstubAllGlobals());

describe('English Wiki authority',()=>{
  it('takes a description from the Wiki facts even when the legacy Chinese is wrong',()=>{
    const reference={title:'Cleave',pageid:1,revid:123};
    const data={records:[{id:'skill:1',kind:'skill',name:'劈击',description:'旧版误写伤害 999',skill:{description:'Elite Axe Attack. +10 damage.',reference},wiki:reference}]};
    const field=contentFields(data,'catalog').find(f=>f.key.endsWith('/description')&&!f.key.includes('/skill/'))!;
    const source=englishSource(data,'catalog',field);
    expect(source.text).toBe('Elite Axe Attack. +10 damage.');
    expect(source.references).toEqual([reference]);
    expect(englishSource({records:[{id:'legacy',description:'无法确认的旧说明'}]},'catalog',{key:'records/legacy/description',path:['records',0,'description'],source:'无法确认的旧说明'})).toBeUndefined();
  });
  it('cites the PvP revision for PvP fields and preserves unresolved identities',()=>{
    const data={records:[{id:'skill:1',skill:{reference:{title:'Skill',pageid:1,revid:10},pvp:{description:'PvP effect 15%.',reference:{title:'Skill (PvP)',pageid:2,revid:20}}}}]};
    const field=contentFields(data,'catalog').find(f=>f.key.includes('/pvp/description'))!;
    expect(englishSource(data,'catalog',field).references).toEqual([{title:'Skill (PvP)',pageid:2,revid:20}]);
    const unresolved={records:[{id:'green:1',kind:'green',name:'火之刃',englishName:"Hierophant's Chest",wiki:{identityStatus:'unresolved'}}]};
    expect(englishSource(unresolved,'catalog',contentFields(unresolved,'catalog')[0]).text).toBe('Unresolved legacy item');
  });
  it('invalidates approval when English, its revision evidence, or Chinese changes',()=>{
    const text='伤害降低 25%。',source={englishHash:hash('25% less damage.'),evidenceHash:'revision-1'};
    const review={...source,translationHash:hash(text),reviewer:'manual'};
    expect(translationReviewMatches(source,text,review)).toBe(true);
    expect(translationReviewMatches({...source,englishHash:hash('25% more damage.')},text,review)).toBe(false);
    expect(translationReviewMatches({...source,evidenceHash:'revision-2'},text,review)).toBe(false);
    expect(translationReviewMatches(source,'受到 25% 伤害。',review)).toBe(false);
  });
  it('rejects a changed English pack even when both languages still claim the same old hash',async()=>{
    const raw=JSON.stringify({activities:[{id:'a',objective:'Damage reduced by 25%.'}]}),sourceHash=hash(raw);
    const fields={'activities/a/objective':'Damage reduced by 25%.'},englishHash=hash(JSON.stringify(fields));
    const common={version:1,dataset:'calendar',sourceHash,englishHash,baselineHash:'pinned-evidence'};
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,text:async()=>url.includes('/en/')?JSON.stringify({...common,locale:'en',fields:{'activities/a/objective':'Damage increased by 25%.'}}):url.includes('/zh-CN/')?JSON.stringify({...common,locale:'zh-CN',fields:{'activities/a/objective':'伤害降低 25%。'}}):raw})));
    await expect(loadContent('calendar')).rejects.toThrow('Stale English translation baseline');
  });
});

describe('numeric and semantic regressions',()=>{
  it('preserves signed progressions, percentages, ranges, multiplicity and order',()=>{
    expect(numericSignature('+10…34…40 damage, -2 Energy, 75%, 11–22 damage')).toEqual(['+10...34...40','-2','75%','11-22']);
    expect(numericIssues('75% chance','75 几率')).toContain('quantity-or-unit');
    expect(numericIssues('10 damage, 2 seconds','2 点伤害，10 秒')).toContain('quantity-order');
    expect(numericIssues('33%','33%%')).toContain('corrupt-token');
    // Identical digits cannot distinguish "less damage" from "damage taken".
    expect(numericIssues('25% less damage','受到 25% 伤害')).toEqual([]);
    expect(translationReviewMatches({englishHash:hash('25% less damage'),evidenceHash:'a'},'受到 25% 伤害',undefined)).toBe(false);
  });
  it('keeps damage reduction and the separate adrenaline/energy effects explicit',()=>{
    const catalog=read('public/data/catalog.json'),zh=read('public/data/i18n/zh-CN/catalog.json').fields;
    const text=(title:string)=>zh[`records/${catalog.records.find((r:any)=>r.englishName===title).id}/description`];
    expect(text('"There\'s Nothing to Fear!"')).toContain('伤害降低 20…35%');
    expect(text('Weapon of Fury')).toContain('怒气增加 100%，并获得 1 点能量');
    expect(text('Practiced Stance')).toContain('持续时间延长 30…246…300%');
    expect(text('Dwarven Battle Stance')).toContain('你的攻击技能命中时会中断敌人');
  });
  it('reviews all 54 PvP descriptions against their own evidence and fixes the knockdown target',()=>{
    const catalog=read('public/data/catalog.json'),zh=read('public/data/i18n/zh-CN/catalog.json').fields;
    const baseline=read('data/i18n/baseline/catalog.json'),reviews=read('data/i18n/review.json').reviews;
    const variants=catalog.records.filter((r:any)=>r.skill?.pvp);
    expect(variants).toHaveLength(54);
    for(const row of variants){
      const key=`records/${row.id}/skill/pvp/description`;
      expect(translationReviewMatches(baseline.fields[key],zh[key],reviews[`zh-CN/catalog/${key}`])).toBe(true);
      expect(baseline.fields[key].references).toContainEqual(expect.objectContaining({revid:row.skill.pvp.reference.revid}));
    }
    const row=variants.find((r:any)=>r.englishName==='Wanderlust');
    expect(zh[`records/${row.id}/skill/pvp/description`]).toContain('将敌人击倒，且精魂失去 70…54…50 点体力');
  });
  it('renders sacrifices with one percent sign and removes the obsolete Winds warning',()=>{
    const catalog=read('public/data/catalog.json'),zh=read('public/data/i18n/zh-CN/catalog.json').fields;
    for(const row of catalog.records.filter((r:any)=>r.skill)){
      expect(row.details.join(' ')).not.toContain('%%');
      for(let i=0;i<row.details.length;i++)expect(zh[`records/${row.id}/details/${i}`]).not.toContain('%%');
    }
    const winds=catalog.records.find((r:any)=>r.englishName==='Winds');
    expect(winds.skill.reference.revid).toBe(2743523);
    expect(winds.skill.warnings).toEqual([]);
  });
  it('keeps all 137 traveler quantities in the translated objectives and the 5-gift account limit',()=>{
    const calendar=read('public/data/calendar.json'),zh=read('public/data/i18n/zh-CN/calendar.json').fields;
    const activities=calendar.activities.filter((a:any)=>a.kind==='traveler');
    expect(activities).toHaveLength(137);
    for(const row of activities){
      const key=`activities/${row.id}`;
      expect(zh[`${key}/objective`]).toBe(`每份旅者礼物需要 ${row.exchange.perGift} × ${zh[`${key}/exchange/item`]}。`);
      expect(zh[`${key}/requirements`]).toContain('每账号每周最多兑换 5 份');
    }
  });
});
