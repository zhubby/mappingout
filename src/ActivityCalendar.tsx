import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ActivityCatalog, ActivityKind, Occurrence } from './feature-types';
import { activityKindNames } from './feature-types';
import { dateInZone, dateStart, formatInstant, nextOccurrence, occurrenceAt, occurrencesOnDate, setActivityProgress, timezone, trackableActivity } from './features-domain';
import { SourceLink } from './WikiDetails';
import { DataStatus, useFeatureData } from './feature-ui';
import type { FeatureProps } from './feature-ui';

function shiftDate(date:string,days:number) {return new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);}
function validDate(date:string) {return /^\d{4}-\d{2}-\d{2}$/.test(date)&&date>='2013-05-13'&&date<='2100-12-31'&&Number.isFinite(Date.parse(date+'T12:00:00Z'))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;}
export default function ActivityCalendar(props:FeatureProps) {
  const {data,error,retry}=useFeatureData<ActivityCatalog>('calendar.json');
  return data?<Calendar {...props} data={data}/>:<DataStatus error={error} retry={retry}/>;
}
function Calendar({data,personal,params,patch,update,manageCharacters,navigateZone}:FeatureProps&{data:ActivityCatalog}) {
  const [now,setNow]=useState(Date.now), [searchLimit,setSearchLimit]=useState(20);
  useEffect(()=>{const refresh=()=>setNow(Date.now()),timer=setInterval(refresh,1000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};},[]);
  const tz=['Asia/Shanghai','local','UTC'].includes(params.tz)?params.tz:personal.preferences.calendarTimezone||'Asia/Shanghai',zone=timezone(tz),today=dateInZone(now,zone),date=validDate(params.date||'')?params.date:today;
  const kind=(Object.keys(activityKindNames).includes(params.cKind)?params.cKind:'') as ActivityKind|'';
  const character=personal.characters.find(c=>c.id===personal.preferences.characterId);
  const current=data.rotations.map(r=>occurrenceAt(data,r.id,now)!).filter(Boolean),nextReset=Math.min(...current.map(o=>o.end)),seconds=Math.max(0,Math.ceil((nextReset-now)/1000));
  const countdown=`${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds%3600/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  const monthDays=useMemo(()=>{
    const first=date.slice(0,7)+'-01',weekday=new Date(first+'T12:00:00Z').getUTCDay(),begin=shiftDate(first,-((weekday+6)%7));
    return Array.from({length:42},(_,i)=>{const day=shiftDate(begin,i);return {day,events:occurrencesOnDate(data,day,zone).filter(o=>!kind||o.activity.kind===kind)};});
  },[data,date.slice(0,7),zone,kind]);
  const dayEvents=useMemo(()=>{
    if(!params.date)return current;
    const events=occurrencesOnDate(data,date,zone),start=dateStart(date,zone);
    for(const rotation of data.rotations.filter(r=>r.period>86400000)) {
      const o=occurrenceAt(data,rotation.id,start)!;if(!events.some(e=>e.activity.id===o.activity.id&&e.start===o.start))events.push(o);
    }
    return events;
  },[data,date,zone,params.date,Math.floor(now/60000)]);
  const search=(params.cq||'').trim().toLowerCase();
  const visible=search?data.activities.filter(a=>(!kind||a.kind===kind)&&search.split(/\s+/).every(word=>[a.name,a.englishName,a.objective,a.location,a.rewards].join(' ').toLowerCase().includes(word))).map(a=>current.find(o=>o.activity.id===a.id)||nextOccurrence(data,a.id,now)!).filter(Boolean):dayEvents.filter(o=>!kind||o.activity.kind===kind);
  const changeMonth=(offset:number)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+offset);patch({date:d.toISOString().slice(0,10)});};
  function card(occurrence:Occurrence) {
    const {activity:a,start,end}=occurrence, done=personal.activityProgress.some(p=>p.characterId===character?.id&&p.activityId===a.id&&p.start===new Date(start).toISOString()&&p.done),next=nextOccurrence(data,a.id,start);
    return <article key={a.id+start} className={`activity-card ${done?'activity-done':''}`} data-kind={a.kind}><div className="activity-card-title"><span className={`activity-kind ${a.kind}`}>{activityKindNames[a.kind]}</span><span className="activity-state">{start>now?'周期预测':end<=now?'往期活动':'当前生效'}</span></div><h3>{a.name}</h3>{a.name!==a.englishName&&<p className="muted" lang="en">{a.englishName}</p>}<p className="activity-period">{formatInstant(start,zone)} → {formatInstant(end,zone)}</p><p className="source-text" lang="en">{a.objective}</p>{a.exchange&&<div className="traveler-materials"><span>每份礼物：<b>{a.exchange.perGift} × {a.exchange.item}</b></span><span>五份礼物：<b>{a.exchange.perGift*5} × {a.exchange.item}</b></span><small>每账号每周上限 5 份；这里不记录兑换次数。</small></div>}
      <details className="activity-details" open={params.activity===a.id}><summary>任务详情与来源</summary><dl><dt>领取／活动地点</dt><dd>{a.giver}{a.location&&` · ${a.location}`}</dd><dt>交付地点</dt><dd>{a.turnIn}</dd><dt>前置与限制</dt><dd className="source-text">{a.requirements}</dd><dt>奖励／活动效果</dt><dd className="source-text" lang="en">{a.rewards}</dd>{a.notes.trim()&&<><dt>说明（含英文）</dt><dd className="source-text" lang="en">{a.notes}</dd></>}</dl>{a.zoneId&&<button className="quiet" onClick={()=>navigateZone(a.zoneId!)}>查看关联区域 →</button>}{a.references.map(r=><SourceLink key={r.pageid} reference={r}/>)}</details>
      <div className="activity-actions">{trackableActivity(a.kind)&&<button className={`primary ${done?'completed':''}`} disabled={start>now} onClick={()=>character?update(s=>setActivityProgress(s,occurrence,character.id,!done)):manageCharacters()}>{done?<Check size={15}/>:null}{start>now?'尚未开始':!character?'创建角色以记录':done?'本轮已完成 · 撤销':'标记本轮已完成'}</button>}{next&&<button className="quiet" onClick={()=>patch({date:dateInZone(next.start,zone),cKind:a.kind,cq:'',activity:a.id})}>下一次：{formatInstant(next.start,zone)}</button>}</div>{a.kind==='combat'&&<p className="muted">战斗任务可重复完成，勾选表示本轮至少完成过一次。</p>}
    </article>;
  }
  return <main className="feature-page calendar-page"><header className="feature-heading"><div><span className="eyebrow">A NEW ADVENTURE EVERY DAY</span><h1><CalendarDays size={25}/>活动日历</h1><p>战承任务 · 旅者尼古拉斯 · 每周奖励</p></div><div className="reset-clock"><small>距离下一次轮换</small><strong data-testid="reset-countdown">{countdown}</strong><span>{formatInstant(nextReset,zone)}</span></div></header>
    <div className="calendar-settings"><label>显示时区<select aria-label="日历时区" value={tz} onChange={e=>{const value=e.target.value as 'Asia/Shanghai'|'local'|'UTC';patch({tz:value});void update(s=>({...s,preferences:{...s.preferences,calendarTimezone:value}}));}}><option value="Asia/Shanghai">北京时间（Asia/Shanghai）</option><option value="local">设备本地时区</option><option value="UTC">UTC</option></select></label><label>活动类别<select aria-label="活动类别" value={kind} onChange={e=>patch({cKind:e.target.value})}><option value="">全部活动</option>{Object.entries(activityKindNames).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label className="calendar-search">搜索活动<input aria-label="搜索活动" value={params.cq||''} placeholder="任务、Boss、区域或兑换物…" onChange={e=>{patch({cq:e.target.value});setSearchLimit(20);}}/></label></div>
    <section className="current-activities" aria-label="当前活动">{current.map(o=><button key={o.activity.kind} onClick={()=>patch({date:dateInZone(o.start,zone),activity:o.activity.id,cKind:o.activity.kind,cq:''})}><small>{activityKindNames[o.activity.kind]}</small><strong>{o.activity.name}</strong></button>)}</section>
    <div className="calendar-layout"><section className="month-panel"><div className="month-heading"><button aria-label="上个月" onClick={()=>changeMonth(-1)}><ChevronLeft size={20}/></button><h2>{date.slice(0,4)} 年 {Number(date.slice(5,7))} 月</h2><button aria-label="下个月" onClick={()=>changeMonth(1)}><ChevronRight size={20}/></button></div><div className="calendar-weekdays">{['一','二','三','四','五','六','日'].map(day=><span key={day}>{day}</span>)}</div><div className="month-grid">{monthDays.map(({day,events})=><button key={day} aria-label={`查看 ${day} 活动`} aria-pressed={day===date} className={`${day.slice(0,7)!==date.slice(0,7)?'outside':''} ${day===date?'selected':''} ${day===today?'is-today':''}`} onClick={()=>patch({date:day,cq:'',activity:''})}><span>{Number(day.slice(8))}</span><div className="calendar-dots">{events.map(o=><i className={o.activity.kind} title={o.activity.name} key={o.activity.id+o.start}/>)}</div>{events.some(o=>o.activity.kind==='traveler')&&<small>周轮换</small>}</button>)}</div><div className="calendar-date-actions"><button className="quiet" onClick={()=>patch({date:'',cq:'',activity:''})}>回到当前活动</button><input type="date" aria-label="选择日历日期" value={date} min="2013-05-13" max="2100-12-31" onChange={e=>e.target.value&&patch({date:e.target.value,cq:'',activity:''})}/></div><p className="muted">日期格按活动开始日期归档；每周活动详情也展示当天仍生效的上一轮。</p><div className="calendar-rules"><h3>重置规则</h3><p>战承：每天 UTC 16:00<br/>北京时间次日 00:00</p><p>旅者与每周奖励：周一 UTC 15:00<br/>北京时间周一 23:00</p><p>未来日程按 Wiki 已核验周期预测。节庆、临时调整及游戏任务日志中的领取条件以游戏为准。</p><small>资料版本：{data.referenceVersion}</small></div></section>
      <section className="calendar-events"><h2>{search?'匹配活动与下次日程':params.date?`${date} 的活动`:'当前生效的活动'} <span>{visible.length}</span></h2><p className="muted">{character?`完成记录：${character.name}`:'创建角色后可记录每次战承轮换的完成状态。'} · {zone}</p>{visible.slice(0,search?searchLimit:visible.length).map(card)}{!visible.length&&<div className="empty-state">没有符合条件的活动。</div>}{search&&visible.length>searchLimit&&<button className="quiet full" onClick={()=>setSearchLimit(n=>n+20)}>显示更多活动</button>}</section></div></main>;
}
