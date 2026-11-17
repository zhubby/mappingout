/**
 * [INPUT]: 依赖导入对象、有效角色编号和任务记录类型。
 * [OUTPUT]: 校验并复制任务记录；拒绝重复键、孤立角色与非法值。
 * [POS]: 个人数据校验的任务分支；不访问攻略资料或网络。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import type { QuestProfile, QuestProgress } from '../shared/contracts/quests';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, length: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= length;
export function validateQuestRecords(value: Record<string, unknown>, characters: Set<string>): { questProgress: QuestProgress[]; questProfiles: QuestProfile[] } | null {
  if (!Array.isArray(value.questProgress) || !Array.isArray(value.questProfiles) || value.questProgress.length > 200000 || value.questProfiles.length > 500) return null;
  const questProgress: QuestProgress[] = [], questProfiles: QuestProfile[] = [], keys = new Set<string>(), profiles = new Set<string>();
  for (const row of value.questProgress) {
    if (!object(row) || !text(row.characterId, 100) || !characters.has(row.characterId) || !text(row.questId, 200) || !['normal', 'hard'].includes(row.mode as string) || typeof row.active !== 'boolean' || typeof row.completed !== 'boolean' || typeof row.bonus !== 'boolean' || ![0, 1, 2, 3].includes(row.mastery as number) || (!row.completed && row.mastery !== 0) || !text(row.updatedAt, 30) || !Number.isFinite(Date.parse(row.updatedAt)) || new Date(row.updatedAt).toISOString() !== row.updatedAt) return null;
    const key = `${row.characterId}\0${row.questId}\0${row.mode}`;
    if (keys.has(key)) return null; keys.add(key);
    questProgress.push({ characterId: row.characterId, questId: row.questId, mode: row.mode as QuestProgress['mode'], active: row.active, completed: row.completed, bonus: row.bonus, mastery: row.mastery as QuestProgress['mastery'], updatedAt: row.updatedAt });
  }
  for (const row of value.questProfiles) {
    if (!object(row) || !text(row.characterId, 100) || !characters.has(row.characterId) || profiles.has(row.characterId) || !object(row.conditions) || Object.keys(row.conditions).length > 10000 || Object.entries(row.conditions).some(([key, flag]) => !text(key, 200) || typeof flag !== 'boolean' || ['__proto__', 'constructor', 'prototype'].includes(key)) || (row.originCampaign !== undefined && ![1, 2, 3].includes(row.originCampaign as number)) || (row.profession !== undefined && ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10].includes(row.profession as number))) return null;
    profiles.add(row.characterId);
    questProfiles.push({ characterId: row.characterId, ...(row.originCampaign !== undefined ? { originCampaign: row.originCampaign as number } : {}), ...(row.profession !== undefined ? { profession: row.profession as number } : {}), conditions: Object.fromEntries(Object.entries(row.conditions)) as Record<string, boolean> });
  }
  return { questProgress, questProfiles };
}
