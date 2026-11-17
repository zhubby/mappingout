/**
 * [INPUT]: 依赖固定任务资料、Wiki 解析器与部署验证器。
 * [OUTPUT]: 验证主线分支、攻略复用、清剿身份和安全内容转换。
 * [POS]: 任务资料语义回归；不以界面快照替代来源校验。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
import {cleanQuestText,contentBlocks,mapTitles} from '../scripts/wiki/quest-content.mjs';
import {validateQuestData} from '../scripts/validate-quests.mjs';
import type {QuestCatalog,QuestRequirement} from '../src/quest-types';
const data:QuestCatalog=JSON.parse(fs.readFileSync('public/data/quests.json','utf8'));
const quest=(title:string)=>data.quests.find(q=>q.englishName===title)!;
const leaves=(requirement:QuestRequirement):QuestRequirement[]=>'items' in requirement?requirement.items.flatMap(leaves):[requirement];
describe('pinned quest evidence',()=>{
  it('ships complete chapters, fixed references and local route images',async()=>{
    expect(await validateQuestData()).toMatchObject({included:1370});
    expect(data.chapters).toHaveLength(7);
    const winds=data.quests.filter(q=>q.chapter==='winds'&&q.kind==='main');
    expect(winds.filter(q=>q.mode==='normal')).toHaveLength(35);
    expect(winds.filter(q=>q.mode==='hard')).toHaveLength(35);
  });
  it('preserves access conditions while expressing parallel campaign branches',()=>{
    const trials=leaves(quest('Augury Rock').requirement).filter(r=>r.op==='quest');
    expect(trials.map(r=>r.questId)).toEqual(['Dunes of Despair','Thirsty River','Elona Reach'].map(t=>quest(t).id));
    const entry=quest('Pogahn Passage').requirement;
    expect(entry).toMatchObject({op:'all',items:expect.arrayContaining([expect.objectContaining({op:'any'})])});
    expect(leaves(entry).some(r=>r.op==='condition'&&r.text.includes('Margrid'))).toBe(true);
    expect(quest('Battle Preparations').allowedOrigins).toEqual([1,2]);
    expect(quest('A Friend in Need').allowedOrigins).toEqual([3]);
  });
  it('keeps vanquishing separate from cooperative missions with the same name',()=>{
    const vanquish=quest('Arborstone (Zaishen vanquish)');
    expect(vanquish.mode).toBe('hard');
    expect(vanquish.walkthroughFrom).not.toBe(quest('Arborstone').id);
    expect(vanquish.references.some(ref=>ref.title==='Arborstone (explorable area)')).toBe(true);
    expect(quest('Slavers\' Exile').walkthroughFrom).toBe(quest('The Last Hierophant').id);
    expect(quest('The Underworld').sections.some(s=>s.title==='The Four Horsemen')).toBe(true);
    expect(quest('The Fissure of Woe').references.some(r=>r.title==='Guide to The Fissure of Woe')).toBe(true);
  });
  it('ships the first mission map with readable rewards and no gallery filenames in prose',()=>{
    const mission=quest('The Great Northern Wall');
    expect(mission.images.some(image=>image.caption==='The Great Northern Wall map')).toBe(true);
    expect(mission.sections.flatMap(section=>section.blocks).some(block=>/\b(?:File|Image):/.test(block.text))).toBe(false);
    const rewards=mission.sections.filter(section=>section.id.startsWith('rewards')).flatMap(section=>section.blocks).flatMap(block=>block.cells?.flat()||[]).join(' ');
    expect(rewards).toContain('500 gold');expect(rewards).toContain('1 skill point');
  });
});
describe('safe quest text conversion',()=>{
  it('extracts template maps and gallery routes without leaking gallery markup into prose',()=>{
    const page={title:'The Great Northern Wall',wikitext:'{{Mission infobox\n| name = The Great Northern Wall\n}}\nA route.\n<gallery>\nFile:Northern wall carto north.jpg|Northern exploration route\nFile:ShrineWhereTheSearingIsCastPost.jpg|A landmark\n</gallery>'};
    expect(mapTitles(page)).toEqual(expect.arrayContaining(['File:The Great Northern Wall map.jpg','File:Northern wall carto north.jpg']));
    expect(mapTitles(page)).not.toContain('File:ShrineWhereTheSearingIsCastPost.jpg');
    expect(contentBlocks(page.wikitext,'route').map(b=>b.text)).toEqual(['A route.']);
    expect(mapTitles({title:'Custom map',wikitext:'{{Quest infobox\n|map=[[File:Guide A.jpg]]\n}}'})).toContain('File:Guide A.jpg');
    expect(mapTitles({title:'No map',wikitext:'{{Mission infobox|name=No map|map=}}'})).toEqual([]);
  });
  it('retains reward units represented by Wiki image links',()=>{
    expect(cleanQuestText('500[[Image:Gold.gif|Gold|link=Currency]] + 1 [[File:Skill-point-tango-icon-20.png|18px|link=Skill point]]')).toBe('500 gold + 1 skill point');
    expect(cleanQuestText('1[[Image:Platinum.gif|Platinum|link=Currency]]')).toBe('1 platinum');
    const table=contentBlocks('{|\n|500[[Image:Gold.gif|Gold|link=Currency]]||1 [[File:Skill-point-tango-icon-20.png|18px|link=Skill point]]\n|}','reward');
    expect(table[0].cells).toEqual([['500 gold','1 skill point']]);
  });
  it('expands multiline warning templates before splitting list items',()=>{
    const blocks=contentBlocks('{{bug|Do not open the gate.\n* Wait for Rurik.\n* Return if he stops.}}','warning');
    expect(blocks.map(b=>b.text)).toEqual(['Do not open the gate.','Wait for Rurik.','Return if he stops.']);
    expect(cleanQuestText('Pay {{cost|1000}}.')).toBe('Pay 1000 gold.');
    expect(cleanQuestText('Need [[Hunk of Fresh Meat|hunk[s] of fresh meat]].')).toBe('Need hunks of fresh meat.');
    expect(cleanQuestText('[[File:Route map.jpg|200px]] See [[NPC|the giver]].')).toBe('See the giver.');
  });
});
