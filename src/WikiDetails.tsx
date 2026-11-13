import { BookOpen, ArrowUpRight } from 'lucide-react';
import type { Entry, StoryGuide, WikiReference } from './types';

export function SourceLink({ reference }: { reference: WikiReference }) {
  return <div className="wiki-reference"><a className="wiki-source" href={reference.revisionUrl} target="_blank" rel="noreferrer">{reference.title}<ArrowUpRight size={12}/><small>修订 {reference.revid} · {reference.revisedAt.slice(0, 10)}</small></a><a className="wiki-source" href={`https://wiki.guildwars.com/index.php?title=${encodeURIComponent(reference.title)}&action=history`} target="_blank" rel="noreferrer">贡献历史</a></div>;
}

const methods: Record<string, string> = { capture: '捕获纹章', trainer: '技能导师', 'hero-trainer': '英雄技能导师', quest: '任务奖励', notes: '获取条件（英文）' };
const fieldNames: Record<string, string> = { description: '技能说明', type: '技能类型', profession: '职业', attribute: '技能属性', energy: '能量消耗', adrenaline: '怒气', activation: '施放时间', recharge: '冷却', upkeep: '维持消耗', sacrifice: '体力牺牲', overcast: '过载', elite: '精英分类', pveOnly: 'PvE 限制', acquisition: '获取方式' };
export function WikiDetails({ entry }: { entry: Entry }) {
  if (!entry.wiki) return <p className="wiki-pending">此条目尚未完成 Wiki 内容核对。</p>;
  return <>
    {entry.wiki.identityStatus === 'unresolved' && <p className="wiki-pending">旧条目身份尚未确定。下方来源用于说明已审查的内容，不代表已确认该 NPC 或物品。</p>}
    {!!entry.skill?.acquisition?.length && <section className="detail-section"><h3><BookOpen size={14}/>Wiki 获取方式</h3>{entry.skill.acquisition.map((source, i) => <p className="detail-stat" key={i}><strong>{methods[source.method] || source.method}</strong> · {source.text}</p>)}</section>}
    {entry.skill?.pvp && <section className="detail-section"><h3>PvP 版本 · 英文原文</h3><p className="description" lang="en">{entry.skill.pvp.description}</p><p className="detail-stat">能量 {entry.skill.pvp.energy} · 怒气 {entry.skill.pvp.adrenaline} · 施放 {entry.skill.pvp.activation} 秒 · 冷却 {entry.skill.pvp.recharge} 秒</p><SourceLink reference={entry.skill.pvp.reference}/></section>}
    {!!entry.skill?.warnings.length && <details className="detail-section wiki-disclosure"><summary>Wiki 的异常与机制备注（{entry.skill.warnings.length}）</summary>{entry.skill.warnings.map((warning, i) => <p lang="en" key={i}>{warning.text}</p>)}</details>}
    {entry.npc?.notes && <details className="detail-section wiki-disclosure"><summary>NPC 来源备注（英文）</summary><p lang="en">{entry.npc.notes}</p></details>}
    {entry.npc?.skillsText && <details className="detail-section wiki-disclosure"><summary>完整技能与出现条件（英文）</summary><p className="npc-skill-source" lang="en">{entry.npc.skillsText}</p></details>}
    <section className="detail-section wiki-provenance"><h3>Wiki 核对来源</h3><SourceLink reference={entry.wiki}/>{entry.wiki.references?.map(reference => <SourceLink key={reference.pageid} reference={reference}/>)}<p>核对范围：{entry.wiki.fields.map(field => fieldNames[field] || field).join('、')}。地图坐标沿用旧资料，尚未逐点核验。</p></section>
    {entry.legacy && <details className="detail-section wiki-disclosure"><summary>查看旧版资料原文</summary><strong>{entry.legacy.name}</strong><p>{entry.legacy.description}</p>{entry.legacy.details.map((line, i) => <p key={i}>{line}</p>)}</details>}
  </>;
}

export function StoryGuides({ stories }: { stories: StoryGuide[] }) {
  return <><span className="eyebrow">THE STORIES OF TYRIA</span><h2>剧情指南</h2><p>包含四大篇章的主要剧情与关键流程。下面的章节展开后包含结局剧透；路线摘要不代替完整任务前置条件。</p>{stories.map(story => <details className="story-guide" key={story.campaign}><summary>{story.title}<span>含剧情剧透</span></summary><p>{story.introduction}</p>{story.arcs.map((arc, i) => <section key={i}><h3>{arc.title}</h3><p>{arc.text}</p>{!!arc.missions.length && <p className="detail-stat">关键任务：{arc.missions.join(' · ')}</p>}{arc.note && <p className="story-note">{arc.note}</p>}</section>)}<div className="story-references">{story.references.map(reference => <SourceLink key={reference.pageid} reference={reference}/>)}</div></details>)}</>;
}
