/**
 * [INPUT]: 依赖护甲资料、职业图标、个人计划、菜单与翻译来源说明。
 * [OUTPUT]: 提供护甲界面与按护甲分组的配方检索索引。
 * [POS]: 护甲视图；个人记录由 App 的写入队列保存。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import TranslationNotice from '../../shared/ui/TranslationNotice';
import { t, getLocale } from '../../i18n';
import { useMemo, useState } from 'react';
import { Check, Plus, Shield, Trash2 } from 'lucide-react';
import type { ArmorCatalog, ArmorOffer, ArmorPlan, MaterialAmount } from '../../shared/contracts/armor';
import type { Catalog } from '../../shared/contracts/catalog';
import { armorTotal, planPieces, saveArmorPlan, setArmorPiece } from './domain';
import { assetUrl } from '../../shared/content/assetUrl';
import { OriginalContent, SourceLink } from '../../shared/ui/WikiDetails';
import { DataStatus } from '../../shared/ui/DataStatus';
import { useFeatureData } from '../../shared/content/useFeatureData';
import type { FeatureProps } from '../../shared/contracts/feature';
import Select from '../../shared/ui/Select';
import { professionById } from '../../shared/game/professions';
import { randomUUID } from '../../shared/browserCrypto';

type CatalogFeatureProps=Omit<FeatureProps,'catalog'>&{catalog:Catalog};
const slots:Record<string,string>={get head() { return t("头部"); },get chest() { return t("身体"); },get hands() { return t("手部"); },get legs() { return t("腿部"); },get feet() { return t("足部"); }};
export const goldLabel=(gold:number)=>`${Math.floor(gold/1000)?t("{{v0}} 白金 ", { v0: Math.floor(gold/1000) }):''}${gold%1000||!gold?' '+gold%1000+t(" 金币"):''}`.trim();
export function createArmorIndex(data:ArmorCatalog) {
  const armorersById=new Map(data.armorers.map(armorer=>[armorer.id,armorer]));
  const offersByArmor=new Map<string,ArmorOffer[]>();
  for(const offer of data.offers){
    const offers=offersByArmor.get(offer.armorId)||[];
    offers.push(offer);
    offersByArmor.set(offer.armorId,offers);
  }
  const searchTextByArmor=new Map(data.sets.map(set=>{
    const offers=offersByArmor.get(set.id)||[];
    const text=[set.name,set.englishName,set.searchAliases?.join(' '),set.notes,...offers.map(offer=>`${offer.location} ${armorersById.get(offer.armorerId)?.name||''}`)].join(' ').toLowerCase();
    return [set.id,text] as const;
  }));
  return {armorersById,offersByArmor,searchTextByArmor};
}
function ProfessionIcon({id}:{id:number}) {
  const profession=professionById.get(id);
  return profession?<img className="armor-profession-icon" src={profession.icon} title={profession.name} alt="" aria-hidden="true"/>:<Shield className="armor-profession-icon armor-common-icon" aria-hidden="true"/>;
}
export default function ArmorWorkshop(props:CatalogFeatureProps) {
  const {data,error,progress,retry}=useFeatureData<ArmorCatalog>('armor.json');
  return data?<Workshop {...props} data={data}/>:<DataStatus error={error} retry={retry} progress={progress}/>;
}
function Workshop({data,catalog,personal,params,patch,update,manageCharacters,navigateZone}:CatalogFeatureProps&{data:ArmorCatalog}) {
  const [planName,setPlanName]=useState(''),[notice,setNotice]=useState(''),[limit,setLimit]=useState(60);
  const [pendingPieces,setPendingPieces]=useState<Record<string,boolean>>({});
  const character=personal.characters.find(c=>c.id===personal.preferences.characterId);
  const armorIndex=useMemo(()=>createArmorIndex(data),[data]);
  const {armorersById:armorers,offersByArmor}=armorIndex;
  const searchTerms=useMemo(()=>params.aq?.toLowerCase().trim().split(/\s+/).filter(Boolean)||[],[params.aq]);
  const offerMatches=(o:ArmorOffer)=> (!params.aCampaign||o.campaign===Number(params.aCampaign))&&(!params.aRating||(o.ratingByProfession?params.aProfession?o.ratingByProfession[Number(params.aProfession)]===Number(params.aRating):Object.values(o.ratingByProfession).includes(Number(params.aRating)):o.armorRating===Number(params.aRating)));
  const results=useMemo(()=>data.sets.filter(s=>(!params.aProfession||s.profession===0||s.profession===Number(params.aProfession))&&(!params.aCategory||s.category===params.aCategory)&&(offersByArmor.get(s.id)||[]).some(offerMatches)&&(!searchTerms.length||searchTerms.every(word=>armorIndex.searchTextByArmor.get(s.id)?.includes(word)))),[data,armorIndex,offersByArmor,searchTerms,params.aProfession,params.aCampaign,params.aRating,params.aCategory]);
  const selected=data.sets.find(s=>s.id===params.armor)||results[0];
  const offers=offersByArmor.get(selected?.id||'')||[];
  const offer=offers.find(o=>o.id===params.offer)||offers.find(offerMatches)||offers[0];
  const selectedIds=params.parts===undefined||params.parts==='all'?offer?.pieces.map(p=>p.id)||[]:params.parts.split(',').filter(Boolean);
  const pieces=offer?.pieces.filter(p=>selectedIds.includes(p.id))||[];
  const total=armorTotal(pieces);
  const plans=personal.armorPlans.filter(p=>p.characterId===character?.id);
  const filter=(key:string,value:string)=>{patch({[key]:value,armor:'',offer:'',parts:'all'});setLimit(60);};
  function amounts(values:MaterialAmount[]) {return values.map(a=>{const material=data.materials.find(m=>m.id===a.materialId);return <span className="material-chip" key={a.materialId} title={material?.name}>{material?.icon&&<img src={assetUrl(material.icon)} alt="" aria-hidden="true" width={24} height={28}/>}<span className="material-name">{material?.name||a.materialId}</span><b>× {a.quantity.toLocaleString(getLocale())}</b></span>;});}
  async function save() {
    if(!character){manageCharacters();return;}
    if(!offer||!pieces.length)return;
    const plan:ArmorPlan={id:randomUUID(),characterId:character.id,name:planName.trim()||selected?.name||t("制作计划"),offerId:offer.id,pieceIds:pieces.map(p=>p.id),completedPieceIds:[]};
    if(await update(state=>saveArmorPlan(state,plan))){setNotice(t("制作计划已保存"));setPlanName('');}
  }
  async function changePiece(plan:ArmorPlan,pieceId:string,done:boolean) {
    const key=`${plan.id}:${pieceId}`;setPendingPieces(p=>({...p,[key]:done}));
    try{await update(s=>setArmorPiece(s,plan.id,plan.characterId,pieceId,done));}
    finally{setPendingPieces(p=>{const next={...p};delete next[key];return next;});}
  }
  return <main className="feature-page armor-page">
    <header className="feature-heading"><div><span className="eyebrow">{t("THE ARMORER’S WORKBENCH")}</span><h1><Shield size={25}/>{t("护甲制作")}</h1><p>{t("十职业 · 全防御等级 · ")}{data.sets.length} {t(" 种外观 · ")}{data.offers.length.toLocaleString(getLocale())} {t(" 份制作方案")}</p></div><span className="feature-version">{t("Wiki 校订资料 · 固定配方与制作费")}</span></header>
    <div className="feature-columns"><aside className="feature-sidebar"><label>{t("搜索护甲或制作商")}<input aria-label={t("搜索护甲或制作商")} value={params.aq||''} onChange={e=>filter('aq',e.target.value)} placeholder={t("外观、NPC、地点…")}/></label><div className="feature-filter-grid">
      <label>{t("职业")}<Select aria-label={t("护甲职业")} value={params.aProfession||''} onValueChange={value=>filter('aProfession',value)} options={[{value:'',label:t("所有职业与通用")},...catalog.professions.map(p=>({value:p.id,label:p.name,icon:professionById.get(p.id)?.icon}))]}/></label>
      <label>{t("篇章")}<Select aria-label={t("护甲篇章")} value={params.aCampaign||''} onValueChange={value=>filter('aCampaign',value)} options={[{value:'',label:t("所有篇章")},{value:'0',label:t("核心")},...catalog.campaigns.map(c=>({value:c.id,label:c.shortName}))]}/></label>
      <label>{t("防御值")}<Select aria-label={t("护甲防御值")} value={params.aRating||''} onValueChange={value=>filter('aRating',value)} options={[{value:'',label:t("所有防御值")},...[...new Set(data.offers.map(o=>o.armorRating))].sort((a,b)=>a-b).map(n=>({value:n,label:String(n)}))]}/></label>
      <label>{t("类别")}<Select aria-label={t("护甲类别")} value={params.aCategory||''} onValueChange={value=>filter('aCategory',value)} options={[{value:'',label:t("所有类型")},{value:'basic',label:t("普通护甲")},{value:'elite',label:t("精英护甲")},{value:'special',label:t("特殊／独立部位")}]}/></label></div>
      <p className="muted">{results.length} {t(" 个结果")}</p><div className="armor-results">{results.slice(0,limit).map(s=><button key={s.id} className={`armor-result ${s.id===selected?.id?'active':''}`} onClick={()=>{patch({armor:s.id,offer:'',parts:(offersByArmor.get(s.id)||[]).find(offerMatches)?.pieces.map(p=>p.id).join(',')||''});setNotice('');}}><ProfessionIcon id={s.profession}/><strong>{s.name}</strong></button>)}{!results.length&&<p className="empty-state">{t("没有符合条件的护甲。")}</p>}{results.length>limit&&<button className="quiet full" onClick={()=>setLimit(n=>n+60)}>{t("显示更多")}</button>}</div>
    </aside><section className="feature-content">
      {selected&&offer?<article className="armor-detail"><div className="feature-title"><h2><ProfessionIcon id={selected.profession}/>{selected.name}</h2></div><div className="armor-overview"><div className="armor-previews">{(['female','male'] as const).map(sex=><figure key={sex}>{selected.images[sex]?<img src={assetUrl(selected.images[sex]!)} alt={t("{{v0}} {{v1}}外观", { v0: selected.name, v1: sex==='male'?t("男性"):t("女性") })} loading="lazy"/>:<div className="missing-preview">{t("暂无")}{sex==='male'?t("男性"):t("女性")}{t("图片")}</div>}<figcaption>{sex==='male'?t("男性外观"):t("女性外观")}</figcaption></figure>)}</div><div className="armor-recipe"><label>{t("制作地点与防御等级")}<Select aria-label={t("护甲制作方案")} value={offer.id} onValueChange={value=>{const next=offers.find(o=>o.id===value)!;patch({offer:next.id,armor:selected.id,parts:next.pieces.map(p=>p.id).join(',')});}} options={offers.map(o=>({value:o.id,label:`${o.location} · ${armorers.get(o.armorerId)?.name}${t(" · AR ")}${o.ratingByProfession?t("60–80（依职业）"):o.armorRating}`}))}/></label><p>{t("制作商：")}<strong>{armorers.get(offer.armorerId)?.name}</strong></p>{offer.zoneId&&<button className="quiet" onClick={()=>navigateZone(offer.zoneId!)}>{t("查看制作区域 →")}</button>}<details className="wiki-disclosure"><summary>{t("制作条件与说明（含英文）")}</summary><p className="source-text">{offer.notes}</p><p className="source-text">{armorers.get(offer.armorerId)?.notes}</p></details>
      <div className="piece-heading"><h3>{t("选择制作部位")}</h3><button className="quiet" onClick={()=>patch({parts:pieces.length===offer.pieces.length?'':offer.pieces.map(p=>p.id).join(',')})}>{pieces.length===offer.pieces.length?t("取消全选"):t("全选")}</button></div><div className="armor-pieces">{offer.pieces.map(piece=><label className="armor-piece" key={piece.id}><input type="checkbox" aria-label={t("制作{{v0}}", { v0: slots[piece.slot] })} checked={selectedIds.includes(piece.id)} onChange={e=>patch({parts:(e.target.checked?[...selectedIds,piece.id]:selectedIds.filter(id=>id!==piece.id)).join(',')})}/><span><strong>{slots[piece.slot]} <small>{piece.name}</small></strong><span className="material-list">{amounts(piece.materials)}</span></span><span className="piece-gold">{goldLabel(piece.gold)}</span></label>)}</div></div></div>
      <section className="craft-total"><div><h3>{t("所选 ")}{pieces.length} {t(" 个部位")}</h3><strong data-testid="armor-gold">{goldLabel(total.gold)}</strong></div><div className="material-list" data-testid="armor-materials">{amounts(total.materials)}</div><p className="muted">{t("仅含材料数量与 NPC 固定制作费；不包含材料购买价、符文、徽记或染料。")}</p><div className="plan-save"><input aria-label={t("制作计划名称")} maxLength={100} value={planName} onChange={e=>setPlanName(e.target.value)} placeholder={t("给制作计划起个名字（可选）")}/><button className="primary" disabled={!pieces.length} onClick={save}><Plus size={16}/>{character?t("保存制作计划"):t("创建角色以保存")}</button></div>{notice&&<p role="status">{notice}</p>}</section>
      <TranslationNotice value={selected}/>{!selected.notes&&<TranslationNotice value={offer}/>}<OriginalContent value={selected}/><div className="feature-sources"><SourceLink reference={selected.reference}/>{data.references.find(r=>r.title==='Armorer')&&<SourceLink reference={data.references.find(r=>r.title==='Armorer')!}/>}{armorers.get(offer.armorerId)&&<SourceLink reference={armorers.get(offer.armorerId)!.reference}/>}</div></article>:<p>{t("没有可用的制作方案。")}</p>}
      <section className="saved-plans"><h2>{character?.name||t("角色")}{t("的制作计划 ")}<span>{plans.length}</span></h2>{!plans.length&&<p className="muted">{t("保存计划后，可在这里逐件记录制作进度。")}</p>}{plans.map(plan=>{const savedOffer=data.offers.find(o=>o.id===plan.offerId),set=data.sets.find(s=>s.id===savedOffer?.armorId);return <article className="saved-plan" key={plan.id}><div className="saved-plan-heading"><button className="quiet" onClick={()=>savedOffer&&patch({armor:savedOffer.armorId,offer:savedOffer.id,parts:plan.pieceIds.join(',')})}><ProfessionIcon id={set?.profession??0}/><strong>{plan.name}</strong></button><button aria-label={t("删除制作计划 {{v0}}", { v0: plan.name })} onClick={()=>update(s=>({...s,armorPlans:s.armorPlans.filter(p=>p.id!==plan.id)}))}><Trash2 size={16}/></button></div><p className="muted">{set?.name||plan.offerId} · {savedOffer?.location}</p>{savedOffer?<><div className="plan-checks">{planPieces(plan,savedOffer).map(piece=><label key={piece.id}><input type="checkbox" aria-label={t("{{v0}} {{v1}}已制作", { v0: plan.name, v1: slots[piece.slot] })} checked={pendingPieces[`${plan.id}:${piece.id}`]??plan.completedPieceIds.includes(piece.id)} disabled={pendingPieces[`${plan.id}:${piece.id}`]!==undefined} onChange={e=>void changePiece(plan,piece.id,e.target.checked)}/>{slots[piece.slot]} {plan.completedPieceIds.includes(piece.id)&&<Check size={12}/>}</label>)}</div><p>{t("整份计划：")}{goldLabel(armorTotal(planPieces(plan,savedOffer)).gold)}</p><div className="material-list">{amounts(armorTotal(planPieces(plan,savedOffer)).materials)}</div><p className="remaining-total">{t("剩余 ")}{planPieces(plan,savedOffer,true).length} {t(" 个部位 · ")}{goldLabel(armorTotal(planPieces(plan,savedOffer,true)).gold)}</p><div className="material-list">{amounts(armorTotal(planPieces(plan,savedOffer,true)).materials)}</div></>:<p>{t("此计划的制作方案已变更，原始记录仍保留在备份中。")}</p>}</article>;})}</section>
    </section></div></main>;
}
