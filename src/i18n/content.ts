/**
 * [INPUT]: 依赖本地资料、双语包、字段目录与 HTTP 兼容哈希。
 * [OUTPUT]: 提供不可变的资料投影、原文和双语检索别名。
 * [POS]: 全应用资料读取边界；失败请求可重新加载。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { contentFields, type Dataset } from './content-fields';
import type { Locale } from './index';
import { sha256Hex } from '../shared/browserCrypto';

export interface LanguagePack { version: 1; locale: Locale; dataset: Dataset; sourceHash: string; englishHash?: string; baselineHash?: string; fields: Record<string,string> }
export interface ContentBundle<T> { original: T; packs: Record<Locale,LanguagePack> }
const requests=new Map<string,Promise<ContentBundle<unknown>>>();
const originals=new WeakMap<object,object>();
const projections=new WeakMap<object,Partial<Record<Locale,unknown>>>();
export function originalOf<T extends object>(value:T):T { return (originals.get(value)??value) as T; }
export function projectContent<T>(bundle:ContentBundle<T>,locale:Locale):T {
  const existing=projections.get(bundle)?.[locale];if(existing)return existing as T;
  const pack=bundle.packs[locale];
  if(pack.locale!==locale)throw Error('Invalid content locale');
  const data=structuredClone(bundle.original);
  function remember(local:unknown,raw:unknown){
    if(!local||!raw||typeof local!=='object'||typeof raw!=='object')return;
    originals.set(local,raw);
    if(Array.isArray(local))local.forEach((v,i)=>remember(v,(raw as unknown[])[i]));
    else for(const key of Object.keys(local))remember((local as Record<string,unknown>)[key],(raw as Record<string,unknown>)[key]);
  }
  remember(data,bundle.original);
  for(const field of contentFields(bundle.original,pack.dataset)) {
    const translated=pack.fields[field.key];
    if(typeof translated!=='string'||!translated.trim())throw Error(`Missing ${locale} translation: ${field.key}`);
    let object=data as Record<string|number,unknown>;
    for(const part of field.path.slice(0,-1))object=object[part] as typeof object;
    object[field.path.at(-1)!]=translated;
    if(pack.dataset==='skills'&&field.path[0]==='skills'&&field.path[2]==='variants'){
      const row=(data as {skills:{variants:{searchTexts?:string[]}[]}[]}).skills[field.path[1] as number].variants[field.path[3] as number];
      (row.searchTexts??=[]).push(bundle.packs['zh-CN'].fields[field.key],bundle.packs.en.fields[field.key]);
    }
  }
  // Search both languages without showing duplicate names in the interface.
  for(const collection of ['records','sets','activities','materials','quests','skills']) {
    const rows=(data as Record<string,unknown[]>)[collection];
    const rawRows=(bundle.original as Record<string,Record<string,unknown>[]>)[collection];
    if(rows)rows.forEach((row,index)=>{
      const item=row as Record<string,unknown>,raw=rawRows[index];
      item.searchAliases=[raw.name,raw.englishName,bundle.packs['zh-CN'].fields[`${collection}/${raw.id}/name`],bundle.packs.en.fields[`${collection}/${raw.id}/name`]].filter(Boolean);
      if(collection==='quests')for(const field of ['region','givenBy','givenAt'])for(const language of ['zh-CN','en'] as const)(item.searchAliases as string[]).push(bundle.packs[language].fields[`quests/${raw.id}/${field}`]||'');
      if(collection==='records')item.descriptionLanguage=locale==='en'?'en':'zh';
    });
  }
  projections.set(bundle,{...projections.get(bundle),[locale]:data});return data;
}
export function loadContent<T>(dataset:Dataset):Promise<ContentBundle<T>> {
  let pending=requests.get(dataset);
  if(!pending){
    const read=async(path:string)=>{const response=await fetch(`${import.meta.env.BASE_URL}data/${path}`);if(!response.ok)throw Error(`Data HTTP ${response.status}`);return response.text();};
    pending=Promise.all([read(`${dataset}.json`),read(`i18n/zh-CN/${dataset}.json`),read(`i18n/en/${dataset}.json`)]).then(async([raw,zh,en])=>{
      const hash=await sha256Hex(raw);
      const packs={'zh-CN':JSON.parse(zh) as LanguagePack,en:JSON.parse(en) as LanguagePack};
      for(const [locale,pack]of Object.entries(packs))if(pack.version!==1||pack.dataset!==dataset||pack.locale!==locale||pack.sourceHash!==hash)throw Error(`Stale ${locale} content pack: ${dataset}`);
      const englishHash=await sha256Hex(JSON.stringify(packs.en.fields));
      if(packs.en.englishHash!==englishHash||packs['zh-CN'].englishHash!==englishHash||!packs.en.baselineHash||packs['zh-CN'].baselineHash!==packs.en.baselineHash)throw Error(`Stale English translation baseline: ${dataset}`);
      const original=JSON.parse(raw);
      for(const field of contentFields(original,dataset))for(const [locale,pack]of Object.entries(packs))if(!pack.fields[field.key]?.trim())throw Error(`Missing ${locale} translation: ${field.key}`);
      return {original,packs};
    }).catch(error=>{requests.delete(dataset);throw error;});
    requests.set(dataset,pending);
  }
  return pending as Promise<ContentBundle<T>>;
}
