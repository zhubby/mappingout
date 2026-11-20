/**
 * [INPUT]: 依赖按需资料投影、个人存储、菜单、离线准备与桌面更新。
 * [OUTPUT]: 提供地图、功能标签、离线准备入口和个人记录交互。
 * [POS]: 应用界面编排；所有个人写入经过同一重启屏障。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { displayMessage, t, useLocale, setLocale } from '../i18n';
import { attributeId } from '../i18n/attributes';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, Check, Plus, ChevronDown, ChevronRight, Compass, Download, Filter, Layers, MapPin, Menu, Search, Shield, SlidersHorizontal, Sparkles, UserRound, Users, X } from 'lucide-react';
import { AtlasMap } from '../features/atlas/AtlasMap';
import { OriginalContent, StoryGuides, WikiDetails } from '../shared/ui/WikiDetails';
import { assetUrl } from '../shared/content/assetUrl';
import { randomUUID } from '../shared/browserCrypto';
import { belongsToRegion, createProgressIndex, filtersSearch, normalizeFilters, preferredPlace, query, readFilters, setProgress, trackable } from '../features/atlas/domain';
import { emptyPersonal } from '../storage/defaults';
import { makeBackup, parseBackup } from '../storage/backup';
import { personalStore } from '../storage/store';
import { kindNames, kindSymbols } from '../shared/game/kinds';
import type { Backup, Note, Personal } from '../shared/contracts/personal';
import type { Catalog, Entry, Filters, Kind, Place } from '../shared/contracts/catalog';
import { isDesktop, exportBackup, pickBackup, writeLocalBackup, openExternal, syncDesktopLocale } from '../platform';
import { AutoBackup } from '../platform/auto-backup';
import {PersonalQueue} from '../platform/restart';
import Select from '../shared/ui/Select';
import {skillParamKeys} from '../features/skills/params';
import {desktopUpdates, useDesktopUpdates} from '../platform/desktop-updates';
import { DesktopUpdateProgress, DesktopUpdatePrompt, updateMessage } from '../features/desktop/DesktopUpdates';
import { useFeatureData } from '../shared/content/useFeatureData';
import { DataStatus } from '../shared/ui/DataStatus';
import type {WithBackup} from '../platform/update-controller';
import '../features/desktop/desktop.css';

import JournalDialogs, { useJournalForms } from '../features/journal/JournalDialogs';

const kinds = Object.keys(kindNames) as Kind[];
const ArmorWorkshop=lazy(()=>import('../features/armor/ArmorWorkshop'));
const ActivityCalendar=lazy(()=>import('../features/calendar/ActivityCalendar'));
const QuestGuides=lazy(()=>import('../features/quests/QuestGuides'));
const SkillLibrary=lazy(()=>import('../features/skills/SkillLibrary'));
const DesktopPanel=lazy(()=>import('../features/desktop/DesktopPanel'));
const LocalDocument=lazy(()=>import('../shared/ui/LocalDocument'));
const OfflinePreparation=lazy(()=>import('../platform/OfflinePreparation'));
const featureKeys=['view','armor','offer','parts','aProfession','aCampaign','aRating','aCategory','aq','date','cKind','cq','tz','activity','quest','qChapter','qMode','qKind','qStatus','qRegion','qq',...skillParamKeys];
function readFeatureParams(){const search=new URLSearchParams(location.search);return Object.fromEntries(featureKeys.filter(k=>search.has(k)).map(k=>[k,search.get(k)!]));}
type Dialog = { type: 'characters' } | { type: 'backup'; backup?: Backup } | { type: 'note'; note: Note } | { type: 'report' } | { type: 'offline' } | { type: 'story' } | { type: 'desktop' } | { type: 'document'; url: string } | null;
function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
const editingTarget = (target: EventTarget | null) => target instanceof HTMLElement && target.matches('input, textarea, [role="combobox"], [contenteditable]:not([contenteditable="false"])');
export default function App() {
  const locale = useLocale();
  const journalForms = useJournalForms();
  useEffect(()=>{void syncDesktopLocale().catch(console.error);},[locale]);
  const [filters,setFilters] = useState<Filters>(() => readFilters(location.search)), [dialog,setDialog] = useState<Dialog>(null), [message,setMessage] = useState('');
  const [featureParams,setFeatureParams]=useState<Record<string,string>>(readFeatureParams);
  const view=featureParams.view==='armor'||featureParams.view==='calendar'||featureParams.view==='quests'||featureParams.view==='skills'?featureParams.view:'atlas';
  const catalogRequest=useFeatureData<Catalog>('catalog.json',view==='atlas'||view==='armor'||view==='skills'||dialog?.type==='story');
  const catalog=catalogRequest.data;
  const [state,setState] = useState<Personal>(emptyPersonal), [ready,setReady] = useState(false);
  const Feature=view==='armor'?ArmorWorkshop:view==='quests'?QuestGuides:view==='skills'?SkillLibrary:ActivityCalendar;
  const patchFeature=useCallback((values:Record<string,string>)=>setFeatureParams(previous=>({...previous,...values})),[]);
  const [focus,setFocus] = useState<Place>(), [focusKey,setFocusKey] = useState(0), [noteMode,setNoteMode] = useState(false), [mobile,setMobile] = useState<'map'|'search'|'detail'>('map'), [limit,setLimit] = useState(60), [treasureDate,setTreasureDate] = useState(today), [storageError,setStorageError] = useState('');
  const [zoneToNavigate,setZoneToNavigate] = useState('');
  const writeQueue = useRef(new PersonalQueue()), stateRef = useRef(state), fileInput = useRef<HTMLInputElement>(null);
  const updateStatus = useDesktopUpdates();
  const [restarting, setRestarting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [backupStatus, setBackupStatus] = useState<{ error: string; savedAt?: number }>({ error: '' });
  const [restoring, setRestoring] = useState(false);
  const autoBackup = useRef<AutoBackup<Personal> | null>(null);
  const restorePending = useRef(false);
  useEffect(() => {
    // 移除有焦点的输入框时，浏览器不会始终触发 blur。
    if (isDesktop) setEditing(editingTarget(document.activeElement));
  }, [dialog, view]);
  useEffect(() => {
    if (!isDesktop) return;
    const backup = new AutoBackup<Personal>(data => writeLocalBackup(data, 'auto'), (error, savedAt) => setBackupStatus({ error, savedAt }));
    autoBackup.current = backup;
    return () => { backup.stop(); autoBackup.current = null; };
  }, []);
  useEffect(() => { if (ready) autoBackup.current?.changed(state); }, [ready, state]);
  useEffect(() => {
    if (!isDesktop) return;
    const handleLink = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const url = new URL(anchor.href);
      if (url.origin !== location.origin) {
        event.preventDefault();
        void openExternal(url.href).catch(error => setMessage(t("无法打开链接：{{v0}}", { v0: String(error) })));
      } else if (/\.(json|txt)$/.test(url.pathname)) {
        event.preventDefault(); setDialog({ type: 'document', url: url.href });
      }
    };
    document.addEventListener('click', handleLink, true);
    document.addEventListener('auxclick', handleLink, true);
    return () => { document.removeEventListener('click', handleLink, true); document.removeEventListener('auxclick', handleLink, true); };
  }, []);
  useEffect(() => {
    let live = true;
    const refresh = () => {
      const pending = writeQueue.current.read(async () => {
        const saved = await personalStore.load();
        if (live) { stateRef.current = saved; setState(saved); }
      });
      void pending.catch(e => { if (live) setStorageError(t("读取本地记录失败：{{v0}}", { v0: e.message })); });
      return pending;
    };
    void refresh().catch(()=>undefined).then(()=>{if(live)setReady(true);});
    const onChange = () => { void refresh().catch(() => {}); };
    const onVisible = () => { if (document.visibilityState === 'visible') onChange(); };
    const unsubscribe = personalStore.subscribe(onChange);
    window.addEventListener('focus', onChange);
    document.addEventListener('visibilitychange', onVisible);
    const blocked=()=>setStorageError(t("本地资料正在升级，请关闭其他旧版页面后重试；已有数据仍保留。"));
    window.addEventListener('mappingout-storage-blocked',blocked);
    return () => { live = false; unsubscribe(); window.removeEventListener('focus', onChange); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('mappingout-storage-blocked',blocked); };
  }, []);
  useEffect(() => { if (ready && isDesktop && import.meta.env.PROD) void desktopUpdates.checkOnLaunch(); }, [ready]);
  useEffect(() => { const pop = () => { setFilters(readFilters(location.search));setFeatureParams(readFeatureParams()); setFocus(undefined); }; window.addEventListener('popstate',pop); return () => window.removeEventListener('popstate',pop); }, []);
  useEffect(() => { const params=new URLSearchParams(filtersSearch(filters));for(const [key,value]of Object.entries(featureParams))if(value||key==='parts')params.set(key,value);history.replaceState(null,'',`${location.pathname}?${params}`); }, [filters,featureParams]);
  useEffect(()=>setLimit(60),[filters]);
  useEffect(() => { if (!message) return; const t = setTimeout(() => setMessage(''),4500); return () => clearTimeout(t); }, [message]);
  const update = (fn: (s: Personal) => Personal) => {
    const saved = writeQueue.current.write(() => personalStore.update(fn)).then(next => {
      stateRef.current = next; setState(next); setStorageError(''); return true;
    }, e => { setStorageError(t("操作未保存，请重试：{{v0}}", { v0: e.message })); return false; });
    return saved;
  };
  const patch = useCallback((v: Partial<Filters>) => setFilters(f => normalizeFilters({ ...f,...v })), []);
  const records = useMemo(() => catalog ? query(catalog,filters,state) : [],[catalog,filters,state]);
  const region = catalog?.regions.find(r => r.id === filters.map) || catalog?.regions[0];
  const selected = catalog?.records.find(e => e.id === filters.selected);
  const currentProgress=useMemo(()=>createProgressIndex(state,state.preferences.characterId),[state.progress,state.preferences.characterId]);
  const selectedProgress=selected?currentProgress.get(selected.id):undefined;
  useEffect(() => { setTreasureDate(currentProgress.get(filters.selected)?.date || today()); }, [currentProgress,filters.selected]);
  const select = useCallback((entry: Entry, place?: Place) => {
    const p = place || preferredPlace(entry, filters);
    setFilters(f => ({ ...f, selected: entry.id, ...(p ? { map: p.region } : {}) })); setFocus(p); setFocusKey(k => k+1); setMobile('detail');
  }, [filters]);
  const navigateZone=useCallback((id:string)=>{setZoneToNavigate(id);patchFeature({view:'atlas'});},[patchFeature]);
  useEffect(()=>{
    if(view!=='atlas'||!catalog||!zoneToNavigate)return;
    const entry=catalog.records.find(value=>value.id===zoneToNavigate);
    setZoneToNavigate('');
    if(entry){select(entry);patch({kind:'zone',q:'',campaign:'',region:'',zone:'',incomplete:false});}
  },[view,catalog,zoneToNavigate,select,patch]);
  useEffect(() => {
    if (!catalog || !filters.selected || focus) return;
    const e = catalog.records.find(e => e.id === filters.selected);
    const p = e?.locations.find(l => l.region === filters.map && l.valid);
    if (p) setFocus(p);
  }, [catalog, filters.selected, filters.map, focus]);
  const editNote = useCallback((note: Note) => setDialog({ type: 'note', note: { ...note } }), []);
  const mapEntries = useMemo(() => {
    const es = records.filter(e => state.preferences.layers.includes(e.kind));
    return selected && state.preferences.layers.includes(selected.kind) && !es.some(e => e.id === selected.id) ? [...es,selected] : es;
  },[records,state.preferences.layers,selected]);
  const notes = useMemo(() => state.notes.filter(n => n.characterId === state.preferences.characterId),[state.notes,state.preferences.characterId]);
  const character = state.characters.find(c => c.id === state.preferences.characterId);
  const skillDone = catalog?.records.filter(e => e.kind === 'skill' && currentProgress.get(e.id)?.done).length || 0;
  const campaignRegions = catalog?.regions.filter(r => !filters.campaign || r.campaign === Number(filters.campaign)) || [];
  const zones = catalog?.records.filter(e => e.kind === 'zone' && (!filters.campaign || e.campaign === Number(filters.campaign)) && (!filters.region || belongsToRegion(e, filters.region))) || [];
  const attrs = [...new Set(catalog?.records.filter(e => e.kind === 'skill' && (!filters.profession || e.profession === Number(filters.profession))).map(e => e.attribute).filter(Boolean))].sort() as string[];
  const regionName = (id: string) => catalog?.regions.find(r => r.id === id)?.name || t("未知地区");
  const zoneName = (id?: string) => catalog?.records.find(e => e.id === `zone:${id}`)?.name;
  const toggle = (e: Entry) => { if (!character) { setDialog({type:'characters'}); return; } const done = !currentProgress.get(e.id)?.done; if (e.kind==='treasure' && done && (!treasureDate || treasureDate>today())) { setMessage(t("请选择有效的开启日期")); return; } void update(s => setProgress(s,e.id,character.id,done,e.kind === 'treasure' ? treasureDate : undefined)); };
  async function downloadBackup() {
    try {
      await writeQueue.current.wait();
      if (await exportBackup(makeBackup(stateRef.current))) setMessage(t("备份已导出"));
    } catch (error) { setMessage(t("导出失败：{{v0}}", { v0: String(error) })); }
  }
  async function chooseBackup() {
    if (!isDesktop) { fileInput.current?.click(); return; }
    try { const backup = await pickBackup(); if (backup) setDialog({ type: 'backup', backup }); }
    catch (error) { setMessage(String(error)); }
  }
  const beforeRestart: WithBackup = async install => {
    setRestarting(true);
    try { await writeQueue.current.restart(async () => writeLocalBackup(await personalStore.load(), 'auto'), install); }
    finally { setRestarting(false); }
  };
  async function importFile(file?: File) {
    if (!file) return;
    try { if (file.size > 20_000_000) throw Error(t("备份超过 20 MB")); const backup = parseBackup(await file.text()); setDialog({type:'backup',backup}); }
    catch(e) { setMessage((e as Error).message); }
    if (fileInput.current) fileInput.current.value='';
  }
  async function restore(backup: Backup) {
    if (restorePending.current) return;
    restorePending.current = true; setRestoring(true);
    const pending = writeQueue.current.write(async () => {
      // Snapshot the latest committed state inside the write queue before replacement.
      if (isDesktop) await writeLocalBackup(await personalStore.load(), 'restore');
      await personalStore.save(backup.data);
      const next = await personalStore.load();
      stateRef.current = next; setState(next); setStorageError('');
      setDialog(null); setMessage(t("备份已恢复"));
    });
    try { await pending; }
    catch (error) { setMessage(t("恢复未完成：{{v0}}。请检查现有记录后重试。", { v0: String(error) })); }
    finally { restorePending.current = false; setRestoring(false); }
  }
  if (!ready) return <main className="loading"><Compass size={44}/><h1>{t("正在展开泰瑞亚地图…")}</h1><p>{storageError?displayMessage(storageError):t("读取本地资料与角色记录")}</p></main>;
  const updatePrompt = isDesktop && updateStatus.phase === 'ready' && (!dialog || dialog.type === 'desktop') && !editing && !restoring && !restarting;
  return <><div className="app-shell" inert={restarting || updatePrompt ? true : undefined}
    onFocusCapture={isDesktop ? event => setEditing(editingTarget(event.target)) : undefined}
    onBlurCapture={isDesktop ? event => setEditing(editingTarget(event.relatedTarget)) : undefined}>
    <header className="topbar"><a className="brand" href={import.meta.env.BASE_URL}><span className="brand-mark"><Compass size={28} strokeWidth={1.3}/></span><span><strong>{t("MAPPING")}<span>{t("OUT")}</span></strong><small>{t("泰瑞亚探索志")}</small></span></a><div className="top-divider"/><div className="top-title"><span>{t("GUILD WARS")}</span><span>{t("你的下一段冒险，从这里开始。")}</span></div><nav><label className="language-selector"><span>{t("语言")}</span><Select aria-label="Language / 語言" value={locale} onValueChange={value => setLocale(value as 'zh-TW' | 'en')} options={[{value:'zh-TW',label:'繁體中文'},{value:'en',label:'English'}]}/></label>{!!catalog?.stories?.length && <button className="quiet" onClick={() => setDialog({type:'story'})}><BookOpen size={16}/><span>{t("剧情指南")}</span></button>}{!isDesktop&&<button className="quiet" aria-label={t('离线资料准备')} onClick={()=>setDialog({type:'offline'})}><Download size={16}/><span>{t('离线资料准备')}</span></button>}{isDesktop && <button className="quiet" onClick={() => setDialog({type:'desktop'})} aria-label={t("客户端设置")}><SlidersHorizontal size={16}/><span>{t("客户端")}</span></button>}<span className="local-status"><span className="live-dot"/>{t("本地资料库")}</span><button className="quiet" onClick={() => setDialog({type:'backup'})}><Download size={16}/><span>{t("数据备份")}</span></button><button className="character-button" onClick={() => setDialog({type:'characters'})}><UserRound size={16}/>{character?.name || t("创建探索者")}<ChevronDown size={13}/></button></nav></header>
    <nav className="module-nav" aria-label={t("主要功能")}>{[['atlas',t("世界地图")],['quests',t("任务攻略")],['skills',t("职业技能")],['armor',t("护甲制作")],['calendar',t("活动日历")]].map(([key,label])=><button key={key} aria-current={view===key?'page':undefined} className={view===key?'active':''} onClick={()=>patchFeature({view:key})}>{label}</button>)}</nav>
    {view!=='atlas'?(view==='quests'||view==='calendar'||catalog?<Suspense fallback={<DataStatus/>}><Feature catalog={catalog as Catalog} personal={state} update={update} params={featureParams} patch={patchFeature} manageCharacters={()=>setDialog({type:'characters'})} manageResources={isDesktop?()=>setDialog({type:'desktop'}):undefined} navigateZone={navigateZone}/></Suspense>:<DataStatus error={catalogRequest.error} retry={catalogRequest.retry} progress={catalogRequest.progress}/>):catalog&&region?<div className="workspace">
      <aside className={`search-panel ${mobile === 'search' ? 'mobile-visible' : ''}`}>
        <div className="search-box"><Search size={17}/><input aria-label={t("搜索资料")} placeholder={t("技能、Boss、装备或地点…")} value={filters.q} onChange={e => patch({q:e.target.value})}/>{filters.q && <button aria-label={t("清空搜索")} onClick={() => patch({q:''})}><X size={14}/></button>}<kbd>⌕</kbd></div>
        <div className="kind-tabs" aria-label={t("资料类型")}><button className={!filters.kind ? 'active' : ''} onClick={() => patch({kind:''})}>{t("全部")}</button>{kinds.map(k => <button key={k} className={`${filters.kind === k ? 'active' : ''} tab-${k}`} onClick={() => patch({kind:k})}>{kindNames[k]}</button>)}</div>
        <div className="filters"><div className="section-label"><SlidersHorizontal size={13}/><span>{t("筛选探索目标")}</span><button onClick={() => setFilters(f => ({...f,q:'',campaign:'',region:'',zone:'',profession:'',attribute:'',incomplete:false}))}>{t("重置")}</button></div>
          <div className="filter-grid"><label>{t("篇章")}<Select aria-label={t("篇章筛选")} value={filters.campaign} onValueChange={value => patch({campaign:value,region:'',zone:''})} options={[{value:'',label:t("所有篇章")},...catalog.campaigns.map(c => ({value:c.id,label:c.shortName}))]}/></label><label>{t("地区")}<Select aria-label={t("地区筛选")} value={filters.region} onValueChange={value => patch({region:value,zone:'',...(value ? {map:value} : {})})} options={[{value:'',label:t("所有地区")},...campaignRegions.map(r => ({value:r.id,label:r.name}))]}/></label>
          <label>{t("区域")}<Select aria-label={t("区域筛选")} value={filters.zone} onValueChange={value => patch({zone:value})} options={[{value:'',label:t("所有区域")},...zones.map(z => ({value:z.id.slice(5),label:z.name}))]}/></label>{(!filters.kind || filters.kind === 'skill' || filters.kind === 'boss') && <label>{t("职业")}<Select aria-label={t("职业筛选")} value={filters.profession} onValueChange={value => patch({profession:value,attribute:''})} options={[{value:'',label:t("所有职业")},...catalog.professions.map(p => ({value:p.id,label:p.name}))]}/></label>}</div>
          {(!filters.kind || filters.kind === 'skill') && <label className="attribute-filter">{t("技能属性")}<Select aria-label={t("技能属性筛选")} value={filters.attribute} onValueChange={value => patch({attribute:value})} options={[{value:'',label:t("所有属性")},...attrs.map(a => ({value:attributeId(a),label:a}))]}/></label>}
          <label className="checkbox-label"><input type="checkbox" checked={filters.incomplete} onChange={e => patch({incomplete:e.target.checked})}/><span>{t("仅显示可追踪的未完成目标")}</span></label>
        </div>
        <div className="result-heading"><span><b>{records.length.toLocaleString(locale)}</b> {t(" 个探索目标")}</span><span>{t("名称 / 地点")}</span></div>
        <div className="results" data-testid="results">{records.slice(0,limit).map(e => <button key={e.id} className={`result ${selected?.id === e.id ? 'selected' : ''}`} onClick={() => select(e)}><span className={`entry-icon ${e.kind}`}>{e.image ? <img src={assetUrl(e.image)} alt="" loading="lazy"/> : kindSymbols[e.kind]}</span><span className="result-copy"><strong>{e.name}</strong><small>{e.attribute || kindNames[e.kind]}<i>·</i>{e.locations.some(p=>p.valid) ? t("{{v0}} 个可定位地点", { v0: e.locations.filter(p=>p.valid).length }) : t("暂无确认坐标")}</small></span>{currentProgress.get(e.id)?.done ? <Check className="done-icon" size={15}/> : <ChevronRight size={14}/>}</button>)}{!records.length && <div className="empty-state"><Search size={28}/><h3>{t("还没有找到目标")}</h3><p>{t("试试其他关键词，或减少筛选条件。")}</p></div>}{records.length>limit && <button className="load-more" onClick={() => setLimit(n=>n+60)}>{t("显示更多目标（剩余 ")}{records.length-limit}）</button>}</div>
        <div className="search-footer"><BookOpen size={13}/><span>{t("源自 MappingOut 4.00")}</span><button onClick={() => setDialog({type:'report'})}>{t("资料说明")}<ArrowUpRight size={12}/></button></div>
      </aside>
      <main className={`map-panel ${mobile === 'map' ? 'mobile-visible' : ''}`}>
        <div className="map-toolbar">
          <div className="breadcrumb">
            <Compass size={16} aria-hidden="true"/><span>{t("世界地图")}</span><ChevronRight size={13} aria-hidden="true"/>
            <Select aria-label={t("章节选择")} value={region.campaign} onValueChange={value => {
              const first = catalog.regions.find(r => r.campaign === Number(value));
              if (first) { patch({map:first.id}); setFocus(undefined); }
            }} options={catalog.campaigns.map(c => ({value:c.id,label:c.shortName}))}/>
            <ChevronRight size={13} aria-hidden="true"/>
            <Select aria-label={t("地图地区")} value={region.id} onValueChange={value => { patch({map:value}); setFocus(undefined); }} options={catalog.regions.filter(r => r.campaign === region.campaign).map(r => ({value:r.id,label:r.name}))}/>
          </div>
          <button className={noteMode ? 'quiet accent' : 'quiet'} onClick={() => { if (!character) setDialog({type:'characters'}); else setNoteMode(v=>!v); }}><Plus size={15}/>{noteMode ? t("取消标注") : t("添加笔记")}</button>
        </div>
        <AtlasMap region={region} entries={mapEntries} selected={selected} focus={focus} focusKey={focusKey} notes={notes} onSelect={select} onEditNote={editNote} noteMode={noteMode} onNote={(x,y) => { if (x<0 || y<0 || x>region.width || y>region.height) { setMessage(t("请在地图图片范围内添加笔记")); return; } setNoteMode(false); setDialog({type:'note',note:{id:randomUUID(),characterId:state.preferences.characterId,region:region.id,x,y,text:''}}); }}/>
        <div className="map-bottom"><div className="legend-title"><Layers size={15}/><span>{t("地图图层")}</span></div><div className="legend-items">{kinds.map(k => <button key={k} className={`${k} ${state.preferences.layers.includes(k) ? 'enabled' : ''}`} aria-pressed={state.preferences.layers.includes(k)} onClick={() => update(s => ({...s,preferences:{...s.preferences,layers:s.preferences.layers.includes(k) ? s.preferences.layers.filter(v=>v!==k) : [...s.preferences.layers,k]}}))}><span>{kindSymbols[k]}</span>{kindNames[k]}</button>)}</div><small>{t("仅显示当前查询结果")}</small></div>
      </main>
      <aside className={`detail-panel ${mobile === 'detail' ? 'mobile-visible' : ''}`}>
        <div className="detail-top"><span className="section-label"><MapPin size={14}/>{t("探索档案")}</span><span className="edition">{t("FIELD NOTES / 01")}</span></div>
        {selected ? <div className="detail-scroll" key={selected.id}><div className={`detail-hero ${selected.kind}`}><span className="eyebrow">{kindNames[selected.kind]} / {catalog.campaigns.find(c=>c.id===selected.campaign)?.shortName || t("核心资料")}</span><div className="detail-title-row"><span className={`entry-icon large ${selected.kind}`}>{selected.image ? <img src={assetUrl(selected.image)} alt={selected.name}/> : kindSymbols[selected.kind]}</span><h2>{selected.name}</h2></div>{!!selected.profession && <span className="profession-tag">{catalog.professions.find(p=>p.id===selected.profession)?.name} {selected.attribute && ` / ${selected.attribute}`}</span>}</div>
          <section className="detail-section"><h3><BookOpen size={14}/>{selected.kind === 'collector' ? t("所在位置与兑换") : selected.kind === 'green' ? t("装备资料") : t("资料概览")}</h3>{selected.wiki && <span className="wiki-badge">{selected.wiki.identityStatus === 'unresolved' ? t("Wiki 来源审查 · 身份待核实") : t("Wiki 核对 · {{v0}}", { v0: selected.descriptionLanguage === 'en' ? t("英文原文") : selected.kind === 'skill' ? t("中文校订") : t("中文整理 · 含英文资料") })}{selected.skill?.pvp ? t(" · PvE 版本") : ''}</span>}<p className="description" lang={selected.descriptionLanguage}>{selected.description || t("暂无额外说明")}</p>{selected.details.map((d,i)=><p className="detail-stat" key={i}>{d}</p>)}</section>
          <WikiDetails entry={selected}/>
          {trackable(selected) && <section className="progress-section"><h3><Shield size={15}/>{t("角色进度 ")}<span>{character?.name || t("尚未创建角色")}</span></h3>{selected.kind==='treasure' && <label className="date-label">{t("开启日期")}<input aria-label={t("宝藏开启日期")} type="date" value={treasureDate} max={today()} onChange={e=>setTreasureDate(e.target.value)}/></label>}<button className={`primary full ${selectedProgress?.done ? 'completed' : ''}`} onClick={()=>toggle(selected)}>{selectedProgress?.done ? <Check size={16}/> : <Plus size={16}/>}{selectedProgress?.done ? t("已完成 · 点击撤销") : selected.kind==='skill' ? (selected.skill?.capturable === false ? t("标记已学会") : t("标记已捕获")) : selected.kind==='zone' ? t("标记已清剿") : t("标记已开启")}</button>{selectedProgress?.date && <small>{t("上次开启：")}{selectedProgress.date}</small>}</section>}
          <section className="detail-section locations"><h3><MapPin size={14}/>{t("发现地点")}<span>{selected.locations.length}</span></h3>{selected.locations.length ? selected.locations.map((p,i)=><div className="location-card" key={`${p.id}-${i}`}><span className="location-number">{String(i+1).padStart(2,'0')}</span><div><strong>{p.boss || zoneName(p.zone) || regionName(p.region)}</strong><small>{regionName(p.region)}{p.boss && zoneName(p.zone) ? ` / ${zoneName(p.zone)}` : ''}</small>{p.note && <p>{selected.wiki && !p.wiki && <small>{t("旧地点备注（尚未核对）：")}</small>}{p.note}</p>}{p.wiki && <a className="wiki-source" href={p.wiki.revisionUrl} target="_blank" rel="noreferrer">{t("地点备注来源")}<ArrowUpRight size={12}/></a>}{p.legacyNote && <details className="wiki-disclosure"><summary>{t("旧地点备注")}</summary><p>{p.legacyNote}</p></details>}<span className="pixel-coords">{t("X ")}{p.x} {t(" / Y ")}{p.y}</span></div><button aria-label={t("定位地点 {{v0}}", { v0: i+1 })} disabled={!p.valid || !catalog.regions.find(r=>r.id===p.region)?.verified} onClick={()=>{select(selected,p);setMobile('map');}}><ArrowUpRight size={18}/></button>{!p.valid && <small className="location-warning">{t("坐标待核实")}</small>}</div>) : <div className="missing-location"><MapPin size={22}/><p>{t("尚无可确认的地图坐标")}</p><small>{t("保留原始资料，待后续补充。")}</small></div>}</section>
          {!!selected.related?.length && <section className="detail-section"><h3><Sparkles size={14}/>{t("相关发现")}</h3>{[...new Set(selected.related)].map(id=>catalog.records.find(e=>e.id===id)).filter((e):e is Entry=>!!e).map(e=><button className="related-item" key={e.id} onClick={()=>select(e)}><span className={e.kind}>{kindSymbols[e.kind]}</span>{e.name}<ChevronRight size={14}/></button>)}</section>}
          {!selected.image && <div className="detail-section missing-image-label">{t("原资料未提供图片")}</div>}
          <OriginalContent value={selected}/>
        </div> : <div className="detail-welcome"><span className="welcome-emblem"><Compass size={66} strokeWidth={0.8}/></span><span className="eyebrow">{t("EVERY DISCOVERY HAS A STORY")}</span><h2>{t("让好奇心")}<br/>{t("指引你的方向。")}</h2><p>{t("选择地图标记或左侧搜索结果，")}<br/>{t("展开属于它的探索档案。")}</p><div className="welcome-stats"><div><strong>04</strong><span>{t("冒险篇章")}</span></div><div><strong>20</strong><span>{t("地区地图")}</span></div><div><strong>{catalog.records.filter(e=>e.kind==='skill').length}</strong><span>{t("技能资料")}</span></div></div><div className="discovery-card"><span>{t("探索提示")}</span><h3>{t("从一个名字开始")}</h3><p>{t("搜索 Boss 或技能名称，找到它们在世界中的足迹。")}</p><ArrowUpRight size={20}/></div></div>}
        <div className="character-summary"><span className="avatar"><UserRound size={21}/></span><div><strong>{character?.name || t("你的冒险，值得记录")}</strong><small>{character ? t("已记录 {{v0}} 个技能", { v0: skillDone }) : t("创建角色，保存每一步进度")}</small></div><button aria-label={t("管理角色")} onClick={()=>setDialog({type:'characters'})}><ChevronRight size={18}/></button></div>
      </aside>
    </div>:<DataStatus error={catalogRequest.error} retry={catalogRequest.retry} progress={catalogRequest.progress}/>}
    <footer className="statusbar"><span><span className="live-dot"/>{t("探索志已就绪")}<span className="status-muted">{t("· 无需账号，本地保存")}</span></span><span>{isDesktop ? 'MAPPINGOUT DESKTOP' : 'MAPPINGOUT WEB'} <i>✦</i> {t(" FOR THE LOVE OF EXPLORATION")}</span></footer>
    {view==='atlas'&&<nav className="mobile-nav"><button className={mobile==='search'?'active':''} onClick={()=>setMobile('search')}><Search size={18}/>{t("查询")}</button><button className={mobile==='map'?'active':''} onClick={()=>setMobile('map')}><Compass size={18}/>{t("地图")}</button><button className={mobile==='detail'?'active':''} onClick={()=>setMobile('detail')}><BookOpen size={18}/>{t("档案")}</button></nav>}
    {message && <div className="toast" role="status">{displayMessage(message)}<button aria-label={t("关闭提示")} onClick={()=>setMessage('')}><X size={15}/></button></div>}
    {isDesktop && backupStatus.error && <div className="desktop-backup-error" role="alert"><span>{t("自动备份失败，记录仍保存在本机。")}</span><button onClick={() => setDialog({type:'desktop'})}>{t("查看详情")}</button></div>}
    {storageError && <div className="storage-error" role="alert">{displayMessage(storageError)}<button onClick={downloadBackup}>{t("导出备份")}</button></div>}
    <input ref={fileInput} type="file" accept="application/json,.json" aria-label={t("导入备份文件")} className="hidden" onChange={e=>importFile(e.target.files?.[0])}/>
    {dialog && <div className="modal-backdrop" onClick={()=>{if(!restoring)setDialog(null);}}><section className="modal" role="dialog" aria-modal="true" aria-label={dialog.type==='characters'?t("探索者管理"):dialog.type==='note'?t("地图笔记"):dialog.type==='report'?t("资料说明"):dialog.type==='offline'?t('离线资料准备'):dialog.type==='story'?t("剧情指南"):dialog.type==='desktop'?t("客户端设置"):dialog.type==='document'?t("资料与许可报告"):t("数据备份")} onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape'&&!restoring)setDialog(null);}}><button className="modal-close" disabled={restoring} aria-label={t("关闭弹窗")} onClick={()=>setDialog(null)}><X size={20}/></button>
      {(dialog.type==='characters'||dialog.type==='backup'||dialog.type==='note') && <JournalDialogs forms={journalForms} dialog={dialog} state={state} update={update} setDialog={setDialog} setMessage={setMessage} regionName={regionName} restoring={restoring} downloadBackup={downloadBackup} chooseBackup={chooseBackup} restore={restore}/>}
      {dialog.type==='desktop' && <Suspense fallback={<p>{t("正在读取客户端设置…")}</p>}><DesktopPanel backupStatus={backupStatus} beforeRestart={beforeRestart} preview={backup=>setDialog({type:'backup',backup})}/></Suspense>}
      {dialog.type==='document' && <Suspense fallback={<p>{t("正在读取…")}</p>}><LocalDocument url={dialog.url}/></Suspense>}
      {dialog.type==='offline' && <Suspense fallback={<p>{t("正在读取…")}</p>}><OfflinePreparation/></Suspense>}
      {dialog.type==='story' && <><StoryGuides stories={catalog?.stories || []} openQuests={campaign=>{patchFeature({view:'quests',qChapter:['prophecies','factions','nightfall','eotn'][campaign-1]||'all',quest:'',qKind:'main',qStatus:'',qRegion:'',qMode:'normal',qq:''});setDialog(null);}}/><button className="primary" onClick={()=>{patchFeature({view:'quests'});setDialog(null);}}>{t('打开完整任务攻略')}</button></>}
      {dialog.type==='report' && <><span className="eyebrow">{t("ABOUT THIS ATLAS")}</span><h2>{t("一份旧地图，一段新旅程。")}</h2><p>{t("地图与旧资料来自 MappingOut 4.00。已校订的内容附 Guild Wars Wiki 修订来源、核对范围及旧版原文；两条无法确认身份的旧记录单独标注。部分技能和装备资料仍为英文；资料对应所引用的 Wiki 修订，不代表游戏内实测。")}</p><p>{t("20 张底图已核对代表性区域地标。缺失引用、重复编号、无法确认的坐标与图片记录在转换报告中；未确认位置不会推测绘制。")}</p><p>{isDesktop ? t("地图与资料已完整安装，可以离线使用。个人记录保存在本机，请定期导出备份。") : t("访问过的资料会自动缓存。完整离线由你手动准备；浏览器清理网站数据会删除本地角色记录，请定期备份。")}</p><a className="primary full" href={assetUrl('data/report.json')} target="_blank" rel="noreferrer">{t("查看完整数据校验报告")}<ArrowUpRight size={15}/></a><a className="wiki-source" href={assetUrl('data/wiki-review.json')} target="_blank" rel="noreferrer">{t("查看 Wiki 校订覆盖报告")}<ArrowUpRight size={12}/></a><p className="muted">{t("Wiki 原创文字遵循 ")}<a href={assetUrl('licenses/gfdl-1.3.txt')}>{t("GFDL 1.3 或后续版本")}</a>{t("，每项来源提供原文与贡献历史。游戏文字与素材权利归 ArenaNet / NCSOFT 及各自权利人。感谢原作者、汉化与 Wiki 贡献者。")}</p></>}
    </section></div>}
  </div>
    {isDesktop && <DesktopUpdateProgress/>}
    {updatePrompt && <DesktopUpdatePrompt withBackup={beforeRestart}/>}
    {restarting && <div className="modal-backdrop desktop-update-backdrop"><section className="modal" role="status"><p>{updateMessage({...updateStatus, phase:'installing'})}</p></section></div>}
  </>;
}
