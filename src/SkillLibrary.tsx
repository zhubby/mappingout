/**
 * [INPUT]: 依赖独立双语技能资料、表达式规则和应用导航。
 * [OUTPUT]: 提供全技能筛选、可分享等级上下文和版本详情。
 * [POS]: 职业技能懒加载标签页；不读取或写入角色技能记录。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {useEffect,useMemo,useState} from 'react';
import {Search,Sparkles,SlidersHorizontal,X,ChevronRight} from 'lucide-react';
import {DataStatus,useFeatureData,type FeatureProps} from './feature-ui';
import {t,useLocale} from './i18n';
import {originalOf} from './i18n/content';
import {attributeId} from './i18n/attributes';
import {parseSkillQuery,searchSkills,SkillQueryError} from './skill-query';
import type {SkillCatalog,SkillFilters as Filters,SkillLevels} from './skill-types';
import SkillFilters from './SkillFilters';
import {boundedRank,rankMap,selectedValues,skillParamKeys} from './skill-params';
import SkillDetails from './SkillDetails';
import {SkillResources,modeLabel,resourceLabels,skillAsset} from './skill-ui';
import Select from './Select';
import './skills.css';
export default function SkillLibrary({catalog,params,patch,navigateZone,manageResources}:FeatureProps){
 const locale=useLocale();const {data,error,retry}=useFeatureData<SkillCatalog>('skills.json');
 const [validQuery,setValidQuery]=useState(''),[queryError,setQueryError]=useState<number>(),[limit,setLimit]=useState(100),[directory,setDirectory]=useState(true);
 const query=params.sq||'';
 useEffect(()=>{const timer=setTimeout(()=>{try{parseSkillQuery(query);setValidQuery(query);setQueryError(undefined);}catch(error){setQueryError(error instanceof SkillQueryError?error.position:0);}},150);return()=>clearTimeout(timer);},[query]);
 const levels=useMemo<SkillLevels>(()=>({attribute:boundedRank(params.sRank),attributes:rankMap(params.sAttributes),titles:Object.fromEntries((data?.tracks||[]).map(track=>{const key=attributeId(originalOf(track).name),value=rankMap(params.sRanks)[key];return [key,Math.min(track.max,value??track.max)];}))}),[data,params.sRank,params.sAttributes,params.sRanks]);
 const filters=useMemo<Filters>(()=>({profession:selectedValues(params.sProfession).map(Number),attribute:selectedValues(params.sAttribute),campaign:selectedValues(params.sCampaign).map(Number),type:selectedValues(params.sType),tag:selectedValues(params.sTag),mode:params.sMode==='pve'||params.sMode==='pvp'?params.sMode:undefined,elite:params.sElite?params.sElite==='yes':undefined,unconditional:params.sUnconditional==='yes'}),[params.sProfession,params.sAttribute,params.sCampaign,params.sType,params.sTag,params.sMode,params.sElite,params.sUnconditional]);
 const ranges=Object.keys(resourceLabels).flatMap(key=>['Min','Max'].flatMap(bound=>{const raw=params[`s${key}${bound}`];return raw?.trim()&&Number.isFinite(Number(raw))?[`${key}${bound==='Min'?'>=':'<='}${Number(raw)}`]:[];})).join(' ');
 const matches=useMemo(()=>data?searchSkills(data,`${validQuery?`(${validQuery})`:''} ${ranges}`,{levels,filters,sort:params.sSort}):[],[data,validQuery,ranges,levels,filters,params.sSort]);
 const selected=matches.find(m=>m.skill.id===params.skill)||matches[0];
 const reset=()=>patch(Object.fromEntries(skillParamKeys.map(key=>[key,''])));
 useEffect(()=>setLimit(100),[validQuery,ranges,filters,params.sSort,levels]);
 if(error||!data)return <main className="feature-page skill-load"><DataStatus error={error} retry={retry}/>{error&&<><p>{t('技能资料未安装；请更新离线资源后重试。')}</p>{manageResources&&<button className="primary" onClick={manageResources}>{t('打开资源管理')}</button>}</>}</main>;
 const visible=matches.slice(0,limit);if(selected&&!visible.includes(selected))visible.push(selected);
 return <main className="feature-page skill-page">
  <header className="feature-heading"><div><span className="eyebrow">{t('每一种技艺，皆有来处')}</span><h1><Sparkles size={25}/>{t('职业技能')}</h1><p>{data.skills.length.toLocaleString()} {t('技能')} · PvE / PvP · {t('高级检索')}</p></div><div className="skill-rank-control"><SlidersHorizontal size={16}/><label>{t('属性等级')}<input aria-label={t('属性等级')} type="number" min="0" max="20" value={levels.attribute} onChange={e=>patch({sRank:e.target.value})}/></label><small>{t('数值按当前等级计算')}</small></div></header>
  <div className="skill-searchbar"><label className="skill-search"><Search size={18}/><input type="text" aria-label={t('搜索技能')} placeholder={locale==='en'?'Healing Signet · profession:warrior healing>=150':'Healing Signet · 职业:战士 治疗>=150'} value={query} spellCheck={false} onChange={e=>patch({sq:e.target.value})}/>{query&&<button aria-label={t('清空搜索')} onClick={()=>patch({sq:''})}><X size={15}/></button>}</label><Select aria-label={t('技能版本')} value={params.sMode||''} options={[{value:'',label:t('全部版本')},{value:'pve',label:'PvE'},{value:'pvp',label:'PvP'}]} onValueChange={sMode=>patch({sMode})}/><Select aria-label={t('排序')} value={params.sSort||'relevance'} options={[{value:'relevance',label:t('相关度')},{value:'name',label:t('名称排序')},{value:'energy',label:t('能量从低到高')},{value:'recharge',label:t('冷却从短到长')},{value:'-effect',label:t('效果值从高到低')}]} onValueChange={sSort=>patch({sSort})}/></div>
  {queryError!==undefined&&<p role="alert" className="skill-query-error">{t('查询语法错误：第 {{position}} 个字符。',{position:queryError+1})} {t('继续显示上一次有效查询的结果。')}</p>}
  <div className="skill-tools"><SkillFilters data={data} catalog={catalog} params={params} patch={patch} levels={levels}/><details className="skill-query-help"><summary>{t('查询语法')}</summary><p>AND · OR · NOT · ( ) · &quot;…&quot; · &gt;= · &lt;=</p>{(locale==='en'?['profession:warrior healing>=150','mode:pvp energy<=5 recharge<=10','effect:(metric:damage value>=50 value<=80)','(tag:interrupt OR tag:knockdown) NOT elite:yes']:['职业:战士 治疗>=150','版本:PvP 能量<=5 冷却<=10','效果:(指标:伤害 数值>=50 数值<=80)','(标签:打断 OR 标签:击倒) NOT 精英:是']).map(example=><button key={example} onClick={()=>patch({sq:example})}><code>{example}</code></button>)}<p>{t('条件与数值按同一版本、同一效果分项匹配。')}</p></details><button className="quiet skill-reset" onClick={reset}>{t('重置技能筛选')}</button></div>
  <div className="skill-result-heading"><span role="status">{t('{{count}} 项技能 · {{variants}} 个匹配版本',{count:matches.length,variants:matches.reduce((n,m)=>n+m.variants.length,0)})}</span><button className="quiet" aria-expanded={directory} onClick={()=>setDirectory(!directory)}>{directory?t('收起技能目录'):t('展开技能目录')}</button></div>
  <div className={`skill-layout${directory?'':' directory-closed'}`}><aside className="skill-directory" aria-label={t('技能结果')} hidden={!directory}>{visible.map(match=>{const v=match.variants[0];return <button className={`skill-result${match===selected?' selected':''}`} key={match.skill.id} aria-pressed={match===selected} onClick={()=>patch({skill:match.skill.id,sVersion:v.id})}><img loading="lazy" src={skillAsset(v.image)} alt="" width="44" height="44"/><div><strong>{match.skill.name}</strong>{locale==='zh-CN'&&<small>{match.skill.englishName}</small>}<span>{v.attribute} · {v.elite?`${t('精英')} · `:''}{modeLabel(v)}</span><SkillResources variant={v} icons={data.resourceIcons} compact/></div><ChevronRight size={13}/></button>;})}{matches.length>limit&&<button className="load-more" onClick={()=>setLimit(limit+100)}>{t('加载更多技能')}</button>}{!matches.length&&<p className="skill-empty">{t('未找到匹配技能')}<small>{t('试试减少筛选条件或调整等级。')}</small></p>}</aside>
   {selected?<SkillDetails key={selected.skill.id} skill={selected.skill} match={selected} data={data} catalog={catalog} params={params} patch={patch} levels={levels} navigateZone={navigateZone}/>:<div className="skill-empty"><Sparkles size={36}/><p>{t('未找到匹配技能')}</p><small>{t('试试减少筛选条件或调整等级。')}</small></div>}
  </div>
 </main>;
}
