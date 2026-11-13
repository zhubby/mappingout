import { openDB } from 'idb';
import type { Backup, Personal } from './types';
export const emptyPersonal = (): Personal => ({ characters: [], progress: [], notes: [], armorPlans: [], activityProgress: [], preferences: { characterId: '', layers: ['skill', 'boss', 'green', 'collector', 'pet', 'treasure', 'zone'], calendarTimezone:'Asia/Shanghai' } });
export interface PersonalStore {
  load(): Promise<Personal>;
  save(state: Personal): Promise<void>;
  update(change: (latest: Personal) => Personal): Promise<Personal>;
  subscribe(listener: () => void): () => void;
}
function database() {
  const opening = openDB('mappingout', 2, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      if(oldVersion===0) db.createObjectStore('personal');
      if(oldVersion===1) {
        const store=transaction.objectStore('personal');
        void store.get('state').then(value=>{ if(value) return store.put(migratePersonalV1(value),'state'); }).catch(()=>transaction.abort());
      }
    },
    blocked() { if(typeof window!=='undefined') window.dispatchEvent(new Event('mappingout-storage-blocked')); },
    blocking() { void opening.then(db=>db.close()); }
  });
  return opening.catch(error=>{ if(error?.name==='VersionError') throw Error('本地资料格式已升级，请刷新页面后继续。'); throw error; });
}
const listeners = new Set<() => void>();
let channel: BroadcastChannel | undefined;
async function commit(change: (latest: Personal) => Personal): Promise<Personal> {
  const db = await database();
  const tx = db.transaction('personal', 'readwrite');
  try {
    // IndexedDB serializes readwrite transactions across tabs. Apply the operation
    // to the latest value inside that transaction, never to a page's old snapshot.
    const stored = await tx.store.get('state');
    const next = validatePersonal(change(stored ? validatePersonal(stored) : emptyPersonal()));
    await tx.store.put(next, 'state');
    await tx.done;
    try { channel?.postMessage('changed'); } catch { /* The data is already committed; focus refresh remains available. */ }
    return next;
  } catch (error) {
    try { tx.abort(); } catch { /* The transaction may already have completed. */ }
    await tx.done.catch(() => {});
    throw error;
  } finally { db.close(); }
}
export const personalStore: PersonalStore = {
  async load() { const db = await database(); try { const state = await db.get('personal', 'state'); return state ? validatePersonal(state) : emptyPersonal(); } finally { db.close(); } },
  async save(state) { const checked = validatePersonal(state); await commit(() => checked); },
  update: commit,
  subscribe(listener) {
    listeners.add(listener);
    if (!channel && typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel('mappingout-personal');
        channel.onmessage = () => listeners.forEach(notify => notify());
      } catch { /* Some browsers restrict messaging; refresh on focus instead. */ }
    }
    return () => { listeners.delete(listener); if (!listeners.size) { channel?.close(); channel = undefined; } };
  }
};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, limit = 1000): v is string => typeof v === 'string' && v.length <= limit;
const validDate = (v: unknown) => str(v) && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
export function validatePersonal(value: unknown): Personal {
  const fail = (): never => { throw new Error('备份内容无效，原有数据未修改。'); };
  if (!object(value) || !Array.isArray(value.characters) || !Array.isArray(value.progress) || !Array.isArray(value.notes) || !object(value.preferences)) return fail();
  const { characters, progress, notes, preferences, armorPlans, activityProgress } = value;
  if(!Array.isArray(armorPlans)||!Array.isArray(activityProgress)||armorPlans.length>10000||activityProgress.length>200000) return fail();
  if (characters.length > 500 || progress.length > 200000 || notes.length > 20000) return fail();
  const ids = new Set<string>(), names = new Set<string>();
  for (const c of characters) { if (!object(c) || !str(c.id,100) || !c.id || ids.has(c.id) || !str(c.name,60) || !c.name.trim() || names.has(c.name.trim())) return fail(); ids.add(c.id); names.add(c.name.trim()); }
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
  return { characters: characters.map(c => ({ id: c.id, name: c.name.trim() })), progress: progress.map(p => ({ characterId: p.characterId, entryId: p.entryId, done: p.done, ...(p.date ? { date: p.date } : {}) })), notes: notes.map(n => ({ id: n.id, characterId: n.characterId, region: n.region, x: n.x, y: n.y, text: n.text })), armorPlans:armorPlans.map(p=>({id:p.id,characterId:p.characterId,name:p.name.trim(),offerId:p.offerId,pieceIds:[...p.pieceIds],completedPieceIds:[...p.completedPieceIds]})), activityProgress:activityProgress.map(p=>({characterId:p.characterId,activityId:p.activityId,start:p.start,done:p.done})), preferences: { characterId: preferences.characterId, layers: [...new Set(preferences.layers)], calendarTimezone:preferences.calendarTimezone||'Asia/Shanghai' } } as Personal;
}
export function migratePersonalV1(value: unknown): Personal {
  if(!object(value))throw Error('旧版备份内容无效。');
  return validatePersonal({...value,armorPlans:[],activityProgress:[],preferences:object(value.preferences)?{...value.preferences,calendarTimezone:'Asia/Shanghai'}:value.preferences});
}
export function parseBackup(text: string): Backup {
  if (text.length > 20_000_000) throw new Error('备份超过 20 MB。');
  let v; try { v = JSON.parse(text); } catch { throw new Error('无法读取 JSON 备份。'); }
  if (!object(v) || v.format !== 'mappingout-backup' || ![1,2].includes(v.version as number) || !str(v.exportedAt) || isNaN(Date.parse(v.exportedAt))) throw new Error('不支持此备份格式或版本。');
  return { format: 'mappingout-backup', version: 2, exportedAt: v.exportedAt, data: v.version===1?migratePersonalV1(v.data):validatePersonal(v.data), ...(v.version===1?{migratedFrom:1 as const}:{}) };
}
export function makeBackup(data: Personal): Backup { return { format: 'mappingout-backup', version: 2, exportedAt: new Date().toISOString(), data: validatePersonal(data) }; }
