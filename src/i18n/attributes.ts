/**
 * [INPUT]: 依赖属性中英文固定标签。
 * [OUTPUT]: 将双语属性转换为稳定检索标识。
 * [POS]: 地图和技能数值的属性身份边界。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import labels from './attribute-labels.json';
const slug=(text:string)=>text.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const aliases=new Map(labels.flatMap(([zh,en])=>[[zh,slug(en)],[en,slug(en)],[slug(en),slug(en)]]));
export function attributeId(value:string|undefined):string { return value ? aliases.get(value) || value : ''; }
