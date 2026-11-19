/**
 * [INPUT]: 依赖 Playwright 初始化脚本和真实桌面前端。
 * [OUTPUT]: 提供可控更新 IPC、检查就绪等待、备份故障与事件记录。
 * [POS]: 测试原生边界替身；资料和个人存储仍执行真实代码。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import type {Page} from '@playwright/test';
import type {UpdateStatus} from '../src/platform/update-controller';

export async function nativeBridge(page: Page, initial: Partial<UpdateStatus> = {}) {
  await page.addInitScript(({initial}) => {
    const w = window as any;
    let status = JSON.parse(localStorage.getItem('qa-update') || 'null') || {
      enabled:true, phase:'idle', currentVersion:'1.2.0', version:null, notes:null,
      downloaded:0, total:null, error:null, startupInstall:false, ...initial,
    };
    if (status.phase === 'deferred') status.startupInstall = true;
    const callbacks = new Map<number, (data: unknown) => void>();
    const events = new Map<string, Set<number>>();
    let next = 0, finishCheck: (status: UpdateStatus) => void, rejectCheck: (error: string) => void;
    const resource = {ready:true, phase:'ready', activeGeneration:'a'.repeat(64), pendingGeneration:null, availableGeneration:null, completed:0, total:0, error:null};
    const actions: {command:string; content?:any}[] = [];
    const emit = (nextStatus: Partial<UpdateStatus>) => {
      status = {...status, ...nextStatus};
      for (const id of events.get('desktop-update-progress') || []) callbacks.get(id)?.({event:'desktop-update-progress', payload:status});
      return status;
    };
    w.qa = {
      actions,
      backupFailure:false,
      checkFailure:false,
      emit,
      failCheck() {
        emit({phase:'error', version:'1.3.0', downloaded:40, total:100, error:'offline'});
        rejectCheck('offline');
      },
      finishCheck() {
        const nextStatus = emit({phase:'ready', version:'1.3.0', notes:'QA release notes', downloaded:100, total:100});
        localStorage.setItem('qa-update', JSON.stringify(nextStatus));
        finishCheck(nextStatus);
      },
    };
    w.__TAURI_EVENT_PLUGIN_INTERNALS__ = {unregisterListener() {}};
    w.__TAURI_INTERNALS__ = {
      metadata:{currentWindow:{label:'main'}, currentWebview:{windowLabel:'main',label:'main'}},
      transformCallback(callback: (data: unknown) => void) { callbacks.set(++next, callback); return next; },
      async invoke(command: string, args: any = {}) {
        if (command === 'plugin:event|listen') {
          if (!events.has(args.event)) events.set(args.event, new Set());
          events.get(args.event)!.add(args.handler);
          return args.handler;
        }
        if (command === 'plugin:event|unlisten') { events.get(args.event)?.delete(args.eventId); return; }
        if (command.startsWith('plugin:window|')) return;
        if (command === 'desktop_update_status') { actions.push({command}); return status; }
        if (command === 'desktop_update_check') {
          actions.push({command});
          if (w.qa.checkFailure) throw 'offline';
          emit({phase:'checking', error:null});
          return new Promise<UpdateStatus>((resolve, reject) => { finishCheck = resolve; rejectCheck = reject; });
        }
        if (command === 'desktop_update_defer') {
          actions.push({command});
          const nextStatus = emit({phase:'deferred', startupInstall:false});
          localStorage.setItem('qa-update', JSON.stringify(nextStatus));
          return nextStatus;
        }
        if (command === 'desktop_update_install') { actions.push({command}); return; }
        if (command === 'desktop_info') return {version:'1.2.0', updateConfigured:true, backupDirectory:'/qa/backups'};
        if (command === 'list_local_backups') return [];
        if (command === 'write_local_backup') {
          actions.push({command, content:JSON.parse(args.content)});
          if (w.qa.backupFailure) throw 'disk full';
          return;
        }
        if (command === 'resources_confirm') { actions.push({command}); return; }
        if (command.startsWith('resources_')) return resource;
        throw Error('Unexpected QA IPC: ' + command);
      },
    };
  }, {initial});
}

export const finishCheck = async (page: Page) => {
  await page.waitForFunction(() => (window as any).qa.actions.some((action: {command:string}) => action.command === 'desktop_update_check'));
  await page.evaluate(() => (window as any).qa.finishCheck());
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
};
export const updateActions = (page: Page) => page.evaluate(() => (window as any).qa.actions.filter((action: any) => action.command.startsWith('desktop_update_')));
