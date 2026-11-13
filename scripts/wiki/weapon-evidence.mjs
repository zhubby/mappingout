import { attributes } from './skill-facts.mjs';

const aliases = {
  'Axe Mastery': ['斧术精通', '精通斧术', '斧头精通'], 'Hammer Mastery': ['锤术精通', '精通锤术', '鎚术精通'],
  Swordsmanship: ['剑术精通', '精通剑术'], Marksmanship: ['弓术精通', '弓术', '射术'],
  'Dagger Mastery': ['匕首精通', '精通匕首'], 'Scythe Mastery': ['镰刀精通', '精通镰刀'],
  'Spear Mastery': ['矛术精通', '精通矛术', '标枪精通'],
  'Divine Favor': ['神恩'], 'Smiting Prayers': ['惩戒祈祷', '惩戒魔法'],
  'Protection Prayers': ['防护祈祷', '保护祈祷'], 'Death Magic': ['死亡魔法'],
  'Spawning Power': ['召唤力量', '召唤'], Communing: ['神唤', '神谕'],
  'Channeling Magic': ['导引魔法', '引导魔法', '导引'], 'Restoration Magic': ['复原魔法', '恢复魔法'],
  Leadership: ['统御', '领导'], Mysticism: ['神秘', '秘法'], Expertise: ['专精'],
  'Critical Strikes': ['致命攻击', '致命一击'], 'Energy Storage': ['能量储存', '能量存储']
};
export function legacyWeaponProfile(record) {
  const lines = (record.legacy || record).details;
  const compact = lines.map(line => line.replace(/\s+/g, ''));
  const requirement = compact.find(line => /(?:需求|需要|要求|需)/.test(line));
  const requirementText = requirement?.match(/(?:需求|需要|要求|需)[.:：]?(\d+)([^)）]+)/);
  let attribute;
  if (requirement) attribute = Object.keys(attributes).find(name => [...(aliases[name] || []), attributes[name]].some(label => requirement.includes(label)));
  const damage = compact.join(' ').match(/(?:^|[^\d])(\d+)[\-–](\d+)(?=[^\d]|$)/);
  let type;
  if (compact.some(line => /^能量[:：]?\+10(?:$|[(（])/.test(line))) type = 'staff';
  else if (damage) {
    const range = `${Number(damage[1])}-${Number(damage[2])}`;
    type = { '6-28': 'axe', '19-35': 'hammer', '15-22': 'sword', '15-28': 'bow', '7-17': 'daggers', '14-27': 'spear', '9-41': 'scythe', '11-22': 'wand' }[range];
  } else if (compact.some(line => /^能量[:：]?\+12/.test(line))) type = 'focus item';
  else if (compact.some(line => /^(?:防御|护甲)[:：]?16/.test(line))) type = 'shield';
  return { type, attribute, requirement: requirementText ? Number(requirementText[1]) : undefined, damage: damage ? `${Number(damage[1])}-${Number(damage[2])}` : undefined };
}
export function matchingWeaponProfile(legacy, current) {
  const reasons = [];
  const type = /^(?:shortbow|longbow|flatbow|recurve bow|hornbow)$/i.test(current.type) ? 'bow' : current.type.toLowerCase();
  if (!legacy.type || legacy.type !== type) reasons.push('type');
  if (!legacy.attribute || legacy.attribute.toLowerCase() !== current.attribute.toLowerCase()) reasons.push('attribute');
  if (!current.unique) reasons.push('not-unique');
  return reasons;
}
