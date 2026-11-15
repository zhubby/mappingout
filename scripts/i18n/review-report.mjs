import fs from 'node:fs';
import {contentFields} from '../../src/i18n/content-fields.ts';
import {sha256,numericIssues,translationReviewMatches} from './english-source.mjs';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const reviews=read('data/i18n/review.json').reviews,grouped=new Map();
for(const dataset of ['catalog','armor','calendar']){
  const data=read(`public/data/${dataset}.json`),baseline=read(`data/i18n/baseline/${dataset}.json`);
  const en=read(`public/data/i18n/en/${dataset}.json`),zh=read(`public/data/i18n/zh-CN/${dataset}.json`);
  for(const field of contentFields(data,dataset)){
    const key=`zh-CN/${dataset}/${field.key}`,source=baseline.fields[field.key],text=zh.fields[field.key],review=reviews[key];
    const translationHash=sha256(text);
    const approved=translationReviewMatches(source,text,review);
    const issues=source?numericIssues(source.text,text):['unverified-English-source'];
    const pendingNumeric=issues.includes('corrupt-token')||(issues.length&&!(approved&&review.numericReview));
    if(approved&&!pendingNumeric)continue;
    const groupKey=(source?.englishHash||sha256(field.source))+'\0'+translationHash+'\0'+(source?.evidenceHash||'');
    if(!grouped.has(groupKey))grouped.set(groupKey,{
      english:source?.text??null,
      ...(!source?{unverifiedEnglishDraft:en.fields[field.key],legacyText:field.source}:{}),
      chinese:text,englishHash:source?.englishHash??null,translationHash,
      references:source?.references||[],issues:pendingNumeric?issues:[],semanticReview:!approved,fields:[],
    });
    grouped.get(groupKey).fields.push(key);
  }
}
const groups=[...grouped.values()].sort((a,b)=>b.fields.length-a.fields.length);
const report={version:2,baseline:'Pinned Wiki English; legacy Chinese and unverified English drafts are never evidence',uniqueDrafts:groups.length,fields:groups.reduce((n,g)=>n+g.fields.length,0),groups};
fs.writeFileSync('data/i18n/review-queue.json',JSON.stringify(report,null,2)+'\n');
console.log('Review queue:',report.uniqueDrafts,'unique source/translation/revision groups across',report.fields,'fields');
