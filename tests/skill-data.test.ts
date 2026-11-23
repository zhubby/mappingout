/**
 * [INPUT]: 依赖固定技能快照、技能来源判定、成长与效果编译器。
 * [OUTPUT]: 验证动态链接、再生衰减、备注表格、固定模板与收录边界。
 * [POS]: 技能数据语义回归；以独立预期值核对 Wiki 规则。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import {compileGrowth,skillEligibility,skillNotes,skillNoteFacts} from '../scripts/wiki/lib/skill-library-facts.mjs';
import {compileEffects,metricOf} from '../scripts/wiki/lib/skill-effects.mjs';
import {templates} from '../scripts/wiki/lib/wikitext.mjs';
const page=(fields:string)=>({title:'Test skill',wikitext:`{{Skill infobox\n${fields}\n}}`});
const definition=(rows:string)=>`<div class="attr">{{{attribute}}}</div><div class="var">{{{var1 name}}}</div>${rows}`;
const snapshot=(pageid:number)=>JSON.parse(fs.readFileSync(`data/wiki/pages/${pageid}.json`,'utf8'));
const notePages=[snapshot(305750),snapshot(304724)];
const tableExpectations=JSON.parse(fs.readFileSync('tests/fixtures/skill-note-tables.json','utf8')) as {
 pageid:number;revid:number;columns:string[];rows:[string,string[]][];captions:string[];sourceOrder?:boolean;tableSource?:{pageid:number;revid:number};
}[];
describe('fixed skill notes',()=>{
 it('excludes sorting metadata from the real Find Their Weakness notes without dropping hero guidance',()=>{
  const source=JSON.parse(fs.readFileSync('data/wiki/pages/14942.json','utf8'));
  const notes=skillNotes(source);
  expect(notes).toContain('Heroes use this skill on party members wielding any martial weapon.');
  expect(notes).toContain('only the target will have the damage and deep wound applied.');
  expect(notes).not.toContain('DEFAULTSORT');
 });
 it('retains the research qualification and temporary-skill distinction in the real Ursan Blessing notes',()=>{
  const source=JSON.parse(fs.readFileSync('data/wiki/pages/58325.json','utf8'));
  const notes=skillNotes(source);
  expect(notes).toContain('[Research needed: Which effects do the Norn elite forms remove and which ones do they leave?]');
  expect(notes).toContain('They will be returned if they were received before entering this form');
 });
 it('evaluates average movement speed from its fixed template and records its dependency',()=>{
  const result=skillNoteFacts(snapshot(14943),notePages);
  expect(result.notes).toBe('* This skill increases average speed by 6.6...14.85...16.5% if used every time it recharges.');
  expect(result.noteReferences.map(source=>[source.pageid,source.revid])).toEqual([[305750,2636862]]);
  expect(()=>skillNotes(snapshot(14943))).toThrow('Missing skill note source: Template:Speed');
 });
 it('retains all 22 HTML growth ranks before removing presentation markup',()=>{
  const notes=skillNotes(snapshot(4230));
  const values=[2,3,7,8,8,13,14,14,19,19,20,25,25,26,30,31,32,36,37,37,42,43];
  for(const [rank,value]of values.entries())expect(notes.split('\n')).toContain(`Spawning Power ${rank}: Net Energy Gain (Within Spirit Earshot): ${value}`);
  expect(notes).not.toMatch(/<div|\{\||\|\}/);
 });
 it('keeps mixed header separators, probabilities and the aftercast qualification',()=>{
  const notes=skillNotes(snapshot(58328));
  expect(notes).toContain('Boast "Buwahahaha!": Benefit: All conditions removed from self; Activation chance (%): 30%');
  expect(notes).toContain('Boast "Is There Anything I Can\'t Do?": Benefit: Recharge all skills; Activation chance (%): 10%');
  expect(notes).toContain('standard aftercast delay of 0.75 second');
 });
 it('keeps energy costs, color explanations and both axes in the rank tables',()=>{
  const songkai=skillNotes(snapshot(5084));
  expect(songkai).toContain('1 Energy spells cost: Spawning Power 0: 1');
  expect(songkai).toContain('Spawning Power 15: 1; Spawning Power 16: 0');
  expect(songkai).toContain('25 Energy spells/rituals cost: Spawning Power 0: 24');
  expect(songkai).toContain('Spawning Power 21: 8');
  const focus=skillNotes(snapshot(51924));
  expect(focus).toContain('Base Cost 10: Expertise 0: 9');
  expect(focus).toContain('Expertise 8: 5 [Blue]');
  expect(focus).toContain('Expertise 20: 2 [Red]');
  expect(focus).toContain('Source header spans 22 columns, but lists 21 ranks');
  const rampage=skillNotes(snapshot(3950));
  expect(rampage).toContain('Expertise rank 13: Beast Mastery rank 0-9: 1.2');
  expect(rampage).toContain('Beast Mastery rank 14: 0.86');
 });
 it('preserves malformed source cells without inventing their column assignment',()=>{
  const notes=skillNotes(snapshot(1243));
  expect(notes).toContain('Source table has inconsistent cell separators. Values retain source order; ambiguous cells have no rank assignment.');
  expect(notes).toContain('Expertise 0-2: -4; -3; -3; -2; -2; -1; -1; 0; 0; 1; 1; 2; 2; 3; 3; 4; 5; 5; 6; 6; 7 | 7');
  expect(notes).toContain('Expertise 18-20: 0; 1; 1; 2; 2; 3; 3; 4; 4; 5; 5; 6; 6; 7; 7; 8; 9; 9; 10; 10; 11 | 11');
 });
 it('keeps omitted empty notes cells and detailed conditions without shifting recharge values',()=>{
  const notes=skillNotes(snapshot(16247));
  expect(notes).toContain('skill Ice Prison: Attribute: Water Magic; range: single-target; recharge: 30s');
  expect(notes).toContain('skill Freezing Gust: Attribute: Water Magic; range: single-target; recharge: 8s; notes: Not if target already has a water magic hex');
  expect(notes).toContain('skill Mirror of Ice: Attribute: Water Magic; range: near self and target ally; recharge: 7.5s; notes: 15s recharge unless one of the struck foes has a Water hex');
 });
 it('expands the fixed transcluded table and retains signed net costs',()=>{
  const result=skillNoteFacts(snapshot(4547),notePages);
  expect(result.notes).toContain('Net cost/gain: Mysticism 0: -5');
  expect(result.notes).toContain('Mysticism 20: 6');
  expect(result.noteReferences.map(source=>[source.pageid,source.revid])).toEqual([[304724,2548529]]);
  expect(result.notes).not.toMatch(/\{\{|#var|\{\||\|\}/);
 });
 it('keeps source warnings and fixes mixed fractions and media parameter shells',()=>{
  expect(skillNotes(snapshot(1681))).toContain('[Source information may be outdated]');
  expect(skillNotes(snapshot(15225))).toContain('[Source flags a skill functionality change]');
  expect(skillNotes(snapshot(11209))).toContain('a 5 energy spell returns 3 energy instead of 2.5 energy');
  expect(skillNotes(snapshot(4064))).toContain('instead of 3.5 energy');
  const vow=skillNoteFacts(snapshot(14396));
  expect(vow.notes).toContain('This does not occur for Energy Storage, dervish nor monk enchantments. Video.');
  expect(vow.warnings.join('\n')).toContain('This does not occur for Energy Storage, dervish nor monk enchantments. Video.');
  expect(vow.notes+vow.warnings.join('\n')).not.toContain('{{');
 });
 it('rejects unknown tables and templates instead of losing their values',()=>{
  expect(()=>skillNotes({title:'Unreviewed',wikitext:'== Notes ==\n{|\n! Rank !! Value\n|-\n| 1 || 2 || 3\n|}'})).toThrow('Invalid skill note table');
  expect(()=>skillNotes({title:'Unreviewed',wikitext:'== Notes ==\n{{unknown mechanic|7}}'})).toThrow('Unparsed skill note markup');
 });
 it('retains a numeric caption and its continuation before rendering table values',()=>{
  const notes=skillNotes({title:'Caption',wikitext:'== Notes ==\n{|\n|+ style="text-align:center" | Damage at 150 health\nand 20 armor\n! Rank !! Damage\n|-\n| 1 || 37\n|}'});
  expect(notes).toBe('Damage at 150 health and 20 armor\nRank 1: Damage: 37');
  expect(()=>skillNotes({title:'Caption',wikitext:'== Notes ==\n{|\n|+ style="color:red" |\n! Rank !! Damage\n|-\n| 1 || 37\n|}'})).toThrow('Invalid skill note table caption');
 });
 it.each([58328,5084,1637,6779,14598,2823,207855,5102,14077,4064,16247,215073,51924,1243,6588,3950,5884,4334,1335,4230,1522,1520])('cleans the real %i note table while retaining its body',(pageid)=>{
  const notes=skillNotes(snapshot(pageid));
  expect(notes.length).toBeGreaterThan(50);
  expect(notes).not.toMatch(/\{\{|\{\||\|\}|bgcolor=|colspan=|rowspan=/);
 });
 it.each(tableExpectations)('retains every fixed source cell and column assignment for page $pageid',table=>{
  const page=snapshot(table.pageid);
  expect(page.revid).toBe(table.revid);
  if(table.tableSource)expect(snapshot(table.tableSource.pageid).revid).toBe(table.tableSource.revid);
  const lines=skillNotes(page,notePages).split('\n');
  for(const caption of table.captions)expect(lines).toContain(caption);
  for(const [label,values]of table.rows){
   expect(values.length).toBe(table.columns.length);
   const expected=table.sourceOrder?values.join('; '):values.flatMap((value,index)=>value?[`${table.columns[index]}: ${value}`]:[]).join('; ');
   expect(lines.filter(line=>line.startsWith(`${label}: `))).toEqual([`${label}: ${expected}`]);
  }
 });
});
describe('fixed skill effects',()=>{
 it.each([
  [1645,'Ether Lord','5…9…10','Energy','Hex Spell. You lose all Energy. For [[MO:growth:0:var1]] seconds, target foe suffers [[MO:growth:0:var2]] Energy degeneration, and you experience [[MO:growth:0:var3]] Energy regeneration.'],
  [1751,'Life Siphon','12…22…24','Health','Hex Spell. For [[MO:growth:0:var1]] seconds, target foe suffers [[MO:growth:0:var2]] Health degeneration, and you gain [[MO:growth:0:var3]] Health regeneration.'],
 ])('keeps the real %i %s degeneration and regeneration on separate growth effects',(pageid,_name,duration,resource,expected)=>{
  const source=JSON.parse(fs.readFileSync(`data/wiki/pages/${pageid}.json`,'utf8'));
  const progression=JSON.parse(fs.readFileSync('data/wiki/pages/11540.json','utf8'));
  const fields=templates(source.wikitext,'Skill infobox')[0].fields;
  const growth=compileGrowth(source,{'skill progression':progression.wikitext});
  const result=compileEffects(source,fields,growth,{});
  expect(result.descriptionParts.filter(part=>part.effectId).map(part=>({effectId:part.effectId,raw:part.raw}))).toEqual([
   {effectId:'growth:0:var1',raw:duration},
   {effectId:'growth:0:var2',raw:'-1…3…3'},
   {effectId:'growth:0:var3',raw:'+1…3…3'},
  ]);
  expect(result.descriptionTemplate).toBe(expected);
  expect(result.effects.filter(effect=>['growth:0:var2','growth:0:var3'].includes(effect.id))).toMatchObject([
   {id:'growth:0:var2',label:`${resource} degeneration`,metric:'degeneration',values:{0:1,12:3,15:3}},
   {id:'growth:0:var3',label:`${resource} regeneration`,metric:'regeneration',values:{0:1,12:3,15:3}},
  ]);
 });
 it.each([
  [11193,'Enchantment Spell. For 30 seconds, you gain [[MO:growth:0:var1]] armor, but move [[MO:growth:0:var2]] slower.'],
  [12218,'Enchantment Spell. For 7 seconds, you are set on fire and move [[MO:growth:0:var1]] faster. When Burning Speed ends, all adjacent foes are set on fire for [[MO:growth:0:var2]] seconds.'],
 ])('keeps the real %i dynamic text free of Wiki link shells', (pageid,expected)=>{
  const source=JSON.parse(fs.readFileSync(`data/wiki/pages/${pageid}.json`,'utf8'));
  const progression=JSON.parse(fs.readFileSync('data/wiki/pages/11540.json','utf8'));
  const fields=templates(source.wikitext,'Skill infobox')[0].fields;
  const growth=compileGrowth(source,{'skill progression':progression.wikitext});
  const result=compileEffects(source,fields,growth,{});
  expect(result.descriptionTemplate).toBe(expected);
  expect(result.descriptionParts.filter(part=>part.effectId).map(part=>part.effectId)).toEqual(['growth:0:var1','growth:0:var2']);
 });
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
