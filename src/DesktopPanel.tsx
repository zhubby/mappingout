/**
 * [INPUT]: 依赖原生备份列表、全局更新状态与 App 的重启屏障。
 * [OUTPUT]: 提供本地备份、资源入口和手动程序更新。
 * [POS]: 客户端设置视图；关闭视图不销毁更新任务。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { displayMessage, t, dateTime } from './i18n';
import { useEffect, useRef, useState } from 'react';
import type { Backup } from './types';
import ResourcePanel from './ResourcePanel';
import {desktopUpdates, useDesktopUpdates} from './platform/desktop-updates';
import type {WithBackup} from './platform/update-controller';
import {updateMessage} from './DesktopUpdates';
import { desktopInfo, listLocalBackups, openBackupDirectory, readLocalBackup, type DesktopInfo, type LocalBackup } from './platform';

export default function DesktopPanel({ preview, beforeRestart, backupStatus }: {
  preview(backup: Backup): void;
  beforeRestart: WithBackup;
  backupStatus: { error: string; savedAt?: number };
}) {
  const [info, setInfo] = useState<DesktopInfo>();
  const [backups, setBackups] = useState<LocalBackup[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const update = useDesktopUpdates();
  const updating = ['checking','downloading','preparing','installing'].includes(update.phase);
  const mounted = useRef(false);
  async function refresh() { setBackups(await listLocalBackups()); }
  useEffect(() => {
    mounted.current = true;
    void Promise.all([desktopInfo(), listLocalBackups()]).then(([value, items]) => {
      if (mounted.current) { setInfo(value); setBackups(items); }
    }).catch(error => { if (mounted.current) setMessage(String(error)); });
    return () => { mounted.current = false; };
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage('');
    try { await action(); } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }
  return <div className="desktop-panel">
    <span className="eyebrow">{t("MAPPINGOUT DESKTOP")}</span><h2>{t("客户端设置")}</h2>
    <p>{t("版本 ")}{info?.version || '…'} {t(" · 离线客户端")}</p>
    <section><h3>{t("本地备份")}</h3>
      <p>{t("记录变更后自动备份，间隔最多 10 分钟。自动备份和恢复前备份各保留最近 20 份。")}</p>
      <p role="status">{backupStatus.error ? t("自动备份失败，将重试：{{v0}}", { v0: backupStatus.error }) : backupStatus.savedAt ? t("最近自动备份：{{v0}}", { v0: dateTime(backupStatus.savedAt) }) : t("等待首次自动备份…")}</p>
      <p className="desktop-path">{info?.backupDirectory}</p>
      <div className="desktop-actions"><button className="quiet" disabled={busy} onClick={() => void run(openBackupDirectory)}>{t("打开备份目录")}</button><button className="quiet" disabled={busy} onClick={() => void run(refresh)}>{t("刷新列表")}</button></div>
      <div className="desktop-backups">{!backups.length && <p className="muted">{t("暂无本地备份。已有记录会在应用运行期间自动备份。")}</p>}{backups.map(item => <button key={item.name} disabled={busy} className="backup-action" onClick={() => void run(async () => preview(await readLocalBackup(item.name)))}>
        <span><strong>{item.kind === 'restore' ? t("恢复前备份") : t("自动备份")}</strong><small>{dateTime(item.modified)} · {Math.max(1, Math.ceil(item.bytes / 1024))} {t(" KB")}</small></span><span>{t("预览恢复 →")}</span>
      </button>)}</div>
      <p className="muted">{t("恢复前会先显示内容摘要并要求确认。建议定期将备份导出到其他磁盘。")}</p>
    </section>
    <ResourcePanel beforeRestart={beforeRestart}/>
    <section><h3>{t("版本更新")}</h3>
      {info?.updateConfigured && update.enabled ? <><p>{t('启动时自动检查并下载新版本，完成后由你选择更新时间。')}</p>
        <p role="status">{updateMessage(update)}</p>
        {update.phase === 'downloading' && <progress aria-label={t('下载进度')} max={update.total || undefined} value={update.total ? update.downloaded : undefined}/>}
        <div className="desktop-actions"><button className="quiet" disabled={busy || updating} onClick={() => void desktopUpdates.check()}>{t("检查更新")}</button>
        {update.version && ['ready','deferred'].includes(update.phase) && <button className="primary" disabled={busy} onClick={() => void desktopUpdates.install(beforeRestart)}>{t('立即重启更新')}</button>}</div>
      </> : <p>{t("此构建使用手动更新。下载安装新版可保留个人记录；更新前建议导出一份备份。")}</p>}
    </section>
    {update.notes&&<details className="original-content wiki-disclosure"><summary>{t('版本说明原文')}</summary><pre>{update.notes}</pre></details>}
    {busy && <p role="status">{t("正在处理，请稍候…")}</p>}{message && <p role="status">{displayMessage(message)}</p>}
  </div>;
}
