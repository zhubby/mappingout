/**
 * [INPUT]: 依赖 Tauri 更新命令、进度事件与 React 订阅接口。
 * [OUTPUT]: 导出桌面更新单例和 useDesktopUpdates。
 * [POS]: 原生更新到界面的适配层；订阅持续到进程退出。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {useSyncExternalStore} from 'react';
import {DesktopUpdates, type UpdateStatus} from './update-controller';

export const desktopUpdates = new DesktopUpdates({
  status: () => invoke<UpdateStatus>('desktop_update_status'),
  check: () => invoke<UpdateStatus>('desktop_update_check'),
  defer: () => invoke<UpdateStatus>('desktop_update_defer'),
  install: () => invoke<void>('desktop_update_install'),
  async listen(changed) { await listen<UpdateStatus>('desktop-update-progress', event => changed(event.payload)); },
});
export const useDesktopUpdates = () => useSyncExternalStore(desktopUpdates.subscribe, desktopUpdates.snapshot, desktopUpdates.snapshot);
