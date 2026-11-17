/**
 * [INPUT]: 依赖资料语言加载和 React 生命周期。
 * [OUTPUT]: 提供按语言投影的懒加载资料与重试。
 * [POS]: 各功能页共同使用的只读资料适配。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { useEffect, useMemo, useState } from 'react';
import { useLocale } from '../../i18n';
import { loadContent, projectContent, type ContentBundle } from '../../i18n/content';
import type { Dataset } from '../../i18n/content-fields';
export function useFeatureData<T>(filename: string) {
  const locale=useLocale();
  const [bundle,setData]=useState<ContentBundle<T>>(),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{let live=true;setError('');loadContent<T>(filename.replace('.json','') as Dataset).then(value=>{if(live)setData(value);}).catch(error=>{if(live)setError(error.message);});return()=>{live=false;};},[filename,retry]);
  const data=useMemo(()=>bundle?projectContent(bundle,locale):undefined,[bundle,locale]);
  return {data,error,retry:()=>setRetry(n=>n+1)};
}
