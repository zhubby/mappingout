// Maintainer-only tool for PUBLIC game/wiki text. Never used by the application.
// Results are drafts, not human-reviewed translations.
import { fetch, ProxyAgent } from 'undici';
const dispatcher = new ProxyAgent(process.env.HTTPS_PROXY || 'http://127.0.0.1:7890');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function translate(text, target) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  for (const [k,v] of Object.entries({client:'gtx',sl:'auto',tl:target,dt:'t',q:text})) url.searchParams.set(k,v);
  let last;
  for(let attempt=0;attempt<6;attempt++) {
    try {
      const response=await fetch(url,{dispatcher,signal:AbortSignal.timeout(30000)});
      if(!response.ok) throw Error(`Translation HTTP ${response.status}`);
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
  const matches=[...output.matchAll(/\[\s*MO\s*(\d+)\s*\]/gi)];
  if(matches.length!==items.length) throw Error('Translation segment markers changed');
  for(let i=0;i<items.length;i++){
    if(Number(matches[i][1])!==i)throw Error('Translation segment order changed');
    result.push(output.slice(matches[i].index+matches[i][0].length,matches[i+1]?.index??output.length).trim());
  }
  return result;
}
