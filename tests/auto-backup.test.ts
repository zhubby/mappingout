import { afterEach, expect, it, vi } from 'vitest';
import { AutoBackup } from '../src/platform/auto-backup';

afterEach(() => { vi.useRealTimers(); });
it('coalesces changes, retries failures, and writes the latest state', async () => {
  vi.useFakeTimers();
  const write = vi.fn().mockRejectedValueOnce(Error('disk full')).mockResolvedValue(undefined);
  const status = vi.fn();
  const backup = new AutoBackup<number>(write, status);
  backup.changed(1); backup.changed(2);
  await vi.advanceTimersByTimeAsync(1000);
  expect(write.mock.calls).toEqual([[2]]);
  expect(status.mock.calls[0][0]).toContain('disk full');
  backup.changed(3);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(write.mock.calls).toEqual([[2], [3]]);
  backup.changed(4); backup.changed(5);
  await vi.advanceTimersByTimeAsync(599_999);
  expect(write).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(write.mock.calls[2]).toEqual([5]);
  backup.stop();
});
it('does not mark a newer change saved when a previous write finishes', async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const write = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockResolvedValue(undefined);
  const backup = new AutoBackup<number>(write, vi.fn());
  backup.changed(1);
  await vi.advanceTimersByTimeAsync(1000);
  backup.changed(2); finish();
  await vi.advanceTimersByTimeAsync(600_000);
  expect(write.mock.calls).toEqual([[1], [2]]);
  backup.stop();
});
it('cancels scheduled writes when the application owner unmounts', async () => {
  vi.useFakeTimers();
  const write = vi.fn();
  const backup = new AutoBackup(write, vi.fn());
  backup.changed({ value: 1 }); backup.stop();
  await vi.advanceTimersByTimeAsync(600_000);
  expect(write).not.toHaveBeenCalled();
});
