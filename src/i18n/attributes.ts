/**
 * [INPUT]: 依赖属性简繁别名及固定英文身份。
 * [OUTPUT]: 将简繁及英文属性转换为稳定检索标识。
 * [POS]: 地图和技能数值的属性身份边界。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import labels from './attribute-labels.json';
import historical from './attribute-aliases.json';
const slug=(text:string)=>text.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const aliases=new Map(labels.flatMap(([zh,en])=>[zh,en,slug(en),...historical[en as keyof typeof historical]||[]].map(name=>[name,slug(en)])));
export function attributeId(value:string|undefined):string { return value ? aliases.get(value) || value : ''; }
