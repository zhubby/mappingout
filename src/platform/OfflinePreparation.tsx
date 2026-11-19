/**
 * [INPUT]: 依赖离线准备 API、本机语言和现有按钮主题。
 * [OUTPUT]: 提供全量离线资料的开始、进度、取消和重试界面。
 * [POS]: Web 设置入口；资源调度与版本缓存由 Service Worker 负责。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { useEffect, useRef, useState } from 'react';
import { Download, RotateCw, X } from 'lucide-react';
import { number, t } from '../i18n';
import type { UiKey } from '../i18n';
import { startOfflinePreparation } from './offline-preparation';
import type { OfflinePreparationError, OfflinePreparationProgress, OfflinePreparationResult, OfflinePreparationTask } from './offline-preparation';
import './offline-preparation.css';

type Phase = 'idle' | 'running' | 'complete' | 'partial' | 'cancelled' | 'error';
const text = (key: string, values?: Record<string, unknown>) => t(key as UiKey, values);
const loopbackHosts = ['localhost', '127.0.0.1', '[::1]', '::1'];

function secureOrigin(): boolean {
  return typeof location !== 'undefined'
    && (location.protocol === 'https:' || loopbackHosts.includes(location.hostname.toLowerCase()));
}

function serviceWorkerReady(): boolean {
  return typeof navigator !== 'undefined'
    && secureOrigin()
    && 'serviceWorker' in navigator
    && !!navigator.serviceWorker.controller;
}

function errorText(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error);
  if (code.includes('offline.https-required')) return text('请通过 HTTPS 使用此功能。');
  if (code.includes('offline.worker-not-ready')) return text('Service Worker 尚未就绪。请刷新页面后重试。');
  return text('无法启动离线准备，请联网后重试。');
}

export default function OfflinePreparation() {
  const task = useRef<OfflinePreparationTask | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<OfflinePreparationProgress>({ completed: 0, total: 0, skipped: 0, failed: 0 });
  const [errors, setErrors] = useState<OfflinePreparationError[]>([]);
  const [message, setMessage] = useState('');
  const working = phase === 'running';

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const update = () => setReady(serviceWorkerReady());
    navigator.serviceWorker.addEventListener('controllerchange', update);
    update();
    return () => navigator.serviceWorker.removeEventListener('controllerchange', update);
  }, []);

  useEffect(() => () => task.current?.cancel(), []);

  async function prepare() {
    setPhase('running');
    setErrors([]);
    setMessage('');
    setProgress({ completed: 0, total: 0, skipped: 0, failed: 0 });
    try {
      const current = startOfflinePreparation(setProgress);
      task.current = current;
      const result: OfflinePreparationResult = await current.promise;
      setProgress(result);
      setErrors(result.errors);
      setPhase(result.status);
    } catch (error) {
      setMessage(errorText(error));
      setPhase('error');
    } finally {
      task.current = undefined;
    }
  }

  function cancel() {
    task.current?.cancel();
  }

  const statusText = phase === 'complete' ? text('离线资料已准备完成。')
    : phase === 'partial' ? text('部分资源未能下载。可重试失败项。')
      : phase === 'cancelled' ? text('准备已取消，可继续准备。')
        : phase === 'error' ? message : '';

  return <section className="offline-preparation" aria-labelledby="offline-preparation-title">
    <h3 id="offline-preparation-title">{text('离线资料准备')}</h3>
    <p>{text('首次安装只缓存启动资源。完整准备会下载当前版本的地图、资料、字体和图标。')}</p>
    {!ready && <p className="offline-preparation-note" role="status">{!secureOrigin()
      ? text('请通过 HTTPS 使用此功能。')
      : text('Service Worker 尚未就绪。请刷新页面后重试。')}</p>}
    {working && <>
      <progress aria-label={text('离线准备进度')} max={progress.total || undefined} value={progress.completed}/>
      <p className="offline-preparation-count" role="status">{text('已处理 {{v0}} / {{v1}} 项；已跳过 {{v2}} 项；失败 {{v3}} 项。', {
        v0: number(progress.completed), v1: number(progress.total), v2: number(progress.skipped), v3: number(progress.failed),
      })}</p>
    </>}
    {statusText && <p className="offline-preparation-status" role="status">{statusText}</p>}
    {!!errors.length && <ul className="offline-preparation-errors" aria-label={text('部分资源未能下载。可重试失败项。')}>
      {errors.slice(0, 5).map(error => <li key={error.path}><code>{error.path}</code><span>{error.message}</span></li>)}
      {errors.length > 5 && <li>{text('部分资源未能下载。可重试失败项。')}</li>}
    </ul>}
    <div className="offline-preparation-actions">
      {working
        ? <button className="quiet" type="button" onClick={cancel}><X size={15}/>{text('取消准备')}</button>
        : <button className="primary" type="button" disabled={!ready} onClick={() => void prepare()}>
          {phase === 'idle' ? <Download size={15}/> : <RotateCw size={15}/>}
          {phase === 'idle' ? text('开始离线准备') : text('重试准备')}
        </button>}
    </div>
  </section>;
}
