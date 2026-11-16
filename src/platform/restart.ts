/**
 * [INPUT]: 依赖调用方提供的个人记录事务、备份和安装操作。
 * [OUTPUT]: 导出 PersonalQueue 与写入排空后的重启屏障。
 * [POS]: App 的个人记录操作队列；保存失败时阻止重启。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
export class PersonalQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private writeError: unknown;
  private locked = false;
  read<T>(action: () => Promise<T>): Promise<T> {
    const pending = this.tail.then(action);
    this.tail = pending.catch(() => {});
    return pending;
  }
  write<T>(action: () => Promise<T>): Promise<T> {
    if (this.locked) return Promise.reject(Error('updates.busy'));
    const pending = this.tail.then(action).then(value => {
      this.writeError = undefined;
      return value;
    }, error => {
      this.writeError = error;
      throw error;
    });
    this.tail = pending.catch(() => {});
    return pending;
  }
  wait() { return this.tail; }
  async restart(backup: () => Promise<void>, install: () => Promise<void>) {
    if (this.locked) throw Error('updates.busy');
    this.locked = true;
    try {
      await this.tail;
      if (this.writeError !== undefined) throw Error('updates.unsaved');
      await backup();
      await install();
    } finally { this.locked = false; }
  }
}
