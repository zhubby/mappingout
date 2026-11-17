/**
 * [INPUT]: 依赖固定修订的任务目录、信息框和任务身份索引。
 * [OUTPUT]: 编译前置表达式及非强制的推荐顺序。
 * [POS]: 任务编译的关系边界；包含关系不转换成前置边。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { links } from './wikitext.mjs';
import { cleanQuestText } from './quest-content.mjs';
const all = (...items) => ({ op: 'all', items: items.flat() });
const any = (...items) => ({ op: 'any', items: items.flat() });

export function compileQuestGraph(rows, pages, chapters, resolve) {
  const byId = new Map(rows.map(row => [row.id, row]));
  const q = title => { const id = resolve(title); if (!id) throw Error(`Missing graph task: ${title}`); return { op: 'quest', questId: id, mode: byId.get(id).mode === 'hard' ? 'hard' : 'normal' }; };
  const condition = (row, key, text) => ({ op: 'condition', id: `${row.id}:${key}`, text });
  const conditions = req => req.op === 'condition' ? [req] : (req.items || []).flatMap(conditions);
  const override = (title, requirement) => { const row = byId.get(resolve(title)); if (row) row.requirement = all(requirement, conditions(row.requirement)); };
  for (const row of rows) {
    const { box, page } = pages.get(row.id);
    const raw = box['preceded by'] || '';
    const titles = [...new Set(links(raw).map(link => link.title))];
    const prerequisites = titles.map(title => resolve(title)).filter(id => id && id !== row.id);
    const items = prerequisites.map(id => q(byId.get(id).englishName));
    const unknown = titles.filter(title => !resolve(title));
    if (unknown.length) items.push(condition(row, 'source-access', cleanQuestText(raw)));
    // 父任务只表示包含关系，不是进入子任务前必须完成父任务。
    const parent = resolve(links(box['part of'] || '')[0]?.title);
    row.requirement = { op: /\bor\b|\beither\b/i.test(raw) ? 'any' : 'all', items: items.filter(item => item.questId !== parent) };
    const requirements = row.sections.filter(s => s.id.startsWith('requirements')).flatMap(s => s.blocks).map(b => b.text).filter(Boolean).join('\n');
    if (requirements) row.requirement = all(row.requirement, condition(row, 'access', requirements));
    if (/Reforged Mode/i.test(page.wikitext) && /only (?:available|offered)|Reforged Mode only/i.test(page.wikitext)) row.requirement = all(row.requirement, condition(row, 'reforged', 'This quest is only available in Reforged Mode.'));
  }
  // 列表中的相邻顺序只用于阅读建议，绝不据此锁定可跳过的任务。
  for (const chapter of chapters) {
    const root = pages.get(`root:${chapter.id}`)?.page;
    if (!root) continue;
    let previous;
    for (const link of links(root.wikitext.split(/^==\s*(?:Notes|Trivia|Challenge|Competitive)/mi)[0])) {
      const id = resolve(link.title), row = byId.get(id);
      if (!row || row.chapter !== chapter.id || row.kind !== 'main') continue;
      if (previous && previous !== id && !row.recommendedAfter.includes(previous)) row.recommendedAfter.push(previous);
      previous = id;
    }
  }
  override('Augury Rock', all(q('Dunes of Despair'), q('Thirsty River'), q('Elona Reach')));
  override('Unwaking Waters', any(q('Into the Whirlpool'), q('Journey to the Whirlpool')));
  override('Taking Back the Palace', q('Unwaking Waters'));
  override('Moddok Crevice', any(q('Pogahn Passage'), q('Rilohn Refuge')));
  override('Pledge of the Merchant Princes', any(q('Dasha Vestibule'), q('Dzagonur Bastion')));
  override('Crossing the Desolation', any(q("Jennur's Horde"), q('Nundu Bay')));
  override('Heart of the Shiverpeaks (quest)', all(q('The Knowledgeable Asura'), q('The Missing Vanguard'), q('Northern Allies')));
  override('Destruction\'s Depths', q('Heart of the Shiverpeaks (quest)'));
  override('A Time for Heroes', q("Destruction's Depths"));
  // 两条英雄分支可借助队伍补做；英雄和队伍资格由领取条件单独确认。
  for (const title of ['Pogahn Passage', 'Rilohn Refuge']) override(title, any(q('No Me, No Kormir'), q('To Kill a Demon')));
  for (const title of ['Dasha Vestibule', 'Dzagonur Bastion']) override(title, any(q('Greed and Regret'), q('Calling the Order')));
  const trial = byId.get(resolve('Trial of Zinn'));
  if (trial) trial.requirement = any(trial.requirement, condition(trial, 'party-access', 'Join a party led by a player who has completed Zinn\'s Task or The Knowledgeable Asura.'));
  // 普通版和困难版有不同任务 ID。困难链也必须满足对应普通版前置。
  for (const row of rows.filter(row => row.chapter === 'winds' && row.mode === 'hard')) {
    const normalTitle = row.englishName.replace(/ \(Hard mode\)$/i, ''), normal = resolve(normalTitle);
    if (normal) row.requirement = all(row.requirement, { op: 'quest', questId: normal, mode: 'normal' });
  }
  // 共享任务常被信息框互相引用。循环不能转化为不可能满足的解锁条件。
  const cycles = [];
  // 只检查每条直接前置边的可达性，并记录需要人工核对的循环。
  for (const row of rows) {
    const seen = new Set();
    const hasPath = (req, target) => {
      if (req.op === 'quest') { if (req.questId === target) return true; if (seen.has(req.questId)) return false; seen.add(req.questId); return hasPath(byId.get(req.questId).requirement, target); }
      return (req.items || []).some(item => hasPath(item, target));
    };
    if (hasPath(row.requirement, row.id)) cycles.push(row.id);
  }
  return { cycles: [...new Set(cycles)] };
}
