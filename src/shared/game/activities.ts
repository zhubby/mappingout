/**
 * [INPUT]: 依赖活动分类契约与界面翻译。
 * [OUTPUT]: 提供活动分类名称。
 * [POS]: 日历展示标签；不参与周期计算。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { t } from '../../i18n';
import type { ActivityKind } from '../contracts/calendar';
export const activityKindNames: Record<ActivityKind,string> = { get mission() { return t("战承任务"); }, get bounty() { return t("战承悬赏"); }, get combat() { return t("战承战斗"); }, get vanquish() { return t("战承清剿"); }, get traveler() { return t("旅者尼古拉斯"); }, get 'pve-bonus'() { return t("PvE 每周奖励"); }, get 'pvp-bonus'() { return t("PvP 每周奖励"); } };
