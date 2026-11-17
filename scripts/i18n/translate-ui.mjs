/**
 * [INPUT]: 依赖中文界面字典、翻译接口与已有英文缓存。
 * [OUTPUT]: 补齐英文界面字典。
 * [POS]: 界面翻译命令；与资料语言包编译分离。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { projectPath } from '../lib/paths.mjs';
import fs from 'node:fs';
import { translateBatch, translate } from './translate-public-text.mjs';
const zh=JSON.parse(fs.readFileSync(projectPath('src/i18n/zh-CN.json'),'utf8'));
const file='src/i18n/en.json';
const en=fs.existsSync(projectPath(file))?JSON.parse(fs.readFileSync(projectPath(file),'utf8')):{};
const queue=Object.keys(zh).filter(k=>!en[k]);
while(queue.length){
 const batch=[];let length=0;
 while(queue.length&&length<650){const s=queue.shift();batch.push(s);length+=s.length;}
 const tokens=[];
 const protect=s=>s.replace(/\{\{\w+\}\}/g,token=>{const i=tokens.push(token)-1;return `ZXQ${i}ZXQ`;});
 const restore=s=>s.replace(/ZXQ\s*(\d+)\s*ZXQ/gi,(_,i)=>tokens[Number(i)]);
 const input=batch.map(protect);
 let results;
 try{results=await translateBatch(input,'en');}catch{results=[];for(const s of input)results.push(await translate(s,'en'));}
 batch.forEach((key,i)=>en[key]=restore(results[i]));
 fs.writeFileSync(projectPath(file),JSON.stringify(en,null,2)+'\n');
 console.log('UI translated',Object.keys(en).length,'/',Object.keys(zh).length);
}
