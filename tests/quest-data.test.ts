/**
 * [INPUT]: 依赖固定任务资料、Wiki 解析器与部署验证器。
 * [OUTPUT]: 验证主线分支、攻略复用、奖励比较符与同级分节边界。
 * [POS]: 任务资料语义回归；不以界面快照替代来源校验。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
import {cleanQuestText,contentBlocks,mapTitles,questSections} from '../scripts/wiki/lib/quest-content.mjs';
import {validateQuestData} from '../scripts/validate/validate-quests.mjs';
import type {QuestCatalog,QuestRequirement} from '../src/shared/contracts/quests';
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
  },20000); // 全量来源与图片哈希校验使用独立等待上限。
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
  it('preserves both reward comparison operators from the pinned Vizunah Square template',()=>{
    const page=JSON.parse(fs.readFileSync('data/wiki/pages/10990.json','utf8'));
    const rewards=questSections(page).find(section=>section.id==='rewards-1')!;
    expect(rewards.blocks.map(block=>block.text)).toEqual([
      'Campaign: Factions',
      'Objective: Completion time',
      'Normal mode — Standard objective: > 30 minutes',
      "Normal mode — Expert's objective: 25 - 30 minutes",
      "Normal mode — Master's objective: < 25 minutes",
      'Hard mode — Standard objective: > 40 minutes',
      "Hard mode — Expert's objective: 35 - 40 minutes",
      "Hard mode — Master's objective: < 35 minutes",
    ]);
  });
  it('keeps mathematical comparisons and decodes HTML comparison entities while removing real tags',()=>{
    expect(cleanQuestText('Normal < 25 minutes; hard > 40 minutes.')).toBe('Normal < 25 minutes; hard > 40 minutes.');
    expect(cleanQuestText('<a href="/wiki/Time">Time</a>: &lt;25 or &gt;40; &#60;30 or &#62;50; &#x3c;35 or &#x3E;45.')).toBe('Time: <25 or >40; <30 or >50; <35 or >45.');
    expect(cleanQuestText('<span>Health</span> &le;50% and &ge;20%.')).toBe('Health ≤50% and ≥20%.');
  });
  it('separates the pinned Sentimental Treasures overview from its access condition',()=>{
    const page=JSON.parse(fs.readFileSync('data/wiki/pages/14617.json','utf8'));
    const sections=questSections(page),requirements=sections.find(section=>section.id==='requirements-1')!;
    expect(requirements.blocks.map(block=>block.text)).toEqual(['Canthan (Factions) character']);
    const overview=sections.find(section=>section.id==='overview-1')!;
    expect(overview.title).toBe('Overview');
    expect(overview.blocks[0].text).toContain('Miller Quang, a resident of the area');
  });
  it('retains early skill grants as a separate reward section from the pinned Talon quest',()=>{
    const page=JSON.parse(fs.readFileSync('data/wiki/pages/25378.json','utf8'));
    const sections=questSections(page),benefits=sections.find(section=>section.title==='Early benefits')!;
    expect(benefits.id).toMatch(/^benefits-/);
    expect(benefits.blocks.map(block=>block.text)).toEqual(['Healing Signet','Power Attack','Sever Artery']);
    expect(sections.find(section=>section.id==='objectives-1')!.blocks.some(block=>block.text==='Healing Signet')).toBe(false);
  });
  it('removes editorial sic annotations before expanding quest prose',()=>{
    expect(cleanQuestText('Bring your charcter{{sic|character}} to the gate.')).toBe('Bring your charcter to the gate.');
  });
  it('keeps nested Bonus dialogue out of the pinned Riverside Province guide',()=>{
    const page=JSON.parse(fs.readFileSync('data/wiki/pages/12264.json','utf8'));
    const sections=questSections(page);
    expect(sections.some(section=>section.id.startsWith('bonus'))).toBe(false);
    const walkthrough=sections.find(section=>section.id==='walkthrough-1')!;
    expect(walkthrough.blocks.some(block=>block.kind==='heading'&&block.text==='Bonus')).toBe(true);
    expect(sections.flatMap(section=>section.blocks).some(block=>block.text.includes('You must be more discreet'))).toBe(false);
  });
  it('removes the split-closing editorial comment from the pinned burning forest notes',()=>{
    const page=JSON.parse(fs.readFileSync('data/wiki/pages/67503.json','utf8'));
    const notes=questSections(page).flatMap(section=>section.blocks).map(block=>block.text).join(' ');
    expect(notes).not.toContain('<!--');
    expect(notes).not.toContain('although this is true about all animation');
    expect(notes).toContain('This requires a full reset from a outpost.');
  });
  it('preserves the qualification and verification alert from the pinned Titan Source update',()=>{
    const page=JSON.parse(fs.readFileSync('data/wiki/pages/11215.json','utf8'));
    const line=page.wikitext.split('\n').find(line=>line.includes('Singe the Malevolent')&&line.includes('{{verify}}'))!;
    expect(cleanQuestText(line)).toContain('requires Hard Mode and Nightfall');
    expect(cleanQuestText(line)).toContain('[Source claim needs verification]');
    expect(cleanQuestText('A claim.{{verify|editorial testing request}}')).toBe('A claim.[Source claim needs verification]');
  });
  it('only attaches deeper unknown headings to the current section',()=>{
    const sections=questSections({wikitext:'==Mission information==\n===Requirements===\n* Reach level 10.\n====Additional detail====\nBring a key.\n===Background===\nA story, not an access condition.\n===Objectives===\n* Enter the gate.'});
    expect(sections[0].blocks.map(block=>block.text)).toEqual(['Reach level 10.','Additional detail','Bring a key.']);
    expect(sections[0].blocks.some(block=>block.text.includes('story'))).toBe(false);
  });
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
