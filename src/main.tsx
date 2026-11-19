/**
 * [INPUT]: 依赖 React、资料就绪信号、桌面更新与 Service Worker。
 * [OUTPUT]: 挂载应用；延迟字体并交接已访问资料与构建资源。
 * [POS]: 界面入口；仅在安全 Web 上下文注册离线缓存。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import 'leaflet/dist/leaflet.css';
import './app/styles.css';
import './app/features.css';
import ResourceGate from './app/desktop/ResourceGate';
import DesktopStartup from './app/desktop/DesktopStartup';
import type { ContentReadyDetail } from './i18n/content';
if(import.meta.env.MODE!=='desktop'||import.meta.env.DEV){
  window.addEventListener('mappingout:content-ready',()=>{
    const loadFonts=()=>void import('./i18n/fonts.css');
    const requestIdle=(window as unknown as {requestIdleCallback?:(callback:()=>void,options?:{timeout:number})=>number}).requestIdleCallback;
    if(requestIdle)requestIdle.call(window,loadFonts,{timeout:2000});
    else window.setTimeout(loadFonts,1500);
  },{once:true});
}
createRoot(document.getElementById('root')!).render(<React.StrictMode>{import.meta.env.MODE==='desktop'&&import.meta.env.PROD?<DesktopStartup><ResourceGate/></DesktopStartup>:<App/>}</React.StrictMode>);
if (import.meta.env.PROD && import.meta.env.MODE !== 'desktop' && isSecureContext && 'serviceWorker' in navigator) {
  const worker = navigator.serviceWorker;
  const visitedContent = new Set<string>();
  const appBase = new URL(import.meta.env.BASE_URL, location.href);
  const buildBase = new URL('build/', appBase);
  const cacheVisited = (paths: Iterable<string>) => {
    if (!worker.controller) return;
    // 懒加载模块能早于首次接管完成，只补缓存页面实际读取过的脚本与样式。
    const loadedBuilds = performance.getEntriesByType('resource').map(entry => new URL(entry.name))
      .filter(url => url.origin === appBase.origin && url.pathname.startsWith(buildBase.pathname) && /\.(?:js|css)$/.test(url.pathname))
      .map(url => url.pathname.slice(appBase.pathname.length));
    worker.controller.postMessage({ type: 'mappingout:cache-visited', paths: [...new Set([...paths, ...loadedBuilds])] });
  };
  window.addEventListener('mappingout:content-ready', event => {
    const paths = (event as CustomEvent<ContentReadyDetail>).detail.paths;
    paths.forEach(path => visitedContent.add(path));
    cacheVisited(paths);
  });
  worker.addEventListener('controllerchange', () => {
    if (!worker.controller) return;
    cacheVisited(visitedContent);
    // 首次接管前已显示的图片也必须进入当前版本缓存。
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
