/**
 * [INPUT]: 依赖固定中文 Wiki、渲染摘录与共用纯文本解析。
 * [OUTPUT]: 提取绑定英文身份的繁体译名、别名及歧义清单。
 * [POS]: 中文术语证据边界；不导入中文页面的数值与机制。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {createHash} from 'node:crypto';
import {plainText} from '../wiki/lib/wikitext.mjs';
const han=text=>/\p{Script=Han}/u.test(text);
const clean=text=>plainText(text.replace(/<br\s*\/?\s*>/gi,''));
const nonArticle=/^:?(?:File|Image|Media|Category|Special|檔案|文件|圖像|图像|影像|圖片|图片|分類|分类|特殊|媒體|媒体):/i;
const identity=text=>text.replaceAll('_',' ').replace(/^\s*(?:Template|模板):/i,'').replace(/#.*$/,'').trim();
export function extractChineseTerms(pages){
  const candidates=new Map();
  function add(english,text,page,strength){
    english=identity(english);text=clean(text);
    if(!english||han(english)||!han(text)||text.length>90||/[{}\n]|<[^>]*>/.test(text)||nonArticle.test(english)||nonArticle.test(text))return;
    const reference={site:page.site,title:page.title,pageid:page.pageid,revid:page.revid,url:page.url,
      revisionUrl:page.revisionUrl,retrievedAt:page.retrievedAt,captureKind:page.captureKind??'wikitext',sha256:page.sha256??createHash('sha256').update(page.wikitext??JSON.stringify(page.observedTerms)).digest('hex')};
    const list=candidates.get(english)??[];
    list.push({text,strength:strength+(page.site==='fandom'?1000:0),reference});candidates.set(english,list);
  }
  for(const page of pages){
    for(const term of page.observedTerms??[])add(term.english,term.text,page,70);
    const text=page.wikitext??'';
    const names=[...text.matchAll(/\|\s*(?:名稱|名称|中文名稱|中文名)\s*=\s*([^|}\n]+)/g)];
    const english=[...text.matchAll(/\|\s*(?:英名|英文名稱|英文名|英文)\s*=\s*([^|}\n]+)/g)];
    if(names.length===1&&english.length===1)add(english[0][1],names[0][1],page,100);
    const redirect=/^\s*#(?:redirect|重定向|重新導向)\s*\[\[([^\]|#]+)/i.exec(text);
    if(redirect)add(page.title,redirect[1],page,90);
    if(/^(?:Template|模板):/i.test(page.title)){
      const link=/^\s*(?:<includeonly>)?\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/.exec(text);
      if(link)add(page.title,link[1],page,80);
    }
    if(han(page.title)){
      const intro=new RegExp(clean(page.title).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'[（(]([^）)]+)[）)]').exec(clean(text.slice(0,2000)));
      if(intro)add(intro[1],page.title,page,85);
    }
    for(const link of text.matchAll(/\[\[(?:gww|en|w:c:guildwars):([^\]|]+)\|([^\]]+)\]\]/gi))add(link[1],link[2],page,60);
  }
  const terms={},conflicts={};
  for(const [english,list]of [...candidates].sort(([a],[b])=>a.localeCompare(b,'en'))){
    const highest=Math.max(...list.map(c=>c.strength));
    const best=list.filter(c=>c.strength===highest),names=[...new Set(best.map(c=>c.text))];
    if(names.length!==1){conflicts[english]=names.map(text=>({text,references:best.filter(c=>c.text===text).map(c=>c.reference)}));continue;}
    const chosen=names[0],references=[...new Map(best.map(c=>[`${c.reference.site}:${c.reference.pageid}:${c.reference.revid}`,c.reference])).values()];
    terms[english]={text:chosen,aliases:[...new Set(list.filter(c=>c.text!==chosen).map(c=>c.text))],references};
  }
  return {version:1,priority:['fandom','huiji'],terms,conflicts};
}
