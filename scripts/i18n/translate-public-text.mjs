/**
 * [INPUT]: 依赖公开文本与在线翻译接口。
 * [OUTPUT]: 提供带批次编号校验和重试的机器辅助翻译。
 * [POS]: 维护期翻译接口；不批准译文审校。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
// Maintainer-only tool for PUBLIC game/wiki text. Never used by the application.
// Results are drafts, not human-reviewed translations.
import { fetch, ProxyAgent } from 'undici';
const dispatcher = new ProxyAgent(process.env.HTTPS_PROXY || 'http://127.0.0.1:7890');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function translate(text, target) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  for (const [k,v] of Object.entries({client:'gtx',sl:target==='zh-TW'?'en':'auto',tl:target,dt:'t',q:text})) url.searchParams.set(k,v);
  let last;
  for(let attempt=0;attempt<6;attempt++) {
    try {
      const response=await fetch(url,{dispatcher,signal:AbortSignal.timeout(30000)});
      if(!response.ok) {
        if(response.status===429)await delay(Math.min(10000*2**attempt,60000));
        throw Error(`Translation HTTP ${response.status}`);
      }
      const result=await response.json();
      const output=result[0].map(part=>part[0]||'').join('');
      if(!output.trim())throw Error('Empty translation');
      return output;
    }catch(error){last=error;await delay(Math.min(1500*(attempt+1),6000));}
  }
  throw last;
}
export async function translateBatch(items,target) {
  const input=items.map((s,i)=>`[MO${i}]\n${s}`).join('\n');
  const output=await translate(input,target);
  const result=[];
  const matches=[...output.matchAll(/\[\s*(?:MO|莫|摩|墨)\s*(\d+)\s*\]/gi)];
  if(matches.length!==items.length) throw Error('Translation segment markers changed');
  for(let i=0;i<items.length;i++){
    if(Number(matches[i][1])!==i)throw Error('Translation segment order changed');
    result.push(output.slice(matches[i].index+matches[i][0].length,matches[i+1]?.index??output.length).trim());
  }
  return result;
}
