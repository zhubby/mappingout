/**
 * [INPUT]: 依赖固定 Wiki 文本、模板解析和表格解析。
 * [OUTPUT]: 编译攻略分节、奖励模式、比较符与路线图。
 * [POS]: 任务编译器的内容适配；前端不解释 Wiki 标记或 HTML。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { plainText, templates, links } from './wikitext.mjs';
import { wikiTables } from './tables.mjs';

function standardPrerequisites(fields) {
  const output = [], nationality = (fields.nationality || fields.campaign || '').toLowerCase();
  const origins = {pre:'Tyrian (Prophecies) character',prophecies:'Tyrian (Prophecies) character',tyrian:'Tyrian (Prophecies) character',factions:'Canthan (Factions) character',canthan:'Canthan (Factions) character',nightfall:'Elonian (Nightfall) character',elonian:'Elonian (Nightfall) character','non-tyrian':'Canthan (Factions) or Elonian (Nightfall) character','non-canthan':'Tyrian (Prophecies) or Elonian (Nightfall) character','non-elonian':'Tyrian (Prophecies) or Canthan (Factions) character'};
  if (origins[nationality]) output.push(origins[nationality]);
  if (fields.hero) output.push(`Required hero: ${fields.hero}`);
  if (fields.transfer) output.push(`Guild Wars ${fields.transfer} on the account`);
  if (fields.profession) output.push(`${fields.primary === 'y' ? 'Primary profession' : 'Primary or secondary profession'}: ${fields.profession}`);
  if (fields.campaign?.toLowerCase() === 'pre') {
    if (fields.test !== 'n') output.push('Completed primary profession test');
    output.push('Character in pre-Searing Ascalon');
  }
  if (fields.unstarted) output.push(`${fields.unstarted} neither active nor completed`);
  if (fields.complete) output.push(`${fields.complete} completed`);
  if (fields.active) output.push(`${fields.active} active`);
  if (fields.minimum) output.push(`Level ${fields.minimum} or higher`);
  if (fields.reforged) output.push(`Reforged Mode ${fields.reforged === 'y' ? 'is active' : 'is inactive'}`);
  return output.map(text => `\n* ${text}`).join('');
}

function missionRewardText(fields) {
  const labels = {1:'Campaign',objective:'Objective',reputation:'Reputation'};
  const modes = {nm:'Normal mode',hm:'Hard mode'}, tiers = {std:'Standard',exp:"Expert's",mstr:"Master's"};
  const values = {obj:'objective',xp:'experience',gold:'gold',pts:'reputation points'};
  return Object.entries(fields).map(([key,value]) => {
    const field = /^(obj|xp|gold|pts)(nm|hm)(std|exp|mstr)$/.exec(key);
    const label = labels[key] || (field ? `${modes[field[2]]} — ${tiers[field[3]]} ${values[field[1]]}` : key === 'xpnmrfstd' ? 'Normal mode (Reforged Mode) — Standard experience' : key);
    return `\n* ${label}: ${value}`;
  }).join('');
}

function expandQuestTemplates(raw = '') {
  let value = raw.replace(/<!--[\s\S]*?-\s*->/g, '').replace(/<gallery\b[^>]*>[\s\S]*?<\/gallery>/gi, '').replace(/<ref\b[^>]*>[\s\S]*?<\/ref>|<ref\b[^>]*\/>/gi, '').replace(/__\w+__/g, '');
  for (let attempt = 0; attempt < 4; attempt++) {
    const found = templates(value); let changed = false;
    for (const item of found) {
      const name = item.name.toLowerCase(), fields = item.fields;
      let replacement;
      if (/infobox|navbar| nav$| missions$|^explorable areas in |^dungeons$|^quest icon$|^hmquest$|^quotation$|^other ?uses$|^clear$|^stub$|^toc|^cleanup$/.test(name)) replacement = '';
      else if (name === 'standard prerequisites') replacement = standardPrerequisites(fields);
      else if (name === 'reforgedmode') replacement = 'Reforged Mode';
      else if (name === 'plat') replacement = `${fields[1] || '1'} platinum`;
      else if (name === 'cost') replacement = `${fields[1]} gold`;
      else if (name === 'skill bar') replacement = Object.entries(fields).filter(([key]) => /^\d+$/.test(key)).map(([, value]) => value).join(' · ');
      else if (name === 'vanquisher') replacement = `Vanquishing: ${fields.low || fields.count}–${fields.high || fields.count} foes.${fields.notes ? ' ' + fields.notes : ''}`;
      else if (['energy','activation','recharge','key'].includes(name)) replacement = name;
      else if (name === 'tyria') replacement = 'Tyria';
      else if (name === 'spoiler' || name === 'quote') replacement = fields[1] || '';
      else if (name === 'more' || name === 'note link') replacement = Object.values(fields).join(' ');
      else if (/^(?:skill|item|npc|monster skill) icon$/.test(name)) replacement = fields[1] || '';
      else if (name === 'sic') replacement = '';
      else if (name === 'verify') replacement = '[Source claim needs verification]';
      else if (/^(?:bug|anomaly|note|warning|disputed)$/.test(name)) replacement = fields[1] || '';
      else if (name === '#tag:ref') replacement = '';
      else if (/^(?:main|see|see also|further)$/.test(name)) replacement = Object.values(fields).join(' · ');
      else if (/^quest list|^mission list/.test(name)) replacement = '';
      else if (name === 'mission rewards') replacement = missionRewardText(fields);
      else if (/^mission (?:objectives|bonus|reward)/.test(name)) replacement = Object.values(fields).join('\n');
      else if (['y', 'yes', 'n', 'no'].includes(name)) replacement = name === 'y' || name === 'yes' ? 'Yes' : 'No';
      if (replacement !== undefined) { value = value.replace(item.raw, replacement); changed = true; }
    }
    if (!changed) break;
  }
  return value;
}
export function cleanQuestText(raw = '') {
  let value = expandQuestTemplates(raw);
  const rewardUnits = {'gold.gif':'gold','platinum.gif':'platinum','skill-point-tango-icon-20.png':'skill point'};
  value=value.replace(/\[\[(?:File|Image):([^\]|]+)(?:[^\]]*)\]\]/gi,(_,name)=>rewardUnits[name.trim().toLowerCase()] ? ` ${rewardUnits[name.trim().toLowerCase()]}` : '');
  value=value.replace(/\[\[(?:Category|File|Image):[^\]]+\]\]/gi,'');
  // 先展开内层链接，修正 Wiki 原文中偶见的嵌套或多余括号。
  for(let i=0;i<3;i++)value=value.replace(/\[\[([^\[\]|]+)\|((?:(?!\[\[)[\s\S])*?)\]\]/g,'$2').replace(/\[\[([^\[\]]+)\]\]/g,'$1');
  value=value.replace(/\]\]/g,'');
  // 比较符之间不是 HTML 标签；仅移除具有合法标签名的标记。
  return plainText(value).replace(/\[https?:\/\/[^\s\]]+\]/g, '').replace(/<\/?[A-Za-z][\w:-]*(?:\s[^<>]*?)?\s*\/?>/g, '').replace(/&rarr;|&#8594;/g, ' → ').replace(/&(?:larr|darr|uarr);/g, ' · ').replace(/&(?:ndash|mdash);/g, ' — ').replace(/&lt;|&#0*60;|&#x0*3c;/gi, '<').replace(/&gt;|&#0*62;|&#x0*3e;/gi, '>').replace(/&le;|&#0*8804;|&#x0*2264;/gi, '≤').replace(/&ge;|&#0*8805;|&#x0*2265;/gi, '≥').replace(/&nbsp;|&#160;/g, ' ').replace(/[ \t]+/g, ' ').trim();
}
const sectionKinds = [
  [/^(?:overview|summary)$/i, 'overview'],
  [/requirement|prerequisite|accessibility|getting (?:there|started)|how to (?:get|enter)/i, 'requirements'],
  [/objective/i, 'objectives'], [/^early benefits$/i, 'benefits'], [/reward/i, 'rewards'],
  [/walkthrough|strategy|strategies|tactics|guide|walk-through|vanquishing|suggestions|acquisition|game mechanics/i, 'walkthrough'],
  [/bonus|master|expert/i, 'bonus'], [/hard mode/i, 'hard-mode'],
  [/environment|spawn/i, 'environment'], [/notes|bug|anomal|tips/i, 'notes'],
  [/order of quest|optional quest|before guild wars beyond|guild wars beyond|finding thackeray|gwen and thackeray/i, 'story'],
];
export function contentBlocks(raw, prefix) {
  const blocks = []; let paragraph = [];
  const push = (kind, text, extra = {}) => { if (text.trim() || extra.cells?.length) blocks.push({ id: `${prefix}-${blocks.length + 1}`, kind, text: text.trim(), ...extra }); };
  const flush = () => { if (paragraph.length) push('paragraph', cleanQuestText(paragraph.join(' '))); paragraph = []; };
  // 保留单元格原文，再转换奖励图标单位，避免通用纯文本清洗提前丢失图标。
  raw = expandQuestTemplates(raw);
  const tables = [];
  raw = raw.replace(/\{\|[\s\S]*?\|\}/g, table => { const index = tables.push(table) - 1; return `\nMO_TABLE_${index}\n`; });
  for (const line of raw.replace(/<!--[\s\S]*?-\s*->/g, '').split('\n')) {
    const table = /^MO_TABLE_(\d+)$/.exec(line.trim());
    if (table) { flush(); for (const rows of wikiTables(tables[Number(table[1])], {raw:true})) {
      const cells = (Array.isArray(rows) ? rows : rows.rows || []).map(row => (Array.isArray(row) ? row : row.cells || []).map(cell => cleanQuestText(typeof cell === 'string' ? cell : cell.text || cell.value || '')));
      if (cells.some(row => row.some(Boolean))) push('table', '', { cells });
    } continue; }
    const item = /^\s*([*#:;]+)\s*(.*)$/.exec(line), heading = /^\s*(={3,6})\s*([^=].*?)\s*\1\s*$/.exec(line);
    if (heading) { flush(); push('heading', cleanQuestText(heading[2]), { level: Math.min(3, heading[1].length - 2) }); }
    else if (item) { flush(); push('item', cleanQuestText(item[2]), { level: Math.min(5, item[1].length) }); }
    else if (!line.trim() || /^\s*(?:\[\[(?:File|Image|Category):|\{\{(?:clear|[\w ]*nav)|<gallery|<\/gallery)/i.test(line)) flush();
    else paragraph.push(line.trim());
  }
  flush(); return blocks;
}
export function questSections(page) {
  const matches = [...page.wikitext.matchAll(/^(={2,6})\s*(.+?)\s*\1\s*$/gm)];
  const result = []; let current, currentLevel = 0, dialogueLevel = 0;
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i], heading = cleanQuestText(match[2]), level = match[1].length;
    if (dialogueLevel && level > dialogueLevel) continue;
    dialogueLevel = 0;
    if (/dialogue/i.test(heading)) { current = undefined; dialogueLevel = level; continue; }
    const kind = sectionKinds.find(([pattern]) => pattern.test(heading))?.[1];
    const body = page.wikitext.slice(match.index + match[0].length, matches[i + 1]?.index ?? page.wikitext.length);
    if (current && current.id.startsWith('walkthrough') && level > currentLevel && !/dialogue|npc|foes|allies|trivia/i.test(heading)) {
      current.blocks.push({ id: `${current.id}-h${i}`, kind: 'heading', text: heading, level: level - 2 }, ...contentBlocks(body, `${current.id}-${i}`));
    } else if (kind) {
      const id = `${kind}-${result.filter(s => s.id.startsWith(kind)).length + 1}`;
      current = { id, title: heading, blocks: contentBlocks(body, id) }; currentLevel=level; result.push(current);
    } else if (current && level > currentLevel && !/dialogue|npc|foes|allies|trivia|skill|monster/i.test(heading)) {
      current.blocks.push({ id: `${current.id}-h${i}`, kind: 'heading', text: heading, level: level - 2 }, ...contentBlocks(body, `${current.id}-${i}`));
    } else current = undefined;
  }
  return result.filter(section => section.blocks.length);
}
export function mapTitles(page) {
  const source=page.wikitext.replaceAll('{{PAGENAME}}',page.title);
  const output = new Set(), route = /map|walkthrough|path|route|carto|from .* to |dungeon/i;
  const add = title => { if (!/icon|logo|flow chart/i.test(title)) output.add('File:' + title.trim()); };
  const images = text => [...text.matchAll(/\[\[(?:File|Image):([^\]|]+)([^\]]*)\]\]/gi)];
  for (const image of images(source)) if (route.test(image[1])) add(image[1]);
  for (const gallery of source.matchAll(/<gallery\b[^>]*>([\s\S]*?)<\/gallery>/gi)) {
    for (const image of gallery[1].matchAll(/^\s*(?:File|Image):([^\n|]+)([^\n]*)/gmi)) if (route.test(image[1]+image[2])) add(image[1]);
  }
  for (const box of templates(source).filter(item=>/^(?:mission|quest) infobox$/i.test(item.name))) {
    for (const [field,value] of Object.entries(box.fields)) if (/^map\d*$/.test(field)) images(value).forEach(image=>add(image[1]));
    // 固定 Mission infobox 修订：未传 map 时使用名称加 map.jpg。
    if (/^mission infobox$/i.test(box.name) && !Object.hasOwn(box.fields,'map')) add(`${cleanQuestText(box.fields.name || page.title)} map.jpg`);
  }
  return [...output];
}
export const pageLinks = page => [...new Set(links(page.wikitext).map(link => link.title).filter(title => !title.includes(':')))];
