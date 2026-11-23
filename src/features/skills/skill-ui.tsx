/**
 * [INPUT]: 依赖技能资源、效果等级与共用文案。
 * [OUTPUT]: 提供资源原图标、作用标签与逐次数值符号的动态说明。
 * [POS]: 技能结果与详情的共用呈现；数值只由领域规则计算。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {Fragment} from 'react';
import {t,type UiKey} from '../../i18n';
import {effectValue} from './query';
import type {SkillCatalog,SkillEffect,SkillLevels,SkillResourceKey,SkillVariant} from '../../shared/contracts/skills';
export const skillAsset=(file:string)=>`${import.meta.env.BASE_URL}${file}`;
export const resourceLabels:Record<SkillResourceKey,UiKey>={energy:'能量',adrenaline:'怒气',activation:'施放',recharge:'冷却',upkeep:'维持',sacrifice:'生命牺牲',overcast:'过载'};
const effectLabels:Record<string,UiKey>={damage:'伤害','bonus-damage':'额外伤害',healing:'治疗',duration:'持续时间','life-steal':'生命窃取','energy-gain':'能量获得','energy-loss':'能量损失',regeneration:'生命恢复',degeneration:'生命衰减',armor:'护甲',speed:'速度变化',count:'数量',other:'其他效果',single:'单次','per-second':'每秒','per-hit':'每次命中','per-trigger':'每次触发',seconds:'秒',points:'点',pips:'格'};
export const effectLabel=(key:string)=>effectLabels[key]?t(effectLabels[key]):key==='percent'?'%':key;
export const modeLabel=(variant:SkillVariant)=>variant.format==='codex'?'PvP · Codex':variant.modes.length===2?t('共享 PvE／PvP'):variant.pveOnly?t('仅 PvE'):variant.modes[0]==='pvp'?'PvP':'PvE';
export function SkillResources({variant,icons,compact=false}:{variant:SkillVariant;icons:SkillCatalog['resourceIcons'];compact?:boolean}){
 return <div className={`skill-resources${compact?' compact':''}`}>{(Object.keys(resourceLabels) as SkillResourceKey[]).filter(key=>variant.resources[key].value!==0).map(key=>{
  const resource=variant.resources[key],icon=icons.find(icon=>icon.key===key);
  const value=resource.kind==='attack-speed'?t('普通攻击速度'):resource.kind==='morale'?t('士气提升后充能'):resource.text;
  const unit=resource.value!==null&&['activation','recharge'].includes(key)?t('秒'):key==='sacrifice'&&!value.includes('%')?'%':'';
  return <span key={key} title={`${t(resourceLabels[key])} · ${value} ${unit}`} aria-label={`${t(resourceLabels[key])} ${value} ${unit}`}>
   {icon&&<img src={skillAsset(icon.file)} alt={t(resourceLabels[key])} width="20" height="20"/>}<b>{value}</b>{!compact&&unit&&<small>{unit}</small>}
  </span>;
 })}</div>;
}
export function SkillDescription({variant,levels}:{variant:SkillVariant;levels:SkillLevels}){
 const text=variant.descriptionTemplate;
 if(!text)return <>{variant.description}</>;
 const occurrences=new Map<string,number>();
 return <>{text.split(/(\[\[MO:[^\]]+\]\])/).map((part,index)=>{
  if(!part.startsWith('[[MO:'))return <Fragment key={index}>{part}</Fragment>;
  const id=part.slice(5,-2),occurrence=occurrences.get(id)??0;
  occurrences.set(id,occurrence+1);
  const effect=variant.effects.find(effect=>effect.id===id),value=effect&&effectValue(effect,levels);
  const original=variant.descriptionParts.filter(p=>p.effectId===id)[occurrence]?.raw;
  const sign=value!==null&&value!==undefined&&value>=0?(original?.startsWith('+')?'+':/^[-−]/.test(original??'')?'-':''):'';
  return <strong key={index} className="skill-value" title={effect?.label}>{value===null||value===undefined?original||'—':`${sign}${value}${original?.endsWith('%')?'%':''}`}</strong>;
 })}</>;
}
export function EffectValue({effect,levels}:{effect:SkillEffect;levels:SkillLevels}){
 const value=effectValue(effect,levels);return <>{value===null?<span title={t('数值待核对')}>—</span>:<strong>{value}</strong>} <small>{effectLabel(effect.unit)}</small></>;
}
