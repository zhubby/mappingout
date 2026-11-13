import { makeBackup, parseBackup } from '../storage';
import type { Backup, Personal } from '../types';

export const isDesktop = import.meta.env.MODE === 'desktop';
export interface LocalBackup { name: string; bytes: number; modified: number; kind: 'auto' | 'restore' }
export interface DesktopInfo { version: string; backupDirectory: string; updateConfigured: boolean }

async function native<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

export async function exportBackup(backup: Backup): Promise<boolean> {
  const content = JSON.stringify(backup, null, 2);
  if (isDesktop) return native<boolean>('save_backup', { content });
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `mappingout-${backup.exportedAt.slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export async function pickBackup(): Promise<Backup | null> {
  const content = await native<string | null>('pick_backup');
  return content === null ? null : parseBackup(content);
}

export async function writeLocalBackup(data: Personal, kind: 'auto' | 'restore'): Promise<void> {
  await native('write_local_backup', { content: JSON.stringify(makeBackup(data)), kind });
}

export const desktopInfo = () => native<DesktopInfo>('desktop_info');
export const listLocalBackups = () => native<LocalBackup[]>('list_local_backups');
export const openBackupDirectory = () => native<void>('open_backup_directory');
export async function readLocalBackup(name: string): Promise<Backup> {
  return parseBackup(await native<string>('read_local_backup', { name }));
}
export async function openExternal(url: string): Promise<void> {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw Error('不支持此链接类型。');
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(parsed.href);
}
