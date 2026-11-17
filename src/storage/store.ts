/**
 * [INPUT]: 依赖 IndexedDB、个人记录校验和默认值。
 * [OUTPUT]: 提供原子读写、迁移事务与跨页面通知。
 * [POS]: 个人数据持久边界；数据库名和版本保持 mappingout v3。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { t } from '../i18n';
import { openDB } from 'idb';
import type { Personal } from '../shared/contracts/personal';
import { validatePersonal, migratePersonalV1, migratePersonalV2 } from './validation';
import { emptyPersonal } from './defaults';
export interface PersonalStore {
  load(): Promise<Personal>;
  save(state: Personal): Promise<void>;
  update(change: (latest: Personal) => Personal): Promise<Personal>;
  subscribe(listener: () => void): () => void;
}
function database() {
  const opening = openDB('mappingout', 3, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      if(oldVersion===0) db.createObjectStore('personal');
      if(oldVersion===1 || oldVersion===2) {
        const store=transaction.objectStore('personal');
        void store.get('state').then(value=>{ if(value) return store.put(oldVersion===1?migratePersonalV1(value):migratePersonalV2(value),'state'); }).catch(()=>transaction.abort());
      }
    },
    blocked() { if(typeof window!=='undefined') window.dispatchEvent(new Event('mappingout-storage-blocked')); },
    blocking() { void opening.then(db=>db.close()); }
  });
  return opening.catch(error=>{ if(error?.name==='VersionError') throw Error(t("本地资料格式已升级，请刷新页面后继续。")); throw error; });
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
