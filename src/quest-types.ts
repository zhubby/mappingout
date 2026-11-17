/**
 * [INPUT]: 依赖 Wiki 修订引用类型。
 * [OUTPUT]: 提供任务攻略、前置表达式和角色记录契约。
 * [POS]: 任务编译、界面、领域规则与持久存储的共同边界。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import type { WikiReference } from './types';

export type QuestChapter = 'prophecies' | 'factions' | 'nightfall' | 'eotn' | 'kryta' | 'winds' | 'core';
export type QuestKind = 'main' | 'side' | 'dungeon' | 'elite' | 'challenge' | 'bounty' | 'utility';
export type QuestMode = 'normal' | 'hard';
export interface QuestBlock { id: string; kind: 'paragraph' | 'heading' | 'item' | 'table' | 'notice'; text: string; level?: number; cells?: string[][] }
export interface QuestSection { id: string; title: string; blocks: QuestBlock[] }
export type QuestRequirement =
  | { op: 'all' | 'any'; items: QuestRequirement[] }
  | { op: 'quest'; questId: string; mode?: QuestMode }
  | { op: 'condition'; id: string; text: string };
export interface QuestImage { id: string; file: string; caption: string; reference: WikiReference; originalUrl: string; sha256: string }
export interface QuestGuide {
  id: string; name: string; englishName: string; chapter: QuestChapter; campaign: number; region: string; kind: QuestKind;
  mode: QuestMode | 'both'; repeatable: boolean; order: number; profession?: number; originCampaign?: number;
  allowedOrigins?: number[]; guideQuality: 'detailed' | 'instructions' | 'target-notes' | 'objectives-only';
  missionReward?: 'bonus' | 'mastery';
  givenBy: string; givenAt: string; requirement: QuestRequirement; recommendedAfter: string[];
  sections: QuestSection[]; images: QuestImage[]; references: WikiReference[];
  missingSourceImages: string[];
  links: { title: string; questId?: string; zoneId?: string; url: string }[];
  searchAliases?: string[]; activityId?: string; walkthroughFrom?: string;
}
export interface QuestCatalog {
  version: 1; referenceVersion: string;
  chapters: { id: QuestChapter; name: string; introduction: string; reference: WikiReference }[];
  quests: QuestGuide[];
  coverage: { discovered: number; included: number; excluded: number; sourceGaps: number };
}
export interface QuestProfile { characterId: string; originCampaign?: number; profession?: number; conditions: Record<string, boolean> }
export interface QuestProgress {
  characterId: string; questId: string; mode: QuestMode; active: boolean; completed: boolean;
  bonus: boolean; mastery: 0 | 1 | 2 | 3; updatedAt: string;
}
