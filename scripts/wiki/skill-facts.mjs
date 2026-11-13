import { templates, plainText, section, links } from './wikitext.mjs';

export const professions = { None: 0, Warrior: 1, Ranger: 2, Monk: 3, Necromancer: 4, Mesmer: 5, Elementalist: 6, Assassin: 7, Ritualist: 8, Paragon: 9, Dervish: 10 };
export const attributes = {
  'Axe Mastery': '精通斧术', 'Hammer Mastery': '精通鎚术', Strength: '力量', Swordsmanship: '精通剑术', Tactics: '战术',
  'Beast Mastery': '野兽支配', Expertise: '专精', Marksmanship: '弓术', 'Wilderness Survival': '求生',
  'Divine Favor': '神恩', 'Healing Prayers': '治疗祈祷', 'Protection Prayers': '防护祈祷', 'Smiting Prayers': '惩戒祈祷',
  'Blood Magic': '血魔法', Curses: '诅咒', 'Death Magic': '死亡魔法', 'Soul Reaping': '灵魂吸取',
  'Domination Magic': '支配魔法', 'Fast Casting': '快速施法', 'Illusion Magic': '幻术魔法', 'Inspiration Magic': '灵感魔法',
  'Air Magic': '风系魔法', 'Earth Magic': '土系魔法', 'Energy Storage': '能量储存', 'Fire Magic': '火系魔法', 'Water Magic': '水系魔法',
  'Critical Strikes': '致命攻击', 'Dagger Mastery': '匕首精通', 'Deadly Arts': '暗杀技巧', 'Shadow Arts': '暗影技巧',
  'Channeling Magic': '导引魔法', 'Communing': '神谕', 'Restoration Magic': '复原魔法', 'Spawning Power': '召唤',
  Command: '命令', Leadership: '领导', Motivation: '激励', 'Spear Mastery': '矛术精通',
  'Earth Prayers': '地之祈祷', Mysticism: '秘法', 'Scythe Mastery': '镰刀精通', 'Wind Prayers': '风之祈祷',
  'Allegiance rank': '阵营称号', 'Sunspear rank': '日戟称号', 'Lightbringer rank': '光明使者称号',
  'Asura rank': '阿苏拉称号', 'Deldrimor rank': '戴尔狄摩称号', 'Ebon Vanguard rank': '黑檀先锋队称号', 'Norn rank': '诺恩称号',
  'No Attribute': '无属性', 'No attribute': '无属性', None: '无属性', '': '无属性'
};
export const skillTypes = { 'Axe Attack': '斧术攻击技能', 'Hammer Attack': '鎚术攻击技能', 'Sword Attack': '剑术攻击技能', 'Melee Attack': '近身攻击技能', 'Bow Attack': '弓术攻击技能', 'Spear Attack': '矛术攻击技能', 'Scythe Attack': '镰刀攻击技能', 'Lead Attack': '引导攻击', 'Off-Hand Attack': '副手攻击', 'Dual Attack': '双重攻击', 'Pet Attack': '宠物攻击', Skill: '技能', Spell: '咒文魔法', 'Enchantment Spell': '加持魔法', 'Flash Enchantment Spell': '闪现加持魔法', 'Hex Spell': '降咒魔法', 'Weapon Spell': '武装魔法', 'Item Spell': '物品魔法', 'Binding Ritual': '缚灵仪式', 'Nature Ritual': '自然仪式', Stance: '态势', Shout: '战嚎', Chant: '圣歌', Echo: '回响', Signet: '纹章', Preparation: '准备技能', Trap: '陷阱', Glyph: '符号', 'Touch Skill': '触碰技能', 'Ebon Vanguard Ritual': '黑檀先锋队仪式', Ritual: '仪式', Attack: '攻击技能' };
const campaigns = { Core: 0, Prophecies: 1, Factions: 2, Nightfall: 3, 'Eye of the North': 4 };
const yes = value => /^(?:y|yes|true|1)$/i.test(value || '');
export function skillFacts(page) {
  const box = templates(page.wikitext, 'Skill infobox')[0]?.fields;
  if (!box) return null;
  const text = Object.fromEntries(Object.entries(box).map(([key, value]) => [key, plainText(value)]));
  const acquisition = section(page.wikitext, 'Acquisition');
  const elite = yes(text.elite);
  let activeCampaigns = [campaigns[text.campaign]], method = elite ? 'capture' : 'trainer'; const sources = [], knownTitles = new Set();
  for (const line of acquisition.split('\n')) {
    if (/^[A-Za-z]/.test(line.trim()) && links(line).length) sources.push({ method: 'notes', title: page.title, areas: [], text: plainText(line), raw: line });
    if (!line.startsWith('*') && /Signet of Capture/.test(line)) method = 'capture';
    else if (!line.startsWith('*') && /Hero skill trainer/i.test(line)) method = 'hero-trainer';
    else if (!line.startsWith('*') && /Skill trainer/i.test(line)) method = 'trainer';
    else if (!line.startsWith('*') && /quest/i.test(line)) method = 'quest';
    if (!line.startsWith('*')) continue;
    const body = plainText(line.replace(/^\*+\s*/, ''));
    const heading = body.split(/\s+and\s+/).map(name => campaigns[name.replace(/^Guild Wars /, '')]);
    if (heading.length && heading.every(value => value !== undefined)) { activeCampaigns = heading; continue; }
    const entries = links(line);
    if (!entries.length) continue;
    // Wiki often links an NPC only on its first occurrence. Preserve the later
    // quest-specific spawn instead of mistaking its first linked area for an NPC.
    const prefix = line.slice(0, line.indexOf('[[')).replace(/^\*+\s*/, '').trim();
    let title, areas;
    if (/[A-Za-z]/.test(prefix)) {
      title = prefix.replace(/\s*\(\s*$/, '').trim();
      if (!knownTitles.has(title)) continue;
      areas = entries.map(entry => entry.title);
    } else { title = entries[0].title; areas = entries.slice(1).map(entry => entry.title); }
    knownTitles.add(title);
    for (const campaign of activeCampaigns) sources.push({ method, campaign, title, areas, text: body, raw: line });
  }
  const progression = templates(page.wikitext).filter(t => /^skill progression/i.test(t.name)).map(t => ({ template: t.name, fields: Object.fromEntries(Object.entries(t.fields).map(([k, v]) => [k, plainText(v)])) }));
  const warnings = templates(page.wikitext).filter(t => ['bug', 'anomaly'].includes(t.name.toLowerCase())).map(t => ({ kind: t.name.toLowerCase(), text: plainText(t.fields[1]) }));
  return {
    title: page.title, gameIds: text.id?.match(/\d+/g)?.map(Number) || [],
    campaign: text.campaign, profession: professions[text.profession] ?? 0, professionName: text.profession || 'None',
    attribute: text.attribute || 'No Attribute', type: text.type, elite, pveOnly: yes(text['pve-only']), hasPvp: yes(text['has-pvp']),
    energy: text.energy || '0', adrenaline: text.adrenaline || '0', activation: text.activation || '0', recharge: text.recharge || '0', upkeep: text.upkeep || '0', sacrifice: text.sacrifice || '0', overcast: text.overcast || text.exhaustion || '0',
    description: plainText(box.description), conciseDescription: plainText(box['concise description']), progression, acquisition: sources, warnings,
    unknownTemplates: /\{\{/.test(plainText(box.description)),
    reference: { title: page.title, pageid: page.pageid, revid: page.revid, url: page.url, revisionUrl: page.revisionUrl, revisedAt: page.revisedAt, retrievedAt: page.retrievedAt }
  };
}
