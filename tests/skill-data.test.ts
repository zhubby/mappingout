/**
 * [INPUT]: 依赖技能来源判定、成长与固定效果编译器。
 * [OUTPUT]: 验证收录边界、成长规则与固定效果的符号和指标。
 * [POS]: 技能数据语义回归；以独立预期值核对 Wiki 规则。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {describe,expect,it} from 'vitest';
import {compileGrowth,skillEligibility} from '../scripts/wiki/skill-library-facts.mjs';
import {compileEffects,metricOf} from '../scripts/wiki/skill-effects.mjs';
const page=(fields:string)=>({title:'Test skill',wikitext:`{{Skill infobox\n${fields}\n}}`});
const definition=(rows:string)=>`<div class="attr">{{{attribute}}}</div><div class="var">{{{var1 name}}}</div>${rows}`;
describe('fixed skill effects',()=>{
 it.each([['-40',-40],['+24',24],['−20',-20]])('preserves the sign of %s armor', (raw,value)=>{
  const result=compileEffects(page(''),{description:`You have ${raw} armor while using this skill.`},[],{});
  expect(result.effects).toHaveLength(1);
  expect(result.effects[0]).toMatchObject({metric:'armor',unit:'points',values:{fixed:value},conditional:true});
 });
 it('keeps an explicit plus sign as bonus damage',()=>{
  const result=compileEffects(page(''),{description:'This attack deals +15 damage.'},[],{});
  expect(result.effects[0]).toMatchObject({metric:'bonus-damage',values:{fixed:15}});
 });
 it('does not interpret the separator of a numeric range as a negative sign',()=>{
  const result=compileEffects(page(''),{description:'Affects 2-3 foes.'},[],{});
  expect(result.effects.map(effect=>effect.values.fixed)).toEqual([2,3]);
 });
});
describe('learnable skill boundary',()=>{
 it('includes an ordinary profession skill and a learnable transformation',()=>{
  expect(skillEligibility(page('| profession = Warrior\n| type = Signet'),[]).included).toBe(true);
  expect(skillEligibility(page('| profession = Mesmer\n| special = Duplicate'),[]).included).toBe(true);
  expect(skillEligibility(page('| attribute = Norn rank\n| type = Form\n| pve-only = y'),[]).included).toBe(true);
 });
 it('excludes monster, temporary, passive and historical entries',()=>{
  expect(skillEligibility(page('| profession = Warrior\n| special = Monster'),[]).included).toBe(false);
  expect(skillEligibility(page('| type = Skill\n| special = Junundu'),[]).included).toBe(false);
  expect(skillEligibility(page('| type = Title\n| attribute = Norn rank'),[]).included).toBe(false);
  expect(skillEligibility(page('| profession = Warrior'),['Category:Historical content']).included).toBe(false);
 });
});
describe('Wiki progression rules',()=>{
 it('keeps health loss, regeneration and duration distinct from healing',()=>{
  expect(metricOf('Health degeneration')).toBe('degeneration');
  expect(metricOf('Health loss')).toBe('other');
  expect(metricOf('Healing duration')).toBe('duration');
  expect(metricOf('Healing')).toBe('healing');
 });
 it('reads explicit title tables without inventing values below the acquisition rank',()=>{
  const p={wikitext:'{{Skill infobox|attribute=Lightbringer rank}}\n{|\n!Lightbringer rank\n|3||4||5\n|-\n!Energy gain\n|22||24||24\n|}'};
  const row=compileGrowth(p,{})[0];expect(row.values).toEqual({3:22,4:24,5:24});expect(row.axisKind).toBe('title');
 });
 it('reproduces Healing Signet values at ranks 0, 12 and 20',()=>{
  const p={wikitext:'{{Skill progression|attribute=Tactics|var1 name=Healing|var1 at0=82|var1 at15=172}}'};
  const template=definition([0,12,20].map(rank=>`<div class="attr">${rank}</div><div class="var">{{#expr: {{{var1 at0}}} + ${rank} * ({{{var1 at15}}}-{{{var1 at0}}}) / 15 round 0 }}</div>`).join(''));
  expect(compileGrowth(p,{'skill progression':template})[0]).toMatchObject({axis:'Tactics',values:{0:82,12:154,20:202}});
 });
 it('uses the title template saturation instead of interpolating to its name',()=>{
  const p={wikitext:'{{Skill progression max10|title track=Norn rank|var1 name=Damage|var1 at0=50|var1 at10=100}}'};
  const template=definition([0,1,5,10].map((rank,index)=>`<div class="attr">${rank}</div><div class="var">{{#expr: {{{var1 at0}}} + ${[0,3,15,15][index]} * ({{{var1 at10}}}-{{{var1 at0}}}) / 15 round 0 }}</div>`).join(''));
  expect(compileGrowth(p,{'skill progression max10':template})[0].values).toEqual({0:50,1:60,5:100,10:100});
 });
 it('rounds the drained quantity before applying a damage multiplier',()=>{
  const p={wikitext:'{{Skill progression factored|attribute=Domination Magic|varf name=Damage|varf at0=1|varf at15=10|varf factor=7}}'};
  const template='<div class="attr">12</div><div class="var">{{#expr: ({{{varF at0}}} + 12 * ({{{varF at15}}}-{{{varF at0}}}) / 15 round 0) * {{{varF factor}}} }}</div>';
  expect(compileGrowth(p,{'skill progression factored':template})[0].values[12]).toBe(56);
 });
});
