/**
 * [INPUT]: 依赖固定技能页面、页面分类和成长模板。
 * [OUTPUT]: 提供可学习技能判定及逐等级成长表。
 * [POS]: 全技能编译的纯事实边界；不读取网络或个人记录。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {plainText,templates} from './wikitext.mjs';
import {professions} from './skill-facts.mjs';
import {wikiTables} from './tables.mjs';

export function skillEligibility(page,categories=[]) {
 const fields=templates(page.wikitext,'Skill infobox')[0]?.fields;
 if(!fields)return {included:false,reason:'No skill infobox'};
 if(categories.some(c=>/Historical content|Skill histories|Removed skills|Unimplemented skills|Monster skills|Bonus Mission Pack skills|Snow fighting skills|Celestial skills|Temporary skills|Disguise skills/.test(c)))return {included:false,reason:'Historical, monster or temporary category'};
 if(plainText(fields.special)&&!/^duplicate$/i.test(plainText(fields.special)))return {included:false,reason:`Special skill: ${plainText(fields.special)}`};
 if(/^(title|party bonus|blessing)$/i.test(plainText(fields.type)))return {included:false,reason:'Passive effect'};
 if(professions[plainText(fields.profession)]>0)return {included:true,reason:'Current profession skill'};
 if(['Resurrection Signet','Signet of Capture'].includes(page.title))return {included:true,reason:'Learnable common skill'};
 if(/rank$/i.test(plainText(fields.attribute))&&/^(y|yes|true)$/i.test(fields['pve-only']||''))return {included:true,reason:'Learnable title-linked PvE skill'};
 return {included:false,reason:'Not a learnable player skill'};
}

// 只解释成长模板需要的算术。禁止执行 Wiki 文本或 JavaScript。
function arithmetic(source) {
 const tokens=source.match(/\d+(?:\.\d+)?|\.\d+|round|floor|ceil|[()+\-*/^]/g)||[];
 if(tokens.join('')!==source.replace(/\s+/g,''))throw Error(`Unsupported growth expression: ${source}`);
 let position=0;
 const precedence={round:1,'+':2,'-':2,'*':3,'/':3,'^':4};
 const round=(value,places)=>Math.sign(value)*Math.floor(Math.abs(value)*10**places+0.5+1e-10)/10**places;
 function expression(min=0) {
  let value,token=tokens[position++];
  if(token==='('){value=expression();if(tokens[position++]!==')')throw Error('Unclosed growth expression');}
  else if(token==='+'||token==='-')value=(token==='-'?-1:1)*expression(5);
  else if(token==='floor'||token==='ceil')value=Math[token](expression(5));
  else {value=Number(token);if(!Number.isFinite(value))throw Error(`Missing growth operand: ${source}`);}
  while(position<tokens.length&&(precedence[tokens[position]]??-1)>=min){
   const op=tokens[position++],other=expression(precedence[op]+(op==='^'?0:1));
   value=op==='+'?value+other:op==='-'?value-other:op==='*'?value*other:op==='/'?value/other:op==='^'?value**other:round(value,other);
  }
  return value;
 }
 const value=expression();
 if(position!==tokens.length||!Number.isFinite(value))throw Error(`Invalid growth expression: ${source}`);
 return value;
}

export function compileGrowth(page,definitions) {
 const rows=[];
 for(const [index,item]of templates(page.wikitext).filter(t=>/^skill progression/i.test(t.name)).entries()){
  const definition=definitions[item.name.toLowerCase()];
  if(!definition)throw Error(`Missing progression template: ${item.name}`);
  const fields=item.fields,variables=Object.keys(fields).filter(key=>/^var(?:\d+|f|x) name$/.test(key)).map(key=>key.slice(0,-5));
  for(const variable of variables){
   const row={id:`growth:${index}:${variable}`,label:plainText(fields[`${variable} name`]),axis:plainText(fields.attribute||fields['title track']||'No Attribute'),axisKind:fields['title track']?'title':'attribute',values:{},anchors:Object.fromEntries(Object.entries(fields).filter(([key])=>key.startsWith(variable+' at')).map(([key,value])=>[key.slice(variable.length+3),Number(value)])),template:item.name};
   for(const column of definition.matchAll(/<div class="attr">\s*(\d+)\s*<\/div>([\s\S]*?)(?=<div class="attr">|$)/g)){
    const rank=Number(column[1]);
    const cell=[...column[2].matchAll(/<div class="var">([\s\S]*?)<\/div>/g)].map(m=>m[1]).find(raw=>new RegExp(`\\{\\{\\{\\s*${variable}(?:\\s+at|\\s+factor|${rank}\\s*[|}])`,'i').test(raw));
    if(!cell)continue;
    const replaced=cell.replace(/\{\{\{([^{}]+)\}\}\}/g,(_,body)=>{const [key,...fallback]=body.split('|');return fields[key.trim().toLowerCase()]??fallback.join('|');});
    const expr=/\{\{\s*#expr:\s*([^{}]*)\}\}/i.exec(replaced)?.[1];
    const raw=expr??plainText(replaced);
    if(!raw.trim())continue;
    try{row.values[rank]=arithmetic(raw);}catch(error){throw Error(`${page.title||'Skill'} / ${row.label} / ${rank}: ${error.message}`);}
   }
   if(!Object.keys(row.values).length)throw Error(`Unparsed progression: ${page.title} / ${row.label}`);
   if(row.anchors[0]===undefined&&row.values[0]!==undefined)row.anchors={0:row.values[0],15:row.values[15]};
   rows.push(row);
  }
 }
 const fields=templates(page.wikitext,'Skill infobox')[0]?.fields||{};
 const axis=plainText(fields.attribute||'No Attribute');
 for(const table of wikiTables(page.wikitext.split(/^==\s*Acquisition\s*==/mi)[0])){
  const header=table.findIndex(row=>row[0]===axis&&row.slice(1).every(cell=>/^\d+$/.test(cell)));
  if(header<0)continue;
  const ranks=table[header].slice(1).map(Number);
  for(const [index,cells]of table.slice(header+1).entries()){
   if(cells.length!==ranks.length+1||!cells.slice(1).every(cell=>/^-?\d+(?:\.\d+)?%?$/.test(cell)))continue;
   const values=Object.fromEntries(ranks.map((rank,i)=>[rank,Number(cells[i+1].replace('%',''))]));
   rows.push({id:`table:${index}`,label:cells[0],axis,axisKind:/rank$/i.test(axis)?'title':'attribute',values,anchors:{0:values[0]??values[ranks[0]],15:values[15]??values[ranks.at(-1)]},template:'Explicit progression table'});
  }
 }
 return rows;
}
