import { useEffect, useRef, useState } from 'react';
import type { Update } from '@tauri-apps/plugin-updater';
import type { Backup } from './types';
import { desktopInfo, listLocalBackups, openBackupDirectory, readLocalBackup, type DesktopInfo, type LocalBackup } from './platform';

export default function DesktopPanel({ preview, beforeRestart, backupStatus }: {
  preview(backup: Backup): void;
  beforeRestart(): Promise<void>;
  backupStatus: { error: string; savedAt?: number };
}) {
  const [info, setInfo] = useState<DesktopInfo>();
  const [backups, setBackups] = useState<LocalBackup[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  const updateRef = useRef<Update | null>(null);
  const mounted = useRef(false);
  async function refresh() { setBackups(await listLocalBackups()); }
  useEffect(() => {
    mounted.current = true;
    void Promise.all([desktopInfo(), listLocalBackups()]).then(([value, items]) => {
      if (mounted.current) { setInfo(value); setBackups(items); }
    }).catch(error => { if (mounted.current) setMessage(String(error)); });
    return () => { mounted.current = false; void updateRef.current?.close().catch(() => {}); };
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage('');
    try { await action(); } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }
  async function checkUpdate() {
    await updateRef.current?.close(); updateRef.current = null;
    setAvailable(''); setDownloaded(false);
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check({ timeout: 20_000 });
    if (!mounted.current) { await update?.close(); return; }
    updateRef.current = update;
    if (update) { setAvailable(update.version); setMessage(update.body || '新版本已准备好，可以下载更新。'); }
    else setMessage('当前已是最新版本。');
  }
  async function downloadUpdate() {
    if (!updateRef.current) return;
    setMessage('正在下载更新，请保持应用打开…');
    await updateRef.current.download(undefined, { timeout: 600_000 });
    setDownloaded(true); setMessage('更新已下载并校验签名。安装会关闭并重启客户端，请选择合适的时间。');
  }
  async function installUpdate() {
    if (!updateRef.current) return;
    await beforeRestart();
    setMessage('备份已保存，正在启动安装程序…');
    await updateRef.current.install({ restartAfterInstall: true });
  }
  return <div className="desktop-panel">
    <span className="eyebrow">MAPPINGOUT DESKTOP</span><h2>客户端设置</h2>
    <p>版本 {info?.version || '…'} · Windows 离线客户端</p>
    <section><h3>本地备份</h3>
      <p>记录变更后自动备份，间隔最多 10 分钟。自动备份和恢复前备份各保留最近 20 份。</p>
      <p role="status">{backupStatus.error ? `自动备份失败，将重试：${backupStatus.error}` : backupStatus.savedAt ? `最近自动备份：${new Date(backupStatus.savedAt).toLocaleString('zh-CN')}` : '等待首次自动备份…'}</p>
      <p className="desktop-path">{info?.backupDirectory}</p>
      <div className="desktop-actions"><button className="quiet" disabled={busy} onClick={() => void run(openBackupDirectory)}>打开备份目录</button><button className="quiet" disabled={busy} onClick={() => void run(refresh)}>刷新列表</button></div>
      <div className="desktop-backups">{!backups.length && <p className="muted">暂无本地备份。已有记录会在应用运行期间自动备份。</p>}{backups.map(item => <button key={item.name} disabled={busy} className="backup-action" onClick={() => void run(async () => preview(await readLocalBackup(item.name)))}>
        <span><strong>{item.kind === 'restore' ? '恢复前备份' : '自动备份'}</strong><small>{new Date(item.modified).toLocaleString('zh-CN')} · {Math.max(1, Math.ceil(item.bytes / 1024))} KB</small></span><span>预览恢复 →</span>
      </button>)}</div>
      <p className="muted">恢复前会先显示内容摘要并要求确认。建议定期将备份导出到其他磁盘。</p>
    </section>
    <section><h3>版本更新</h3>
      {info?.updateConfigured ? <><p>检查更新需要联网，地图和个人记录可持续离线使用。</p>
        <button className="quiet" disabled={busy} onClick={() => void run(checkUpdate)}>检查更新</button>
        {available && !downloaded && <button className="primary full" disabled={busy} onClick={() => void run(downloadUpdate)}>下载更新 {available}</button>}
        {downloaded && <button className="primary full" disabled={busy} onClick={() => void run(installUpdate)}>保存备份并安装重启</button>}
      </> : <p>此构建使用手动更新。下载安装新版可保留个人记录；更新前建议导出一份备份。</p>}
    </section>
    {busy && <p role="status">正在处理，请稍候…</p>}{message && <p role="status">{message}</p>}
  </div>;
}
