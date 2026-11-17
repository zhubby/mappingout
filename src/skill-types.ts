/**
 * [INPUT]: 依赖共用 Wiki 来源与获取途径契约。
 * [OUTPUT]: 提供技能版本、资源、成长效果和查询上下文类型。
 * [POS]: 技能采集编译、双语界面和离线查询的共同边界。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import type {Acquisition,WikiReference} from './types';
export type SkillMode='pve'|'pvp';
export type SkillResourceKey='energy'|'adrenaline'|'activation'|'recharge'|'upkeep'|'sacrifice'|'overcast';
export interface SkillResource {text:string;value:number|null;kind:'number'|'attack-speed'|'morale'|'dynamic'}
export interface SkillEffect {
 id:string;label:string;metric:string;unit:string;scope:'single'|'per-second'|'per-hit'|'per-trigger';
 condition:string;conditional:boolean;axis:string;axisKind:'attribute'|'title'|'fixed';values:Record<string,number>;
 formula?:string;uncertain?:boolean;reference:WikiReference;
}
export interface SkillTextPart {id:string;text?:string;effectId?:string;raw?:string}
export interface SkillSource extends Acquisition {questId?:string;zoneIds?:string[];reference?:WikiReference}
export interface SkillVariant {
 id:string;name:string;englishName:string;searchTexts?:string[];gameIds:number[];modes:SkillMode[];format?:'codex';profession:number;attribute:string;
 campaigns:number[];type:string;elite:boolean;pveOnly:boolean;image:string;
 description:string;conciseDescription:string;descriptionParts:SkillTextPart[];descriptionTemplate?:string;
 resources:Record<SkillResourceKey,SkillResource>;target:string;range:string;aoe:string;tags:string[];
 effects:SkillEffect[];acquisition:SkillSource[];notes:string[];related:string[];reference:WikiReference;
}
export interface LibrarySkill {id:string;name:string;englishName:string;searchAliases?:string[];legacyEntryIds:string[];variants:SkillVariant[]}
export interface SkillCatalog {
 version:1;referenceVersion:string;skills:LibrarySkill[];
 resourceIcons:{key:SkillResourceKey;file:string;reference:WikiReference}[];
 tracks:{id:string;name:string;max:number}[];
 coverage:{discovered:number;included:number;variants:number;excluded:number;dynamicEffects:number};
}
export interface SkillLevels {attribute:number;attributes?:Record<string,number>;titles:Record<string,number>}
export interface SkillFilters {profession?:number[];attribute?:string[];campaign?:number[];type?:string[];mode?:SkillMode;elite?:boolean;unconditional?:boolean;tag?:string[]}
export interface SkillSearchOptions {levels:SkillLevels;filters?:SkillFilters;sort?:string}
export interface SkillMatch {skill:LibrarySkill;variants:SkillVariant[];effects:Record<string,SkillEffect[]>;score:number}
