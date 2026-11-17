/**
 * [INPUT]: 依赖地址参数中的技能筛选和等级文本。
 * [OUTPUT]: 提供共享参数目录、安全等级和多选解析。
 * [POS]: 应用路由与技能页共用的纯参数边界。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
export const skillParamKeys=['sq','skill','sVersion','sCompare','sMode','sProfession','sAttribute','sCampaign','sType','sElite','sUnconditional','sSort','sRank','sRanks','sAttributes','sTag',...['energy','adrenaline','activation','recharge','upkeep','sacrifice','overcast'].flatMap(key=>[`s${key}Min`,`s${key}Max`])];
export const selectedValues=(value:string|undefined)=>value?.split('|').filter(Boolean)||[];
export function rankMap(raw:string|undefined,max=20):Record<string,number>{
 try{
  const value=JSON.parse(raw||'{}');if(!value||Array.isArray(value)||typeof value!=='object')return {};
  return Object.fromEntries(Object.entries(value).filter(([,n])=>typeof n==='number'&&Number.isFinite(n)).map(([key,n])=>[key,Math.max(0,Math.min(max,Math.round(n as number)))]));
 }catch{return {};}
}
export const boundedRank=(raw:string|undefined,fallback=12,max=20)=>raw!==undefined&&raw!==''&&Number.isFinite(Number(raw))?Math.max(0,Math.min(max,Math.round(Number(raw)))):fallback;
