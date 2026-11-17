/**
 * [INPUT]: 依赖资料分类、护甲、日历和任务的纯类型。
 * [OUTPUT]: 定义角色、进度、笔记与 v3 备份信封。
 * [POS]: 个人数据契约；不加载界面或翻译。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import type { Kind } from './catalog';
export interface Character { id: string; name: string }
export interface Progress { characterId: string; entryId: string; done: boolean; date?: string }
export interface Note { id: string; characterId: string; region: string; x: number; y: number; text: string }
export interface Personal { characters: Character[]; progress: Progress[]; notes: Note[]; armorPlans: import('./armor').ArmorPlan[]; activityProgress: import('./calendar').ActivityProgress[]; questProgress: import('./quests').QuestProgress[]; questProfiles: import('./quests').QuestProfile[]; preferences: { characterId: string; layers: Kind[]; calendarTimezone?: 'Asia/Shanghai'|'local'|'UTC' } }
export interface Backup { format: 'mappingout-backup'; version: 3; exportedAt: string; data: Personal; migratedFrom?: 1 | 2 }
