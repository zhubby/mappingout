export type Kind = 'skill' | 'boss' | 'green' | 'collector' | 'pet' | 'treasure' | 'zone';
export const kindNames: Record<Kind, string> = { skill: '精英技能', boss: 'Boss', green: '绿装', collector: '收藏家', pet: '宠物', treasure: '宝藏', zone: '区域' };
export const kindSymbols: Record<Kind, string> = { skill: '✦', boss: '♜', green: '⚔', collector: '◇', pet: '♧', treasure: '▣', zone: '⌖' };
export interface Source { file: string; line: number }
export interface Place { id: string; region: string; zone?: string; x: number; y: number; valid: boolean; note: string; boss?: string; bossId?: string; source: Source }
export interface Entry { id: string; kind: Kind; name: string; code?: string; campaign: number; profession?: number; attribute?: string; description: string; details: string[]; image?: string; locations: Place[]; related?: string[]; vanquishable?: boolean; source: Source }
export interface Region { id: string; code: number; campaign: number; name: string; verified: boolean; image?: string; width: number; height: number }
export interface Catalog { version: number; campaigns: { id: number; name: string; shortName: string }[]; regions: Region[]; professions: { id: number; name: string; originalName: string }[]; records: Entry[] }
export interface Character { id: string; name: string }
export interface Progress { characterId: string; entryId: string; done: boolean; date?: string }
export interface Note { id: string; characterId: string; region: string; x: number; y: number; text: string }
export interface Personal { characters: Character[]; progress: Progress[]; notes: Note[]; preferences: { characterId: string; layers: Kind[] } }
export interface Backup { format: 'mappingout-backup'; version: 1; exportedAt: string; data: Personal }
export interface Filters { q: string; campaign: string; region: string; zone: string; kind: Kind | ''; profession: string; attribute: string; incomplete: boolean; selected: string; map: string }
