import {useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {t} from './i18n';
import {cancelResources, checkResources, downloadResources, importResources, repairResources, useResources} from './platform/resources';
export function resourceMessage(value:string):string{
  if(value==='checking')return t('正在检查资料更新…');
  if(value==='downloading')return t('正在下载资源…');
  if(value==='verifying')return t('正在校验资源…');
  if(value==='pending')return t('新资料已准备好，下次启动生效。');
  if(value==='ready')return t('离线资料已就绪。');
  if(value.includes('resources.cancelled'))return t('下载已取消，可继续下载。');
  if(value.includes('resources.signature')||value.includes('resources.integrity'))return t('资源校验失败，原有资料保持不变。');
  if(value.includes('resources.incompatible'))return t('没有适用于当前客户端的资源，请检查版本。');
  if(value==='missing')return t('尚未准备离线资料。');
  if(value.includes('resources.busy'))return t('正在处理，请稍候…');
  return t('资源准备未完成，请检查网络或磁盘空间后重试，也可以离线导入。');
}
export default function ResourcePanel({beforeRestart}:{beforeRestart:()=>Promise<void>}){
  const status=useResources();const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const working=busy||['checking','downloading','verifying'].includes(status?.phase||'');
  async function run(action:()=>Promise<unknown>){setBusy(true);setMessage('');try{await action();}catch(e){setMessage(String(e));}finally{setBusy(false);}}
  return <section><h3>{t('离线资料')}</h3><p>{status?.activeGeneration?t('资料修订：{{v0}}',{v0:status.activeGeneration.slice(0,12)}):t('尚未准备离线资料。')}</p>
    <p>{t('地图和字体会重复使用，仅下载发生变化的资源包。')}</p>
    <p role="status">{resourceMessage(message||status?.error||status?.phase||'ready')}</p>
    {status?.total? <progress max={status.total} value={status.completed}/>:null}
    <div className="desktop-actions"><button disabled={working} onClick={()=>void run(async()=>{const s=await checkResources();if(s.availableGeneration&&s.availableGeneration!==s.activeGeneration&&s.availableGeneration!==s.pendingGeneration)await downloadResources();})}>{t('检查资料更新')}</button>
      <button disabled={working} onClick={()=>void run(importResources)}>{t('导入离线资源')}</button>
      <button disabled={working} onClick={()=>void run(repairResources)}>{t('修复本地资源')}</button>
      {working&&<button onClick={()=>void cancelResources()}>{t('取消下载')}</button>}
      {status?.pendingGeneration&&<button disabled={working} onClick={()=>void run(async()=>{await beforeRestart();await invoke('restart_desktop');})}>{t('重启使用新资料')}</button>}
    </div></section>;
}
