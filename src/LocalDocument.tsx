import { useEffect, useState } from 'react';
export default function LocalDocument({ url }: { url: string }) {
  const [text, setText] = useState('正在读取…');
  useEffect(() => {
    let live = true;
    void fetch(url).then(async response => {
      if (!response.ok) throw Error(`读取失败（${response.status}）`);
      const text = await response.text();
      if (live) { try { setText(JSON.stringify(JSON.parse(text), null, 2)); } catch { setText(text); } }
    }).catch(error => { if (live) setText(String(error)); });
    return () => { live = false; };
  }, [url]);
  return <><h2>资料与许可报告</h2><pre className="local-document">{text}</pre></>;
}
