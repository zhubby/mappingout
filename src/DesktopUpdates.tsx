/**
 * [INPUT]: 依赖更新单例、个人备份和应用提供的重启屏障。
 * [OUTPUT]: 提供启动更新入口、进度提示和二选一更新弹窗。
 * [POS]: 桌面更新界面；主界面编辑期间由 App 暂缓弹窗。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {useEffect, useRef, useState, type ReactNode} from 'react';
import {t, useLocale} from './i18n';
import {personalStore} from './storage';
import {writeLocalBackup} from './platform';
import {desktopUpdates, useDesktopUpdates} from './platform/desktop-updates';
import type {UpdateStatus, WithBackup} from './platform/update-controller';

export function updateMessage(status: UpdateStatus): string {
  if (status.phase === 'error') {
    if (status.error?.includes('updates.unsaved')) return t('有操作尚未保存，请重试保存后再更新。');
    if (status.error?.includes('updates.interrupted')) return t('上次更新未完成，请手动重试；当前版本仍可使用。');
    if (/signature|integrity|updates.cache/.test(status.error || '')) return t('更新包校验失败，请重新检查更新。');
    return t('更新未完成，可继续使用当前版本，并在客户端设置中重试。');
  }
  if (status.phase === 'checking') return t('正在检查程序更新…');
  if (status.phase === 'downloading') return t('正在后台下载新版本…');
  if (status.phase === 'preparing') return t('正在准备新版所需的离线资料…');
  if (status.phase === 'installing') return t('正在保存备份并安装更新…');
  if (status.phase === 'ready') return t('新版本 {{v0}} 已下载并校验，可选择更新时间。', {v0:status.version});
  if (status.phase === 'deferred') return t('新版本 {{v0}} 将在下次打开应用时安装。', {v0:status.version});
  return t('当前已是最新版本。');
}

export default function DesktopStartup({children}: {children: ReactNode}) {
  const [ready, setReady] = useState(false);
  const status = useDesktopUpdates();
  useEffect(() => {
    let live = true;
    void desktopUpdates.initialize(async install => {
      await writeLocalBackup(await personalStore.load(), 'auto');
      await install();
    }).then(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);
  return ready ? children : <main className="loading"><h1>{t('正在准备客户端…')}</h1><p role="status">{status.phase === 'installing' ? updateMessage(status) : t('正在读取已下载的更新…')}</p></main>;
}

export function DesktopUpdateProgress() {
  useLocale();
  const status = useDesktopUpdates();
  if (!status.enabled || status.phase === 'idle' || status.phase === 'ready') return null;
  return <div className="desktop-update-status" role="status">
    <span>{updateMessage(status)}</span>
    {status.phase === 'downloading' && <progress aria-label={t('下载进度')} max={status.total || undefined} value={status.total ? status.downloaded : undefined}/>}
  </div>;
}

export function DesktopUpdatePrompt({withBackup}: {withBackup: WithBackup}) {
  const status = useDesktopUpdates();
  const dialog = useRef<HTMLElement>(null), later = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    later.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  const defer = () => { void desktopUpdates.defer(); };
  return <div className="modal-backdrop desktop-update-backdrop" onClick={defer}>
    <section ref={dialog} className="modal desktop-update-dialog" role="dialog" aria-modal="true" aria-labelledby="desktop-update-title" aria-describedby="desktop-update-description"
      onClick={event => event.stopPropagation()} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); defer(); }
        if (event.key === 'Tab') {
          const buttons = dialog.current?.querySelectorAll<HTMLElement>('button, summary');
          const first = buttons?.[0], last = buttons?.[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <span className="eyebrow">MAPPINGOUT DESKTOP</span><h2 id="desktop-update-title">{t('新版本已准备好')}</h2>
      <p id="desktop-update-description">{updateMessage(status)}</p>
      <p>{t('立即更新会先保存个人记录和备份，再自动安装并重新打开应用。')}</p>
      {status.notes && <details className="original-content wiki-disclosure"><summary>{t('版本说明原文')}</summary><pre>{status.notes}</pre></details>}
      <div className="desktop-actions">
        <button className="primary" onClick={() => void desktopUpdates.install(withBackup)}>{t('立即重启更新')}</button>
        <button ref={later} className="quiet" onClick={defer}>{t('下次打开时更新')}</button>
      </div>
    </section>
  </div>;
}
