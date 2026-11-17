/**
 * [INPUT]: 依赖任务记录校验与个人记录契约。
 * [OUTPUT]: 校验个人记录并迁移 v1/v2 数据。
 * [POS]: 纯数据校验边界；拒绝非法输入后才允许提交。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { t } from '../i18n';
import type { Personal } from '../shared/contracts/personal';
import { validateQuestRecords } from './quest-validation';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, limit = 1000): v is string => typeof v === 'string' && v.length <= limit;
const validDate = (v: unknown) => str(v) && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
export function validatePersonal(value: unknown): Personal {
  const fail = (): never => { throw new Error(t("备份内容无效，原有数据未修改。")); };
  if (!object(value) || !Array.isArray(value.characters) || !Array.isArray(value.progress) || !Array.isArray(value.notes) || !object(value.preferences)) return fail();
  const { characters, progress, notes, preferences, armorPlans, activityProgress } = value;
  if(!Array.isArray(armorPlans)||!Array.isArray(activityProgress)||armorPlans.length>10000||activityProgress.length>200000) return fail();
  if (characters.length > 500 || progress.length > 200000 || notes.length > 20000) return fail();
  const ids = new Set<string>(), names = new Set<string>();
  for (const c of characters) { if (!object(c) || !str(c.id,100) || !c.id || ids.has(c.id) || !str(c.name,60) || !c.name.trim() || names.has(c.name.trim())) return fail(); ids.add(c.id); names.add(c.name.trim()); }
  const quests = validateQuestRecords(value, ids);
  if (!quests) return fail();
  if (!str(preferences.characterId,100) || (preferences.characterId && !ids.has(preferences.characterId)) || !Array.isArray(preferences.layers) || preferences.layers.some(k => !['skill','boss','green','collector','pet','treasure','zone'].includes(k))) return fail();
  const keys = new Set<string>();
  for (const p of progress) {
    if (!object(p) || !str(p.characterId,100) || !ids.has(p.characterId) || !str(p.entryId,200) || !p.entryId || typeof p.done !== 'boolean' || (p.date !== undefined && !validDate(p.date))) return fail();
    const key = `${p.characterId}\0${p.entryId}`; if (keys.has(key)) return fail(); keys.add(key);
  }
  const noteIds = new Set<string>();
  for (const n of notes) { if (!object(n) || !str(n.id,100) || !n.id || noteIds.has(n.id) || !str(n.characterId,100) || !ids.has(n.characterId) || !str(n.region,100) || !/^\d+:\d+$/.test(n.region) || typeof n.x !== 'number' || typeof n.y !== 'number' || !Number.isFinite(n.x) || !Number.isFinite(n.y) || n.x < 0 || n.y < 0 || !str(n.text,2000) || !n.text.trim()) return fail(); noteIds.add(n.id); }
  const planIds=new Set<string>(), activityKeys=new Set<string>();
  for(const p of armorPlans) {
    if(!object(p)||!str(p.id,100)||!p.id||planIds.has(p.id)||!str(p.characterId,100)||!ids.has(p.characterId)||!str(p.name,100)||!p.name.trim()||!str(p.offerId,200)||!p.offerId||!Array.isArray(p.pieceIds)||!p.pieceIds.length||p.pieceIds.length>5||p.pieceIds.some(id=>!str(id,100)||!id)||new Set(p.pieceIds).size!==p.pieceIds.length||!Array.isArray(p.completedPieceIds)||p.completedPieceIds.some(id=>!(p.pieceIds as unknown[]).includes(id))||new Set(p.completedPieceIds).size!==p.completedPieceIds.length) return fail();
    planIds.add(p.id);
  }
  for(const p of activityProgress) {
    if(!object(p)||!str(p.characterId,100)||!ids.has(p.characterId)||!str(p.activityId,200)||!p.activityId||!str(p.start,30)||!Number.isFinite(Date.parse(p.start))||new Date(p.start).toISOString()!==p.start||typeof p.done!=='boolean') return fail();
    const key=`${p.characterId}\0${p.activityId}\0${p.start}`;if(activityKeys.has(key))return fail();activityKeys.add(key);
  }
  if(preferences.calendarTimezone!==undefined&&!['Asia/Shanghai','local','UTC'].includes(preferences.calendarTimezone as string))return fail();
  // Construct fresh plain objects; imported extra properties never enter application state.
  return { ...quests, characters: characters.map(c => ({ id: c.id, name: c.name.trim() })), progress: progress.map(p => ({ characterId: p.characterId, entryId: p.entryId, done: p.done, ...(p.date ? { date: p.date } : {}) })), notes: notes.map(n => ({ id: n.id, characterId: n.characterId, region: n.region, x: n.x, y: n.y, text: n.text })), armorPlans:armorPlans.map(p=>({id:p.id,characterId:p.characterId,name:p.name.trim(),offerId:p.offerId,pieceIds:[...p.pieceIds],completedPieceIds:[...p.completedPieceIds]})), activityProgress:activityProgress.map(p=>({characterId:p.characterId,activityId:p.activityId,start:p.start,done:p.done})), preferences: { characterId: preferences.characterId, layers: [...new Set(preferences.layers)], calendarTimezone:preferences.calendarTimezone||'Asia/Shanghai' } } as Personal;
}
export function migratePersonalV1(value: unknown): Personal {
  if(!object(value))throw Error(t("旧版备份内容无效。"));
  return migratePersonalV2({...value,armorPlans:[],activityProgress:[],preferences:object(value.preferences)?{...value.preferences,calendarTimezone:'Asia/Shanghai'}:value.preferences});
}
export function migratePersonalV2(value: unknown): Personal {
  if(!object(value))throw Error(t("旧版备份内容无效。"));
  return validatePersonal({...value,questProgress:[],questProfiles:[]});
}
