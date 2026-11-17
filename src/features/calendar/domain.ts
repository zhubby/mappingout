/**
 * [INPUT]: 依赖活动轮换、角色契约和日期格式。
 * [OUTPUT]: 提供周期实例、时区与活动完成变更。
 * [POS]: 日历领域边界；任务联动复用周期规则。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { t, getLocale } from '../../i18n';
import type { ActivityCatalog, ActivityProgress, Occurrence } from '../../shared/contracts/calendar';
import type { Personal } from '../../shared/contracts/personal';
export function occurrenceAt(data: ActivityCatalog, rotationId: string, instant: number): Occurrence | undefined {
  const rotation=data.rotations.find(r=>r.id===rotationId);
  if (!rotation?.sequence.length || !Number.isFinite(instant)) return;
  const count=Math.floor((instant-rotation.epoch)/rotation.period);
  const index=((count%rotation.sequence.length)+rotation.sequence.length)%rotation.sequence.length;
  const activity=data.activities.find(a=>a.id===rotation.sequence[index]);
  if (!activity) return;
  const start=rotation.epoch+count*rotation.period;
  return {activity,start,end:start+rotation.period};
}
export function nextOccurrence(data: ActivityCatalog, activityId: string, after: number): Occurrence | undefined {
  const activity=data.activities.find(a=>a.id===activityId), rotation=data.rotations.find(r=>r.id===activity?.kind);
  if (!rotation) return;
  const count=Math.floor((after-rotation.epoch)/rotation.period);
  for(let i=1;i<=rotation.sequence.length;i++) {
    const start=rotation.epoch+(count+i)*rotation.period, occurrence=occurrenceAt(data,rotation.id,start);
    if(occurrence?.activity.id===activityId) return occurrence;
  }
}
export function trackableActivity(kind: string) { return ['mission','bounty','combat','vanquish'].includes(kind); }
export function setActivityProgress(state: Personal, occurrence: Occurrence, characterId: string, done: boolean, now=Date.now()): Personal {
  if(!state.characters.some(c=>c.id===characterId)) throw Error(t("此角色已在其他页面删除，请重新选择角色。"));
  if(!trackableActivity(occurrence.activity.kind)||occurrence.start>now) throw Error(t("未来活动或展示类活动不能标记完成。"));
  const record: ActivityProgress={characterId,activityId:occurrence.activity.id,start:new Date(occurrence.start).toISOString(),done};
  return {...state,activityProgress:[...state.activityProgress.filter(p=>!(p.characterId===characterId&&p.activityId===record.activityId&&p.start===record.start)),record]};
}
export function timezone(value: string) { return value==='local' ? Intl.DateTimeFormat().resolvedOptions().timeZone : value==='UTC' ? 'UTC' : 'Asia/Shanghai'; }
export function dateInZone(instant: number, zone: string) {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);
  const value=(type:string)=>parts.find(p=>p.type===type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function formatInstant(instant: number, zone: string) { return new Intl.DateTimeFormat(getLocale(),{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(instant); }
export function dateStart(date: string, zone: string) {
  const center=Date.parse(`${date}T12:00:00Z`);let low=center-2*86400000, high=center+2*86400000;
  while(high-low>1){const mid=Math.floor((low+high)/2);if(dateInZone(mid,zone)<date)low=mid;else high=mid;}
  return high;
}
// Iterate actual period boundaries; dates are labels in the display zone, never substitutes for reset instants.
export function occurrencesOnDate(data: ActivityCatalog, date: string, zone: string): Occurrence[] {
  const center=Date.parse(`${date}T12:00:00Z`), result: Occurrence[]=[];
  if(!Number.isFinite(center)) return result;
  for(const rotation of data.rotations) {
    const first=Math.floor((center-2*86400000-rotation.epoch)/rotation.period);
    for(let i=0;i<Math.ceil(5*86400000/rotation.period)+2;i++) {
      const start=rotation.epoch+(first+i)*rotation.period;
      if(dateInZone(start,zone)===date) { const occurrence=occurrenceAt(data,rotation.id,start);if(occurrence)result.push(occurrence); }
    }
  }
  return result.sort((a,b)=>a.start-b.start);
}
