/**
 * [INPUT]: 依赖双语字段、用户查询及技能版本契约。
 * [OUTPUT]: 提供含科学计数值的查询及版本内效果分项匹配。
 * [POS]: 技能高级检索的纯规则；不执行用户输入或网络请求。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import type {LibrarySkill,SkillCatalog,SkillEffect,SkillLevels,SkillSearchOptions,SkillMatch,SkillVariant} from './skill-types';
import {attributeId} from './i18n/attributes';
import {originalOf} from './i18n/content';
type Truth=boolean|null;
type Node={kind:'all'}|{kind:'term';field:string;op:string;value:string}|{kind:'not';child:Node}|{kind:'effect';child:Node}|{kind:'and';left:Node;right:Node}|{kind:'or';left:Node;right:Node};
type Token={text:string;position:number;quoted?:boolean};
export class SkillQueryError extends Error {position:number;constructor(message:string,position:number){super(message);this.position=position;}}
export const normalizeSkillText=(value:string)=>value.normalize('NFKC').toLocaleLowerCase().replace(/[’‘]/g,"'").replace(/[“”]/g,'"');
const fields:Record<string,string>={职业:'profession',属性:'attribute',章节:'campaign',版本:'mode',类型:'type',精英:'elite',效果:'effect',目标:'target',射程:'range',范围:'aoe',获取:'source',名称:'name',正文:'text',编号:'id',能量:'energy',怒气:'adrenaline',施放:'activation',施法:'activation',冷却:'recharge',维持:'upkeep',牺牲:'sacrifice',过载:'overcast',指标:'metric',数值:'value',单位:'unit',方式:'scope',条件:'conditional',标签:'tag',说明:'label',伤害:'damage',治疗:'healing',持续:'duration',持续时间:'duration',额外伤害:'bonus-damage',生命窃取:'life-steal',能量获得:'energy-gain',能量损失:'energy-loss',生命恢复:'regeneration',生命衰减:'degeneration',护甲:'armor',速度变化:'speed',数量:'count'};
const allowed=new Set(['profession','attribute','campaign','mode','type','elite','effect','target','range','aoe','source','name','text','id','energy','adrenaline','activation','recharge','upkeep','sacrifice','overcast','metric','value','unit','scope','conditional','tag','label','damage','bonus-damage','healing','duration','life-steal','energy-gain','energy-loss','regeneration','degeneration','armor','speed','count']);
const numeric=new Set(['energy','adrenaline','activation','recharge','upkeep','sacrifice','overcast','value']);
const metrics=new Set(['damage','bonus-damage','healing','duration','life-steal','energy-gain','energy-loss','regeneration','degeneration','armor','speed','count']);
const aliases:Record<string,string>={打断:'interrupt',移除加持:'enchantment-removal',移除附魔:'enchantment-removal',移除降咒:'hex-removal',移除症状:'condition-removal',击倒:'knockdown',复活:'resurrection',失明:'blind',流血:'bleeding',中毒:'poison',燃烧:'burning',残废:'crippled',虚弱:'weakness',深度伤口:'deep-wound',眩晕:'dazed',伤害:'damage',额外伤害:'bonus-damage',治疗:'healing',生命窃取:'life-steal',持续时间:'duration',持续:'duration',能量获得:'energy-gain',能量损失:'energy-loss',每秒:'per-second',每次命中:'per-hit',每次触发:'per-trigger',单次:'single',点:'points',秒:'seconds',百分比:'percent',格:'pips'};
const canonical=(value:string)=>aliases[value]||normalizeSkillText(value).replace(/ spell(?= removal)/g,'').replace(/[ _]+/g,'-');
const skillTypes:Record<string,string>={纹章:'signet',咒文魔法:'spell',加持魔法:'enchantment spell',闪现加持魔法:'flash enchantment spell',降咒魔法:'hex spell',武装魔法:'weapon spell',物品魔法:'item spell',缚灵仪式:'binding ritual',自然仪式:'nature ritual',态势:'stance',战嚎:'shout',圣歌:'chant',回响:'echo',准备技能:'preparation',陷阱:'trap',符号:'glyph',技能:'skill',触碰技能:'touch skill',引导攻击:'lead attack',副手攻击:'off-hand attack',双重攻击:'dual attack',宠物攻击:'pet attack'};
const professions=[['none','通用'],['warrior','战士'],['ranger','游侠'],['monk','僧侣'],['necromancer','死灵','死灵法师'],['mesmer','幻术','幻术师'],['elementalist','元素','元素使'],['assassin','刺客'],['ritualist','祭祀'],['paragon','圣言者'],['dervish','神唤']];
const campaigns=[['core','核心','通用'],['prophecies','预言'],['factions','盟与敌'],['nightfall','黑暗逆袭'],['eye of the north','北方之眼','eotn']];
function lex(text:string):Token[]{
 const output:Token[]=[];let i=0;
 while(i<text.length){
  if(/\s/u.test(text[i])){i++;continue;}
  const position=i,char=text[i];
  if(char==='"'||char==="'"){
   let value='';i++;let closed=false;
   while(i<text.length){if(text[i]==='\\'&&i+1<text.length){value+=text[i+1];i+=2;}else if(text[i]===char){i++;closed=true;break;}else value+=text[i++];}
   if(!closed)throw new SkillQueryError('Unclosed quote',position);
   output.push({text:value,position,quoted:true});continue;
  }
  if(char==='-'&&!/\d/.test(text[i+1]||'')){output.push({text:'NOT',position});i++;continue;}
  const operator=/^(?:>=|<=|!=|[():=<>])/u.exec(text.slice(i));
  if(operator){output.push({text:operator[0],position});i+=operator[0].length;continue;}
  const word=/^[^\s():=<>!]+/u.exec(text.slice(i));
  if(!word)throw new SkillQueryError('Unexpected character',position);
  output.push({text:word[0],position});i+=word[0].length;
 }
 return output;
}
export function parseSkillQuery(source:string):Node {
 const text=source.normalize('NFKC').replaceAll('≤','<=').replaceAll('≥','>='),tokens=lex(text);let p=0;
 const is=(word:string)=>tokens[p]&&!tokens[p].quoted&&tokens[p].text.toUpperCase()===word;
 const fail=(message:string)=>{throw new SkillQueryError(message,tokens[p]?.position??text.length);};
 function primary():Node {
  if(is('NOT')){p++;return {kind:'not',child:primary()};}
  if(is('(')){p++;const child=or();if(!is(')'))fail('Expected )');p++;return child;}
  const token=tokens[p++];if(!token||!token.quoted&&[')', 'AND','OR'].includes(token.text.toUpperCase()))return fail('Expected a search condition');
  const op=tokens[p]?.text;
  if(!token.quoted&&op&&[':', '=', '!=', '>', '<', '>=', '<='].includes(op)){
   const field=fields[token.text]||token.text.toLowerCase();if(!allowed.has(field))throw new SkillQueryError(`Unknown field: ${token.text}`,token.position);
   p++;
   if(field==='effect'&&op===':'&&is('(')){p++;const child=or();if(!is(')'))fail('Expected )');p++;return {kind:'effect',child};}
   const value=tokens[p++];if(!value||!value.quoted&&['(',')','AND','OR','NOT'].includes(value.text.toUpperCase()))return fail('Expected a field value');
   if((numeric.has(field)||metrics.has(field))&&(!/^[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?(?:s|ms|%|秒|点|格)?$/i.test(value.text)||!Number.isFinite(parseFloat(value.text))))throw new SkillQueryError('Expected a numeric value',value.position);
   const term:Node={kind:'term',field,op,value:value.text};
   return metrics.has(field)?{kind:'effect',child:{kind:'and',left:{kind:'term',field:'metric',op:':',value:field},right:{...term,field:'value'}}}:term;
  }
  return {kind:'term',field:'text',op:':',value:token.text};
 }
 function and():Node{let node=primary();while(p<tokens.length&&!is(')')&&!is('OR')){if(is('AND'))p++;node={kind:'and',left:node,right:primary()};}return node;}
 function or():Node{let node=and();while(is('OR')){p++;node={kind:'or',left:node,right:and()};}return node;}
 if(!tokens.length)return {kind:'all'};
 const result=or();if(p<tokens.length)fail('Unexpected token');return result;
}
export function effectValue(effect:SkillEffect,levels:SkillLevels):number|null{
 if(effect.uncertain)return null;
 if(effect.axisKind==='fixed')return effect.values.fixed??null;
 const key=attributeId(effect.axis),rank=effect.axisKind==='title'?levels.titles[key]:levels.attributes?.[key]??levels.attribute;
 return rank===undefined?null:effect.values[String(rank)]??null;
}
function compare(actual:number|null,op:string,input:string):Truth{
 if(actual===null)return null;
 const number=parseFloat(input)*(input.endsWith('ms')?0.001:1);
 return op==='>'?actual>number:op==='>='?actual>=number:op==='<'?actual<number:op==='<='?actual<=number:op==='!='?actual!==number:actual===number;
}
const boolean=(value:string)=>['true','yes','y','是','1'].includes(normalizeSkillText(value));
const index=new WeakMap<SkillVariant,string>();
function searchable(skill:LibrarySkill,variant:SkillVariant){
 let text=index.get(variant);
 if(!text){const raw=originalOf(variant);text=normalizeSkillText([skill.name,skill.englishName,...skill.searchAliases||[],...variant.searchTexts||[],...new Set([variant,raw])].flatMap(value=>typeof value==='string'?[value]:[value.name,value.englishName,value.description,value.conciseDescription,...value.notes,...value.tags,...value.acquisition.flatMap(a=>[a.title,a.text,...a.areas])]).join(' '));index.set(variant,text);}
 return text;
}
type Outcome={truth:Truth;effects:SkillEffect[]};
function evaluate(node:Node,skill:LibrarySkill,variant:SkillVariant,options:SkillSearchOptions,effect?:SkillEffect):Outcome{
 const result=(truth:Truth,effects:SkillEffect[]=[]):Outcome=>({truth,effects});
 if(node.kind==='all')return result(true);
 if(node.kind==='not'){const child=evaluate(node.child,skill,variant,options,effect);return result(child.truth===null?null:!child.truth);}
 if(node.kind==='and'||node.kind==='or'){
  const a=evaluate(node.left,skill,variant,options,effect),b=evaluate(node.right,skill,variant,options,effect);
  const truth=node.kind==='and'?(a.truth===false||b.truth===false?false:a.truth===null||b.truth===null?null:true):(a.truth===true||b.truth===true?true:a.truth===null||b.truth===null?null:false);
  return result(truth,truth===true?[...a.truth===true?a.effects:[],...b.truth===true?b.effects:[]]:[]);
 }
 if(node.kind==='effect'){
  const candidates=(effect?[effect]:variant.effects).filter(e=>!options.filters?.unconditional||!e.conditional);
  const evaluated=candidates.map(e=>({effect:e,value:evaluate(node.child,skill,variant,options,e).truth}));
  const matching=evaluated.filter(e=>e.value===true).map(e=>e.effect);
  return result(matching.length?true:evaluated.some(e=>e.value===null)?null:false,matching);
 }
 const {field,op,value}=node;
 if(numeric.has(field))return result(compare(field==='value'?(effect?effectValue(effect,options.levels):null):variant.resources[field as keyof typeof variant.resources].value,op,value));
 const raw=originalOf(variant),needle=normalizeSkillText(value);
 let found:boolean;
 if(field==='profession')found=String(variant.profession)===value||professions[variant.profession]?.includes(needle);
 else if(field==='campaign')found=variant.campaigns.some(id=>String(id)===value||campaigns[id]?.includes(needle));
 else if(field==='attribute')found=attributeId(raw.attribute)===attributeId(value);
 else if(field==='mode')found=variant.modes.includes(needle==='pvp'?'pvp':needle==='pve'?'pve':value as 'pve');
 else if(field==='elite')found=variant.elite===boolean(value);
 else if(field==='conditional')found=!!effect&&effect.conditional===boolean(value);
 else if(field==='metric')found=!!effect&&(effect.metric===canonical(value)||(canonical(value)==='damage'&&effect.metric==='bonus-damage'));
 else if(field==='unit'||field==='scope')found=!!effect&&effect[field]===canonical(value);
 else if(field==='label')found=!!effect&&normalizeSkillText([effect.label,originalOf(effect).label,effect.condition].join(' ')).includes(needle);
 else if(field==='effect'||field==='tag')found=[...variant.tags,...raw.tags].some(tag=>canonical(tag)===canonical(value)||normalizeSkillText(tag).includes(needle));
 else if(field==='id')found=[skill.id,variant.id,...variant.gameIds.map(String),...skill.legacyEntryIds].includes(value);
 else if(field==='name')found=normalizeSkillText([skill.name,skill.englishName,variant.name,variant.englishName,...skill.searchAliases||[]].join(' ')).includes(needle);
 else if(field==='source')found=normalizeSkillText([...variant.acquisition,...raw.acquisition].flatMap(a=>[a.method,a.title,a.text,...a.areas]).join(' ')).includes(needle);
 else if(['target','range','aoe','type'].includes(field))found=normalizeSkillText(`${variant[field as 'type']} ${raw[field as 'type']}`).includes(field==='type'?skillTypes[value]||needle:needle);
 else found=effect?normalizeSkillText(`${effect.label} ${effect.condition}`).includes(needle):searchable(skill,variant).includes(needle);
 return result(op==='!='?!found:!!found);
}
function nameTerms(node:Node):string[]{
 if(node.kind==='and'||node.kind==='or')return [...nameTerms(node.left),...nameTerms(node.right)];
 return node.kind==='term'&&['name','text'].includes(node.field)&&node.op!== '!='?[normalizeSkillText(node.value)]:[];
}
function relevance(skill:LibrarySkill,variants:SkillVariant[],terms:string[]):number{
 const names=[skill.name,skill.englishName,...skill.searchAliases||[],...variants.flatMap(v=>[v.name,v.englishName])].map(normalizeSkillText);
 return terms.reduce((score,term)=>score+Math.max(0,...names.map(name=>name===term?100:name.startsWith(term)?60:name.includes(term)?30:0)),0);
}
export function searchSkills(data:SkillCatalog,query:string,options:SkillSearchOptions):SkillMatch[]{
 const ast=parseSkillQuery(query),terms=[...new Set(nameTerms(ast))],filter=options.filters||{},matches:SkillMatch[]=[];
 for(const skill of data.skills){
  const variants:SkillVariant[]=[],effects:Record<string,SkillEffect[]>={};
  for(const variant of skill.variants){
   const raw=originalOf(variant);
   if(filter.mode&&!variant.modes.includes(filter.mode)||filter.profession?.length&&!filter.profession.includes(variant.profession)||filter.attribute?.length&&!filter.attribute.includes(attributeId(raw.attribute))||filter.campaign?.length&&!variant.campaigns.some(c=>filter.campaign!.includes(c))||filter.type?.length&&!filter.type.includes(raw.type)||filter.elite!==undefined&&filter.elite!==variant.elite||filter.tag?.length&&!filter.tag.some(tag=>[...variant.tags,...raw.tags].some(t=>canonical(t)===canonical(tag))))continue;
   const matched=evaluate(ast,skill,variant,options);
   if(matched.truth===true){variants.push(variant);effects[variant.id]=[...new Map(matched.effects.map(e=>[e.id,e])).values()];}
  }
  if(variants.length)matches.push({skill,variants,effects,score:relevance(skill,variants,terms)});
 }
 const sort=options.sort||'relevance',descending=sort.startsWith('-'),field=sort.replace(/^-/,'');
 const sortValue=(match:SkillMatch)=>{if(field!=='effect')return match.variants[0].resources[field as keyof SkillVariant['resources']]?.value??null;const values=Object.values(match.effects).flat().map(e=>effectValue(e,options.levels)).filter((v):v is number=>v!==null);return values.length?Math.max(...values):null;};
 return matches.sort((a,b)=>{if(field==='name')return (descending?-1:1)*a.skill.name.localeCompare(b.skill.name);if(field==='relevance')return b.score-a.score||a.skill.name.localeCompare(b.skill.name);const av=sortValue(a),bv=sortValue(b);if(av===null||bv===null)return av===bv?0:av===null?1:-1;return (descending?-1:1)*(av-bv)||a.skill.name.localeCompare(b.skill.name);});
}
