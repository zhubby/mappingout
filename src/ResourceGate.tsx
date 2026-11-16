/**
 * [INPUT]: 依赖签名资源、资料加载、字体和资源命令。
 * [OUTPUT]: 资源就绪并确认后挂载 App；失败时提供重试和导入。
 * [POS]: 生产桌面的资料入口；位于延期程序更新之后。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {useEffect, useRef, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {t, useLocale, setLocale} from './i18n';
import {loadContent} from './i18n/content';
import {backgroundResources, cancelResources, importResources, prepareResources, repairResources, useResources} from './platform/resources';
import {resourceMessage} from './ResourcePanel';
import App from './App';

export default function ResourceGate(){
  const locale=useLocale(),status=useResources();
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(true),[error,setError]=useState('');
  const started=useRef(false);
  async function open(){
    await Promise.all(['catalog','armor','calendar'].map(dataset=>loadContent(dataset as 'catalog'|'armor'|'calendar')));
    await import('./i18n/fonts.css');
    await invoke('resources_confirm');
    setReady(true);void backgroundResources();
  }
  async function run(importing=false){
    setBusy(true);setError('');
    try {
      if(importing){const result=await importResources();if(!result.ready)return;}else{if(status?.ready&&error)await repairResources();await prepareResources();}
      try{await open();}catch(error){
        if(String(error).includes('resources.busy'))throw error;
        if(await invoke<boolean>('resources_rollback')){location.reload();return;}
        throw error;
      }
    }catch(error){setError(String(error));}finally{setBusy(false);}
  }
  useEffect(()=>{if(!started.current){started.current=true;void run();}},[]);
  if(ready)return <App/>;
  return <main className="resource-gate"><section><span className="eyebrow">MAPPINGOUT</span><h1>{t('准备离线资料')}</h1>
    <p>{t('首次使用需要准备地图、资料和字体。完成后即可离线使用。')}</p>
    <select aria-label="Language / 语言" value={locale} onChange={e=>setLocale(e.target.value as 'en'|'zh-CN')}><option value="zh-CN">简体中文</option><option value="en">English</option></select>
    <p role="status">{error?resourceMessage(error):resourceMessage(status?.phase||'checking')}</p>
    {status?.total? <><progress max={status.total} value={status.completed}/><p>{Math.round(status.completed/1024/1024)} / {Math.round(status.total/1024/1024)} MiB</p></>:null}
    <div className="desktop-actions">{busy?<button onClick={()=>void cancelResources()}>{t('取消下载')}</button>:<><button className="primary" onClick={()=>void run()}>{t('重试下载')}</button><button onClick={()=>void run(true)}>{t('导入离线资源')}</button></>}</div>
    <p className="muted">{t('离线导入：将签名资源清单和三个资源包放在同一目录，选择清单文件。')}</p>
  </section></main>;
}
