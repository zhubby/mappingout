/**
 * [INPUT]: 依赖个人记录契约、角色规则和应用注入的写入能力。
 * [OUTPUT]: 提供角色、地图笔记与备份预览表单。
 * [POS]: 个人记录界面；通过应用队列提交，不直接访问存储。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Check, ChevronRight, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { t, dateTime } from '../../i18n';
import type { Backup, Note, Personal } from '../../shared/contracts/personal';
import { isDesktop } from '../../platform';
import { deleteCharacter } from './domain';
export type JournalDialog = {type:'characters'} | {type:'backup'; backup?:Backup} | {type:'note'; note:Note};
export default function JournalDialogs({dialog,state,update,setDialog,setMessage,regionName,restoring,downloadBackup,chooseBackup,restore}: {dialog: JournalDialog; state: Personal; update: (change: (state: Personal) => Personal) => Promise<boolean>; setDialog: (dialog: JournalDialog | {type:'desktop'} | null) => void; setMessage: (message: string) => void; regionName: (id: string) => string; restoring: boolean; downloadBackup: () => Promise<void>; chooseBackup: () => Promise<void>; restore: (backup: Backup) => Promise<void>}) {
  const [characterName,setCharacterName] = useState(''), [renaming,setRenaming] = useState('');
  async function saveCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = characterName.trim();
    if (!name || name.length > 60) { setMessage(t("请输入 1–60 字的角色名")); return; }
    const id = renaming || crypto.randomUUID();
    const saved = await update(s => {
      if (s.characters.some(c => c.name === name && c.id !== renaming)) throw new Error(t("角色名已存在"));
      if (renaming && !s.characters.some(c => c.id === id)) throw new Error(t("此角色已在其他页面删除。"));
      return { ...s, characters: renaming ? s.characters.map(c => c.id === id ? { ...c, name } : c) : [...s.characters, { id, name }], preferences: { ...s.preferences, characterId: id } };
    });
    if (saved) { setCharacterName(''); setRenaming(''); setMessage(t("角色已保存")); }
  }
  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dialog?.type !== 'note') return;
    const note = { ...dialog.note, text: dialog.note.text.trim() };
    if (!note.text) return;
    if (await update(s => ({ ...s, notes: [...s.notes.filter(n => n.id !== note.id), note] }))) { setDialog(null); setMessage(t("地图笔记已保存")); }
  }
  return <>
      {dialog.type==='characters' && <><span className="eyebrow">{t("YOUR ADVENTURE, YOUR STORY")}</span><h2>{t("探索者管理")}</h2><p>{t("每位角色拥有独立的技能、区域、宝藏进度、笔记、护甲计划与战承记录。")}</p><div className="character-list">{state.characters.map(c=><div key={c.id}><button className={c.id===state.preferences.characterId?'active':''} onClick={()=>update(s=>({...s,preferences:{...s.preferences,characterId:c.id}}))}><UserRound size={17}/>{c.name}{c.id===state.preferences.characterId && <Check size={15}/>}</button><button aria-label={t("重命名 {{v0}}", { v0: c.name })} onClick={()=>{setRenaming(c.id);setCharacterName(c.name);}}><Pencil size={15}/></button><button aria-label={t("删除 {{v0}}", { v0: c.name })} onClick={()=>{if(window.confirm(t("删除「{{v0}}」及其全部进度和笔记？", { v0: c.name })))update(s=>deleteCharacter(s,c.id));}}><Trash2 size={15}/></button></div>)}</div><form onSubmit={saveCharacter}><label>{renaming?t("修改角色名"):t("新建角色")}<input autoFocus aria-label={t("角色名")} maxLength={60} value={characterName} onChange={e=>setCharacterName(e.target.value)} placeholder={t("输入角色名称")} required/></label><button className="primary full" type="submit"><Plus size={16}/>{renaming?t("保存名称"):t("创建探索者")}</button>{renaming&&<button type="button" className="quiet" onClick={()=>{setRenaming('');setCharacterName('');}}>{t("取消重命名")}</button>}</form></>}
      {dialog.type==='backup' && <><span className="eyebrow">{t("KEEP YOUR MEMORIES SAFE")}</span><h2>{t("数据备份")}</h2>{isDesktop && <button className="quiet" disabled={restoring} onClick={() => setDialog({type:'desktop'})}>{t("查看自动备份与客户端设置")}</button>}{dialog.backup ? <><p>{t("已校验备份（")}{dateTime(dialog.backup.exportedAt)}）</p><div className="backup-summary"><span>{dialog.backup.data.characters.length} {t(" 位角色")}</span><span>{dialog.backup.data.progress.length} {t(" 条进度")}</span><span>{dialog.backup.data.notes.length} {t(" 条笔记")}</span><span>{dialog.backup.data.armorPlans.length} {t(" 份制作计划")}</span><span>{dialog.backup.data.activityProgress.length} {t(" 条活动记录")}</span><span>{dialog.backup.data.questProgress.length} {t(" 条任务记录")}</span></div>{dialog.backup.migratedFrom&&<p>{t("旧版 v{{v0}} 备份已校验，将迁移到 v3；任务记录为空。",{v0:dialog.backup.migratedFrom})}</p>}<p className="warning">{isDesktop ? t("恢复会整体替换客户端个人数据；覆盖前会自动保存一份恢复前备份，保存失败则不会替换。") : t("恢复会整体替换当前浏览器中的个人数据。建议先导出当前备份。")}</p><button className="quiet full" onClick={downloadBackup}>{t("先导出当前数据")}</button><button className="primary full" disabled={restoring} onClick={()=>restore(dialog.backup!)}>{restoring ? t("正在备份并恢复…") : t("确认替换并恢复")}</button></> : <><p>{isDesktop ? t("角色与进度保存在当前客户端。导出 JSON 文件，可在网页版或其他电脑恢复。") : t("角色与进度保存在当前浏览器。导出 JSON 文件，可在其他浏览器恢复。")}</p><button className="backup-action" onClick={downloadBackup}><ArrowDownToLine size={23}/><span><strong>{t("导出个人数据")}</strong><small>{state.characters.length} {t(" 位角色 · ")}{state.notes.length} {t(" 条笔记")}</small></span><ChevronRight size={18}/></button><button className="backup-action" onClick={()=>void chooseBackup()}><ArrowUpFromLine size={23}/><span><strong>{t("从备份恢复")}</strong><small>{t("先校验与预览，再确认替换")}</small></span><ChevronRight size={18}/></button></>}</>}
      {dialog.type==='note' && <><span className="eyebrow">{t("A NOTE TO YOUR FUTURE SELF")}</span><h2>{t("地图笔记")}</h2><p>{regionName(dialog.note.region)} {t(" · X ")}{dialog.note.x} {t(" / Y ")}{dialog.note.y}</p><form onSubmit={saveNote}><textarea autoFocus aria-label={t("笔记内容")} required maxLength={2000} placeholder={t("记录路线、发现或下次冒险的计划…")} value={dialog.note.text} onChange={e=>setDialog({...dialog,note:{...dialog.note,text:e.target.value}})}/><button className="primary full" type="submit">{t("保存笔记")}</button>{state.notes.some(n=>n.id===dialog.note.id)&&<button className="danger full" type="button" onClick={()=>{update(s=>({...s,notes:s.notes.filter(n=>n.id!==dialog.note.id)}));setDialog(null);}}>{t("删除笔记")}</button>}</form></>}
  </>;
}
