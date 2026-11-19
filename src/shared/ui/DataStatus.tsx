/**
 * [INPUT]: 依赖界面翻译与错误文案。
 * [OUTPUT]: 展示资料加载状态和重试按钮。
 * [POS]: 功能页共同使用的状态界面。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { displayMessage, t } from '../../i18n';
import type { ContentProgress } from '../../i18n/content';
interface Props { error:string; retry:()=>void; progress?:ContentProgress }
export function DataStatus({error,retry,progress}:Props) {
  const phase=progress?.phase;
  const label=phase==='fetching'?t('正在下载资料'):phase==='verifying'?t('正在校验资料'):phase==='projecting'?t('正在生成语言视图'):t('正在加载资料…');
  return <div className="feature-status" role={error?'alert':'status'}>{error?<><p>{displayMessage(error)}</p><button className="primary" onClick={retry}>{t("重新加载")}</button></>:<><p>{label}{progress?.resource?` · ${progress.resource}`:''}</p>{phase==='fetching'&&progress&&progress.totalBytes&&<progress aria-label={t('资料下载进度')} value={progress.loadedBytes||0} max={progress.totalBytes}/>}</>}</div>;
}
