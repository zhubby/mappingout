/** Coalesces changes; failures remain dirty and are retried without losing newer changes. */
export class AutoBackup<T> {
  private revision = 0;
  private savedRevision = 0;
  private latest?: T;
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private stopped = false;
  private lastSuccess = 0;
  constructor(
    private readonly write: (value: T) => Promise<void>,
    private readonly status: (error: string, savedAt?: number) => void,
    private readonly interval = 10 * 60 * 1000,
  ) {}
  changed(value: T) {
    this.latest = value;
    this.revision++;
    this.schedule();
  }
  private schedule(retry = false) {
    if (this.stopped || this.timer || this.running || this.revision === this.savedRevision) return;
    const delay = retry ? 60_000 : Math.max(1000, this.lastSuccess + this.interval - Date.now());
    this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, delay);
  }
  async flush() {
    if (this.stopped || this.running || this.latest === undefined || this.revision === this.savedRevision) return;
    this.running = true;
    const revision = this.revision, value = this.latest;
    let failed = false;
    try {
      await this.write(value);
      this.savedRevision = revision;
      this.lastSuccess = Date.now();
      if (!this.stopped) this.status('', this.lastSuccess);
    } catch (error) {
      failed = true;
      if (!this.stopped) this.status(String(error));
    } finally {
      this.running = false;
      this.schedule(failed);
    }
  }
  stop() { this.stopped = true; if (this.timer) clearTimeout(this.timer); }
}
