/**
 * [INPUT]: 依赖界面翻译与错误文案。
 * [OUTPUT]: 展示资料加载状态和重试按钮。
 * [POS]: 功能页共同使用的状态界面。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { displayMessage, t } from '../../i18n';
export function DataStatus({error,retry}:{error:string;retry:()=>void}) {return <div className="feature-status" role={error?'alert':'status'}>{error?<><p>{displayMessage(error)}</p><button className="primary" onClick={retry}>{t("重新加载")}</button></>:<p>{t("正在加载资料…")}</p>}</div>;}
