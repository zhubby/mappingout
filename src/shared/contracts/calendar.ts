/**
 * [INPUT]: 依赖 Wiki 来源契约。
 * [OUTPUT]: 定义活动、轮换、实例与个人完成记录。
 * [POS]: 日历和任务联动共用的纯类型。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import type { WikiReference } from './catalog';
export type ActivityKind = 'mission'|'bounty'|'combat'|'vanquish'|'traveler'|'pve-bonus'|'pvp-bonus';
export interface Activity { id: string; kind: ActivityKind; name: string; englishName: string; searchAliases?: string[]; objective: string; requirements: string; rewards: string; giver: string; turnIn: string; notes: string; zoneId?: string; relatedIds?: string[]; location?: string; exchange?: { item: string; perGift: number }; references: WikiReference[] }
export interface Rotation { id: ActivityKind; epoch: number; period: number; sequence: string[]; reference: WikiReference }
export interface ActivityCatalog { version: 1; referenceVersion: string; activities: Activity[]; rotations: Rotation[]; references: WikiReference[] }
export interface Occurrence { activity: Activity; start: number; end: number }
export interface ActivityProgress { characterId: string; activityId: string; start: string; done: boolean }
