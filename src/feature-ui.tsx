import { useEffect, useState } from 'react';
import { assetUrl } from './domain';
import type { Catalog, Personal } from './types';

export interface FeatureProps { catalog: Catalog; personal: Personal; update: (change:(state:Personal)=>Personal)=>Promise<boolean>; params: Record<string,string>; patch: (values:Record<string,string>)=>void; manageCharacters:()=>void; navigateZone:(id:string)=>void }
export function useFeatureData<T>(filename: string) {
  const [data,setData]=useState<T>(),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{let live=true;setError('');fetch(assetUrl(`data/${filename}`)).then(async response=>{if(!response.ok)throw Error(`资料请求失败（${response.status}）`);return response.json();}).then(value=>{if(live)setData(value);}).catch(error=>{if(live)setError(error.message);});return()=>{live=false;};},[filename,retry]);
  return {data,error,retry:()=>setRetry(n=>n+1)};
}
export function DataStatus({error,retry}:{error:string;retry:()=>void}) {return <div className="feature-status" role={error?'alert':'status'}>{error?<><p>{error}</p><button className="primary" onClick={retry}>重新加载</button></>:<p>正在加载资料…</p>}</div>;}
