/**
 * [INPUT]: 依赖程序更新单例、最新存储与原生备份。
 * [OUTPUT]: 在挂载应用前恢复延期安装。
 * [POS]: 桌面启动编排；安装成功或失败后的放行由控制器决定。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { useEffect, useState, type ReactNode } from 'react';
import { t } from '../../i18n';
import { personalStore } from '../../storage/store';
import { writeLocalBackup } from '../../platform';
import { desktopUpdates, useDesktopUpdates } from '../../platform/desktop-updates';
import { updateMessage } from '../../features/desktop/DesktopUpdates';
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

