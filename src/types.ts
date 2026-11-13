export type Kind = 'skill' | 'boss' | 'green' | 'collector' | 'pet' | 'treasure' | 'zone';
export const kindNames: Record<Kind, string> = { skill: '技能', boss: 'Boss / 来源', green: '装备', collector: '收藏家', pet: '宠物', treasure: '宝藏', zone: '区域' };
export const kindSymbols: Record<Kind, string> = { skill: '✦', boss: '♜', green: '⚔', collector: '◇', pet: '♧', treasure: '▣', zone: '⌖' };
export interface Source { file: string; line: number }
export interface Place { id: string; region: string; zone?: string; x: number; y: number; valid: boolean; legacyValid?: boolean; positionStatus?: 'unconfirmed'; note: string; legacyNote?: string; wiki?: WikiReference; boss?: string; bossId?: string; source: Source }
export interface WikiReference { title: string; pageid: number; revid: number; url: string; revisionUrl: string; revisedAt: string; retrievedAt: string }
export interface WikiReview extends WikiReference { fields: string[]; coordinateStatus: 'legacy-unverified'; identityStatus?: 'unresolved'; translation?: 'reviewed' | 'english-source'; references?: WikiReference[] }
export interface Acquisition { method: string; campaign?: number; title: string; areas: string[]; text: string }
export interface SkillFacts {
  title: string; gameIds: number[]; type: string; profession: number; professionName: string; attribute: string;
  elite: boolean; pveOnly: boolean; energy: string; adrenaline: string; activation: string; recharge: string; upkeep: string; sacrifice: string; overcast: string;
  description: string; conciseDescription: string; acquisition?: Acquisition[]; warnings: { kind: string; text: string }[];
  reference: WikiReference; special?: boolean; capturable?: boolean; faction?: 'Kurzick' | 'Luxon'; pvp?: SkillFacts;
}
export interface StoryArc { title: string; text: string; missions: string[]; note?: string }
export interface StoryGuide { campaign: number; title: string; introduction: string; arcs: StoryArc[]; references: WikiReference[] }
export interface LegacyEntry { name: string; description: string; details: string[]; profession?: number; attribute?: string; vanquishable?: boolean }
export interface AreaFacts { title: string; type: string; campaign: string; region: string; vanquishable: boolean; exits: string[]; levels: string; reference: WikiReference; atlasRegion?: string; legacyMarker?: boolean }
export interface NpcFacts { title: string; boss: boolean; role?: 'boss' | 'boss-like' | 'enemy' | 'service'; profession: number; secondaryProfession?: number; thirdProfession?: number; level: string; areas: string[]; skills: string[]; skillsText?: string; drops: string[]; notes?: string; service: string }
export interface Entry { id: string; kind: Kind; name: string; code?: string; campaign: number; origin?: 'wiki'; profession?: number; attribute?: string; description: string; details: string[]; image?: string; locations: Place[]; related?: string[]; vanquishable?: boolean; source: Source; englishName?: string; descriptionLanguage?: 'zh' | 'en'; skill?: SkillFacts; npc?: NpcFacts; area?: AreaFacts; wiki?: WikiReview; legacy?: LegacyEntry }
export interface Region { id: string; code: number; campaign: number; name: string; verified: boolean; image?: string; width: number; height: number }
export interface Catalog { version: number; referenceVersion?: string; stories?: StoryGuide[]; campaigns: { id: number; name: string; shortName: string }[]; regions: Region[]; professions: { id: number; name: string; originalName: string }[]; records: Entry[] }
export interface Character { id: string; name: string }
export interface Progress { characterId: string; entryId: string; done: boolean; date?: string }
export interface Note { id: string; characterId: string; region: string; x: number; y: number; text: string }
export interface Personal { characters: Character[]; progress: Progress[]; notes: Note[]; preferences: { characterId: string; layers: Kind[] } }
export interface Backup { format: 'mappingout-backup'; version: 1; exportedAt: string; data: Personal }
export interface Filters { q: string; campaign: string; region: string; zone: string; kind: Kind | ''; profession: string; attribute: string; incomplete: boolean; selected: string; map: string }
