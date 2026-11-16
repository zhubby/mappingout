import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {useEffect, useState} from 'react';
import {getLocale} from '../i18n';

export interface ResourceStatus {
  activeGeneration: string | null; pendingGeneration: string | null; availableGeneration: string | null;
  phase: string; completed: number; total: number; error: string | null; ready: boolean;
}
export const resourceStatus=()=>invoke<ResourceStatus>('resources_status');
export const checkResources=(force=true)=>invoke<ResourceStatus>('resources_check',{force});
export const downloadResources=()=>invoke<ResourceStatus>('resources_download');
export const repairResources=()=>invoke<ResourceStatus>('resources_download',{repair:true});
export const importResources=()=>invoke<ResourceStatus>('resources_import',{locale:getLocale()});
export const cancelResources=()=>invoke<void>('resources_cancel');
export const prepareUpdateResources=(version:string)=>invoke<void>('resources_prepare_update',{version});
export function useResources() {
  const [status,setStatus]=useState<ResourceStatus>();
  useEffect(()=>{
    let live=true;
    const refresh=()=>{void resourceStatus().then(s=>{if(live)setStatus(s);}).catch(()=>{});};
    refresh();const timer=setInterval(refresh,1000);
    const subscription=listen<ResourceStatus>('resources-progress',event=>{if(live)setStatus(event.payload);});
    return()=>{live=false;clearInterval(timer);void subscription.then(unlisten=>unlisten());};
  },[]);
  return status;
}
let preparation:Promise<void>|undefined;
export function prepareResources() {
  return preparation??=(async()=>{
    let status=await resourceStatus();
    if(!status.ready){
      // The embedded signed manifest remains usable when the channel is offline.
      try{await checkResources();}catch(error){if(String(error).includes('resources.cancelled'))throw error;/* Download may still use the bootstrap manifest. */}
      status=await downloadResources();
    }
    if(!status.ready)throw Error('resources.incomplete');
  })().finally(()=>{preparation=undefined;});
}
export async function backgroundResources() {
  try {
    const status=await checkResources(false);
    if(status.availableGeneration&&status.availableGeneration!==status.activeGeneration&&status.availableGeneration!==status.pendingGeneration)await downloadResources();
  }catch{/* Resource status retains the error; a working atlas remains available. */}
}
