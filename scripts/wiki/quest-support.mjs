/**
 * [INPUT]: 依赖固定任务、区域与玩法指南快照。
 * [OUTPUT]: 补入独立玩法攻略和 NPC 原文指示；保留来源与内容级别。
 * [POS]: 任务编译的来源补充层；不将任务目标冒充详细攻略。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { templates, links } from './wikitext.mjs';
import { questSections, contentBlocks } from './quest-content.mjs';
import { reference } from './content-facts.mjs';

export const supportTitles = ['Guide to The Fissure of Woe', 'Polymock', 'The Norn Fighting Tournament'];
export function appendSections(row, sections, source, prefix) {
  for (const section of sections) row.sections.push({
    ...structuredClone(section), id: `${prefix}-${section.id}`,
    blocks: section.blocks.map(block => ({ ...structuredClone(block), id: `${prefix}-${block.id}` })),
  });
  if (!row.references.some(ref => ref.pageid === source.pageid)) row.references.push(reference(source));
}
export async function supplementQuest(row, page, load) {
  const title = row.englishName;
  const support = title === 'The Fissure of Woe' ? supportTitles[0]
    : /^Polymock:/.test(title) ? supportTitles[1]
    : /^(?:Round [1-5]|Final Round).*Fight!$/.test(title) ? supportTitles[2] : undefined;
  if (support) {
    const source = await load(support);
    if (!source) throw Error(`Missing quest support snapshot: ${support}`);
    // 该指南用一级标题；提升一级后复用同一分节器。
    const normalized = /^=[^=].*[^=]=$/m.test(source.wikitext) ? source.wikitext.replace(/^(=+)\s*(.*?)\s*\1\s*$/gm, (_, marks, text) => `${marks}= ${text} =${marks}`) : source.wikitext;
    appendSections(row, questSections({ ...source, wikitext: normalized }).filter(s => /^(walkthrough|notes)/.test(s.id)), source, `support-${source.pageid}`);
  }
  if (row.sections.some(s => /walkthrough/.test(s.id))) return;
  // 简单交付与教程没有独立 Walkthrough，直接保留 NPC 的操作指示。
  let instructions = page.wikitext.split(/^===?\s*Initial dialogue\s*===?\s*$/mi)[1]?.split(/^===?\s*(?:Intermediate|Reward) dialogue\s*===?\s*$/mi)[0] || '';
  if (title === 'Trial of Zinn') instructions = page.wikitext.split(/^==/m)[0] + '\n' + (page.wikitext.split(';Immediately on arrival')[1]?.split(';When you have stepped')[0] || '');
  for (const template of templates(instructions)) if (/infobox|offer dial|^quotation$/i.test(template.name)) instructions = instructions.replace(template.raw, '');
  const blocks = contentBlocks(instructions, 'instructions');
  if (blocks.length) row.sections.push({ id: 'instructions-dialogue', title: 'Instructions from quest dialogue', blocks });
}
export function eliteSubquests(page, resolve, byId) {
  if (page.title !== 'The Underworld') return [];
  const objectives = page.wikitext.split(/^==\s*Quests available\s*==/mi)[1]?.split(/^==[^=]/m)[0] || '';
  return [...new Set(links(objectives).map(link => resolve(link.title)))].map(id => byId.get(id)).filter(row => row && row.id !== `quest:gww:${page.pageid}`);
}
