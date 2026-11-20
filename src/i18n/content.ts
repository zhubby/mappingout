/**
 * [INPUT]: 依赖资料 worker、语言目录与 React 可消费的进度回调。
 * [OUTPUT]: 提供繁英投影、聚合进度、译名证据、旧名与已访问路径。
 * [POS]: 全应用资料读取边界；校验和投影都在 worker 内执行。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { contentFields, type Dataset } from './content-fields';
import type { Locale } from './index';

interface NameSource { kind:string; references:{site:string;title:string;revid:number;revisionUrl:string}[] }
export interface TranslationInfo { name?:NameSource; englishVerified:boolean }
export interface LanguagePack { version: 1; locale: Locale; dataset: Dataset; sourceHash: string; englishHash?: string; baselineHash?: string; fields: Record<string,string>; nameSources?:Record<string,NameSource>; legacyAliases?:Record<string,string|string[]>; unverifiedFields?:string[] }
export function translationOf(value:object):TranslationInfo|undefined {return (value as {translationInfo?:TranslationInfo}).translationInfo;}
export interface ContentBundle<T> { original: T; packs: Record<Locale,LanguagePack> }
export type ContentPhase = 'fetching' | 'verifying' | 'projecting';
export interface ContentProgress { phase: ContentPhase; resource?: string; resourceIndex?: number; resourceCount?: number; completedResources?: number; loadedBytes?: number; totalBytes?: number }
export interface ContentReadyDetail { paths: string[] }
export function resolveContentBaseUrl(baseUrl:string,currentUrl:string):string { return new URL(baseUrl,currentUrl).href; }
interface WorkerRequest { id: number; dataset: Dataset; locale?: Locale; baseUrl: string }
interface WorkerSuccess<T> { id: number; type: 'success'; result: T }
interface WorkerFailure { id: number; type: 'error'; error: string }
interface WorkerProgress { id: number; type: 'progress'; progress: ContentProgress }
type WorkerReply<T> = WorkerSuccess<T> | WorkerFailure | WorkerProgress;
interface ProjectionResult<T> { data: T; original: T }
interface RequestEntry<T> { promise: Promise<T>; listeners: Set<(progress: ContentProgress) => void>; latest?: ContentProgress }
const requests=new Map<string,RequestEntry<void>>();
const projectionRequests=new Map<string,RequestEntry<unknown>>();
const originals=new WeakMap<object,object>();
const projections=new WeakMap<object,Partial<Record<Locale,unknown>>>();
const pendingRequests=new Map<number,{resolve:(value:unknown)=>void;reject:(error:Error)=>void;progress?:(value:ContentProgress)=>void}>();
let worker:Worker|undefined;
let nextRequestId=0;
export function originalOf<T extends object>(value:T):T { return (originals.get(value)??value) as T; }

function linkOriginals(local:unknown,raw:unknown):void {
  if(!local||!raw||typeof local!=='object'||typeof raw!=='object')return;
  originals.set(local,raw);
  if(Array.isArray(local))local.forEach((value,index)=>linkOriginals(value,(raw as unknown[])[index]));
  else for(const key of Object.keys(local))linkOriginals((local as Record<string,unknown>)[key],(raw as Record<string,unknown>)[key]);
}

function receiveWorkerMessage(event:MessageEvent<WorkerReply<unknown>>):void {
  const message=event.data,pending=pendingRequests.get(message.id);
  if(!pending)return;
  if(message.type==='progress'){
    pending.progress?.(message.progress);
    return;
  }
  pendingRequests.delete(message.id);
  if(message.type==='error')pending.reject(new Error(message.error));
  else pending.resolve(message.result);
}

function failWorkerRequests(event:ErrorEvent):void {
  worker=undefined;
  for(const pending of pendingRequests.values())pending.reject(new Error(event.message||'Content worker failed'));
  pendingRequests.clear();
}

function getWorker():Worker {
  if(!worker){
    worker=new Worker(new URL('./content.worker.ts',import.meta.url),{type:'module'});
    worker.onmessage=receiveWorkerMessage;
    worker.onerror=failWorkerRequests;
  }
  return worker;
}

function requestWorker<T>(dataset:Dataset,locale:Locale|undefined,onProgress?:(progress:ContentProgress)=>void):Promise<T> {
  return new Promise((resolve,reject)=>{
    const id=++nextRequestId;
    pendingRequests.set(id,{resolve:resolve as (value:unknown)=>void,reject,progress:onProgress});
    const origin=typeof location==='undefined'?'http://mappingout.test/':location.href;
    try{getWorker().postMessage({id,dataset,locale,baseUrl:resolveContentBaseUrl(import.meta.env.BASE_URL,origin)} satisfies WorkerRequest);}
    catch(error){pendingRequests.delete(id);reject(error instanceof Error?error:new Error(String(error)));}
  });
}

function cachedRequest<T>(cache:Map<string,RequestEntry<T>>,key:string,create:((report:(progress:ContentProgress)=>void)=>Promise<T>),onProgress?:((progress:ContentProgress)=>void)):Promise<T> {
  let entry=cache.get(key);
  if(!entry){
    entry={listeners:new Set(),promise:Promise.resolve(undefined as T)};
    const current=entry;
    current.promise=create(progress=>{
      current.latest=progress;
      for(const listener of current.listeners)listener(progress);
    }).then(value=>{current.listeners.clear();return value;}).catch(error=>{
      current.listeners.clear();
      if(cache.get(key)===current)cache.delete(key);
      throw error;
    });
    cache.set(key,current);
  }
  if(onProgress){
    entry.listeners.add(onProgress);
    if(entry.latest)onProgress(entry.latest);
    void entry.promise.finally(()=>entry?.listeners.delete(onProgress)).catch(()=>{});
  }
  return entry.promise;
}

export function projectContent<T>(bundle:ContentBundle<T>,locale:Locale):T {
  const existing=projections.get(bundle)?.[locale];if(existing)return existing as T;
  const pack=bundle.packs[locale];
  if(pack.locale!==locale)throw Error('Invalid content locale');
  const data=structuredClone(bundle.original);
  linkOriginals(data,bundle.original);
  for(const field of contentFields(bundle.original,pack.dataset)) {
    const translated=pack.fields[field.key];
    if(typeof translated!=='string'||!translated.trim())throw Error(`Missing ${locale} translation: ${field.key}`);
    let object=data as Record<string|number,unknown>;
    for(const part of field.path.slice(0,-1))object=object[part] as typeof object;
    object[field.path.at(-1)!]=translated;
    if(pack.dataset==='skills'&&field.path[0]==='skills'&&field.path[2]==='variants'){
      const row=(data as {skills:{variants:{searchTexts?:string[]}[]}[]}).skills[field.path[1] as number].variants[field.path[3] as number];
      (row.searchTexts??=[]).push(bundle.packs['zh-TW'].fields[field.key],bundle.packs.en.fields[field.key]);
      const alias=bundle.packs['zh-TW'].legacyAliases?.[field.key];
      if(alias)row.searchTexts!.push(...typeof alias==='string'?[alias]:alias);
    }
  }
  // Index aliases once; large skill packs must not scan every field per row.
  const aliasGroups=new Map<string,string[]>(),chinese=bundle.packs['zh-TW'];
  for(const [key,text]of Object.entries(chinese.legacyAliases??{})){
    const entity=key.split('/').slice(0,2).join('/');
    const group=aliasGroups.get(entity)??[];group.push(...typeof text==='string'?[text]:text);aliasGroups.set(entity,group);
  }
  const unverified=new Set(chinese.unverifiedFields?.map(key=>key.split('/').slice(0,2).join('/')));
  // Search both languages without showing duplicate names in the interface.
  for(const collection of ['records','sets','activities','materials','quests','skills','stories','chapters','offers','armorers','tracks']) {
    const rows=(data as Record<string,unknown[]>)[collection];
    const rawRows=(bundle.original as Record<string,Record<string,unknown>[]>)[collection];
    if(rows)rows.forEach((row,index)=>{
      const item=row as Record<string,unknown>,raw=rawRows[index];
      const entity=`${collection}/${raw.id??index}`,prefix=`${entity}/`;
      item.searchAliases=[raw.name,raw.englishName,chinese.fields[`${prefix}name`],bundle.packs.en.fields[`${prefix}name`],...aliasGroups.get(entity)??[]].filter(Boolean);
      if(locale==='zh-TW')item.translationInfo={name:chinese.nameSources?.[`${prefix}name`]??chinese.nameSources?.[`${prefix}title`],englishVerified:!unverified.has(entity)} satisfies TranslationInfo;
      if(collection==='quests')for(const field of ['region','givenBy','givenAt'])for(const language of ['zh-TW','en'] as const)(item.searchAliases as string[]).push(bundle.packs[language].fields[`quests/${raw.id}/${field}`]||'');
      if(collection==='records')item.descriptionLanguage=locale==='en'?'en':'zh';
    });
  }
  projections.set(bundle,{...projections.get(bundle),[locale]:data});return data;
}
export function loadContent(dataset:Dataset,onProgress?:(progress:ContentProgress)=>void):Promise<void> {
  return cachedRequest(requests,dataset,report=>requestWorker<void>(dataset,undefined,report),onProgress);
}

export function loadContentProjection<T>(dataset:Dataset,locale:Locale,onProgress?:(progress:ContentProgress)=>void):Promise<T> {
  const key=`${dataset}:${locale}`;
  const pending=cachedRequest(projectionRequests,key,async report=>{
    const result=await requestWorker<ProjectionResult<T>>(dataset,locale,report);
    linkOriginals(result.data,result.original);
    return result.data;
  },onProgress);
  return pending.then(data=>{
    if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent<ContentReadyDetail>('mappingout:content-ready',{detail:{
      paths:[`data/${dataset}.json`,`data/i18n/zh-TW/${dataset}.json`,`data/i18n/en/${dataset}.json`],
    }}));
    return data as T;
  });
}
