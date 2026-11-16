/**
 * [INPUT]: 依赖原生更新端口和调用方的备份屏障。
 * [OUTPUT]: 导出更新状态、端口契约与 DesktopUpdates。
 * [POS]: 应用生命周期中的唯一更新控制器；界面仅订阅状态。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
export interface UpdateStatus {
  enabled: boolean;
  phase: 'idle' | 'checking' | 'downloading' | 'preparing' | 'ready' | 'deferred' | 'installing' | 'error';
  currentVersion: string;
  version: string | null;
  notes: string | null;
  downloaded: number;
  total: number | null;
  error: string | null;
  startupInstall: boolean;
}
export type WithBackup = (install: () => Promise<void>) => Promise<void>;
export interface UpdatePort {
  status(): Promise<UpdateStatus>;
  check(): Promise<UpdateStatus>;
  defer(): Promise<UpdateStatus>;
  install(): Promise<void>;
  listen(changed: (status: UpdateStatus) => void): Promise<void>;
}

export class DesktopUpdates {
  private status: UpdateStatus = {enabled:false, phase:'idle', currentVersion:'', version:null, notes:null, downloaded:0, total:null, error:null, startupInstall:false};
  private readonly listeners = new Set<() => void>();
  private initialization?: Promise<void>;
  private running?: Promise<void>;
  private checkedOnLaunch = false;
  constructor(private readonly port: UpdatePort) {}
  snapshot = () => this.status;
  subscribe = (changed: () => void) => {
    this.listeners.add(changed);
    return () => { this.listeners.delete(changed); };
  };
  private changed(status: UpdateStatus) {
    this.status = status;
    this.listeners.forEach(listener => listener());
  }
  private failed(error: unknown) {
    this.changed({...this.status, phase:'error', error:String(error), startupInstall:false});
  }
  initialize(withBackup: WithBackup): Promise<void> {
    return this.initialization ??= (async () => {
      try {
        await this.port.listen(status => this.changed(status));
        this.changed(await this.port.status());
        if (this.status.enabled && this.status.startupInstall) await this.install(withBackup);
      } catch (error) { this.failed(error); }
    })();
  }
  private run(action: () => Promise<void>): Promise<void> {
    if (this.running) return this.running;
    const pending = Promise.resolve().then(action).catch(error => this.failed(error));
    this.running = pending;
    void pending.then(() => { if (this.running === pending) this.running = undefined; });
    return pending;
  }
  async checkOnLaunch() {
    if (this.checkedOnLaunch) return;
    this.checkedOnLaunch = true;
    if (!this.status.enabled || (this.status.version && this.status.phase !== 'idle')) return;
    await this.check();
  }
  check() {
    return this.run(async () => {
      this.changed({...this.status, phase:'checking', error:null});
      this.changed(await this.port.check());
    });
  }
  defer() {
    return this.run(async () => { this.changed(await this.port.defer()); });
  }
  install(withBackup: WithBackup) {
    return this.run(async () => {
      this.changed({...this.status, phase:'installing', error:null, startupInstall:false});
      await withBackup(() => this.port.install());
    });
  }
}
