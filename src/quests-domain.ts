/**
 * [INPUT]: 依赖任务前置表达式、攻略目录和角色个人记录。
 * [OUTPUT]: 提供三态前置判断、检索及原子任务记录变更。
 * [POS]: 任务界面与持久存储之间的纯领域边界。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import type { Personal } from './types';
import type { QuestGuide, QuestMode, QuestProfile, QuestProgress, QuestRequirement } from './quest-types';
import { t } from './i18n';

export type RequirementState = 'ready' | 'blocked' | 'unknown';
export function questProfile(state: Personal, characterId = state.preferences.characterId): QuestProfile {
  return state.questProfiles.find(p => p.characterId === characterId) || { characterId, conditions: {} };
}
export function questRecord(state: Personal, questId: string, mode: QuestMode, characterId = state.preferences.characterId) {
  return state.questProgress.find(p => p.characterId === characterId && p.questId === questId && p.mode === mode);
}
export function requirementState(requirement: QuestRequirement, state: Personal, characterId = state.preferences.characterId): RequirementState {
  if (!state.characters.some(c => c.id === characterId)) return 'unknown';
  if (requirement.op === 'quest') return state.questProgress.some(p => p.characterId === characterId && p.questId === requirement.questId && (!requirement.mode || p.mode === requirement.mode) && p.completed) ? 'ready' : 'blocked';
  if (requirement.op === 'condition') {
    const value = questProfile(state, characterId).conditions[requirement.id];
    return value === undefined ? 'unknown' : value ? 'ready' : 'blocked';
  }
  const statuses = requirement.items.map(item => requirementState(item, state, characterId));
  if (requirement.op === 'all') return statuses.includes('blocked') ? 'blocked' : statuses.includes('unknown') ? 'unknown' : 'ready';
  return statuses.includes('ready') ? 'ready' : statuses.includes('unknown') ? 'unknown' : 'blocked';
}
export function questAvailability(quest: QuestGuide, state: Personal): RequirementState {
  const profile = questProfile(state), checks = [requirementState(quest.requirement, state)];
  if (quest.allowedOrigins?.length) checks.push(profile.originCampaign === undefined ? 'unknown' : quest.allowedOrigins.includes(profile.originCampaign) ? 'ready' : 'blocked');
  for (const [expected, actual] of [[quest.allowedOrigins?.length ? undefined : quest.originCampaign, profile.originCampaign], [quest.profession, profile.profession]]) {
    if (expected) checks.push(actual === undefined ? 'unknown' : expected === actual ? 'ready' : 'blocked');
  }
  return checks.includes('blocked') ? 'blocked' : checks.includes('unknown') ? 'unknown' : 'ready';
}
export function changeQuest(state: Personal, characterId: string, questId: string, mode: QuestMode, patch: Partial<Pick<QuestProgress, 'active' | 'completed' | 'bonus' | 'mastery'>>, now = new Date().toISOString()): Personal {
  if (!state.characters.some(c => c.id === characterId)) throw Error(t('此角色已在其他页面删除，请重新选择角色。'));
  const previous = questRecord(state, questId, mode, characterId);
  const next: QuestProgress = { characterId, questId, mode, active: false, completed: false, bonus: false, mastery: 0, ...previous, ...patch, updatedAt: now };
  if (patch.completed === true || (patch.mastery !== undefined && patch.mastery > 0)) { next.completed = true; next.active = false; }
  if (patch.completed === false) next.mastery = 0;
  return { ...state, questProgress: [...state.questProgress.filter(p => !(p.characterId === characterId && p.questId === questId && p.mode === mode)), next] };
}
export function changeQuestProfile(state: Personal, characterId: string, change: (profile: QuestProfile) => QuestProfile): Personal {
  if (!state.characters.some(c => c.id === characterId)) throw Error(t('此角色已在其他页面删除，请重新选择角色。'));
  const next = { ...change(questProfile(state, characterId)), characterId };
  return { ...state, questProfiles: [...state.questProfiles.filter(p => p.characterId !== characterId), next] };
}
export function searchQuests(quests: QuestGuide[], search: string) {
  const terms = search.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return quests.filter(quest => {
    const text = [quest.name, quest.englishName, ...(quest.searchAliases || []), quest.region, quest.givenAt, quest.givenBy].join(' ').toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
}
