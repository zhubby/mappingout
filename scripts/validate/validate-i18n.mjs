/**
 * [INPUT]: 依赖繁英资料、固定证据、逐文本校对与字体许可。
 * [OUTPUT]: 校验字段、动态效果身份、内容哈希与正式发布审校门禁。
 * [POS]: 本地和正式构建共用的双语验证入口。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { projectRoot } from '../lib/paths.mjs';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {contentFields,datasets} from '../../src/i18n/content-fields.ts';
import {numericIssues,translationReviewMatches} from '../i18n/english-source.mjs';
import {extractChineseTerms} from '../i18n/chinese-sources.mjs';
import {loadProofreading,proofreadText,assertDynamicTokens} from '../i18n/proofreading.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
export function validateI18n(root=projectRoot,release=false){
 const read=file=>fs.readFileSync(path.join(root,file),'utf8');
 const json=file=>JSON.parse(read(file));
 const errors=[],stats={fields:0,pendingReview:0,numericReview:0,mixedLanguage:0,unverifiedEnglish:0,sourcePlaceholders:0};
 const zh=json('src/i18n/zh-TW.json'),en=json('src/i18n/en.json');
 if(JSON.stringify(Object.keys(zh).sort())!==JSON.stringify(Object.keys(en).sort()))errors.push('UI locale key sets differ');
 const placeholders=s=>[...s.matchAll(/\{\{\w+\}\}/g)].map(m=>m[0]).sort().join('|');
 for(const [key,value]of Object.entries(zh)){
  if(!en[key]?.trim())errors.push(`Missing English UI: ${key}`);
  else if(placeholders(value)!==placeholders(en[key]))errors.push(`UI interpolation mismatch: ${key}`);
 }
 const review=json('data/i18n/review.json').reviews;
 const provenance=json('data/i18n/zh-TW-provenance.json');
 let proofreading=new Map();
 try{proofreading=loadProofreading(path.join(root,'data/i18n/proofreading'));}catch(error){errors.push(error.message);}
 const proofreadFields=new Set();
 const pages=[...json('data/i18n/chinese-sources.json').pages,...json('data/i18n/huiji-sources.json').pages];
 for(const page of pages){
  const text=page.captureKind==='rendered-table-transcription'?JSON.stringify(page.observedTerms):page.wikitext;
  if(hash(text)!==page.sha256)errors.push(`Chinese source snapshot changed: ${page.site}/${page.title}`);
 }
 if(JSON.stringify(extractChineseTerms(pages))!==JSON.stringify(json('data/i18n/zh-TW-terms.json')))errors.push('Chinese terminology differs from pinned evidence');
 const wikiReferences=new Map();
 for(const dataset of datasets){
  const raw=read(`public/data/${dataset}.json`),data=JSON.parse(raw),fields=contentFields(data,dataset);
  const baseline=json(`data/i18n/baseline/${dataset}.json`);
  for(const field of Object.values(baseline.fields))for(const reference of field.references)wikiReferences.set(reference.pageid,reference);
  const english=json(`public/data/i18n/en/${dataset}.json`);
  const englishHash=hash(JSON.stringify(english.fields)),baselineHash=hash(JSON.stringify(baseline));
  if(baseline.sourceHash!==hash(raw))errors.push(`Stale English baseline: ${dataset}`);
  const unresolved=fields.filter(f=>!baseline.fields[f.key]).map(f=>f.key);
  if(JSON.stringify(unresolved)!==JSON.stringify(english.unverifiedFields))errors.push(`English review inventory differs: ${dataset}`);
  stats.unverifiedEnglish+=unresolved.length;
  for(const locale of ['zh-TW','en']){
   const pack=json(`public/data/i18n/${locale}/${dataset}.json`);
   if(locale==='zh-TW'&&provenance.datasets[dataset]?.packHash!==hash(JSON.stringify(pack)))errors.push(`Stale Chinese provenance: ${dataset}`);
   if(pack.sourceHash!==hash(raw)||pack.locale!==locale||pack.dataset!==dataset||pack.version!==1)errors.push(`Stale ${locale}/${dataset} pack`);
   if(pack.englishHash!==englishHash||pack.baselineHash!==baselineHash)errors.push(`Stale English binding: ${locale}/${dataset}`);
   const expected=new Set(fields.map(field=>field.key));
   if(Object.keys(pack.fields).some(key=>!expected.has(key)))errors.push(`Obsolete ${locale}/${dataset} field`);
   for(const field of fields){
    stats.fields++;
    const text=pack.fields[field.key];
    if(!text?.trim()){errors.push(`Missing ${locale}/${dataset}/${field.key}`);continue;}
    // Archived, unverified English gaps remain visible without granting source approval.
    const sourceGap=locale==='en'&&!baseline.fields[field.key]&&text.includes('<unk>');
    if(sourceGap)stats.sourcePlaceholders++;
    if(/ZXQ\d+ZXQ|MOPROTECT|(?:PROT)?ECT\d+(?:END)?|\[MO\d+\]|MISSING_TOKEN|\u2581/.test(text)||text.includes('<unk>')&&!sourceGap)errors.push(`Unresolved placeholder: ${locale}/${dataset}/${field.key}`);
    if(locale==='en'&&/\p{Script=Han}/u.test(text))errors.push(`Chinese in English content: ${dataset}/${field.key}`);
    if(locale==='zh-TW'){
      if(/<br\b|(?:圖像|影像|檔案|文件|File|Image|Media):[^\s]*\.(?:png|jpe?g|gif|svg|webp)/i.test(text))errors.push(`Wiki presentation leaked into Chinese text: ${dataset}/${field.key}`);
      const origin=provenance.adaptations[`${dataset}/${field.key}`]??provenance.texts[hash(english.fields[field.key])];
      if(!origin||origin.translationHash!==hash(text))errors.push(`Missing Chinese text provenance: ${dataset}/${field.key}`);
      const allowed=new Set(['Wiki','wiki','NPC','Boss','boss','PvE','PvP','AR','HP','XP','UTC','GMT','GvG','PvX','GW','HM','NM','AoE','DPS','I','II','III','IV','V','X']);
      if([...text.matchAll(/[A-Za-z][A-Za-z'-]*/g)].some(match=>!allowed.has(match[0])))stats.mixedLanguage++;
    }
    const source=baseline.fields[field.key];
    if(source)try{assertDynamicTokens(source.text,text);}catch(error){errors.push(`${error.message}: ${locale}/${dataset}/${field.key}`);}
    if(locale==='zh-TW')try{
      const correction=proofreadText(proofreading,dataset,field.key,source);
      if(correction){
        proofreadFields.add(`${dataset}/${field.key}`);
        if(text!==correction.text)errors.push(`Proofread text differs: ${dataset}/${field.key}`);
      }
    }catch(error){errors.push(error.message);}
    if(source&&(source.legacyHash!==hash(field.source)||source.englishHash!==hash(source.text)||source.evidenceHash!==hash(JSON.stringify(source.references))))errors.push(`Stale Wiki field: ${dataset}/${field.key}`);
    if(locale==='en'&&source&&text!==source.text)errors.push(`English differs from Wiki baseline: ${dataset}/${field.key}`);
    const record=review[`${locale}/${dataset}/${field.key}`];
    const approved=translationReviewMatches(source,text,record);
    if(locale==='zh-TW'){
      if(!approved)stats.pendingReview++;
      const numeric=source?numericIssues(source.text,text):[];
      if(numeric.includes('corrupt-token')||(numeric.length&&!(approved&&record.numericReview)))stats.numericReview++;
    }
   }
  }
 }
 if(proofreadFields.size!==proofreading.size)errors.push('Proofreading includes stale or obsolete fields');
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
