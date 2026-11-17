/**
 * [INPUT]: 依赖资料分类契约与界面翻译。
 * [OUTPUT]: 提供地图分类名称和符号。
 * [POS]: 地图标记与应用导航共用标签。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { t } from '../../i18n';
import type { Kind } from '../contracts/catalog';
export const kindNames: Record<Kind, string> = { get skill() { return t("技能"); }, get boss() { return t("Boss / 来源"); }, get green() { return t("装备"); }, get collector() { return t("收藏家"); }, get pet() { return t("宠物"); }, get treasure() { return t("宝藏"); }, get zone() { return t("区域"); } };
export const kindSymbols: Record<Kind, string> = { skill: '✦', boss: '♜', green: '⚔', collector: '◇', pet: '♧', treasure: '▣', zone: '⌖' };
