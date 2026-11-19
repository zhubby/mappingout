/**
 * [INPUT]: 依赖受控 Service Worker 的消息通道与离线任务协议。
 * [OUTPUT]: 提供全量离线准备进度、结果、失败和取消接口。
 * [POS]: Web 平台边界；Service Worker 独占版本缓存与资源写入。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
export interface OfflinePreparationProgress {
  completed: number;
  total: number;
  skipped: number;
  failed: number;
  latestError?: OfflinePreparationError;
}

export interface OfflinePreparationError {
  path: string;
  message: string;
}

export interface OfflinePreparationResult extends OfflinePreparationProgress {
  status: 'complete' | 'partial' | 'cancelled';
  errors: OfflinePreparationError[];
}

export interface OfflinePreparationTask {
  promise: Promise<OfflinePreparationResult>;
  cancel(): void;
}

type WorkerMessage =
  | ({ type: 'mappingout:offline-progress' } & OfflinePreparationProgress)
  | ({ type: 'mappingout:offline-result' } & OfflinePreparationResult)
  | { type: 'mappingout:offline-error'; message: string };

export function startOfflinePreparation(onProgress: (progress: OfflinePreparationProgress) => void = () => undefined): OfflinePreparationTask {
  const localHosts = ['localhost', '127.0.0.1', '[::1]', '::1'];
  const secureOrigin = typeof location !== 'undefined'
    && (location.protocol === 'https:' || localHosts.includes(location.hostname.toLowerCase()));
  if (!secureOrigin) throw new Error('offline.https-required');
  const worker = navigator.serviceWorker?.controller;
  if (!worker) throw new Error('offline.worker-not-ready');

  const channel = new MessageChannel();
  let settled = false;
  let resolveResult!: (result: OfflinePreparationResult) => void;
  let rejectResult!: (error: Error) => void;
  const promise = new Promise<OfflinePreparationResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  const finish = (action: () => void) => {
    if (settled) return;
    settled = true;
    channel.port1.close();
    action();
  };

  channel.port1.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const message = event.data;
    if (message.type === 'mappingout:offline-progress') {
      try { onProgress(message); } catch { /* UI observers do not own the worker job. */ }
    } else if (message.type === 'mappingout:offline-result') {
      finish(() => resolveResult(message));
    } else if (message.type === 'mappingout:offline-error') {
      finish(() => rejectResult(new Error(message.message)));
    }
  };
  channel.port1.onmessageerror = () => finish(() => rejectResult(new Error('offline.message-failed')));
  channel.port1.start();

  try {
    worker.postMessage({ type: 'mappingout:prepare-offline' }, [channel.port2]);
  } catch (error) {
    finish(() => rejectResult(error instanceof Error ? error : new Error(String(error))));
  }

  return {
    promise,
    cancel() {
      if (settled) return;
      try { channel.port1.postMessage({ type: 'cancel' }); } catch { /* The worker can finish between the click and message. */ }
    },
  };
}
