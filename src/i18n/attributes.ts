import labels from './attribute-labels.json';
const slug=(text:string)=>text.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const aliases=new Map(labels.flatMap(([zh,en])=>[[zh,slug(en)],[en,slug(en)],[slug(en),slug(en)]]));
export function attributeId(value:string|undefined):string { return value ? aliases.get(value) || value : ''; }
