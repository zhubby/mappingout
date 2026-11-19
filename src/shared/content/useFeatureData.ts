/**
 * [INPUT]: 依赖 worker 资料投影、语言偏好和 React 生命周期。
 * [OUTPUT]: 提供异步资料、阶段进度、条件加载和重试。
 * [POS]: 只读资料适配；按文件、语言与重试批次隔离视图状态。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { useEffect, useState } from 'react';
import { useLocale } from '../../i18n';
import { loadContentProjection, type ContentProgress } from '../../i18n/content';
import type { Dataset } from '../../i18n/content-fields';
interface FeatureDataState<T> { key: string; data?: T; error?: string; progress?: ContentProgress }
export function useFeatureData<T>(filename: string,enabled=true) {
  const locale=useLocale();
  const [state,setState]=useState<FeatureDataState<T>>(),[retry,setRetry]=useState(0);
  const key=`${filename}:${locale}:${retry}:${enabled}`;
  useEffect(()=>{
    let live=true;
    setState({key});
    if(enabled){
      void loadContentProjection<T>(filename.replace('.json','') as Dataset,locale,progress=>{if(live)setState({key,progress});}).then(data=>{
        if(live)setState({key,data});
      }).catch(error=>{
        if(live)setState({key,error:error instanceof Error?error.message:String(error)});
      });
    }
    return()=>{live=false;};
  },[filename,locale,retry,enabled,key]);
  const current=enabled&&state?.key===key?state:undefined;
  return {data:current?.data,error:current?.error||'',progress:current?.progress,retry:()=>setRetry(n=>n+1)};
}
