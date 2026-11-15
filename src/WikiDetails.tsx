import { t } from './i18n';
import { BookOpen, ArrowUpRight } from 'lucide-react';
import type { Entry, StoryGuide, WikiReference } from './types';
import { originalOf } from './i18n/content';

export function OriginalContent({ value }: { value: object }) {
  return <details className="detail-section wiki-disclosure original-content"><summary>{t('查看来源原文')}</summary><pre>{JSON.stringify(originalOf(value), null, 2)}</pre></details>;
}

export function SourceLink({ reference }: { reference: WikiReference }) {
  return <details className="wiki-reference wiki-disclosure"><summary>{t('来源与修订')} · {reference.revid}</summary><a className="wiki-source" href={reference.revisionUrl} target="_blank" rel="noreferrer">{reference.title}<ArrowUpRight size={12}/><small>{reference.revisedAt.slice(0, 10)}</small></a><a className="wiki-source" href={`https://wiki.guildwars.com/index.php?title=${encodeURIComponent(reference.title)}&action=history`} target="_blank" rel="noreferrer">{t("贡献历史")}</a></details>;
}

const methods: Record<string, string> = { get capture() { return t("捕获纹章"); }, get trainer() { return t("技能导师"); }, get 'hero-trainer'() { return t("英雄技能导师"); }, get quest() { return t("任务奖励"); }, get notes() { return t("获取条件（英文）"); } };
const fieldNames: Record<string, string> = { get description() { return t("技能说明"); }, get type() { return t("技能类型"); }, get profession() { return t("职业"); }, get attribute() { return t("技能属性"); }, get energy() { return t("能量消耗"); }, get adrenaline() { return t("怒气"); }, get activation() { return t("施放时间"); }, get recharge() { return t("冷却"); }, get upkeep() { return t("维持消耗"); }, get sacrifice() { return t("体力牺牲"); }, get overcast() { return t("过载"); }, get elite() { return t("精英分类"); }, get pveOnly() { return t("PvE 限制"); }, get acquisition() { return t("获取方式"); } };
export function WikiDetails({ entry }: { entry: Entry }) {
  if (!entry.wiki) return <p className="wiki-pending">{t("此条目尚未完成 Wiki 内容核对。")}</p>;
  return <>
    {entry.wiki.identityStatus === 'unresolved' && <p className="wiki-pending">{t("旧条目身份尚未确定。下方来源用于说明已审查的内容，不代表已确认该 NPC 或物品。")}</p>}
    {!!entry.skill?.acquisition?.length && <section className="detail-section"><h3><BookOpen size={14}/>{t("Wiki 获取方式")}</h3>{entry.skill.acquisition.map((source, i) => <p className="detail-stat" key={i}><strong>{methods[source.method] || source.method}</strong> · {source.text}</p>)}</section>}
    {entry.skill?.pvp && <section className="detail-section"><h3>{t("PvP 版本 · 英文原文")}</h3><p className="description">{entry.skill.pvp.description}</p><p className="detail-stat">{t("能量 ")}{entry.skill.pvp.energy} {t(" · 怒气 ")}{entry.skill.pvp.adrenaline} {t(" · 施放 ")}{entry.skill.pvp.activation} {t(" 秒 · 冷却 ")}{entry.skill.pvp.recharge} {t(" 秒")}</p><SourceLink reference={entry.skill.pvp.reference}/></section>}
    {!!entry.skill?.warnings.length && <details className="detail-section wiki-disclosure"><summary>{t("Wiki 的异常与机制备注（")}{entry.skill.warnings.length}）</summary>{entry.skill.warnings.map((warning, i) => <p key={i}>{warning.text}</p>)}</details>}
    {entry.npc?.notes && <details className="detail-section wiki-disclosure"><summary>{t("NPC 来源备注（英文）")}</summary><p>{entry.npc.notes}</p></details>}
    {entry.npc?.skillsText && <details className="detail-section wiki-disclosure"><summary>{t("完整技能与出现条件（英文）")}</summary><p className="npc-skill-source">{entry.npc.skillsText}</p></details>}
    <details className="detail-section wiki-provenance wiki-disclosure"><summary>{t("Wiki 核对来源")}</summary><SourceLink reference={entry.wiki}/>{entry.wiki.references?.map(reference => <SourceLink key={reference.pageid} reference={reference}/>)}<p>{t("核对范围：")}{entry.wiki.fields.map(field => fieldNames[field] || field).join('、')}{t("。地图坐标沿用旧资料，尚未逐点核验。")}</p></details>
    {entry.legacy && <details className="detail-section wiki-disclosure"><summary>{t("查看旧版资料原文")}</summary><strong>{entry.legacy.name}</strong><p>{entry.legacy.description}</p>{entry.legacy.details.map((line, i) => <p key={i}>{line}</p>)}</details>}
  </>;
}

export function StoryGuides({ stories }: { stories: StoryGuide[] }) {
  return <><span className="eyebrow">{t("THE STORIES OF TYRIA")}</span><h2>{t("剧情指南")}</h2><p>{t("包含四大篇章的主要剧情与关键流程。下面的章节展开后包含结局剧透；路线摘要不代替完整任务前置条件。")}</p>{stories.map(story => <details className="story-guide" key={story.campaign}><summary>{story.title}<span>{t("含剧情剧透")}</span></summary><p>{story.introduction}</p>{story.arcs.map((arc, i) => <section key={i}><h3>{arc.title}</h3><p>{arc.text}</p>{!!arc.missions.length && <p className="detail-stat">{t("关键任务：")}{arc.missions.join(' · ')}</p>}{arc.note && <p className="story-note">{arc.note}</p>}</section>)}<div className="story-references">{story.references.map(reference => <SourceLink key={reference.pageid} reference={reference}/>)}</div></details>)}</>;
}
