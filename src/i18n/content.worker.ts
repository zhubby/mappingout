/**
 * [INPUT]: 依赖资料 JSON、双语语言包、字段目录与 HTTP 可用 SHA-256。
 * [OUTPUT]: 提供聚合下载进度、校验后的原始资料和语言投影。
 * [POS]: 内容读取 worker；下载、校验和投影都远离主线程。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { contentFields, type Dataset } from './content-fields';
import { projectContent, type ContentBundle, type ContentProgress, type LanguagePack } from './content';
import type { Locale } from './index';
import { sha256Hex } from '../shared/browserCrypto';

export const CONTENT_IDLE_TIMEOUT_MS=30_000;
export const CONTENT_RESOURCE_TIMEOUT_MS=5*60_000;

export interface ContentWorkerRequest { id:number; dataset:Dataset; locale?:Locale; baseUrl:string }
interface ContentWorkerSuccess<T> { id:number; type:'success'; result:T }
interface ContentWorkerFailure { id:number; type:'error'; error:string }
interface ContentWorkerProgress { id:number; type:'progress'; progress:ContentProgress }
type ContentWorkerReply<T> = ContentWorkerSuccess<T>|ContentWorkerFailure|ContentWorkerProgress;
type ProgressReporter = (progress:ContentProgress)=>void;
type Fetcher = typeof fetch;
type ContentWorkerBundle<T> = ContentBundle<T>;
interface ProjectionResult<T> { data:T; original:T }
interface ResourceReadProgress { loadedBytes:number; totalBytes?:number }
interface ResourceReadOptions { idleTimeoutMs?:number; resourceTimeoutMs?:number }

const bundles=new Map<Dataset,Promise<ContentWorkerBundle<unknown>>>();

function reportError(error:unknown):string {
  return error instanceof Error?error.message:String(error);
}

export async function readTextResource(
  url:string,
  onProgress:(progress:ResourceReadProgress)=>void,
  fetcher:Fetcher=fetch,
  options:ResourceReadOptions={},
):Promise<string> {
  const controller=new AbortController();
  const idleTimeoutMs=options.idleTimeoutMs??CONTENT_IDLE_TIMEOUT_MS;
  const resourceTimeoutMs=options.resourceTimeoutMs??CONTENT_RESOURCE_TIMEOUT_MS;
  let idleTimer!:ReturnType<typeof setTimeout>;
  let resourceTimer!:ReturnType<typeof setTimeout>;
  let timedOut:Error|undefined;
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  let rejectTimeout:(error:Error)=>void=()=>{};
  const timeout=new Promise<never>((_,reject)=>{rejectTimeout=reject;});
  const stop=(error:Error)=>{
    if(timedOut)return;
    timedOut=error;
    controller.abort(error);
    rejectTimeout(error);
    void reader?.cancel(error).catch(()=>{});
  };
  const resetIdle=()=>{
    clearTimeout(idleTimer);
    idleTimer=setTimeout(()=>stop(new Error('Data read timed out without progress')),idleTimeoutMs);
  };
  const operation=(async()=>{
    resetIdle();
    resourceTimer=setTimeout(()=>stop(new Error('Data resource exceeded five minutes')),resourceTimeoutMs);
    const response=await fetcher(url,{signal:controller.signal});
    if(!response.ok)throw Error(`Data HTTP ${response.status}`);
    const header=response.headers.get('content-length');
    const parsedTotal=header?Number(header):undefined;
    const encoding=response.headers.get('content-encoding');
    let totalBytes=(!encoding||encoding.toLowerCase()==='identity')&&parsedTotal&&Number.isFinite(parsedTotal)&&parsedTotal>0?parsedTotal:undefined;
    // 浏览器返回解压后的字节；压缩长度不能用作进度总量。
    onProgress({loadedBytes:0,...(totalBytes?{totalBytes}:{})});
    if(!response.body){
      const value=await response.text();
      if(timedOut)throw timedOut;
      const loadedBytes=new TextEncoder().encode(value).byteLength;
      onProgress({loadedBytes,totalBytes:loadedBytes});
      return value;
    }
    reader=response.body.getReader();
    const decoder=new TextDecoder();
    let loadedBytes=0,text='';
    while(true){
      const part=await reader.read();
      if(timedOut)throw timedOut;
      if(part.done)break;
      if(part.value.byteLength){
        loadedBytes+=part.value.byteLength;
        if(totalBytes!==undefined&&loadedBytes>totalBytes)totalBytes=undefined;
        resetIdle();
        onProgress({loadedBytes,...(totalBytes?{totalBytes}:{})});
      }
      text+=decoder.decode(part.value,{stream:true});
    }
    onProgress({loadedBytes,totalBytes:loadedBytes});
    return text+decoder.decode();
  })();
  try{return await Promise.race([operation,timeout]);}
  catch(error){throw timedOut??(error instanceof Error?error:new Error(String(error)));}
  finally{
    clearTimeout(idleTimer);
    clearTimeout(resourceTimer);
    if(reader)reader.releaseLock();
  }
}

async function fetchAndVerify(dataset:Dataset,baseUrl:string,report:ProgressReporter,fetcher:Fetcher):Promise<ContentWorkerBundle<unknown>> {
  const paths=[`${dataset}.json`,`i18n/zh-TW/${dataset}.json`,`i18n/en/${dataset}.json`];
  const resources=paths.map(()=>({loadedBytes:0,totalBytes:undefined as number|undefined,complete:false}));
  const reportDownload=(index?:number)=>report({
    phase:'fetching',resource:index===undefined?dataset:paths[index],
    ...(index===undefined?{}:{resourceIndex:index+1}),resourceCount:paths.length,
    completedResources:resources.filter(value=>value.complete).length,
    loadedBytes:resources.reduce((sum,value)=>sum+value.loadedBytes,0),
    ...(resources.every(value=>value.totalBytes!==undefined)?{totalBytes:resources.reduce((sum,value)=>sum+value.totalBytes!,0)}:{}),
  });
  reportDownload();
  const texts=await Promise.all(paths.map(async(path,index)=>{
    const result=await readTextResource(`${baseUrl}data/${path}`,value=>{
      Object.assign(resources[index],{loadedBytes:value.loadedBytes,totalBytes:value.totalBytes});
      reportDownload(index);
    },fetcher);
    resources[index].complete=true;
    reportDownload(index);
    return result;
  }));
  report({phase:'verifying',resource:`${dataset}.json`});
  const [raw,zh,en]=texts;
  const hash=await sha256Hex(raw);
  const packs={
    'zh-TW':JSON.parse(zh) as LanguagePack,
    en:JSON.parse(en) as LanguagePack,
  };
  for(const [locale,pack]of Object.entries(packs))if(pack.version!==1||pack.dataset!==dataset||pack.locale!==locale||pack.sourceHash!==hash)throw Error(`Stale ${locale} content pack: ${dataset}`);
  const englishHash=await sha256Hex(JSON.stringify(packs.en.fields));
  if(packs.en.englishHash!==englishHash||packs['zh-TW'].englishHash!==englishHash||!packs.en.baselineHash||packs['zh-TW'].baselineHash!==packs.en.baselineHash)throw Error(`Stale English translation baseline: ${dataset}`);
  const original=JSON.parse(raw);
  for(const field of contentFields(original,dataset))for(const [locale,pack]of Object.entries(packs))if(!pack.fields[field.key]?.trim())throw Error(`Missing ${locale} translation: ${field.key}`);
  return {original,packs};
}

function loadBundle(dataset:Dataset,baseUrl:string,report:ProgressReporter,fetcher:Fetcher):Promise<ContentWorkerBundle<unknown>> {
  let pending=bundles.get(dataset);
  if(!pending){
    pending=fetchAndVerify(dataset,baseUrl,report,fetcher).catch(error=>{
      bundles.delete(dataset);
      throw error;
    });
    bundles.set(dataset,pending);
  }
  return pending;
}

export async function handleContentRequest(
  request:ContentWorkerRequest,
  postMessage:(message:ContentWorkerReply<unknown>)=>void,
  fetcher:Fetcher=fetch,
):Promise<void> {
  const report=(progress:ContentProgress)=>postMessage({id:request.id,type:'progress',progress});
  try{
    const bundle=await loadBundle(request.dataset,request.baseUrl,report,fetcher);
    if(!request.locale){
      postMessage({id:request.id,type:'success',result:undefined});
      return;
    }
    report({phase:'projecting',resource:request.dataset});
    const data=projectContent(bundle,request.locale);
    postMessage({id:request.id,type:'success',result:{data,original:bundle.original} satisfies ProjectionResult<unknown>});
  }catch(error){
    postMessage({id:request.id,type:'error',error:reportError(error)});
  }
}

type WorkerScope = typeof globalThis & {
  document?:Document;
  postMessage?:(message:ContentWorkerReply<unknown>)=>void;
  addEventListener?:(type:'message',listener:(event:MessageEvent<ContentWorkerRequest>)=>void)=>void;
};

const scope=globalThis as WorkerScope;
if(typeof scope.document==='undefined'&&scope.postMessage&&scope.addEventListener){
  scope.addEventListener('message',event=>{
    void handleContentRequest(event.data,message=>scope.postMessage?.(message));
  });
}
