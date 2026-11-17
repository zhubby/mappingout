/**
 * [INPUT]: 依赖技能查询、版本与效果类型。
 * [OUTPUT]: 验证布尔检索、科学计数值与嵌套效果分项隔离。
 * [POS]: 技能检索语义回归；测试真实解析器而非模拟查询结果。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {describe,expect,it} from 'vitest';
import {effectValue,parseSkillQuery,searchSkills} from '../src/features/skills/query';
import type {SkillCatalog,SkillEffect,SkillVariant} from '../src/shared/contracts/skills';
const reference={title:'Test',pageid:1,revid:1,url:'https://wiki.guildwars.com/wiki/Test',revisionUrl:'https://wiki.guildwars.com/index.php?oldid=1',revisedAt:'2026-11-16',retrievedAt:'2026-11-16'};
const effect=(id:string,values:Record<string,number>,metric='damage',conditional=false):SkillEffect=>({id,label:metric,metric,unit:'points',scope:'single',conditional,condition:conditional?'If target is hexed':'',axis:'Tactics',axisKind:'attribute',values,reference});
function variant(id:string,energy:number|null,recharge:number|null,effects:SkillEffect[],mode:'pve'|'pvp'='pve'):SkillVariant{
 const resource=(value:number|null)=>({text:String(value),value,kind:value===null?'dynamic' as const:'number' as const});
 return {id,name:'Test',englishName:'Test',gameIds:[1],modes:[mode],profession:1,attribute:'Tactics',campaigns:[0],type:'Signet',elite:false,pveOnly:false,image:'',description:'Heal an ally. 打断',conciseDescription:'',descriptionParts:[],resources:{energy:resource(energy),recharge:resource(recharge),activation:resource(0.5),adrenaline:resource(0),upkeep:resource(0),sacrifice:resource(0),overcast:resource(0)},target:'allies',range:'casting',aoe:'none',tags:['Interrupt'],effects,acquisition:[],notes:[],related:[],reference};
}
function catalog(variants:SkillVariant[]):SkillCatalog{return {version:1,referenceVersion:'test',skills:[{id:'skill:1',name:'治疗纹章',englishName:'Healing Signet',legacyEntryIds:[],variants}],resourceIcons:[],tracks:[],coverage:{discovered:1,included:1,variants:variants.length,excluded:0,dynamicEffects:0}};}
const options={levels:{attribute:12,titles:{}}};
describe('skill query language',()=>{
 it('searches both languages, quoted names and implicit conjunctions',()=>{
  const data=catalog([variant('pve',5,10,[])]);
  expect(searchSkills(data,'"Healing Signet" 职业:战士 施放<=0.5',options)).toHaveLength(1);
  expect(searchSkills(data,'治疗 打断',options)).toHaveLength(1);
 });
 it('ranks name matches above mentions when queries contain parentheses and filters',()=>{
  const data=catalog([variant('pve',5,10,[])]);
  data.skills.unshift({id:'skill:2',name:'A Scourge Healing',englishName:'Scourge Healing',legacyEntryIds:[],variants:[{...variant('other',5,10,[]),name:'Scourge Healing',englishName:'Scourge Healing',notes:['Healing Signet heals the user.']}]});
  for(const query of ['"Healing Signet"','("Healing Signet") energy>=0','(名称:"Healing Signet")']){
   const matches=searchSkills(data,query,options);
   expect(matches[0].skill.id).toBe('skill:1');
  }
  expect(searchSkills(data,'("Healing Signet") energy>=0',options)).toHaveLength(2);
 });
 it('honours NOT, AND and OR precedence and parentheses',()=>{
  const data=catalog([variant('pve',5,10,[])]);
  expect(searchSkills(data,'职业:幻术 OR 职业:战士 AND NOT 精英:是',options)).toHaveLength(1);
  expect(searchSkills(data,'(职业:幻术 OR 职业:战士) AND 精英:是',options)).toHaveLength(0);
 });
 it('reports syntax errors instead of ignoring invalid filters',()=>{
  expect(()=>parseSkillQuery('energy<=')).toThrow();
  expect(()=>parseSkillQuery('(energy<=5')).toThrow();
  expect(()=>parseSkillQuery('unknown:5')).toThrow();
 });
 it('never combines costs from different PvE and PvP variants',()=>{
  const data=catalog([variant('pve',5,20,[]),variant('pvp',10,5,[],'pvp')]);
  expect(searchSkills(data,'energy<=5 recharge<=5',options)).toHaveLength(0);
  expect(searchSkills(data,'mode:pvp energy>=10',options)[0].variants.map(v=>v.id)).toEqual(['pvp']);
 });
 it('uses selected attribute levels for effect values',()=>{
  const data=catalog([variant('pve',0,4,[effect('heal',{0:82,12:154,20:202},'healing')])]);
  expect(searchSkills(data,'治疗>=150',options)).toHaveLength(1);
  expect(searchSkills(data,'治疗>=150',{levels:{attribute:0,titles:{}}})).toHaveLength(0);
 });
 it('accepts finite scientific notation from resource range inputs',()=>{
  const data=catalog([variant('pve',5,10,[])]);
  expect(searchSkills(data,'energy>=1e-7',options)).toHaveLength(1);
  expect(searchSkills(data,'energy>=1e+21',options)).toHaveLength(0);
  expect(searchSkills(data,'activation<=5e2ms',options)).toHaveLength(1);
 });
 it('keeps a grouped numeric range on a single effect component',()=>{
  const data=catalog([variant('pve',5,10,[effect('a',{12:10}),effect('b',{12:100})])]);
  expect(searchSkills(data,'效果:(指标:伤害 数值>=50 数值<=80)',options)).toHaveLength(0);
  expect(searchSkills(data,'效果:(指标:伤害 数值>=80 条件:否)',options)[0].effects.pve.map(e=>e.id)).toEqual(['b']);
 });
 it('binds shorthand comparisons inside an effect group to the same component',()=>{
  const data=catalog([variant('pve',5,10,[effect('a',{12:10}),effect('b',{12:100})])]);
  expect(searchSkills(data,'效果:(伤害>=50 伤害<=80)',options)).toHaveLength(0);
  expect(searchSkills(data,'伤害>=50 伤害<=80',options)).toHaveLength(1);
 });
 it('keeps nested negation and match highlights on the current component',()=>{
  const data=catalog([variant('pve',5,10,[effect('a',{12:10}),effect('b',{12:100}),effect('c',{12:60})])]);
  const matches=searchSkills(data,'效果:(伤害>=50 NOT 伤害>80)',options);
  expect(matches).toHaveLength(1);
  expect(matches[0].effects.pve.map(e=>e.id)).toEqual(['c']);
 });
 it('includes conditional effects by default and supports unconditional filtering',()=>{
  const data=catalog([variant('pve',5,10,[effect('bonus',{12:100},'damage',true)])]);
  expect(searchSkills(data,'伤害>=80',options)).toHaveLength(1);
  expect(searchSkills(data,'伤害>=80',{...options,filters:{unconditional:true}})).toHaveLength(0);
 });
 it('does not turn symbolic or unknown values into zero, including under NOT',()=>{
  const data=catalog([variant('pve',null,null,[])]);
  expect(searchSkills(data,'recharge<=0',options)).toHaveLength(0);
  expect(searchSkills(data,'NOT recharge>0',options)).toHaveLength(0);
 });
 it('uses independent attribute overrides and title ranks',()=>{
  const healing=effect('heal',{0:82,12:154,20:202},'healing');
  expect(effectValue(healing,{attribute:20,attributes:{tactics:0},titles:{}})).toBe(82);
  const title={...healing,axis:'Norn rank',axisKind:'title' as const,values:{0:50,10:100}};
  expect(effectValue(title,{attribute:0,titles:{'norn-rank':10}})).toBe(100);
  expect(effectValue({...healing,uncertain:true},options.levels)).toBeNull();
 });
});
