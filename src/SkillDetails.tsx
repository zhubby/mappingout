/**
 * [INPUT]: 依赖技能版本、匹配效果、等级上下文与已验证资料链接。
 * [OUTPUT]: 展示匹配版本的说明、成长、对照与获取来源。
 * [POS]: 技能百科只读文章；任务跳转清除旧难度筛选。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {useState} from 'react';
import {BookOpen,ExternalLink,MapPin,Copy} from 'lucide-react';
import {t,useLocale} from './i18n';
import {originalOf} from './i18n/content';
import {attributeId} from './i18n/attributes';
import {professionById} from './professions';
import {SourceLink} from './WikiDetails';
import Select from './Select';
import {skillParamKeys} from './skill-params';
import {EffectValue,SkillDescription,SkillResources,effectLabel,modeLabel,skillAsset} from './skill-ui';
import type {LibrarySkill,SkillCatalog,SkillLevels,SkillMatch,SkillVariant} from './skill-types';
import type {Catalog} from './types';
interface Props{skill:LibrarySkill;data:SkillCatalog;catalog:Catalog;levels:SkillLevels;match:SkillMatch;params:Record<string,string>;patch:(values:Record<string,string>)=>void;navigateZone:(id:string)=>void}
function Version({variant,levels,data,matched,original}:{variant:SkillVariant;levels:SkillLevels;data:SkillCatalog;matched:string[];original:boolean}){
 const content=original?originalOf(variant):variant;
 const uncertain=content.descriptionParts.some(p=>p.raw&&!p.effectId)||content.effects.some(e=>e.uncertain);
 return <section className="skill-version-card" aria-label={modeLabel(variant)}>
  <div className="skill-version-heading"><span className="skill-mode">{modeLabel(variant)}</span><span>{content.type}{variant.elite&&` · ${t('精英')}`}</span></div>
  <SkillResources variant={variant} icons={data.resourceIcons}/>
  <p className="skill-description" lang={original?'en':undefined}><SkillDescription variant={content} levels={levels}/></p>
  {uncertain&&<p className="skill-source-dispute">{t('来源正文与成长表不一致；有争议的数值不参与筛选。')}</p>}
  <dl className="skill-targets">{[['目标',content.target],['射程',content.range],['范围',content.aoe]].filter(([,v])=>v).map(([label,value])=><div key={label}><dt>{label==='目标'?t('目标'):label==='射程'?t('射程'):t('范围')}</dt><dd>{value}</dd></div>)}</dl>
  {!!content.effects.length&&<details className="skill-growth" open={matched.length>0||undefined}><summary>{t('成长与效果')} <small>{content.effects.length}</small></summary><div className="skill-effects">{content.effects.map(effect=><div key={effect.id} className={`skill-effect${matched.includes(effect.id)?' is-match':''}`}>
   <div><strong>{effect.label}</strong><span>{effectLabel(effect.metric)} · {effectLabel(effect.scope)}</span></div><div className="skill-effect-number"><EffectValue effect={effect} levels={levels}/></div>
   <p>{effect.axisKind==='fixed'?t('所有效果分项'):`${effect.axis} · ${effect.axisKind==='title'?levels.titles[attributeId(originalOf(effect).axis)]??'—':levels.attributes?.[attributeId(originalOf(effect).axis)]??levels.attribute}`}{effect.conditional&&` · ${t('生效条件')}`}</p>
   {effect.condition&&<p className="skill-condition">{effect.condition}</p>}
   {effect.uncertain&&<p className="skill-source-dispute">{t('数值待核对')}</p>}
   {effect.axisKind!=='fixed'&&<details className="skill-growth-values"><summary>{t('各属性等级')}</summary><div>{Object.entries(effect.values).filter(([rank])=>Number(rank)<=20).map(([rank,value])=><span key={rank}><small>{rank}</small><b>{value}</b></span>)}</div></details>}
  </div>)}</div></details>}
  <SourceLink reference={variant.reference}/>
 </section>;
}
export default function SkillDetails({skill,data,catalog,levels,match,params,patch,navigateZone}:Props){
 const locale=useLocale(),[original,setOriginal]=useState(false),[copied,setCopied]=useState('');
 const variant=match.variants.find(v=>v.id===params.sVersion)||match.variants[0];
 const compare=params.sCompare==='yes'&&skill.variants.length>1,versions=compare?skill.variants:[variant];
 const profession=professionById.get(variant.profession),content=original?originalOf(variant):variant;
 const related=[...new Set(versions.flatMap(v=>v.related))].map(id=>data.skills.find(s=>s.id===id)).filter((s):s is LibrarySkill=>!!s);
 const copy=async()=>{try{const url=new URL(location.href);url.searchParams.set('skill',skill.id);url.searchParams.set('sVersion',variant.id);await navigator.clipboard.writeText(url.href);setCopied(t('链接已复制'));}catch{setCopied(t('复制失败，请复制地址栏链接。'));}};
 const open=(id:string)=>patch({...Object.fromEntries(skillParamKeys.filter(key=>!['sRank','sRanks','sAttributes'].includes(key)).map(key=>[key,''])),skill:id});
 return <article className="skill-article" aria-labelledby="skill-title">
  <header className="skill-title"><img className="skill-portrait" src={skillAsset(variant.image)} alt={skill.name} width="72" height="72"/><div><span className="eyebrow">{t('技能百科')}</span><h2 id="skill-title">{skill.name}</h2>{locale==='zh-CN'&&<p lang="en">{skill.englishName}</p>}<div className="skill-byline">{profession&&<img src={profession.icon} alt=""/>}<span>{profession?.name||t('通用技能')} · {variant.attribute}</span></div></div></header>
  <div className="skill-detail-controls">{skill.variants.length>1&&<><Select aria-label={t('显示版本')} value={variant.id} options={match.variants.map(v=>({value:v.id,label:modeLabel(v)}))} onValueChange={sVersion=>patch({sVersion})}/><label><input type="checkbox" checked={compare} onChange={e=>patch({sCompare:e.target.checked?'yes':''})}/>{t('对照 PvE／PvP')}</label></>}<button className="quiet" title={t('复制技能链接')} onClick={copy}><Copy size={14}/>{t('复制技能链接')}</button>{copied&&<span role="status">{copied}</span>}</div>
  {locale==='zh-CN'&&<div className="skill-reading"><button className="quiet" aria-pressed={original} onClick={()=>setOriginal(!original)}>{original?t('阅读中文技能说明'):t('阅读英文技能原文')}</button>{!original&&<p>{t('中文技能含机器辅助译文，尚待逐条校订。')}</p>}</div>}
  <div className={`skill-versions${compare?' compare':''}`}>{versions.map(v=><Version key={v.id} variant={v} levels={levels} data={data} matched={(match.effects[v.id]||[]).map(e=>e.id)} original={original}/>)}</div>
  {!!content.acquisition.length&&<section className="skill-acquisition"><h3><BookOpen size={15}/>{t('获取技能')}</h3>{content.acquisition.map((source,index)=><div key={index}><p>{source.text}</p><div className="skill-acquisition-links">{source.questId&&<button className="quiet" onClick={()=>patch({view:'quests',quest:source.questId!,qChapter:'all',qMode:'',qKind:'',qRegion:'',qStatus:'',qq:''})}><BookOpen size={12}/>{t('任务攻略')}</button>}{source.zoneIds?.map(id=>{const zone=catalog.records.find(r=>r.id===id);return zone&&<button key={id} className="quiet" onClick={()=>navigateZone(id)}><MapPin size={12}/>{zone.name}</button>;})}<a href={(source.reference||variant.reference).revisionUrl} target="_blank" rel="noreferrer"><ExternalLink size={11}/>{t('获取方式')}</a></div></div>)}</section>}
  {!!content.notes.length&&<details className="skill-notes"><summary>{t('注意事项')}</summary>{content.notes.map((text,index)=><p key={index}>{text}</p>)}</details>}
  {!!related.length&&<section className="skill-related"><h3>{t('相关技能')}</h3>{related.map(s=><button className="skill-chip" key={s.id} onClick={()=>open(s.id)}>{s.name} →</button>)}</section>}
  <footer className="skill-sources"><details><summary>{t('技能来源')}</summary><SourceLink reference={variant.reference}/>{data.resourceIcons.map(icon=><SourceLink key={icon.key} reference={icon.reference}/>)}<p>{t('技能图标与资源图标采用 Wiki 原文件；许可见文件来源。')}</p><a href={skillAsset('licenses/gfdl-1.3.txt')} target="_blank" rel="noreferrer">GNU Free Documentation License</a></details></footer>
 </article>;
}
