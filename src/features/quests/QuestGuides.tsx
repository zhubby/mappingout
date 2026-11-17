/**
 * [INPUT]: 依赖独立攻略资料、应用写入队列和任务领域规则。
 * [OUTPUT]: 提供篇章目录、双语检索、角色进度和下一步指引。
 * [POS]: 懒加载任务标签页；复用应用角色与地图导航。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronRight, Compass, ListFilter, Search } from 'lucide-react';
import type { FeatureProps } from '../../shared/contracts/feature';
import type { QuestCatalog, QuestGuide, QuestKind, QuestMode } from '../../shared/contracts/quests';
import type { ActivityCatalog } from '../../shared/contracts/calendar';
import { occurrenceAt, setActivityProgress } from '../calendar/domain';
import { originalOf } from '../../i18n/content';
import { DataStatus } from '../../shared/ui/DataStatus';
import { useFeatureData } from '../../shared/content/useFeatureData';
import { changeQuest, changeQuestProfile, questAvailability, questProfile, questRecord, searchQuests } from './domain';
import { t, useLocale } from '../../i18n';
import { professions } from '../../shared/game/professions';
import Select from '../../shared/ui/Select';
import QuestArticle from './QuestArticle';
import './quests.css';

export const questKindNames: Record<QuestKind, () => string> = {main:()=>t('主线任务'),side:()=>t('支线任务'),dungeon:()=>t('地城攻略'),elite:()=>t('精英区域'),challenge:()=>t('挑战任务'),bounty:()=>t('循环悬赏'),utility:()=>t('环境与机制')};
export default function QuestGuides({ personal, update, params, patch, manageCharacters, navigateZone, manageResources }: FeatureProps) {
  useLocale();
  const {data,error,retry}=useFeatureData<QuestCatalog>('quests.json');
  const {data:calendar}=useFeatureData<ActivityCatalog>('calendar.json');
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);
  const [pending,setPending]=useState(false),[limit,setLimit]=useState(150),[directory,setDirectory]=useState(true);
  const detail=useRef<HTMLDivElement>(null);
  const requested=data?.quests.find(q=>q.id===params.quest);
  const chapter=params.qChapter==='all'?'':data?.chapters.some(c=>c.id===params.qChapter)?params.qChapter:requested?.chapter??'prophecies';
  const difficulty:QuestMode=params.qMode==='hard'||!params.qMode&&requested?.mode==='hard'?'hard':'normal';
  const filtered=useMemo(()=>searchQuests(data?.quests||[],params.qq||'').filter(q=>{
    if(chapter&&q.chapter!==chapter || params.qKind&&q.kind!==params.qKind || q.mode!=='both'&&q.mode!==difficulty || params.qRegion&&originalOf(q).region!==params.qRegion)return false;
    const record=questRecord(personal,q.id,difficulty),availability=questAvailability(q,personal);
    if(params.qStatus==='completed')return !!record?.completed;
    if(params.qStatus==='active')return !!record?.active;
    if(params.qStatus==='ready')return !record?.completed&&availability==='ready';
    if(params.qStatus==='incomplete')return !record?.completed;
    return true;
  }),[data,params.qq,params.qKind,params.qRegion,params.qStatus,chapter,difficulty,personal]);
  const selected=filtered.find(q=>q.id===params.quest)||filtered[0];
  const mode:QuestMode=selected?.mode==='hard'?'hard':selected?.mode==='normal'?'normal':difficulty;
  useEffect(()=>setLimit(150),[chapter,params.qq,params.qKind,params.qRegion,params.qStatus,difficulty]);
  useEffect(()=>{if(selected&&params.quest!==selected.id)patch({quest:selected.id});},[selected?.id,params.quest,patch]);
  const profile=questProfile(personal),character=personal.characters.find(c=>c.id===personal.preferences.characterId);
  const save=async(change:Parameters<typeof update>[0])=>{if(pending)return;setPending(true);try{await update(change);}finally{setPending(false);}};
  const openQuest=(id:string,preferredMode?:QuestMode)=>{const quest=data?.quests.find(q=>q.id===id);if(quest){patch({view:'quests',quest:id,qChapter:quest.chapter,qMode:quest.mode==='both'?preferredMode||difficulty:quest.mode,qKind:'',qStatus:'',qRegion:'',qq:''});setDirectory(false);detail.current?.scrollIntoView({block:'start'});}};
  const chooseMode=(value:string)=>{
    const title=selected?.englishName.replace(/ \(Hard mode\)$/i,''),counterpart=data?.quests.find(q=>q.englishName===(value==='hard'?`${title} (Hard mode)`:title));
    patch({qMode:value,quest:counterpart?.id||(selected?.mode==='both'?selected.id:'' )});
  };
  if(error||!data)return <div className="quest-load"><DataStatus error={error} retry={retry}/>{error&&<><p>{t('旧版离线资料包可能尚未包含任务攻略。')}</p>{manageResources&&<button className="primary" onClick={manageResources}>{t('更新或导入离线资料')}</button>}</>}</div>;
  const scope=data.quests.filter(q=>(!chapter||q.chapter===chapter)&&(q.mode==='both'||q.mode===difficulty));
  const completed=scope.filter(q=>questRecord(personal,q.id,difficulty)?.completed).length;
  const next=scope.filter(q=>!questRecord(personal,q.id,difficulty)?.completed&&(questRecord(personal,q.id,difficulty)?.active||q.kind==='main'&&questAvailability(q,personal)==='ready')).slice(0,3);
  const visible=filtered.slice(0,limit);if(selected&&!visible.some(q=>q.id===selected.id))visible.push(selected);
  const groups=new Map<string,QuestGuide[]>();visible.forEach(q=>groups.set(q.region||t('其它地区'),[...(groups.get(q.region||t('其它地区'))||[]),q]));
  const selectedChapter=data.chapters.find(c=>c.id===chapter);
  const regions=[...new Map(data.quests.filter(q=>!chapter||q.chapter===chapter).filter(q=>q.region).map(q=>[originalOf(q).region,q.region])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  const occurrence=selected?.activityId&&calendar?calendar.rotations.map(rotation=>occurrenceAt(calendar,rotation.id,now)).find(o=>o?.activity.id===selected.activityId):undefined;
  const periodDone=!!occurrence&&personal.activityProgress.some(p=>p.characterId===character?.id&&p.activityId===occurrence.activity.id&&p.start===new Date(occurrence.start).toISOString()&&p.done);
  return <main className="feature-page quest-page">
    <div className="feature-heading"><div><span className="eyebrow">{t('从起点，到下一段传奇')}</span><h1><BookOpen size={26}/>{t('任务攻略')}</h1><p>{t('四大篇章与后续故事 · 主线、支线及常驻 PvE')}</p></div><div className="quest-overall"><span>{character?.name||t('选择角色以记录进度')}</span><strong>{completed}<small> / {scope.length}</small></strong><progress value={completed} max={Math.max(1,scope.length)} aria-label={t('本篇章任务进度')}/></div></div>
    <div className="quest-top-filters"><label>{t('攻略篇章')}<Select aria-label={t('攻略篇章')} value={chapter||'all'} options={[{value:'all',label:t('全部篇章')},...data.chapters.map(c=>({value:c.id,label:c.name}))]} onValueChange={value=>patch({qChapter:value,quest:'',qRegion:''})}/></label><label>{t('任务难度')}<Select aria-label={t('任务难度')} value={difficulty} onValueChange={chooseMode} options={[{value:'normal',label:t('普通模式')},{value:'hard',label:t('困难模式')}]}/></label><label className="quest-search">{t('搜索任务')}<span><Search size={15}/><input aria-label={t('搜索任务')} placeholder={t('任务名、NPC 或地点，中英文均可')} value={params.qq||''} onChange={event=>patch({qq:event.target.value,quest:''})}/></span></label></div>
    <details className="quest-character-settings"><summary><Compass size={15}/>{t('角色条件与适用范围')}<span>{character?.name||t('尚未选择角色')}</span></summary>{character?<div className="quest-profile"><label>{t('角色起始章节')}<Select aria-label={t('角色起始章节')} value={profile.originCampaign||''} disabled={pending} options={[{value:'',label:t('未设置')},...data.chapters.slice(0,3).map((c,index)=>({value:index+1,label:c.name}))]} onValueChange={value=>void save(s=>changeQuestProfile(s,character.id,p=>({...p,originCampaign:value?Number(value):undefined})))}/></label><label>{t('角色主职业')}<Select aria-label={t('角色主职业')} value={profile.profession||''} disabled={pending} options={[{value:'',label:t('未设置')},...professions.map(p=>({value:p.id,label:p.name,icon:p.icon}))]} onValueChange={value=>void save(s=>changeQuestProfile(s,character.id,p=>({...p,profession:value?Number(value):undefined})))}/></label><p>{t('职业、起始章节及手动确认的条件，只用于下一步提示。')}</p></div>:<button className="primary" onClick={manageCharacters}>{t('创建探索者')}</button>}</details>
    {!!next.length&&<section className="quest-next" aria-label={t('下一步建议')}><span>{t('下一步建议')}</span>{next.map(q=><button key={q.id} onClick={()=>openQuest(q.id)}>{q.name}<ChevronRight size={14}/></button>)}</section>}
    <div className="quest-layout"><aside className={`quest-directory ${directory?'is-open':''}`}><button className="quest-directory-toggle" aria-expanded={directory} onClick={()=>setDirectory(!directory)}><ListFilter size={15}/>{t('任务目录')}<span>{filtered.length}</span></button><div className="quest-directory-content"><div className="quest-directory-filters"><label>{t('任务类型')}<Select aria-label={t('任务类型')} value={params.qKind||''} onValueChange={value=>patch({qKind:value,quest:''})} options={[{value:'',label:t('全部类型')},...Object.entries(questKindNames).map(([value,label])=>({value,label:label()}))]}/></label><label>{t('任务状态')}<Select aria-label={t('任务状态')} value={params.qStatus||''} onValueChange={value=>patch({qStatus:value,quest:''})} options={[{value:'',label:t('全部状态')},{value:'incomplete',label:t('尚未完成')},{value:'active',label:t('进行中')},{value:'completed',label:t('已完成')},{value:'ready',label:t('按记录可推进')}]}/></label></div>
      <label className="quest-region-filter">{t('任务地区')}<Select aria-label={t('任务地区')} value={params.qRegion||''} onValueChange={value=>patch({qRegion:value,quest:''})} options={[{value:'',label:t('全部地区')},...regions.map(([value,label])=>({value,label}))]}/></label><nav className="quest-tree" aria-label={t('任务目录')}>{[...groups].map(([region,quests])=><div className="quest-tree-group" key={region}><h3>{region}<small>{quests.length}</small></h3>{quests.map(q=>{const record=questRecord(personal,q.id,difficulty);return <button key={q.id} className={`quest-row ${selected?.id===q.id?'active':''}`} aria-current={selected?.id===q.id?'true':undefined} onClick={()=>{patch({quest:q.id});setDirectory(false);detail.current?.scrollIntoView({block:'start'});}}><span className={`quest-row-mark ${record?.completed?'is-done':record?.active?'is-active':''}`}>{record?.completed?'✓':record?.active?'•':''}</span><span><strong>{q.name}</strong><small>{questKindNames[q.kind]()} · {questAvailability(q,personal)==='ready'?t('按记录可推进'):questAvailability(q,personal)==='unknown'?t('条件待确认'):t('前置待完成')}</small></span></button>;})}</div>)}</nav>{filtered.length>limit&&<button className="quiet" onClick={()=>setLimit(limit+150)}>{t('显示更多任务')}</button>}{!filtered.length&&<p className="muted">{t('没有符合筛选的任务。')}</p>}</div></aside>
      <div className="quest-detail" ref={detail}>{selected?<QuestArticle key={`${selected.id}:${mode}:${character?.id}`} quest={selected} quests={data.quests} personal={personal} mode={mode} pending={pending} onProgress={values=>{if(character)void save(s=>changeQuest(s,character.id,selected.id,mode,values));else manageCharacters();}} onCondition={(id,value)=>{if(character)void save(s=>changeQuestProfile(s,character.id,p=>{const conditions={...p.conditions};if(value===undefined)delete conditions[id];else conditions[id]=value;return {...p,conditions};}));}} openQuest={openQuest} navigateZone={navigateZone} manageCharacters={manageCharacters} periodDone={periodDone} onPeriodProgress={occurrence?()=>{if(character)void save(s=>setActivityProgress(s,occurrence,character.id,!periodDone));else manageCharacters();}:undefined} openCalendar={()=>patch({view:'calendar',activity:selected.activityId||'',date:'',cKind:'',cq:calendar?.activities.find(a=>a.id===selected.activityId)?.englishName||''})}/>:<div className="quest-empty"><BookOpen size={36}/><p>{t('选择一个任务，开始阅读攻略。')}</p></div>}</div>
    </div>{selectedChapter&&<footer className="quest-chapter-source"><SourceChapter reference={selectedChapter.reference}/></footer>}
  </main>;
}
function SourceChapter({reference}:{reference:QuestCatalog['chapters'][number]['reference']}){return <a href={reference.revisionUrl} target="_blank" rel="noreferrer">{t('篇章任务目录来源')} · {reference.title}</a>;}
