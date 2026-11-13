import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, ArrowUpRight, BookOpen, Check, ChevronDown, ChevronRight, Compass, Download, Filter, Layers, MapPin, Menu, Pencil, Plus, Search, Shield, SlidersHorizontal, Sparkles, Trash2, UserRound, Users, X } from 'lucide-react';
import { AtlasMap } from './AtlasMap';
import { StoryGuides, WikiDetails } from './WikiDetails';
import { assetUrl, completed, deleteCharacter, filtersSearch, normalizeFilters, preferredPlace, query, readFilters, setProgress, trackable } from './domain';
import { emptyPersonal, makeBackup, parseBackup, personalStore } from './storage';
import { kindNames, kindSymbols } from './types';
import type { Backup, Catalog, Entry, Filters, Kind, Note, Personal, Place } from './types';

const kinds = Object.keys(kindNames) as Kind[];
type Dialog = { type: 'characters' } | { type: 'backup'; backup?: Backup } | { type: 'note'; note: Note } | { type: 'report' } | { type: 'story' } | null;
function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export default function App() {
  const [catalog,setCatalog] = useState<Catalog>(), [state,setState] = useState<Personal>(emptyPersonal), [ready,setReady] = useState(false), [fatal,setFatal] = useState('');
  const [filters,setFilters] = useState<Filters>(() => readFilters(location.search)), [dialog,setDialog] = useState<Dialog>(null), [message,setMessage] = useState('');
  const [focus,setFocus] = useState<Place>(), [focusKey,setFocusKey] = useState(0), [noteMode,setNoteMode] = useState(false), [mobile,setMobile] = useState<'map'|'search'|'detail'>('map'), [limit,setLimit] = useState(60), [characterName,setCharacterName] = useState(''), [renaming,setRenaming] = useState(''), [treasureDate,setTreasureDate] = useState(today), [storageError,setStorageError] = useState('');
  const writeQueue = useRef(Promise.resolve()), stateRef = useRef(state), fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let live = true;
    const refresh = () => {
      const pending = writeQueue.current.then(async () => {
        const saved = await personalStore.load();
        if (live) { stateRef.current = saved; setState(saved); }
      });
      writeQueue.current = pending.catch(e => { if (live) setStorageError(`读取本地记录失败：${e.message}`); });
      return pending;
    };
    const loaded = refresh();
    Promise.all([fetch(assetUrl('data/catalog.json')).then(r => { if (!r.ok) throw Error('资料加载失败'); return r.json(); }), loaded]).then(([c]) => { if (live) { setCatalog(c); setReady(true); } }).catch(e => { if (live) setFatal(`无法加载地图资料或本地存储：${e.message}`); });
    const onChange = () => { void refresh().catch(() => {}); };
    const onVisible = () => { if (document.visibilityState === 'visible') onChange(); };
    const unsubscribe = personalStore.subscribe(onChange);
    window.addEventListener('focus', onChange);
    document.addEventListener('visibilitychange', onVisible);
    return () => { live = false; unsubscribe(); window.removeEventListener('focus', onChange); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  useEffect(() => { const pop = () => { setFilters(readFilters(location.search)); setFocus(undefined); }; window.addEventListener('popstate',pop); return () => window.removeEventListener('popstate',pop); }, []);
  useEffect(() => { history.replaceState(null,'',`${location.pathname}${filtersSearch(filters)}`); setLimit(60); }, [filters]);
  useEffect(() => { if (!message) return; const t = setTimeout(() => setMessage(''),4500); return () => clearTimeout(t); }, [message]);
  const update = (fn: (s: Personal) => Personal) => {
    const saved = writeQueue.current.then(() => personalStore.update(fn)).then(next => {
      stateRef.current = next; setState(next); setStorageError(''); return true;
    }, e => { setStorageError(`操作未保存，请重试：${e.message}`); return false; });
    writeQueue.current = saved.then(() => {});
    return saved;
  };
  const patch = useCallback((v: Partial<Filters>) => setFilters(f => normalizeFilters({ ...f,...v })), []);
  const records = useMemo(() => catalog ? query(catalog,filters,state) : [],[catalog,filters,state]);
  const region = catalog?.regions.find(r => r.id === filters.map) || catalog?.regions[0];
  const selected = catalog?.records.find(e => e.id === filters.selected);
  useEffect(() => { setTreasureDate(completed(stateRef.current, filters.selected)?.date || today()); }, [filters.selected, state.preferences.characterId]);
  const select = useCallback((entry: Entry, place?: Place) => {
    const p = place || preferredPlace(entry, filters);
    setFilters(f => ({ ...f, selected: entry.id, ...(p ? { map: p.region } : {}) })); setFocus(p); setFocusKey(k => k+1); setMobile('detail');
  }, [filters]);
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
  const skillDone = catalog?.records.filter(e => e.kind === 'skill' && completed(state,e.id)?.done).length || 0;
  const campaignRegions = catalog?.regions.filter(r => !filters.campaign || r.campaign === Number(filters.campaign)) || [];
  const zones = catalog?.records.filter(e => e.kind === 'zone' && (!filters.campaign || e.campaign === Number(filters.campaign)) && (!filters.region || e.locations.some(l => l.region === filters.region))) || [];
  const attrs = [...new Set(catalog?.records.filter(e => e.kind === 'skill' && (!filters.profession || e.profession === Number(filters.profession))).map(e => e.attribute).filter(Boolean))].sort() as string[];
  const regionName = (id: string) => catalog?.regions.find(r => r.id === id)?.name || '未知地区';
  const zoneName = (id?: string) => catalog?.records.find(e => e.id === `zone:${id}`)?.name;
  const toggle = (e: Entry) => { if (!character) { setDialog({type:'characters'}); return; } const done = !completed(state,e.id)?.done; if (e.kind==='treasure' && done && (!treasureDate || treasureDate>today())) { setMessage('请选择有效的开启日期'); return; } void update(s => setProgress(s,e.id,character.id,done,e.kind === 'treasure' ? treasureDate : undefined)); };
  function downloadBackup() {
    const blob = new Blob([JSON.stringify(makeBackup(stateRef.current),null,2)],{type:'application/json'}), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href=url; a.download=`mappingout-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); setMessage('备份已导出');
  }
  async function importFile(file?: File) {
    if (!file) return;
    try { if (file.size > 20_000_000) throw Error('备份超过 20 MB'); const backup = parseBackup(await file.text()); setDialog({type:'backup',backup}); }
    catch(e) { setMessage((e as Error).message); }
    if (fileInput.current) fileInput.current.value='';
  }
  async function restore(backup: Backup) {
    if (await update(() => backup.data)) { setDialog(null); setMessage('备份已恢复'); }
    else setMessage('恢复失败，原有数据未替换。');
  }
  async function saveCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = characterName.trim();
    if (!name || name.length > 60) { setMessage('请输入 1–60 字的角色名'); return; }
    const id = renaming || crypto.randomUUID();
    const saved = await update(s => {
      if (s.characters.some(c => c.name === name && c.id !== renaming)) throw new Error('角色名已存在');
      if (renaming && !s.characters.some(c => c.id === id)) throw new Error('此角色已在其他页面删除。');
      return { ...s, characters: renaming ? s.characters.map(c => c.id === id ? { ...c, name } : c) : [...s.characters, { id, name }], preferences: { ...s.preferences, characterId: id } };
    });
    if (saved) { setCharacterName(''); setRenaming(''); setMessage('角色已保存'); }
  }
  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dialog?.type !== 'note') return;
    const note = { ...dialog.note, text: dialog.note.text.trim() };
    if (!note.text) return;
    if (await update(s => ({ ...s, notes: [...s.notes.filter(n => n.id !== note.id), note] }))) { setDialog(null); setMessage('地图笔记已保存'); }
  }
  if (fatal) return <main className="loading"><Compass size={42}/><h1>无法打开探索志</h1><p role="alert">{fatal}</p><button onClick={() => location.reload()}>重新加载</button></main>;
  if (!ready || !catalog || !region) return <main className="loading"><Compass size={44}/><h1>正在展开泰瑞亚地图…</h1><p>读取本地资料与角色记录</p></main>;
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href={import.meta.env.BASE_URL}><span className="brand-mark"><Compass size={28} strokeWidth={1.3}/></span><span><strong>MAPPING<span>OUT</span></strong><small>泰瑞亚探索志</small></span></a><div className="top-divider"/><div className="top-title"><span>GUILD WARS</span><span>你的下一段冒险，从这里开始。</span></div><nav>{!!catalog.stories?.length && <button className="quiet" onClick={() => setDialog({type:'story'})}><BookOpen size={16}/><span>剧情指南</span></button>}<span className="local-status"><span className="live-dot"/>本地资料库</span><button className="quiet" onClick={() => setDialog({type:'backup'})}><Download size={16}/><span>数据备份</span></button><button className="character-button" onClick={() => setDialog({type:'characters'})}><UserRound size={16}/>{character?.name || '创建探索者'}<ChevronDown size={13}/></button></nav></header>
    <div className="workspace">
      <aside className={`search-panel ${mobile === 'search' ? 'mobile-visible' : ''}`}>
        <div className="panel-intro"><span className="eyebrow">THE EXPLORER'S COMPANION</span><h1>探索未知，<br/><span>收藏每一次发现。</span></h1><p>穿越四大篇章，重访泰瑞亚的每个角落。</p></div>
        <div className="search-box"><Search size={17}/><input aria-label="搜索资料" placeholder="技能、Boss、装备或地点…" value={filters.q} onChange={e => patch({q:e.target.value})}/>{filters.q && <button aria-label="清空搜索" onClick={() => patch({q:''})}><X size={14}/></button>}<kbd>⌕</kbd></div>
        <div className="kind-tabs" aria-label="资料类型"><button className={!filters.kind ? 'active' : ''} onClick={() => patch({kind:''})}>全部</button>{kinds.map(k => <button key={k} className={`${filters.kind === k ? 'active' : ''} tab-${k}`} onClick={() => patch({kind:k})}>{kindNames[k]}</button>)}</div>
        <div className="filters"><div className="section-label"><SlidersHorizontal size={13}/><span>筛选探索目标</span><button onClick={() => setFilters(f => ({...f,q:'',campaign:'',region:'',zone:'',profession:'',attribute:'',incomplete:false}))}>重置</button></div>
          <div className="filter-grid"><label>篇章<select aria-label="篇章筛选" value={filters.campaign} onChange={e => patch({campaign:e.target.value,region:'',zone:''})}><option value="">所有篇章</option>{catalog.campaigns.map(c => <option key={c.id} value={c.id}>{c.shortName}</option>)}</select></label><label>地区<select aria-label="地区筛选" value={filters.region} onChange={e => patch({region:e.target.value,zone:'',...(e.target.value ? {map:e.target.value} : {})})}><option value="">所有地区</option>{campaignRegions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <label>区域<select aria-label="区域筛选" value={filters.zone} onChange={e => patch({zone:e.target.value})}><option value="">所有区域</option>{zones.map(z => <option key={z.id} value={`${z.campaign}:${Number(z.code)}`}>{z.name}</option>)}</select></label>{(!filters.kind || filters.kind === 'skill' || filters.kind === 'boss') && <label>职业<select aria-label="职业筛选" value={filters.profession} onChange={e => patch({profession:e.target.value,attribute:''})}><option value="">所有职业</option>{catalog.professions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}</div>
          {(!filters.kind || filters.kind === 'skill') && <label className="attribute-filter">技能属性<select aria-label="技能属性筛选" value={filters.attribute} onChange={e => patch({attribute:e.target.value})}><option value="">所有属性</option>{attrs.map(a => <option key={a}>{a}</option>)}</select></label>}
          <label className="checkbox-label"><input type="checkbox" checked={filters.incomplete} onChange={e => patch({incomplete:e.target.checked})}/><span>仅显示可追踪的未完成目标</span></label>
        </div>
        <div className="result-heading"><span><b>{records.length.toLocaleString()}</b> 个探索目标</span><span>名称 / 地点</span></div>
        <div className="results" data-testid="results">{records.slice(0,limit).map(e => <button key={e.id} className={`result ${selected?.id === e.id ? 'selected' : ''}`} onClick={() => select(e)}><span className={`entry-icon ${e.kind}`}>{e.image ? <img src={assetUrl(e.image)} alt="" loading="lazy"/> : kindSymbols[e.kind]}</span><span className="result-copy"><strong>{e.name}</strong><small>{e.attribute || kindNames[e.kind]}<i>·</i>{e.locations.some(p=>p.valid) ? `${e.locations.filter(p=>p.valid).length} 个可定位地点` : '暂无确认坐标'}</small></span>{completed(state,e.id)?.done ? <Check className="done-icon" size={15}/> : <ChevronRight size={14}/>}</button>)}{!records.length && <div className="empty-state"><Search size={28}/><h3>还没有找到目标</h3><p>试试其他关键词，或减少筛选条件。</p></div>}{records.length>limit && <button className="load-more" onClick={() => setLimit(n=>n+60)}>显示更多目标（剩余 {records.length-limit}）</button>}</div>
        <div className="search-footer"><BookOpen size={13}/><span>源自 MappingOut 4.00</span><button onClick={() => setDialog({type:'report'})}>资料说明<ArrowUpRight size={12}/></button></div>
      </aside>
      <main className={`map-panel ${mobile === 'map' ? 'mobile-visible' : ''}`}>
        <div className="map-toolbar"><div className="breadcrumb"><Compass size={16}/><span>世界地图</span><ChevronRight size={13}/><select aria-label="地图地区" value={region.id} onChange={e => { patch({map:e.target.value}); setFocus(undefined); }}>{catalog.campaigns.map(c => <optgroup key={c.id} label={c.shortName}>{catalog.regions.filter(r => r.campaign===c.id).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>)}</select></div><button className={noteMode ? 'quiet accent' : 'quiet'} onClick={() => { if (!character) setDialog({type:'characters'}); else setNoteMode(v=>!v); }}><Plus size={15}/>{noteMode ? '取消标注' : '添加笔记'}</button></div>
        <AtlasMap region={region} entries={mapEntries} selected={selected} focus={focus} focusKey={focusKey} notes={notes} onSelect={select} onEditNote={editNote} noteMode={noteMode} onNote={(x,y) => { if (x<0 || y<0 || x>region.width || y>region.height) { setMessage('请在地图图片范围内添加笔记'); return; } setNoteMode(false); setDialog({type:'note',note:{id:crypto.randomUUID(),characterId:state.preferences.characterId,region:region.id,x,y,text:''}}); }}/>
        <div className="map-bottom"><div className="legend-title"><Layers size={15}/><span>地图图层</span></div><div className="legend-items">{kinds.map(k => <button key={k} className={`${k} ${state.preferences.layers.includes(k) ? 'enabled' : ''}`} aria-pressed={state.preferences.layers.includes(k)} onClick={() => update(s => ({...s,preferences:{...s.preferences,layers:s.preferences.layers.includes(k) ? s.preferences.layers.filter(v=>v!==k) : [...s.preferences.layers,k]}}))}><span>{kindSymbols[k]}</span>{kindNames[k]}</button>)}</div><small>仅显示当前查询结果</small></div>
      </main>
      <aside className={`detail-panel ${mobile === 'detail' ? 'mobile-visible' : ''}`}>
        <div className="detail-top"><span className="section-label"><MapPin size={14}/>探索档案</span><span className="edition">FIELD NOTES / 01</span></div>
        {selected ? <div className="detail-scroll" key={selected.id}><div className={`detail-hero ${selected.kind}`}><span className="eyebrow">{kindNames[selected.kind]} / {catalog.campaigns.find(c=>c.id===selected.campaign)?.shortName || '核心资料'}</span><div className="detail-title-row"><span className={`entry-icon large ${selected.kind}`}>{selected.image ? <img src={assetUrl(selected.image)} alt={selected.name}/> : kindSymbols[selected.kind]}</span><h2>{selected.name}</h2></div>{!!selected.profession && <span className="profession-tag">{catalog.professions.find(p=>p.id===selected.profession)?.name} {selected.attribute && ` / ${selected.attribute}`}</span>}</div>
          <section className="detail-section"><h3><BookOpen size={14}/>{selected.kind === 'collector' ? '所在位置与兑换' : selected.kind === 'green' ? '装备资料' : '资料概览'}</h3>{selected.englishName && <p className="english-name" lang="en">{selected.englishName}</p>}{selected.wiki && <span className="wiki-badge">{selected.wiki.identityStatus === 'unresolved' ? 'Wiki 来源审查 · 身份待核实' : `Wiki 核对 · ${selected.descriptionLanguage === 'en' ? '英文原文' : selected.kind === 'skill' ? '中文校订' : '中文整理 · 含英文资料'}`}{selected.skill?.pvp ? ' · PvE 版本' : ''}</span>}<p className="description" lang={selected.descriptionLanguage}>{selected.description || '暂无额外说明'}</p>{selected.details.map((d,i)=><p className="detail-stat" key={i}>{d}</p>)}</section>
          <WikiDetails entry={selected}/>
          {trackable(selected) && <section className="progress-section"><h3><Shield size={15}/>角色进度 <span>{character?.name || '尚未创建角色'}</span></h3>{selected.kind==='treasure' && <label className="date-label">开启日期<input aria-label="宝藏开启日期" type="date" value={treasureDate} max={today()} onChange={e=>setTreasureDate(e.target.value)}/></label>}<button className={`primary full ${completed(state,selected.id)?.done ? 'completed' : ''}`} onClick={()=>toggle(selected)}>{completed(state,selected.id)?.done ? <Check size={16}/> : <Plus size={16}/>}{completed(state,selected.id)?.done ? '已完成 · 点击撤销' : selected.kind==='skill' ? (selected.skill?.capturable === false ? '标记已学会' : '标记已捕获') : selected.kind==='zone' ? '标记已清剿' : '标记已开启'}</button>{completed(state,selected.id)?.date && <small>上次开启：{completed(state,selected.id)?.date}</small>}</section>}
          <section className="detail-section locations"><h3><MapPin size={14}/>发现地点<span>{selected.locations.length}</span></h3>{selected.locations.length ? selected.locations.map((p,i)=><div className="location-card" key={`${p.id}-${i}`}><span className="location-number">{String(i+1).padStart(2,'0')}</span><div><strong>{p.boss || zoneName(p.zone) || regionName(p.region)}</strong><small>{regionName(p.region)}{p.boss && zoneName(p.zone) ? ` / ${zoneName(p.zone)}` : ''}</small>{p.note && <p>{selected.wiki && !p.wiki && <small>旧地点备注（尚未核对）：</small>}{p.note}</p>}{p.wiki && <a className="wiki-source" href={p.wiki.revisionUrl} target="_blank" rel="noreferrer">地点备注来源<ArrowUpRight size={12}/></a>}{p.legacyNote && <details className="wiki-disclosure"><summary>旧地点备注</summary><p>{p.legacyNote}</p></details>}<span className="pixel-coords">X {p.x} / Y {p.y}</span></div><button aria-label={`定位地点 ${i+1}`} disabled={!p.valid || !catalog.regions.find(r=>r.id===p.region)?.verified} onClick={()=>{select(selected,p);setMobile('map');}}><ArrowUpRight size={18}/></button>{!p.valid && <small className="location-warning">坐标待核实</small>}</div>) : <div className="missing-location"><MapPin size={22}/><p>尚无可确认的地图坐标</p><small>保留原始资料，待后续补充。</small></div>}</section>
          {!!selected.related?.length && <section className="detail-section"><h3><Sparkles size={14}/>相关发现</h3>{[...new Set(selected.related)].map(id=>catalog.records.find(e=>e.id===id)).filter((e):e is Entry=>!!e).map(e=><button className="related-item" key={e.id} onClick={()=>select(e)}><span className={e.kind}>{kindSymbols[e.kind]}</span>{e.name}<ChevronRight size={14}/></button>)}</section>}
          {!selected.image && <div className="detail-section missing-image-label">原资料未提供图片</div>}
          <div className="provenance">原始编号 {selected.code || '—'}<br/>{selected.source.file.split('/').pop()} · 第 {selected.source.line} 行</div>
        </div> : <div className="detail-welcome"><span className="welcome-emblem"><Compass size={66} strokeWidth={0.8}/></span><span className="eyebrow">EVERY DISCOVERY HAS A STORY</span><h2>让好奇心<br/>指引你的方向。</h2><p>选择地图标记或左侧搜索结果，<br/>展开属于它的探索档案。</p><div className="welcome-stats"><div><strong>04</strong><span>冒险篇章</span></div><div><strong>20</strong><span>地区地图</span></div><div><strong>{catalog.records.filter(e=>e.kind==='skill').length}</strong><span>技能资料</span></div></div><div className="discovery-card"><span>探索提示</span><h3>从一个名字开始</h3><p>搜索 Boss 或技能名称，找到它们在世界中的足迹。</p><ArrowUpRight size={20}/></div></div>}
        <div className="character-summary"><span className="avatar"><UserRound size={21}/></span><div><strong>{character?.name || '你的冒险，值得记录'}</strong><small>{character ? `已记录 ${skillDone} 个技能` : '创建角色，保存每一步进度'}</small></div><button aria-label="管理角色" onClick={()=>setDialog({type:'characters'})}><ChevronRight size={18}/></button></div>
      </aside>
    </div>
    <footer className="statusbar"><span><span className="live-dot"/>探索志已就绪<span className="status-muted">· 无需账号，本地保存</span></span><span>MAPPINGOUT WEB <i>✦</i> FOR THE LOVE OF EXPLORATION</span></footer>
    <nav className="mobile-nav"><button className={mobile==='search'?'active':''} onClick={()=>setMobile('search')}><Search size={18}/>查询</button><button className={mobile==='map'?'active':''} onClick={()=>setMobile('map')}><Compass size={18}/>地图</button><button className={mobile==='detail'?'active':''} onClick={()=>setMobile('detail')}><BookOpen size={18}/>档案</button></nav>
    {message && <div className="toast" role="status">{message}<button aria-label="关闭提示" onClick={()=>setMessage('')}><X size={15}/></button></div>}
    {storageError && <div className="storage-error" role="alert">{storageError}<button onClick={downloadBackup}>导出备份</button></div>}
    <input ref={fileInput} type="file" accept="application/json,.json" aria-label="导入备份文件" className="hidden" onChange={e=>importFile(e.target.files?.[0])}/>
    {dialog && <div className="modal-backdrop" onClick={()=>setDialog(null)}><section className="modal" role="dialog" aria-modal="true" aria-label={dialog.type==='characters'?'探索者管理':dialog.type==='note'?'地图笔记':dialog.type==='report'?'资料说明':dialog.type==='story'?'剧情指南':'数据备份'} onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')setDialog(null);}}><button className="modal-close" aria-label="关闭弹窗" onClick={()=>setDialog(null)}><X size={20}/></button>
      {dialog.type==='characters' && <><span className="eyebrow">YOUR ADVENTURE, YOUR STORY</span><h2>探索者管理</h2><p>每位角色拥有独立的技能、区域、宝藏进度与笔记。</p><div className="character-list">{state.characters.map(c=><div key={c.id}><button className={c.id===state.preferences.characterId?'active':''} onClick={()=>update(s=>({...s,preferences:{...s.preferences,characterId:c.id}}))}><UserRound size={17}/>{c.name}{c.id===state.preferences.characterId && <Check size={15}/>}</button><button aria-label={`重命名 ${c.name}`} onClick={()=>{setRenaming(c.id);setCharacterName(c.name);}}><Pencil size={15}/></button><button aria-label={`删除 ${c.name}`} onClick={()=>{if(window.confirm(`删除「${c.name}」及其全部进度和笔记？`))update(s=>deleteCharacter(s,c.id));}}><Trash2 size={15}/></button></div>)}</div><form onSubmit={saveCharacter}><label>{renaming?'修改角色名':'新建角色'}<input autoFocus aria-label="角色名" maxLength={60} value={characterName} onChange={e=>setCharacterName(e.target.value)} placeholder="输入角色名称" required/></label><button className="primary full" type="submit"><Plus size={16}/>{renaming?'保存名称':'创建探索者'}</button>{renaming&&<button type="button" className="quiet" onClick={()=>{setRenaming('');setCharacterName('');}}>取消重命名</button>}</form></>}
      {dialog.type==='backup' && <><span className="eyebrow">KEEP YOUR MEMORIES SAFE</span><h2>数据备份</h2>{dialog.backup ? <><p>已校验备份（{new Date(dialog.backup.exportedAt).toLocaleString('zh-CN')}）</p><div className="backup-summary"><span>{dialog.backup.data.characters.length} 位角色</span><span>{dialog.backup.data.progress.length} 条进度</span><span>{dialog.backup.data.notes.length} 条笔记</span></div><p className="warning">恢复会整体替换当前浏览器中的个人数据。建议先导出当前备份。</p><button className="quiet full" onClick={downloadBackup}>先导出当前数据</button><button className="primary full" onClick={()=>restore(dialog.backup!)}>确认替换并恢复</button></> : <><p>角色与进度保存在当前浏览器。导出 JSON 文件，可在其他浏览器恢复。</p><button className="backup-action" onClick={downloadBackup}><ArrowDownToLine size={23}/><span><strong>导出个人数据</strong><small>{state.characters.length} 位角色 · {state.notes.length} 条笔记</small></span><ChevronRight size={18}/></button><button className="backup-action" onClick={()=>fileInput.current?.click()}><ArrowUpFromLine size={23}/><span><strong>从备份恢复</strong><small>先校验与预览，再确认替换</small></span><ChevronRight size={18}/></button></>}</>}
      {dialog.type==='note' && <><span className="eyebrow">A NOTE TO YOUR FUTURE SELF</span><h2>地图笔记</h2><p>{regionName(dialog.note.region)} · X {dialog.note.x} / Y {dialog.note.y}</p><form onSubmit={saveNote}><textarea autoFocus aria-label="笔记内容" required maxLength={2000} placeholder="记录路线、发现或下次冒险的计划…" value={dialog.note.text} onChange={e=>setDialog({...dialog,note:{...dialog.note,text:e.target.value}})}/><button className="primary full" type="submit">保存笔记</button>{state.notes.some(n=>n.id===dialog.note.id)&&<button className="danger full" type="button" onClick={()=>{update(s=>({...s,notes:s.notes.filter(n=>n.id!==dialog.note.id)}));setDialog(null);}}>删除笔记</button>}</form></>}
      {dialog.type==='story' && <StoryGuides stories={catalog.stories || []}/>}
      {dialog.type==='report' && <><span className="eyebrow">ABOUT THIS ATLAS</span><h2>一份旧地图，一段新旅程。</h2><p>地图与旧资料来自 MappingOut 4.00。已校订的内容附 Guild Wars Wiki 修订来源、核对范围及旧版原文；两条无法确认身份的旧记录单独标注。部分技能和装备资料仍为英文；资料对应所引用的 Wiki 修订，不代表游戏内实测。</p><p>20 张底图已核对代表性区域地标。缺失引用、重复编号、无法确认的坐标与图片记录在转换报告中；未确认位置不会推测绘制。</p><p>图片只在访问时缓存。离线前请先访问需要的地图；浏览器清理网站数据会删除本地角色记录，请定期备份。</p><a className="primary full" href={assetUrl('data/report.json')} target="_blank" rel="noreferrer">查看完整数据校验报告<ArrowUpRight size={15}/></a><a className="wiki-source" href={assetUrl('data/wiki-review.json')} target="_blank" rel="noreferrer">查看 Wiki 校订覆盖报告<ArrowUpRight size={12}/></a><p className="muted">Wiki 原创文字遵循 <a href={assetUrl('licenses/gfdl-1.3.txt')}>GFDL 1.3 或后续版本</a>，每项来源提供原文与贡献历史。游戏文字与素材权利归 ArenaNet / NCSOFT 及各自权利人。感谢原作者、汉化与 Wiki 贡献者。</p></>}
    </section></div>}
  </div>;
}
