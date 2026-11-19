/**
 * [INPUT]: 依赖任务前置表达式、攻略目录和角色个人记录。
 * [OUTPUT]: 提供角色范围评估器、三态前置判断与原子任务变更。
 * [POS]: 任务界面与持久存储之间的纯领域边界。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import type { Personal } from '../../shared/contracts/personal';
import type { QuestGuide, QuestMode, QuestProfile, QuestProgress, QuestRequirement } from '../../shared/contracts/quests';
import { t } from '../../i18n';

export type RequirementState = 'ready' | 'blocked' | 'unknown';
export function questProfile(state: Personal, characterId = state.preferences.characterId): QuestProfile {
  return state.questProfiles.find(p => p.characterId === characterId) || { characterId, conditions: {} };
}
export function questRecord(state: Personal, questId: string, mode: QuestMode, characterId = state.preferences.characterId) {
  return createQuestEvaluator(state, characterId).record(questId, mode);
}
export interface QuestEvaluator {
  record: (questId: string, mode: QuestMode) => QuestProgress | undefined;
  requirement: (requirement: QuestRequirement) => RequirementState;
  availability: (quest: QuestGuide) => RequirementState;
}
const evaluatorCache = new WeakMap<Personal, Map<string, QuestEvaluator>>();
export function createQuestEvaluator(state: Personal, characterId = state.preferences.characterId): QuestEvaluator {
  const byCharacter = evaluatorCache.get(state);
  const cached = byCharacter?.get(characterId);
  if (cached) return cached;
  const exists = state.characters.some(character => character.id === characterId);
  const records = new Map<string, QuestProgress>();
  const completedAny = new Set<string>();
  if (exists) for (const progress of state.questProgress) {
    if (progress.characterId !== characterId) continue;
    records.set(`${progress.questId}:${progress.mode}`, progress);
    if (progress.completed) completedAny.add(progress.questId);
  }
  const profile = questProfile(state, characterId);
  const requirementCache = new WeakMap<QuestRequirement, RequirementState>();
  const availabilityCache = new WeakMap<QuestGuide, RequirementState>();
  const record = (questId: string, mode: QuestMode) => records.get(`${questId}:${mode}`);
  const requirement = (item: QuestRequirement): RequirementState => {
    const cached = requirementCache.get(item);
    if (cached) return cached;
    let result: RequirementState;
    if (!exists) result = 'unknown';
    else if (item.op === 'quest') result = (item.mode ? record(item.questId, item.mode)?.completed : completedAny.has(item.questId)) ? 'ready' : 'blocked';
    else if (item.op === 'condition') {
      const value = profile.conditions[item.id];
      result = value === undefined ? 'unknown' : value ? 'ready' : 'blocked';
    } else {
      const statuses = item.items.map(requirement);
      if (item.op === 'all') result = statuses.includes('blocked') ? 'blocked' : statuses.includes('unknown') ? 'unknown' : 'ready';
      else result = statuses.includes('ready') ? 'ready' : statuses.includes('unknown') ? 'unknown' : 'blocked';
    }
    requirementCache.set(item, result);
    return result;
  };
  const availability = (quest: QuestGuide): RequirementState => {
    const cached = availabilityCache.get(quest);
    if (cached) return cached;
    const checks: RequirementState[] = [requirement(quest.requirement)];
    if (quest.allowedOrigins?.length) checks.push(profile.originCampaign === undefined ? 'unknown' : quest.allowedOrigins.includes(profile.originCampaign) ? 'ready' : 'blocked');
    for (const [expected, actual] of [[quest.allowedOrigins?.length ? undefined : quest.originCampaign, profile.originCampaign], [quest.profession, profile.profession]]) {
      if (expected) checks.push(actual === undefined ? 'unknown' : expected === actual ? 'ready' : 'blocked');
    }
    const result = checks.includes('blocked') ? 'blocked' : checks.includes('unknown') ? 'unknown' : 'ready';
    availabilityCache.set(quest, result);
    return result;
  };
  const evaluator = { record, requirement, availability };
  const cache = byCharacter || new Map<string, QuestEvaluator>();
  cache.set(characterId, evaluator);
  if (!byCharacter) evaluatorCache.set(state, cache);
  return evaluator;
}
export function requirementState(requirement: QuestRequirement, state: Personal, characterId = state.preferences.characterId): RequirementState {
  return createQuestEvaluator(state, characterId).requirement(requirement);
}
export function questAvailability(quest: QuestGuide, state: Personal): RequirementState {
  return createQuestEvaluator(state).availability(quest);
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
