/**
 * [INPUT]: 依赖固定技能与备注子页、Wiki 表格及受限算术。
 * [OUTPUT]: 提供可读备注、机制警示与实际使用的固定引用。
 * [POS]: 技能备注的编译边界；先解析数值，再移除展示语法。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {plainText,templates,section,splitTopLevel} from './wikitext.mjs';
import {wikiTables} from './tables.mjs';
import {reference} from './content-facts.mjs';

function styleVariables(source) {
 const variables=new Map();
 source=source.replace(/\{\{\s*#vardefine:([^{}|]+)\|([^{}]*)\}\}/gi,(_raw,key,value)=>{
  if(!/^style\s*=/.test(value.trim()))throw Error(`Unsupported skill note variable: ${key}`);
  variables.set(key.trim(),value);return '';
 });
 return source.replace(/\{\{\s*#var:([^{}|]+)\s*\}\}/gi,(_raw,key)=>{
  if(!variables.has(key.trim()))throw Error(`Missing skill note variable: ${key}`);
  return variables.get(key.trim());
 });
}

function tableCell(source) {
 const pieces=splitTopLevel(source),color=/^\s*bgcolor\s*=\s*["']?([^"'\s]+)["']?\s*$/i.exec(pieces[0]);
 if(color){
  if(pieces.length!==2)throw Error('Invalid skill note table color cell');
  const label={lightcoral:'Red',skyblue:'Blue'}[color[1].toLowerCase()];
  return `${plainText(pieces[1])}${label?` [${label}]`:''}`;
 }
 return plainText(source).replace(/\s*\|\s*/g,' | ');
}

function htmlProgression(rows) {
 if(rows.length!==1||rows[0].length!==2)throw Error('Invalid skill note HTML progression');
 const [labels,values]=rows[0];
 const axis=/<div class="attr">([\s\S]*?)<\/div>/.exec(labels)?.[1];
 const label=/<div class="var">([\s\S]*?)<\/div>/.exec(labels)?.[1];
 const pairs=[...values.matchAll(/<div class="attr">\s*(\d+)\s*<\/div>\s*<div class="var">\s*([^<]+)\s*<\/div>/g)];
 if(!axis||!label||!pairs.length||new Set(pairs.map(pair=>pair[1])).size!==pairs.length||
  pairs.length!==(values.match(/<div class="(?:attr|var)">/g)||[]).length/2||
  pairs.some(pair=>!/^[-+]?\d+(?:\.\d+)?%?$/.test(pair[2].trim())))throw Error('Invalid skill note HTML progression values');
 return pairs.map(pair=>`${plainText(axis)} ${pair[1]}: ${plainText(label)}: ${pair[2].trim()}`);
}

function noteTable(source) {
 const captions=[],body=[];let caption;
 function flushCaption(){
  if(caption===undefined)return;
  const parts=splitTopLevel(caption);
  if(/^\s*(?:style|align|class|width)\s*=/.test(parts[0]))parts.shift();
  if(parts.length!==1||!plainText(parts[0]).trim())throw Error('Invalid skill note table caption');
  captions.push(plainText(parts[0]));caption=undefined;
 }
 for(const line of source.split('\n').map(value=>value.replace(/^[ \t]*:*/,''))){
  if(line.startsWith('|+')){flushCaption();caption=line.slice(2);continue;}
  if(caption!==undefined&&!/^[!|{]/.test(line)){caption+=` ${line}`;continue;}
  flushCaption();body.push(line);
 }
 flushCaption();
 const rows=wikiTables(body.join('\n'),{raw:true})[0];
 if(!rows?.length)throw Error('Empty skill note table');
 while(rows.length&&rows[0].length>1&&new Set(rows[0]).size===1)captions.push(plainText(rows.shift()[0]));
 if(rows.some(row=>row.some(cell=>/<div class="(?:attr|var)">/.test(cell))))return [...captions,...htmlProgression(rows)].join('\n');
 const header=rows.shift()?.map(tableCell);
 if(!header?.length||!rows.length)throw Error('Invalid skill note table');
 const rank=/^\d+(?:-\d+)?$/;
 let rowAxis=header[0],columns=header.slice(1),notices=[];
 if(rows[0].length>1&&tableCell(rows[0][0])===header[0]&&new Set(columns).size===1&&rows[0].slice(1).every(cell=>rank.test(tableCell(cell)))){
  const ranks=rows.shift().map(tableCell);
  if(columns.length!==ranks.length-1)notices.push(`[Source header spans ${columns.length} columns, but lists ${ranks.length-1} ranks]`);
  rowAxis=header[0];columns=ranks.slice(1).map(value=>`${header[1]} ${value}`);
 }else if(columns.every(value=>rank.test(value))){rowAxis='';columns=columns.map(value=>`${header[0]} ${value}`);}
 const data=rows.map(row=>row.map(tableCell));
 if(data.some(row=>row.some(cell=>cell.includes(' | ')))){
  // 单管线保留为原始单元格内容，禁止猜测缺失等级或拆分数值。
  if(data.some(row=>row.length!==columns.length+1))throw Error('Invalid skill note table with ambiguous cells');
  return [...captions,...notices,'[Source table has inconsistent cell separators. Values retain source order; ambiguous cells have no rank assignment.]',
   `Columns: ${columns.join('; ')}`,...data.map(row=>`${rowAxis?rowAxis+' ':''}${row[0]}: ${row.slice(1).join('; ')}`)].join('\n');
 }
 for(const row of data){
  // Wiki 省略末尾空备注栏；数值栏仍必须逐列存在。
  if(row.length===columns.length&&columns.at(-1).toLowerCase()==='notes')row.push('');
  if(row.length!==columns.length+1)throw Error('Invalid skill note table column count');
 }
 return [...captions,...notices,...data.map(row=>`${rowAxis?rowAxis+' ':''}${row[0]}: ${row.slice(1).flatMap((value,index)=>value?[`${columns[index]}: ${value}`]:[]).join('; ')}`)].join('\n');
}

export function parseSkillNotes(page,notePages,evaluate) {
 const noteReferences=[];
 function dependency(title){
  const source=notePages.find(item=>item.title.toLowerCase()===title.toLowerCase());
  if(!source)throw Error(`Missing skill note source: ${title}`);
  if(!noteReferences.some(ref=>ref.pageid===source.pageid))noteReferences.push(reference(source));
  return source;
 }
 function expand(source){
  let text=source.replace(/<!--[\s\S]*?-->/g,'')
   .replace(/\{\{\s*DEFAULTSORT\s*:[^{}]*\}\}/gi,'').replace(/__NOTOC__/g,'')
   .replace(/(\d+)\s*\{\{\s*(\d+)\/(\d+)\s*\}\}/g,(_raw,whole,numerator,denominator)=>String(Number(whole)+Number(numerator)/Number(denominator)))
   .replace(/\{\{\s*energy\s*\}\}/gi,' energy');
  for(const item of templates(text)){
   const name=item.name.toLowerCase(),fields=item.fields;let replacement;
   if(name==='speed'){
    if(Object.keys(fields).length!==4||[1,2,3,4].some(key=>!/^\d+(?:\.\d+)?$/.test(fields[key]||'')))throw Error('Invalid skill note speed arguments');
    replacement=dependency('Template:Speed').wikitext.replace(/<noinclude\b[^>]*>[\s\S]*?<\/noinclude>/gi,'')
     .replace(/\{\{\{([^{}]+)\}\}\}/g,(_raw,body)=>{const [key,fallback='']=body.split('|');return fields[key.trim()]??fallback;})
     .replace(/\{\{\s*#expr:\s*([^{}]*)\}\}/gi,(_raw,expression)=>String(evaluate(expression)));
   }else if(name==='/table'){
    if(Object.keys(fields).length)throw Error('Unsupported skill note table arguments');
    replacement=styleVariables(dependency(`${page.title}/table`).wikitext.replace(/<noinclude\b[^>]*>[\s\S]*?<\/noinclude>/gi,''));
   }else if(name==='research needed')replacement=`[Research needed: ${expand(fields[1]||'Source claim needs verification')}]`;
   else if(name==='outdated info')replacement=`[Source information may be outdated]${fields[1]?` ${expand(fields[1])}`:''}`;
   else if(name==='skill change')replacement=`[Source flags a skill functionality change]${fields[1]?` ${expand(fields[1])}`:''}`;
   else if(['bug','anomaly','note'].includes(name))replacement=expand(fields[1]||'');
   if(replacement!==undefined)text=text.replace(item.raw,replacement);
  }
  // 先解析外层参数，防止 Video URL 的等号变成模板命名参数。
  return text.replace(/\{\{\{\s*\|([^{}]*)\}\}\}/g,'$1');
 }
 function render(source){
  const expanded=expand(source).replace(/^[ \t]*:*[ \t]*\{\|[^\n]*\n[\s\S]*?^[ \t]*\|\}[ \t]*$/gm,noteTable)
   .replace(/^={3,}\s*(.*?)\s*={3,}$/gm,'$1');
  const text=plainText(expanded);
  if(/\{\{|\{\||\|\}|^\s*[|!]/m.test(text))throw Error(`Unparsed skill note markup: ${page.title}`);
  return text;
 }
 const notes=render(section(page.wikitext,'Notes'));
 const warnings=templates(page.wikitext).filter(item=>['bug','anomaly'].includes(item.name.toLowerCase())).map(item=>`${item.name.toLowerCase()}: ${render(item.fields[1]||'')}`);
 return {notes,warnings,noteReferences};
}
