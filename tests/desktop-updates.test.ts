/**
 * [INPUT]: 依赖更新控制器与个人写入队列；替换原生 I/O。
 * [OUTPUT]: 验证启动检查、延期安装与重启前的数据屏障。
 * [POS]: 桌面更新生命周期回归；不启动安装器。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {describe, expect, it} from 'vitest';
import {DesktopUpdates, type UpdatePort, type UpdateStatus} from '../src/platform/update-controller';
import {PersonalQueue} from '../src/platform/restart';

function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return {promise, resolve};
}
function fixture(initial: Partial<UpdateStatus> = {}) {
  let status: UpdateStatus = {enabled:true, phase:'idle', currentVersion:'1.2.0', version:null, notes:null, downloaded:0, total:null, error:null, startupInstall:false, ...initial};
  const actions: string[] = [];
  let listener = (_status: UpdateStatus) => {};
  const port: UpdatePort = {
    async status() { actions.push('status'); return status; },
    async listen(changed) { listener = changed; },
    async check() { actions.push('check'); status = {...status, phase:'ready', version:'1.3.0'}; return status; },
    async defer() { actions.push('defer'); status = {...status, phase:'deferred', startupInstall:false}; return status; },
    async install() { actions.push('install'); },
  };
  const updates = new DesktopUpdates(port);
  return {updates, port, actions, emit(next: Partial<UpdateStatus>) { status = {...status, ...next}; listener(status); }};
}
const withBackup = async (install: () => Promise<void>) => { await install(); };

describe('desktop update lifecycle', () => {
  it('checks once after startup despite repeated mounts and keeps manual checks available', async () => {
    const {updates, actions, emit} = fixture();
    await Promise.all([updates.initialize(withBackup), updates.initialize(withBackup)]);
    await Promise.all([updates.checkOnLaunch(), updates.checkOnLaunch()]);
    expect(actions).toEqual(['status','check']);
    expect(updates.snapshot().phase).toBe('ready');
    emit({phase:'idle'});
    await updates.check();
    expect(actions).toEqual(['status','check','check']);
  });
  it('continues a download when the settings subscriber disappears', async () => {
    const {updates, port, emit} = fixture();
    const download = pending<UpdateStatus>();
    port.check = () => download.promise;
    await updates.initialize(withBackup);
    const unsubscribe = updates.subscribe(() => {});
    const checking = updates.check();
    unsubscribe();
    emit({phase:'downloading', downloaded:50, total:100});
    const ready = {...updates.snapshot(), phase:'ready' as const, version:'1.3.0'};
    download.resolve(ready);
    await checking;
    expect(updates.snapshot()).toMatchObject({phase:'ready', version:'1.3.0'});
  });
  it('does not prompt again after deferring in the current process', async () => {
    const {updates, actions} = fixture({phase:'ready', version:'1.3.0'});
    await updates.initialize(withBackup);
    await updates.defer();
    await updates.checkOnLaunch();
    expect(updates.snapshot()).toMatchObject({phase:'deferred', startupInstall:false});
    expect(actions).toEqual(['status','defer']);
  });
  it('installs a deferred cache at next startup without a network check', async () => {
    const {updates, actions} = fixture({phase:'deferred', version:'1.3.0', startupInstall:true});
    await updates.initialize(async install => { actions.push('backup'); await install(); });
    await updates.checkOnLaunch();
    expect(actions).toEqual(['status','backup','install']);
  });
  it('resumes preparation when a verified cached package has no prepared resources', async () => {
    const {updates, actions} = fixture({phase:'idle', version:'1.3.0'});
    await updates.initialize(withBackup);
    await updates.checkOnLaunch();
    expect(actions).toEqual(['status','check']);
    expect(updates.snapshot().phase).toBe('ready');
  });
  it('preserves the running client when the pre-install backup fails', async () => {
    const {updates, actions} = fixture({phase:'ready', version:'1.3.0'});
    await updates.initialize(withBackup);
    await updates.install(async () => { throw Error('disk full'); });
    expect(actions).toEqual(['status']);
    expect(updates.snapshot()).toMatchObject({phase:'error', currentVersion:'1.2.0', error:'Error: disk full'});
  });
  it('coalesces overlapping install requests', async () => {
    const {updates, actions} = fixture({phase:'ready', version:'1.3.0'});
    await updates.initialize(withBackup);
    const backup = pending<void>();
    const first = updates.install(async install => { await backup.promise; await install(); });
    const second = updates.install(withBackup);
    backup.resolve();
    await Promise.all([first, second]);
    expect(actions).toEqual(['status','install']);
  });
  it('does not check disabled builds or automatically retry an interrupted installation', async () => {
    for (const initial of [{enabled:false}, {phase:'error' as const, version:'1.3.0', error:'updates.interrupted'}]) {
      const {updates, actions} = fixture(initial);
      await updates.initialize(withBackup);
      await updates.checkOnLaunch();
      expect(actions).toEqual(['status']);
    }
  });
});

describe('restart data barrier', () => {
  it('drains accepted writes and blocks new changes until installation finishes', async () => {
    const queue = new PersonalQueue();
    const writing = pending<void>(), installing = pending<void>();
    let data = 0, backup = -1;
    const first = queue.write(async () => { await writing.promise; data = 7; });
    const restart = queue.restart(async () => { backup = data; }, () => installing.promise);
    await expect(queue.write(async () => { data = 9; })).rejects.toThrow('updates.busy');
    expect(backup).toBe(-1);
    writing.resolve(); await first;
    await Promise.resolve(); await Promise.resolve();
    installing.resolve(); await restart;
    expect({data, backup}).toEqual({data:7, backup:7});
    await queue.write(async () => { data = 10; });
    expect(data).toBe(10);
  });
  it('does not install after an unsaved write, and allows a successful retry', async () => {
    const queue = new PersonalQueue();
    let installed = false;
    await expect(queue.write(async () => { throw Error('quota'); })).rejects.toThrow('quota');
    await queue.read(async () => 1);
    await expect(queue.restart(async () => {}, async () => { installed = true; })).rejects.toThrow('updates.unsaved');
    expect(installed).toBe(false);
    await queue.write(async () => 2);
    await queue.restart(async () => {}, async () => { installed = true; });
    expect(installed).toBe(true);
  });
  it('unlocks the app after a failed backup without invoking the installer', async () => {
    const queue = new PersonalQueue();
    let installed = false;
    await expect(queue.restart(async () => { throw Error('backup failed'); }, async () => { installed = true; })).rejects.toThrow('backup failed');
    expect(installed).toBe(false);
    expect(await queue.write(async () => 3)).toBe(3);
  });
});
