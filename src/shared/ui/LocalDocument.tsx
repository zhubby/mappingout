/**
 * [INPUT]: 依赖本地文档 URL 与界面翻译。
 * [OUTPUT]: 读取并展示 JSON 或许可文本。
 * [POS]: 桌面文档阅读器；取消已卸载界面的异步更新。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { displayMessage, t } from '../../i18n';
import { useEffect, useState } from 'react';
export default function LocalDocument({ url }: { url: string }) {
  const [text, setText] = useState(t("正在读取…"));
  useEffect(() => {
    let live = true;
    void fetch(url).then(async response => {
      if (!response.ok) throw Error(t("读取失败（{{v0}}）", { v0: response.status }));
      const text = await response.text();
      if (live) { try { setText(JSON.stringify(JSON.parse(text), null, 2)); } catch { setText(text); } }
    }).catch(error => { if (live) setText(String(error)); });
    return () => { live = false; };
  }, [url]);
  return <><h2>{t("资料与许可报告")}</h2><pre className="local-document">{displayMessage(text)}</pre></>;
}
