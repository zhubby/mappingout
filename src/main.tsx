/**
 * [INPUT]: 依赖 React、桌面启动更新、资源入口与网页缓存。
 * [OUTPUT]: 挂载应用；桌面先恢复延期更新，网页注册离线缓存。
 * [POS]: 界面入口；生产桌面启动与网页启动在此分开。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import './features.css';
import ResourceGate from './ResourceGate';
import DesktopStartup from './DesktopUpdates';
if(import.meta.env.MODE!=='desktop'||import.meta.env.DEV)void import('./i18n/fonts.css');
createRoot(document.getElementById('root')!).render(<React.StrictMode>{import.meta.env.MODE==='desktop'&&import.meta.env.PROD?<DesktopStartup><ResourceGate/></DesktopStartup>:<App/>}</React.StrictMode>);
if (import.meta.env.PROD && import.meta.env.MODE !== 'desktop' && 'serviceWorker' in navigator) {
  const worker = navigator.serviceWorker;
  worker.addEventListener('controllerchange', () => {
    if (!worker.controller) return;
    // Images can finish loading before the first worker claims the page. Fetch
    // the displayed assets through the new controller to cache that first visit.
    const assets = new URL(`${import.meta.env.BASE_URL}assets/`, location.href);
    const images = new Set(Array.from(document.images, image => image.currentSrc || image.src));
    for (const url of images) {
      if (url.startsWith(assets.href)) void fetch(url).catch(() => undefined);
    }
  });
  window.addEventListener('load', () => {
    worker.register(`${import.meta.env.BASE_URL}sw.js`).catch(console.error);
  }, { once: true });
}
