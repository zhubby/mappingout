import { useMemo, useState } from 'react';
import { Check, Plus, Shield, Trash2 } from 'lucide-react';
import type { ArmorCatalog, ArmorOffer, ArmorPlan, MaterialAmount } from './feature-types';
import { armorTotal, planPieces, saveArmorPlan, setArmorPiece } from './features-domain';
import { assetUrl } from './domain';
import { SourceLink } from './WikiDetails';
import { DataStatus, useFeatureData } from './feature-ui';
import type { FeatureProps } from './feature-ui';

const slots:Record<string,string>={head:'头部',chest:'身体',hands:'手部',legs:'腿部',feet:'足部'};
export const goldLabel=(gold:number)=>`${Math.floor(gold/1000)?`${Math.floor(gold/1000)} 白金 `:''}${gold%1000||!gold?' '+gold%1000+' 金币':''}`.trim();
export default function ArmorWorkshop(props:FeatureProps) {
  const {data,error,retry}=useFeatureData<ArmorCatalog>('armor.json');
  return data?<Workshop {...props} data={data}/>:<DataStatus error={error} retry={retry}/>;
}
function Workshop({data,catalog,personal,params,patch,update,manageCharacters,navigateZone}:FeatureProps&{data:ArmorCatalog}) {
  const [planName,setPlanName]=useState(''),[notice,setNotice]=useState(''),[limit,setLimit]=useState(60);
  const [pendingPieces,setPendingPieces]=useState<Record<string,boolean>>({});
  const character=personal.characters.find(c=>c.id===personal.preferences.characterId);
  const armorers=new Map(data.armorers.map(n=>[n.id,n]));
  const offerMatches=(o:ArmorOffer)=> (!params.aCampaign||o.campaign===Number(params.aCampaign))&&(!params.aRating||(o.ratingByProfession?params.aProfession?o.ratingByProfession[Number(params.aProfession)]===Number(params.aRating):Object.values(o.ratingByProfession).includes(Number(params.aRating)):o.armorRating===Number(params.aRating)));
  const results=useMemo(()=>data.sets.filter(s=>(!params.aProfession||s.profession===0||s.profession===Number(params.aProfession))&&(!params.aCategory||s.category===params.aCategory)&&data.offers.some(o=>o.armorId===s.id&&offerMatches(o))&&(!params.aq||params.aq.toLowerCase().trim().split(/\s+/).every(word=>[s.name,s.englishName,s.notes,...data.offers.filter(o=>o.armorId===s.id).map(o=>o.location+' '+armorers.get(o.armorerId)?.name)].join(' ').toLowerCase().includes(word)))),[data,params.aProfession,params.aCampaign,params.aRating,params.aCategory,params.aq]);
  const selected=data.sets.find(s=>s.id===params.armor)||results[0];
  const offers=data.offers.filter(o=>o.armorId===selected?.id);
  const offer=offers.find(o=>o.id===params.offer)||offers.find(offerMatches)||offers[0];
  const selectedIds=params.parts===undefined||params.parts==='all'?offer?.pieces.map(p=>p.id)||[]:params.parts.split(',').filter(Boolean);
  const pieces=offer?.pieces.filter(p=>selectedIds.includes(p.id))||[];
  const total=armorTotal(pieces);
  const plans=personal.armorPlans.filter(p=>p.characterId===character?.id);
  const filter=(key:string,value:string)=>{patch({[key]:value,armor:'',offer:'',parts:'all'});setLimit(60);};
  function amounts(values:MaterialAmount[]) {return values.map(a=>{const material=data.materials.find(m=>m.id===a.materialId);return <span className="material-chip" key={a.materialId} title={material?.englishName}>{material?.name||a.materialId} <b>× {a.quantity.toLocaleString()}</b></span>;});}
  async function save() {
    if(!character){manageCharacters();return;}
    if(!offer||!pieces.length)return;
    const plan:ArmorPlan={id:crypto.randomUUID(),characterId:character.id,name:planName.trim()||selected?.name||'制作计划',offerId:offer.id,pieceIds:pieces.map(p=>p.id),completedPieceIds:[]};
    if(await update(state=>saveArmorPlan(state,plan))){setNotice('制作计划已保存');setPlanName('');}
  }
  async function changePiece(plan:ArmorPlan,pieceId:string,done:boolean) {
    const key=`${plan.id}:${pieceId}`;setPendingPieces(p=>({...p,[key]:done}));
    try{await update(s=>setArmorPiece(s,plan.id,plan.characterId,pieceId,done));}
    finally{setPendingPieces(p=>{const next={...p};delete next[key];return next;});}
  }
  return <main className="feature-page armor-page">
    <header className="feature-heading"><div><span className="eyebrow">THE ARMORER’S WORKBENCH</span><h1><Shield size={25}/>护甲制作</h1><p>十职业 · 全防御等级 · {data.sets.length} 种外观 · {data.offers.length.toLocaleString()} 份制作方案</p></div><span className="feature-version">Wiki 校订资料 · 固定配方与制作费</span></header>
    <div className="feature-columns"><aside className="feature-sidebar"><label>搜索护甲或制作商<input aria-label="搜索护甲或制作商" value={params.aq||''} onChange={e=>filter('aq',e.target.value)} placeholder="外观、NPC、地点…"/></label><div className="feature-filter-grid">
      <label>职业<select aria-label="护甲职业" value={params.aProfession||''} onChange={e=>filter('aProfession',e.target.value)}><option value="">所有职业与通用</option>{catalog.professions.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>篇章<select aria-label="护甲篇章" value={params.aCampaign||''} onChange={e=>filter('aCampaign',e.target.value)}><option value="">所有篇章</option><option value="0">核心</option>{catalog.campaigns.map(c=><option key={c.id} value={c.id}>{c.shortName}</option>)}</select></label>
      <label>防御值<select aria-label="护甲防御值" value={params.aRating||''} onChange={e=>filter('aRating',e.target.value)}><option value="">所有防御值</option>{[...new Set(data.offers.map(o=>o.armorRating))].sort((a,b)=>a-b).map(n=><option key={n}>{n}</option>)}</select></label>
      <label>类别<select aria-label="护甲类别" value={params.aCategory||''} onChange={e=>filter('aCategory',e.target.value)}><option value="">所有类型</option><option value="basic">普通护甲</option><option value="elite">精英护甲</option><option value="special">特殊／独立部位</option></select></label></div>
      <p className="muted">{results.length} 个结果</p><div className="armor-results">{results.slice(0,limit).map(s=><button key={s.id} className={`armor-result ${s.id===selected?.id?'active':''}`} onClick={()=>{patch({armor:s.id,offer:'',parts:data.offers.find(o=>o.armorId===s.id&&offerMatches(o))?.pieces.map(p=>p.id).join(',')||''});setNotice('');}}><strong>{s.name}</strong><small lang="en">{s.englishName}</small></button>)}{!results.length&&<p className="empty-state">没有符合条件的护甲。</p>}{results.length>limit&&<button className="quiet full" onClick={()=>setLimit(n=>n+60)}>显示更多</button>}</div>
    </aside><section className="feature-content">
      {selected&&offer?<article className="armor-detail"><div className="feature-title"><h2>{selected.name}</h2><p className="english-name" lang="en">{selected.englishName}</p></div><div className="armor-overview"><div className="armor-previews">{(['female','male'] as const).map(sex=><figure key={sex}>{selected.images[sex]?<img src={assetUrl(selected.images[sex]!)} alt={`${selected.englishName} ${sex==='male'?'男性':'女性'}外观`} loading="lazy"/>:<div className="missing-preview">暂无{sex==='male'?'男性':'女性'}图片</div>}<figcaption>{sex==='male'?'男性外观':'女性外观'}</figcaption></figure>)}</div><div className="armor-recipe"><label>制作地点与防御等级<select aria-label="护甲制作方案" value={offer.id} onChange={e=>{const next=offers.find(o=>o.id===e.target.value)!;patch({offer:next.id,armor:selected.id,parts:next.pieces.map(p=>p.id).join(',')});}}>{offers.map(o=><option value={o.id} key={o.id}>{o.location} · {armorers.get(o.armorerId)?.name} · AR {o.ratingByProfession?'60–80（依职业）':o.armorRating}</option>)}</select></label><p>制作商：<strong>{armorers.get(offer.armorerId)?.name}</strong></p>{offer.zoneId&&<button className="quiet" onClick={()=>navigateZone(offer.zoneId!)}>查看制作区域 →</button>}<details className="wiki-disclosure"><summary>制作条件与说明（含英文）</summary><p className="source-text" lang="en">{offer.notes}</p><p className="source-text" lang="en">{armorers.get(offer.armorerId)?.notes}</p></details>
      <div className="piece-heading"><h3>选择制作部位</h3><button className="quiet" onClick={()=>patch({parts:pieces.length===offer.pieces.length?'':offer.pieces.map(p=>p.id).join(',')})}>{pieces.length===offer.pieces.length?'取消全选':'全选'}</button></div><div className="armor-pieces">{offer.pieces.map(piece=><label className="armor-piece" key={piece.id}><input type="checkbox" aria-label={`制作${slots[piece.slot]}`} checked={selectedIds.includes(piece.id)} onChange={e=>patch({parts:(e.target.checked?[...selectedIds,piece.id]:selectedIds.filter(id=>id!==piece.id)).join(',')})}/><span><strong>{slots[piece.slot]} <small>{piece.name}</small></strong><span className="material-list">{amounts(piece.materials)}</span></span><span className="piece-gold">{goldLabel(piece.gold)}</span></label>)}</div></div></div>
      <section className="craft-total"><div><h3>所选 {pieces.length} 个部位</h3><strong data-testid="armor-gold">{goldLabel(total.gold)}</strong></div><div className="material-list" data-testid="armor-materials">{amounts(total.materials)}</div><p className="muted">仅含材料数量与 NPC 固定制作费；不包含材料购买价、符文、徽记或染料。</p><div className="plan-save"><input aria-label="制作计划名称" maxLength={100} value={planName} onChange={e=>setPlanName(e.target.value)} placeholder="给制作计划起个名字（可选）"/><button className="primary" disabled={!pieces.length} onClick={save}><Plus size={16}/>{character?'保存制作计划':'创建角色以保存'}</button></div>{notice&&<p role="status">{notice}</p>}</section>
      <div className="feature-sources"><SourceLink reference={selected.reference}/>{data.references.find(r=>r.title==='Armorer')&&<SourceLink reference={data.references.find(r=>r.title==='Armorer')!}/>}{armorers.get(offer.armorerId)&&<SourceLink reference={armorers.get(offer.armorerId)!.reference}/>}</div></article>:<p>没有可用的制作方案。</p>}
      <section className="saved-plans"><h2>{character?.name||'角色'}的制作计划 <span>{plans.length}</span></h2>{!plans.length&&<p className="muted">保存计划后，可在这里逐件记录制作进度。</p>}{plans.map(plan=>{const savedOffer=data.offers.find(o=>o.id===plan.offerId),set=data.sets.find(s=>s.id===savedOffer?.armorId);return <article className="saved-plan" key={plan.id}><div className="saved-plan-heading"><button className="quiet" onClick={()=>savedOffer&&patch({armor:savedOffer.armorId,offer:savedOffer.id,parts:plan.pieceIds.join(',')})}><strong>{plan.name}</strong></button><button aria-label={`删除制作计划 ${plan.name}`} onClick={()=>update(s=>({...s,armorPlans:s.armorPlans.filter(p=>p.id!==plan.id)}))}><Trash2 size={16}/></button></div><p className="muted">{set?.englishName||plan.offerId} · {savedOffer?.location}</p>{savedOffer?<><div className="plan-checks">{planPieces(plan,savedOffer).map(piece=><label key={piece.id}><input type="checkbox" aria-label={`${plan.name} ${slots[piece.slot]}已制作`} checked={pendingPieces[`${plan.id}:${piece.id}`]??plan.completedPieceIds.includes(piece.id)} disabled={pendingPieces[`${plan.id}:${piece.id}`]!==undefined} onChange={e=>void changePiece(plan,piece.id,e.target.checked)}/>{slots[piece.slot]} {plan.completedPieceIds.includes(piece.id)&&<Check size={12}/>}</label>)}</div><p>整份计划：{goldLabel(armorTotal(planPieces(plan,savedOffer)).gold)}</p><div className="material-list">{amounts(armorTotal(planPieces(plan,savedOffer)).materials)}</div><p className="remaining-total">剩余 {planPieces(plan,savedOffer,true).length} 个部位 · {goldLabel(armorTotal(planPieces(plan,savedOffer,true)).gold)}</p><div className="material-list">{amounts(armorTotal(planPieces(plan,savedOffer,true)).materials)}</div></>:<p>此计划的制作方案已变更，原始记录仍保留在备份中。</p>}</article>;})}</section>
    </section></div></main>;
}
