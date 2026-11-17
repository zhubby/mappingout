/**
 * [INPUT]: 依赖任务攻略、角色状态、前置判断与统一菜单。
 * [OUTPUT]: 展示攻略、前置条件、奖励记录和可放大的本地路线图。
 * [POS]: 任务详情呈现边界；写入统一交给应用个人数据队列。
 * 复选框即时反馈；队列结束后以已保存记录校正。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { useEffect, useRef, useState } from 'react';
import { BookOpen, Check, MapPin, Repeat2, ZoomIn, X } from 'lucide-react';
import type { Personal } from '../../shared/contracts/personal';
import type { QuestGuide, QuestMode, QuestProgress, QuestRequirement } from '../../shared/contracts/quests';
import { originalOf } from '../../i18n/content';
import { t, useLocale } from '../../i18n';
import { assetUrl } from '../../shared/content/assetUrl';
import { questProfile, questRecord, requirementState } from './domain';
import { SourceLink } from '../../shared/ui/WikiDetails';
import { professionById } from '../../shared/game/professions';
import Select from '../../shared/ui/Select';

export function QuestRequirements({ requirement, personal, quests, openQuest, setCondition, disabled }: {
  requirement: QuestRequirement; personal: Personal; quests: QuestGuide[]; openQuest: (id: string, mode?: QuestMode) => void;
  setCondition: (id: string, value?: boolean) => void; disabled: boolean;
}) {
  if (requirement.op === 'condition') {
    const condition = questProfile(personal).conditions[requirement.id];
    return <div className="quest-condition"><span>{requirement.text}</span><Select aria-label={t('确认领取条件') + ' ' + requirement.id} value={condition === undefined ? '' : condition ? 'yes' : 'no'} disabled={disabled} onValueChange={value => setCondition(requirement.id, value === '' ? undefined : value === 'yes')} options={[{value:'',label:t('待确认')},{value:'yes',label:t('已满足')},{value:'no',label:t('尚未满足')}]}/></div>;
  }
  if (requirement.op === 'quest') {
    const quest = quests.find(q => q.id === requirement.questId), done = requirementState(requirement, personal) === 'ready';
    return <button className={`quest-prerequisite ${done ? 'is-done' : ''}`} onClick={() => openQuest(requirement.questId,requirement.mode)}><Check size={14}/><span>{quest?.name || requirement.questId}{requirement.mode==='hard'&&` · ${t('困难模式')}`}</span><small>{done ? t('已完成') : t('未记录完成')}</small></button>;
  }
  if (!requirement.items.length) return null;
  return <div className="quest-requirements"><p>{requirement.op === 'any' ? t('满足以下任意一项') : t('满足以下全部条件')}</p>{requirement.items.map((item, index) => <QuestRequirements key={index} requirement={item} personal={personal} quests={quests} openQuest={openQuest} setCondition={setCondition} disabled={disabled}/>)}</div>;
}

interface Props {
  quest: QuestGuide; quests: QuestGuide[]; personal: Personal; mode: QuestMode; pending: boolean;
  onProgress: (patch: Partial<Pick<QuestProgress, 'active' | 'completed' | 'bonus' | 'mastery'>>) => void;
  onCondition: (id: string, value?: boolean) => void; openQuest: (id: string, mode?: QuestMode) => void; navigateZone: (id: string) => void;
  manageCharacters: () => void; openCalendar: () => void; periodDone: boolean; onPeriodProgress?: () => void;
}
export default function QuestArticle({ quest, quests, personal, mode, pending, onProgress, onCondition, openQuest, navigateZone, manageCharacters, openCalendar, periodDone, onPeriodProgress }: Props) {
  const locale = useLocale(), [original, setOriginal] = useState(false), [imageIndex, setImageIndex] = useState(0);
  const zoom = useRef<HTMLDialogElement>(null), article = original ? originalOf(quest) : quest;
  const record = questRecord(personal, quest.id, mode), hasCharacter = personal.characters.some(c => c.id === personal.preferences.characterId);
  const [bonus,setBonus] = useState(!!record?.bonus);
  useEffect(()=>{if(!pending)setBonus(!!record?.bonus);},[pending,record?.bonus]);
  const profession = professionById.get(quest.profession || 0);
  const next = quests.filter(q => q.recommendedAfter.includes(quest.id)).slice(0, 6);
  const related = quest.links.filter(link=>link.questId).map(link=>quests.find(q=>q.id===link.questId)).filter((q):q is QuestGuide=>!!q);
  return <article className="quest-article" aria-labelledby="quest-title">
    <header className="quest-title"><div><span className="eyebrow">{t('每一步，都有方向')}</span><h2 id="quest-title">{profession && <img src={profession.icon} alt={profession.name}/>} {quest.name}</h2>{locale === 'zh-CN' && <p lang="en">{quest.englishName}</p>}</div><BookOpen size={30} strokeWidth={1}/></header>
    <div className="quest-meta"><span>{mode === 'hard' ? t('困难模式') : t('普通模式')}</span>{quest.region && <span><MapPin size={12}/>{quest.region}</span>}{quest.repeatable && <span><Repeat2 size={12}/>{t('可重复')}</span>}</div>
    {(quest.givenBy || quest.givenAt) && <dl className="quest-giver"><div><dt>{t('领取地点')}</dt><dd>{quest.givenAt || '—'}</dd></div><div><dt>{t('领取 NPC')}</dt><dd>{quest.givenBy || '—'}</dd></div></dl>}
    <section className="quest-tracking" aria-label={t('角色任务记录')}>
      {hasCharacter ? <><div className="quest-progress-actions"><button disabled={pending} className={record?.completed ? 'primary is-complete' : 'primary'} onClick={() => onProgress({completed:!record?.completed})}><Check size={15}/>{record?.completed ? t('已完成 · 撤销') : t('标记任务完成')}</button><button disabled={pending} className={record?.active ? 'active' : ''} onClick={() => onProgress({active:!record?.active})}>{record?.active ? t('进行中 · 结束记录') : quest.repeatable && record?.completed ? t('再次开始') : t('标记进行中')}</button></div>
        {quest.missionReward === 'bonus' && <label className="quest-bonus"><input type="checkbox" disabled={pending} checked={bonus} onChange={event => {setBonus(event.target.checked);onProgress({bonus:event.target.checked});}}/>{t('额外奖励已完成')}</label>}
        {quest.missionReward === 'mastery' && <label className="quest-mastery">{t('任务奖励等级')}<Select aria-label={t('任务奖励等级')} value={record?.mastery || 0} disabled={pending} onValueChange={value => onProgress({mastery:Number(value) as QuestProgress['mastery']})} options={[{value:0,label:t('未记录')},{value:1,label:t('标准奖励')},{value:2,label:t('专家级奖励')},{value:3,label:t('大师级奖励')}]}/></label>}
        <p className="muted">{t('按游戏内完成条件及必要领奖记录；普通与困难进度独立保存。')}</p></> : <button className="primary" onClick={manageCharacters}>{t('创建角色以记录任务进度')}</button>}
      {onPeriodProgress&&<><button className="quiet quest-period" disabled={pending} onClick={onPeriodProgress}>{periodDone?t('本轮已完成 · 撤销'):t('标记本轮已完成')}</button><p className="muted">{t('本轮悬赏记录与任务通关记录分别保存，重置后可再次记录。')}</p></>}{quest.activityId && <button className="quiet" onClick={openCalendar}>{t('查看悬赏日历与本期记录')}</button>}
    </section>
    <details className="quest-access"><summary>{t('前置任务与领取条件')}</summary><QuestRequirements requirement={quest.requirement} personal={personal} quests={quests} openQuest={openQuest} setCondition={onCondition} disabled={pending || !hasCharacter}/>{quest.allowedOrigins&&<p>{t('起始章节限制')} · {quest.allowedOrigins.map(id=>[t('预言'),t('盟与敌'),t('黑暗逆袭')][id-1]).join(' / ')}</p>}{profession && <p>{t('职业')} · {profession.name}</p>}<p className="muted">{t('条件由你确认；此应用不读取游戏中的任务日志。')}</p></details>
    <div className="quest-reading-controls"><span>{t('任务流程与攻略')}</span>{locale === 'zh-CN' && <button className="quiet" aria-pressed={original} onClick={() => setOriginal(!original)}>{original ? t('阅读中文攻略') : t('阅读英文原文')}</button>}</div>
    {locale === 'zh-CN' && !original && <p className="quest-translation-note">{t('中文攻略含机器辅助译文，尚待逐条校订；可切换英文原文核对。')}</p>}
    {quest.guideQuality!=='detailed'&&<p className="quest-source-note">{quest.guideQuality==='target-notes'?t('Wiki 未单列此悬赏的详细攻略；下方补充目标区域的路线与注意事项。'):t('Wiki 未单列详细攻略；下方保留任务目标、NPC 操作指示和已知注意事项。')}</p>}
    <div className="quest-guide-body" lang={original ? 'en' : locale}>
      {article.sections.map(section => <section key={section.id} className={`quest-guide-section ${section.id.startsWith('notes') ? 'quest-notes' : ''}`}>
        <h3>{section.title}</h3>{section.blocks.map(block => block.kind === 'table' ? <div key={block.id} className="quest-table"><table><tbody>{block.cells?.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div> : block.kind === 'heading' ? <h4 key={block.id}>{block.text}</h4> : <p key={block.id} className={`quest-block quest-block-${block.kind}`} style={block.kind === 'item' ? {paddingInlineStart:`${Math.max(0, (block.level || 1) - 1) * 14 + 20}px`} : undefined}>{block.kind === 'item' && <span aria-hidden="true" className="quest-step-dot"/>}{block.text}</p>)}
      </section>)}
    </div>
    {!!quest.images.length && <section className="quest-route-maps"><h3>{t('路线与任务地图')}</h3><div className="quest-images">{quest.images.map((image, index) => <figure key={image.id}><button aria-label={t('放大路线图') + ' ' + (index + 1)} onClick={() => {setImageIndex(index);zoom.current?.showModal();}}><img loading="lazy" src={assetUrl(image.file)} alt={image.caption}/><ZoomIn size={16}/></button><figcaption>{image.caption}</figcaption><SourceLink reference={image.reference}/></figure>)}</div></section>}
    {!!quest.missingSourceImages.length&&<p className="quest-source-note">{t('Wiki 的部分路线图源文件缺失或校验不一致，暂未收录。')}</p>}
    <dialog ref={zoom} className="quest-map-dialog" aria-label={t('路线图预览')} onClick={event => {if(event.target === zoom.current)zoom.current.close();}}><button className="quest-map-close" aria-label={t('关闭路线图')} onClick={() => zoom.current?.close()}><X size={22}/></button>{quest.images[imageIndex] && <img src={assetUrl(quest.images[imageIndex].file)} alt={quest.images[imageIndex].caption}/>}</dialog>
    {!!quest.links.filter(link => link.zoneId).length && <section className="quest-map-links"><h3>{t('在地图查看')}</h3>{quest.links.filter(link => link.zoneId).map(link => <button className="quiet" key={link.zoneId} onClick={() => navigateZone(link.zoneId!)}><MapPin size={13}/>{link.title}</button>)}</section>}
    {!!next.length && <section className="quest-next-links"><h3>{t('接下来的剧情')}</h3>{next.map(q => <button key={q.id} className="quiet" onClick={() => openQuest(q.id)}>{q.name} →</button>)}</section>}
    {!!related.length&&<details className="quest-related"><summary>{t('相关任务')} · {related.length}</summary>{related.map(q=><button className="quiet" key={q.id} onClick={()=>openQuest(q.id)}>{q.name} →</button>)}</details>}
    <footer className="quest-sources"><h3>{t('攻略来源')}</h3>{quest.references.map(ref => <SourceLink key={ref.pageid} reference={ref}/>)}<p>{t('Wiki 原创文字遵循 GFDL；地图的游戏画面及标注许可见各文件来源。')}</p><a href={assetUrl('licenses/gfdl-1.3.txt')} target="_blank" rel="noreferrer">GNU Free Documentation License</a></footer>
  </article>;
}
