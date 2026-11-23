/**
 * [INPUT]: 依赖 Wiki 来源契约。
 * [OUTPUT]: 定义护甲配方、备注子页证据、制作商与个人计划。
 * [POS]: 护甲资料和持久记录的纯类型。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import type { WikiReference } from './catalog';
export interface MaterialAmount { materialId: string; quantity: number }
export interface Material { id: string; name: string; englishName: string; icon?: string }
export interface ArmorPiece { id: string; name: string; slot: string; gold: number; materials: MaterialAmount[] }
export interface Armorer { id: string; name: string; locations: string[]; notes: string; reference: WikiReference }
export interface ArmorSet { id: string; name: string; englishName: string; searchAliases?: string[]; profession: number; campaigns: number[]; category: 'basic'|'elite'|'special'; images: { male?: string; female?: string }; notes: string; noteReferences?: WikiReference[]; reference: WikiReference }
export interface ArmorOffer { id: string; armorId: string; armorerId: string; location: string; zoneId?: string; campaign: number; armorRating: number; ratingByProfession?: Record<number,number>; pieces: ArmorPiece[]; notes: string; noteReferences?: WikiReference[]; reference: WikiReference }
export interface ArmorCatalog { version: 1; referenceVersion: string; sets: ArmorSet[]; offers: ArmorOffer[]; armorers: Armorer[]; materials: Material[]; references: WikiReference[]; issues: { title: string; message: string }[]; coverage: { discovered: number; crafted: number; excluded: number } }
export interface ArmorPlan { id: string; characterId: string; name: string; offerId: string; pieceIds: string[]; completedPieceIds: string[] }
