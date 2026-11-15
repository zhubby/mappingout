import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {contentFields} from '../src/i18n/content-fields.ts';
import {numericIssues,translationReviewMatches} from './i18n/english-source.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
export function validateI18n(root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),release=false){
 const read=file=>fs.readFileSync(path.join(root,file),'utf8');
 const json=file=>JSON.parse(read(file));
 const errors=[],stats={fields:0,pendingReview:0,numericReview:0,mixedLanguage:0,unverifiedEnglish:0};
 const zh=json('src/i18n/zh-CN.json'),en=json('src/i18n/en.json');
 if(JSON.stringify(Object.keys(zh).sort())!==JSON.stringify(Object.keys(en).sort()))errors.push('UI locale key sets differ');
 const placeholders=s=>[...s.matchAll(/\{\{\w+\}\}/g)].map(m=>m[0]).sort().join('|');
 for(const [key,value]of Object.entries(zh)){
  if(!en[key]?.trim())errors.push(`Missing English UI: ${key}`);
  else if(placeholders(value)!==placeholders(en[key]))errors.push(`UI interpolation mismatch: ${key}`);
 }
 const review=json('data/i18n/review.json').reviews;
 const wikiReferences=new Map();
 for(const dataset of ['catalog','armor','calendar']){
  const raw=read(`public/data/${dataset}.json`),data=JSON.parse(raw),fields=contentFields(data,dataset);
  const baseline=json(`data/i18n/baseline/${dataset}.json`);
  for(const field of Object.values(baseline.fields))for(const reference of field.references)wikiReferences.set(reference.pageid,reference);
  const english=json(`public/data/i18n/en/${dataset}.json`);
  const englishHash=hash(JSON.stringify(english.fields)),baselineHash=hash(JSON.stringify(baseline));
  if(baseline.sourceHash!==hash(raw))errors.push(`Stale English baseline: ${dataset}`);
  const unresolved=fields.filter(f=>!baseline.fields[f.key]).map(f=>f.key);
  if(JSON.stringify(unresolved)!==JSON.stringify(english.unverifiedFields))errors.push(`English review inventory differs: ${dataset}`);
  stats.unverifiedEnglish+=unresolved.length;
  for(const locale of ['zh-CN','en']){
   const pack=json(`public/data/i18n/${locale}/${dataset}.json`);
   if(pack.sourceHash!==hash(raw)||pack.locale!==locale||pack.dataset!==dataset||pack.version!==1)errors.push(`Stale ${locale}/${dataset} pack`);
   if(pack.englishHash!==englishHash||pack.baselineHash!==baselineHash)errors.push(`Stale English binding: ${locale}/${dataset}`);
   const expected=new Set(fields.map(field=>field.key));
   if(Object.keys(pack.fields).some(key=>!expected.has(key)))errors.push(`Obsolete ${locale}/${dataset} field`);
   for(const field of fields){
    stats.fields++;
    const text=pack.fields[field.key];
    if(!text?.trim()){errors.push(`Missing ${locale}/${dataset}/${field.key}`);continue;}
    if(/ZXQ\d+ZXQ|\[MO\d+\]|MISSING_TOKEN/.test(text))errors.push(`Unresolved placeholder: ${locale}/${dataset}/${field.key}`);
    if(locale==='en'&&/\p{Script=Han}/u.test(text))errors.push(`Chinese in English content: ${dataset}/${field.key}`);
    if(locale==='zh-CN'){
      const allowed=new Set(['Wiki','wiki','NPC','Boss','boss','PvE','PvP','AR','HP','XP','UTC','GMT','GvG','PvX','GW','HM','NM','AoE','DPS','I','II','III','IV','V','X']);
      if([...text.matchAll(/[A-Za-z][A-Za-z'-]*/g)].some(match=>!allowed.has(match[0])))stats.mixedLanguage++;
    }
    const source=baseline.fields[field.key];
    if(source&&(source.legacyHash!==hash(field.source)||source.englishHash!==hash(source.text)||source.evidenceHash!==hash(JSON.stringify(source.references))))errors.push(`Stale Wiki field: ${dataset}/${field.key}`);
    if(locale==='en'&&source&&text!==source.text)errors.push(`English differs from Wiki baseline: ${dataset}/${field.key}`);
    const record=review[`${locale}/${dataset}/${field.key}`];
    const approved=translationReviewMatches(source,text,record);
    if(locale==='zh-CN'){
      if(!approved)stats.pendingReview++;
      const numeric=source?numericIssues(source.text,text):[];
      if(numeric.includes('corrupt-token')||(numeric.length&&!(approved&&record.numericReview)))stats.numericReview++;
    }
   }
  }
 }
 if(release){
  const current=json('data/i18n/wiki-current-revisions.json');
  const referenceHash=hash(JSON.stringify([...wikiReferences.values()].sort((a,b)=>a.pageid-b.pageid)));
  if(current.referenceHash!==referenceHash||current.checked!==wikiReferences.size)errors.push('Wiki current-revision check does not match the English baseline');
  if(current.changed.length||current.errors.length)errors.push('Wiki revision changes still require review');
 }
 const fonts=json('public/fonts/manifest.json');
 for(const font of fonts.fonts){
  if(!font.file){if(release)errors.push(`${font.family}: font file and embedding license are unresolved`);continue;}
  const file=path.join(root,'public',font.file);
  if(!fs.existsSync(file)||hash(fs.readFileSync(file))!==font.sha256)errors.push(`Missing or changed font: ${font.family}`);
  if(font.licenseFile&&!fs.existsSync(path.join(root,'public',font.licenseFile)))errors.push(`Missing font license: ${font.family}`);
  if(release&&!font.distributionApproved)errors.push(`Font distribution not approved: ${font.family}`);
  if(release&&font.distributionApproved&&!font.licenseFile)errors.push(`Font distribution evidence missing: ${font.family}`);
 }
 if(release&&stats.pendingReview)errors.push(`${stats.pendingReview} Chinese fields still require review against English Wiki`);
 if(release&&stats.unverifiedEnglish)errors.push(`${stats.unverifiedEnglish} English fields still require Wiki source verification`);
 if(release&&stats.numericReview)errors.push(`${stats.numericReview} translated fields require numeric/token review`);
 if(release&&stats.mixedLanguage)errors.push(`${stats.mixedLanguage} Chinese fields still contain untranslated Latin words`);
 return {errors,stats};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=validateI18n(undefined,process.argv.includes('--release'));
 console.log(JSON.stringify({stats:result.stats,errors:result.errors.slice(0,30),errorCount:result.errors.length},null,2));
 if(result.errors.length)process.exitCode=1;
}
