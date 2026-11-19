/**
 * [INPUT]: 依赖界面键、旧界面值、OpenCC、中文术语及最终资料包。
 * [OUTPUT]: 生成繁体界面及兼容旧查询的静态别名。
 * [POS]: 维护期字形和术语编译；运行时不依赖 OpenCC。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import fs from 'node:fs';
import {Converter} from 'opencc-js';
import {projectPath} from '../lib/paths.mjs';
const read=file=>JSON.parse(fs.readFileSync(projectPath(file),'utf8'));
const save=(file,data)=>fs.writeFileSync(projectPath(file),JSON.stringify(data,null,2)+'\n');
const traditional=Converter({from:'cn',to:'twp'});
const english=read('src/i18n/en.json'),editorial=read('data/i18n/zh-TW-editorial.json');
const legacy=read('data/i18n/ui-source.json').fields;
const terms=read('data/i18n/zh-TW-terms.json').terms;
save('src/i18n/zh-TW.json',Object.fromEntries(Object.entries(english).map(([key,en])=>[
  key,(editorial.ui[key]??editorial.terms[en]??traditional(legacy[key]??key)).replaceAll('秘法','祕法'),
])));
const labels=read('src/i18n/attribute-labels.json');
const contentAliases=new Map();
for(const dataset of ['catalog','skills']){
  const en=read(`public/data/i18n/en/${dataset}.json`).fields,zh=read(`public/data/i18n/zh-TW/${dataset}.json`).fields;
  for(const [key,name]of Object.entries(en))if(key.endsWith('/attribute')||key.startsWith('tracks/')&&key.endsWith('/name')){
    const names=contentAliases.get(name)??[];
    if(zh[key])names.push(zh[key]);
    contentAliases.set(name,names);
  }
}
save('src/i18n/attribute-aliases.json',Object.fromEntries(labels.map(([zh,en])=>[en,[...new Set([zh,traditional(zh),editorial.terms[en]??terms[en]?.text??traditional(zh),...contentAliases.get(en)??[]])]])));
// Query syntax and old shared URLs retain their original identities.
const query=fs.readFileSync(projectPath('src/features/skills/query.ts'),'utf8');
const maps={};
for(const name of ['fields','aliases','skillTypes']){
  const literal=new RegExp(`const ${name}:Record<string,string>=(\\{[^;]+\\});`).exec(query)?.[1];
  if(!literal)throw Error(`Missing query vocabulary: ${name}`);
  // The literal is a checked-in static object, never user input.
  const values=Function(`return (${literal})`)();
  maps[name]=Object.fromEntries(Object.entries(values).map(([key,value])=>[traditional(key),value]));
}
save('src/i18n/query-aliases.json',maps);
