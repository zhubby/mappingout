/**
 * [INPUT]: 依赖固定技能说明、逐等级成长表与 Wiki 文本解析。
 * [OUTPUT]: 编译保留符号的固定效果、成长分项与资源语义。
 * [POS]: 技能数值与正文的单一编译入口；不估算战斗总伤害。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {plainText,templates} from './wikitext.mjs';
export const resourceKeys=['energy','adrenaline','activation','recharge','upkeep','sacrifice','overcast'];
export function resourcesOf(fields){
 return Object.fromEntries(resourceKeys.map(key=>{
  const text=plainText(fields[key]??(key==='overcast'?fields.exhaustion:'')??'');
  if(key==='activation'&&!text&&/attack/i.test(fields.type||''))return [key,{text:'Attack speed',value:null,kind:'attack-speed'}];
  if(key==='recharge'&&/^(m|morale|morale boost)$/i.test(text))return [key,{text:'Morale boost',value:null,kind:'morale'}];
  const value=text?Number(text.replace(/%$/,'')):0;
  return [key,{text:text||'0',value:Number.isFinite(value)?value:null,kind:Number.isFinite(value)?'number':'dynamic'}];
 }));
}
const scopeOf=text=>/per second|each second|every second|each second|regeneration|degeneration/i.test(text)?'per-second':/each (?:attack|hit)|whenever.*(?:attack|hit)|on hit/i.test(text)?'per-hit':/whenever|every time|each time|when .*(?:ends|dies|cast|use)/i.test(text)?'per-trigger':'single';
const conditional=text=>/\b(?:if|when|whenever|while|unless|for each|every time|each time|per (?:enchantment|condition|hex|foe))\b/i.test(text);
export function metricOf(label){
 const s=label.toLowerCase();
 if(/duration|seconds|time before/.test(s))return 'duration';
 if(/steal|stolen|life.?steal/.test(s)&&/health|life|damage/.test(s))return 'life-steal';
 if(/\+.*damage|bonus.*damage|additional.*damage/.test(s))return 'bonus-damage';
 if(/damage/.test(s)&&!/reduction|absorb|reduced/.test(s))return 'damage';
 if(/\bheal(?:ing|s|ed)?\b|health (?:gain|restored)/.test(s)&&!/maximum/.test(s))return 'healing';
 if(/energy.*(?:gain|return|steal)|(?:gain|return).*energy/.test(s))return 'energy-gain';
 if(/energy.*(?:loss|lost|drain)|(?:drain|lost).*energy/.test(s))return 'energy-loss';
 if(/degeneration/.test(s))return 'degeneration';
 if(/regeneration/.test(s))return 'regeneration';
 if(/armor|armour/.test(s))return 'armor';
 if(/speed|faster|slower|recharge reduction|activation reduction/.test(s))return 'speed';
 if(/number|foes|allies|enchantments|conditions|hexes|minions|spirits|attacks|rituals|spells|arrows|targets/.test(s))return 'count';
 return 'other';
}
const unitOf=(metric,label)=>/percent|%/.test(label)?'percent':metric==='duration'?'seconds':['regeneration','degeneration'].includes(metric)?'pips':metric==='count'?'count':'points';
const sentenceAt=(text,position)=>{const before=text.slice(0,position).split(/\.(?:\s|$)|\n/).at(-1)||'',after=text.slice(position).split(/\.(?:\s|$)|\n/)[0];return plainText(before+after).trim();};
function rangeMetric(source,start,end,context){
 const after=plainText(source.slice(end,end+100)),before=plainText(source.slice(Math.max(0,start-80),start));
 if(/^seconds?\b/i.test(after))return 'duration';
 if(/^(?:(?:fire|cold|lightning|earth|holy|dark|chaos|physical|slashing|piercing|blunt|armor.ignoring)\s+)?damage\b/i.test(after))return /additional|extra|\+\s*$/i.test(before)?'bonus-damage':'damage';
 if(/^health\b/i.test(after))return /steal|stolen/i.test(before)?'life-steal':/heal|gain|restore/i.test(before)?'healing':'other';
 return metricOf(context);
}
export function compileEffects(page,fields,growth,reference){
 let source=fields.description||'';
 for(let n=0;n<4;n++){let changed=false;for(const item of templates(source))if(/^(gray|grey|sic)$/i.test(item.name)){source=source.replace(item.raw,item.fields[1]||'');changed=true;}if(!changed)break;}
 const ranges=templates(source).filter(t=>/^(gr|gr2)$/i.test(t.name)),positions=[];
 let cursor=0;
 for(const item of ranges){const start=source.indexOf(item.raw,cursor),end=start+item.raw.length,context=sentenceAt(source,start);positions.push({item,start,end,context,metric:rangeMetric(source,start,end,context)});cursor=end;}
 const effects=growth.map(row=>{
  const candidates=positions.filter(({item})=>Number(item.fields[1])===row.anchors[0]&&Object.values(row.anchors).some(v=>v===Number(item.fields[2])));
  const context=candidates.find(p=>p.metric===metricOf(row.label))?.context||candidates[0]?.context||'';
  const maximum=/^maximum damage/i.test(row.label),metric=maximum?'other':metricOf(row.label);
  return {...row,metric,unit:unitOf(metric,row.label),scope:scopeOf(`${row.label} ${context}`),condition:maximum?'Maximum damage in the Wiki table; requires the full duration and applicable trigger conditions.':context,conditional:maximum||conditional(context),reference};
 });
 const descriptionParts=[];cursor=0;
 for(const {item,start,end,context,metric}of positions){
  const prefix=plainText(source.slice(cursor,start));if(prefix)descriptionParts.push({id:`text:${descriptionParts.length}`,text:(cursor?' ':'')+prefix+' '});
  const candidates=effects.filter(e=>e.anchors[0]===Number(item.fields[1])&&Object.values(e.anchors).some(v=>v===Number(item.fields[2])));
  const effect=candidates.find(e=>e.metric===metric)||candidates[0];
  if(!effect){const conflicting=effects.filter(e=>e.anchors[0]===Number(item.fields[1])||e.metric===metric);if(conflicting.length===1)conflicting[0].uncertain=true;else for(const e of conflicting)if(e.anchors[0]===Number(item.fields[1]))e.uncertain=true;}
  descriptionParts.push({id:`value:${descriptionParts.length}`,...(effect?{effectId:effect.id}:{}),raw:plainText(item.raw)});cursor=end;
 }
 const suffix=plainText(source.slice(cursor));if(suffix)descriptionParts.push({id:`text:${descriptionParts.length}`,text:' '+suffix});
 let constants=source;for(const item of ranges)constants=constants.replace(item.raw,'◆');
 const prose=plainText(constants);
 for(const match of prose.matchAll(/(?<![\w.])[-+−]?\d+(?:\.\d+)?\b/g)){
  const value=Number(match[0].replace('−','-')),start=match.index,context=sentenceAt(prose,start),after=prose.slice(start+match[0].length,start+match[0].length+50),before=prose.slice(Math.max(0,start-45),start);
  let label=context,metric='other',unit='points';
  if(/^\s*seconds?\b/i.test(after)){metric='duration';unit='seconds';label='Duration';}
  else if(/^\s*(?:(?:fire|cold|lightning|earth|holy|dark|chaos|physical|slashing|piercing|blunt|armor.ignoring)\s+)?damage\b/i.test(after)){metric=match[0].startsWith('+')||/\+\s*$|additional\s*$|extra\s*$/i.test(before)?'bonus-damage':'damage';label=metric==='bonus-damage'?'Bonus damage':'Damage';}
  else if(/^\s*health\b/i.test(after)){metric=/steal|stolen/i.test(before)?'life-steal':/heal|gain|restore/i.test(before)?'healing':'other';label=metric==='other'?'Health':metric==='healing'?'Healing':'Life steal';}
  else if(/^\s*energy\b/i.test(after)){metric=/lose|loss|drain/i.test(before)?'energy-loss':/gain|steal|return|restore/i.test(before)?'energy-gain':'other';label=metric==='other'?'Energy':metric==='energy-gain'?'Energy gain':'Energy loss';}
  else if(/^\s*(?:armor|armour)\b/i.test(after))metric='armor';
  else if(/^\s*%/.test(after)){unit='percent';metric=/speed|faster|slower/i.test(after.slice(0,35))?'speed':'other';}
  else if(/^\s*(?:foes?|allies|targets?|spirits?|minions?|attacks?|hexes|enchantments?|conditions?)\b/i.test(after)){metric='count';unit='count';}
  const scope=scopeOf(context);
  effects.push({id:`fixed:${effects.length}`,label,metric,unit,scope,condition:context,conditional:conditional(context),axis:'No Attribute',axisKind:'fixed',values:{fixed:value},reference});
 }
 const descriptionTemplate=descriptionParts.map(part=>part.effectId?`[[MO:${part.effectId}]]`:part.text||part.raw).join('').trim();
 return {effects:effects.map(({anchors,template,...effect})=>effect),descriptionParts,descriptionTemplate};
}
export function tagsOf(fields,categories,description){
 const tags=new Set();
 for(const[key,value]of Object.entries(fields))if(/^(causes|removes)\d*$/.test(key))tags.add(key.startsWith('removes')?`${plainText(value)} removal`:plainText(value));
 for(const category of categories){let match=/^Category:Skills that cause (.+)$/.exec(category);if(match)tags.add(match[1]);match=/^Category:(.+) removing skills$/.exec(category);if(match)tags.add(`${match[1]} removal`);}
 const checks={Interrupt:/\binterrupt/i,Knockdown:/knock.?down/i,Healing:/\bheal/i,Resurrection:/\bresurrect/i,'Enchantment removal':/remove.*enchantment|enchantment.*removed/i,'Hex removal':/remove.*hex|hex.*removed/i,'Condition removal':/remove.*condition|condition.*removed/i};
 for(const[tag,pattern]of Object.entries(checks))if(pattern.test(description))tags.add(tag);
 return [...tags].sort();
}
