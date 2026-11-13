import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import './features.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
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
