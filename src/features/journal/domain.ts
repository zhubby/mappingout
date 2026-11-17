/**
 * [INPUT]: 依赖完整个人记录契约。
 * [OUTPUT]: 删除角色并清除各功能的角色记录。
 * [POS]: 角色生命周期边界；地图领域不依赖角色删除。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import type { Personal } from '../../shared/contracts/personal';
export function deleteCharacter(state: Personal, id: string): Personal {
  const characters = state.characters.filter(c => c.id !== id);
  return { ...state, characters, questProgress:state.questProgress.filter(p=>p.characterId!==id), questProfiles:state.questProfiles.filter(p=>p.characterId!==id), progress: state.progress.filter(p => p.characterId !== id), notes: state.notes.filter(n => n.characterId !== id), armorPlans:state.armorPlans.filter(p=>p.characterId!==id), activityProgress:state.activityProgress.filter(p=>p.characterId!==id), preferences: { ...state.preferences, characterId: state.preferences.characterId === id ? characters[0]?.id || '' : state.preferences.characterId } };
}
