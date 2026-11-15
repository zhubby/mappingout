import { displayMessage, t } from './i18n';
import { useEffect, useMemo, useState } from 'react';
import { useLocale } from './i18n';
import { loadContent, projectContent, type ContentBundle } from './i18n/content';
import type { Dataset } from './i18n/content-fields';
import type { Catalog, Personal } from './types';

export interface FeatureProps { catalog: Catalog; personal: Personal; update: (change:(state:Personal)=>Personal)=>Promise<boolean>; params: Record<string,string>; patch: (values:Record<string,string>)=>void; manageCharacters:()=>void; navigateZone:(id:string)=>void }
export function useFeatureData<T>(filename: string) {
  const locale=useLocale();
  const [bundle,setData]=useState<ContentBundle<T>>(),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{let live=true;setError('');loadContent<T>(filename.replace('.json','') as Dataset).then(value=>{if(live)setData(value);}).catch(error=>{if(live)setError(error.message);});return()=>{live=false;};},[filename,retry]);
  const data=useMemo(()=>bundle?projectContent(bundle,locale):undefined,[bundle,locale]);
  return {data,error,retry:()=>setRetry(n=>n+1)};
}
export function DataStatus({error,retry}:{error:string;retry:()=>void}) {return <div className="feature-status" role={error?'alert':'status'}>{error?<><p>{displayMessage(error)}</p><button className="primary" onClick={retry}>{t("重新加载")}</button></>:<p>{t("正在加载资料…")}</p>}</div>;}
