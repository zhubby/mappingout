/**
 * [INPUT]: 依赖技能目录、规范化等级和地址参数。
 * [OUTPUT]: 提供多选分面、资源范围及属性和称号等级面板。
 * [POS]: 技能检索输入边界；筛选含义由 skill-query 决定。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {X} from 'lucide-react';
import Select from '../../shared/ui/Select';
import {t} from '../../i18n';
import {attributeId} from '../../i18n/attributes';
import {originalOf} from '../../i18n/content';
import {professions} from '../../shared/game/professions';
import {resourceLabels} from './skill-ui';
import type {SkillCatalog,SkillLevels,SkillResourceKey} from '../../shared/contracts/skills';
import type { Catalog } from '../../shared/contracts/catalog';
import {boundedRank,selectedValues} from './params';
function Facet({label,values,options,onChange}:{label:string;values:string[];options:{value:string;label:string}[];onChange:(values:string[])=>void}){
 return <div className="skill-facet"><Select aria-label={label} value="" options={[{value:'',label},...options.filter(option=>!values.includes(option.value))]} onValueChange={value=>{if(value)onChange([...values,value]);}}/><div className="skill-chips">{values.map(value=><button key={value} className="skill-chip" onClick={()=>onChange(values.filter(v=>v!==value))} aria-label={`${t('移除筛选')} ${options.find(o=>o.value===value)?.label||value}`}>{options.find(o=>o.value===value)?.label||value}<X size={11}/></button>)}</div></div>;
}
export default function SkillFilters({data,catalog,params,levels,patch}:{data:SkillCatalog;catalog:Catalog;params:Record<string,string>;levels:SkillLevels;patch:(values:Record<string,string>)=>void}){
 const variants=data.skills.flatMap(s=>s.variants);
 const attributes=[...new Map(variants.map(v=>[attributeId(originalOf(v).attribute),v.attribute])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
 const types=[...new Map(variants.map(v=>[originalOf(v).type,v.type])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
 const tags=[...new Map(variants.flatMap(v=>v.tags.map((tag,i)=>[originalOf(v).tags[i],tag] as [string,string]))).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
 const toggle=(key:string,value:string)=>{const values=selectedValues(params[key]);patch({[key]:(values.includes(value)?values.filter(v=>v!==value):[...values,value]).join('|')});};
 return <details className="skill-filter-panel"><summary>{t('高级检索')}</summary><div className="skill-filter-content">
  <fieldset className="skill-professions"><legend>{t('职业')}</legend>{[{id:0,name:t('通用技能'),icon:''},...professions].map(p=><button type="button" key={p.id} aria-pressed={selectedValues(params.sProfession).includes(String(p.id))} onClick={()=>toggle('sProfession',String(p.id))}>{p.icon&&<img src={p.icon} alt=""/>}{p.name}</button>)}</fieldset>
  <div className="skill-facets"><Facet label={t('添加属性筛选')} values={selectedValues(params.sAttribute)} options={attributes.map(([value,label])=>({value,label}))} onChange={values=>patch({sAttribute:values.join('|')})}/><Facet label={t('添加章节筛选')} values={selectedValues(params.sCampaign)} options={[{id:0,name:t('核心')},...catalog.campaigns.filter(c=>c.id>0)].map(c=>({value:String(c.id),label:c.name}))} onChange={values=>patch({sCampaign:values.join('|')})}/><Facet label={t('添加类型筛选')} values={selectedValues(params.sType)} options={types.map(([value,label])=>({value,label}))} onChange={values=>patch({sType:values.join('|')})}/><Facet label={t('添加标签筛选')} values={selectedValues(params.sTag)} options={tags.map(([value,label])=>({value,label}))} onChange={values=>patch({sTag:values.join('|')})}/></div>
  <div className="skill-filter-options"><Select aria-label={t('精英分类')} value={params.sElite||''} onValueChange={sElite=>patch({sElite})} options={[{value:'',label:t('全部稀有度')},{value:'yes',label:t('精英技能')},{value:'no',label:t('非精英技能')}]}/><label><input type="checkbox" checked={params.sUnconditional==='yes'} onChange={e=>patch({sUnconditional:e.target.checked?'yes':''})}/>{t('仅无条件效果')}</label></div>
  <details className="skill-resource-ranges"><summary>{t('资源范围')}</summary><div>{(Object.keys(resourceLabels) as SkillResourceKey[]).map(key=><fieldset key={key}><legend>{t(resourceLabels[key])}</legend>{['Min','Max'].map(bound=><label key={bound}><span>{bound==='Min'?t('最低'):t('最高')}</span><input type="number" min="0" step="any" aria-label={`${t(resourceLabels[key])} ${bound==='Min'?t('最低'):t('最高')}`} value={params[`s${key}${bound}`]||''} onChange={e=>patch({[`s${key}${bound}`]:e.target.value})}/></label>)}</fieldset>)}</div></details>
  <div className="skill-rank-panels"><details><summary>{t('各属性等级')}</summary><p>{t('数值按当前等级计算')}</p>{attributes.filter(([id])=>!id.endsWith('rank')&&id!=='no-attribute').map(([id,name])=><label className="skill-rank-row" key={id}>{name}<input type="number" min="0" max="20" aria-label={`${name} ${t('自定义等级')}`} placeholder={String(levels.attribute)} value={levels.attributes?.[id]??''} onChange={e=>{const values={...levels.attributes};if(e.target.value==='')delete values[id];else values[id]=boundedRank(e.target.value);patch({sAttributes:JSON.stringify(values)});}}/></label>)}</details><details><summary>{t('称号等级')}</summary>{data.tracks.map(track=>{const id=attributeId(originalOf(track).name);return <label className="skill-rank-row" key={track.id}>{track.name}<input type="number" min="0" max={track.max} aria-label={`${track.name} ${t('称号等级')}`} value={levels.titles[id]??track.max} onChange={e=>patch({sRanks:JSON.stringify({...levels.titles,[id]:boundedRank(e.target.value,track.max,track.max)})})}/></label>;})}</details></div>
  <p className="muted">{t('条件与数值按同一版本、同一效果分项匹配。')}</p>
 </div></details>;
}
