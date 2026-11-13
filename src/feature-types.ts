import type { WikiReference } from './types';

export interface MaterialAmount { materialId: string; quantity: number }
export interface Material { id: string; name: string; englishName: string }
export interface ArmorPiece { id: string; name: string; slot: string; gold: number; materials: MaterialAmount[] }
export interface Armorer { id: string; name: string; locations: string[]; notes: string; reference: WikiReference }
export interface ArmorSet { id: string; name: string; englishName: string; profession: number; campaigns: number[]; category: 'basic'|'elite'|'special'; images: { male?: string; female?: string }; notes: string; reference: WikiReference }
export interface ArmorOffer { id: string; armorId: string; armorerId: string; location: string; zoneId?: string; campaign: number; armorRating: number; ratingByProfession?: Record<number,number>; pieces: ArmorPiece[]; notes: string; reference: WikiReference }
export interface ArmorCatalog { version: 1; referenceVersion: string; sets: ArmorSet[]; offers: ArmorOffer[]; armorers: Armorer[]; materials: Material[]; references: WikiReference[]; issues: { title: string; message: string }[]; coverage: { discovered: number; crafted: number; excluded: number } }
export interface ArmorPlan { id: string; characterId: string; name: string; offerId: string; pieceIds: string[]; completedPieceIds: string[] }

export type ActivityKind = 'mission'|'bounty'|'combat'|'vanquish'|'traveler'|'pve-bonus'|'pvp-bonus';
export const activityKindNames: Record<ActivityKind,string> = { mission:'战承任务', bounty:'战承悬赏', combat:'战承战斗', vanquish:'战承清剿', traveler:'旅者尼古拉斯', 'pve-bonus':'PvE 每周奖励', 'pvp-bonus':'PvP 每周奖励' };
export interface Activity { id: string; kind: ActivityKind; name: string; englishName: string; objective: string; requirements: string; rewards: string; giver: string; turnIn: string; notes: string; zoneId?: string; relatedIds?: string[]; location?: string; exchange?: { item: string; perGift: number }; references: WikiReference[] }
export interface Rotation { id: ActivityKind; epoch: number; period: number; sequence: string[]; reference: WikiReference }
export interface ActivityCatalog { version: 1; referenceVersion: string; activities: Activity[]; rotations: Rotation[]; references: WikiReference[] }
export interface Occurrence { activity: Activity; start: number; end: number }
export interface ActivityProgress { characterId: string; activityId: string; start: string; done: boolean }
