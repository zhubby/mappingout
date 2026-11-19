/**
 * [INPUT]: 依赖被测领域或构建接口与固定测试资料。
 * [OUTPUT]: 验证 service-worker 的行为与拒绝条件。
 * [POS]: 独立回归测试；不向生产环境写入数据。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('public/sw.js','utf8').replace('__BUILD_VERSION__','test-release').replace('[/* __BUILD_PRECACHE__ */]',JSON.stringify(['build/content.worker-123.js','build/app-123.css','build/app-123.js']));
function worker(origin = 'https://atlas.test/maps/') {
  const base = origin;
  const stored = new Map<string, Response>();
  const key = (request: string | URL | {url:string}) => typeof request === 'string' ? request : request instanceof URL ? request.href : request.url;
  const cache = {
    put: vi.fn(async (request: string | URL | {url:string}, response: Response) => { stored.set(key(request),response.clone()); }),
    match: vi.fn(async (request: string | URL | {url:string}) => stored.get(key(request))?.clone()),
    addAll: vi.fn(async (_requests: Request[]) => {})
  };
  const caches = {open:vi.fn(async()=>cache),keys:vi.fn(async()=>['mappingout-v1','mappingout-v2','mappingout-test-release','other-app']),delete:vi.fn(async()=>true)};
  const network = vi.fn(async(_request: Request)=>new Response('<html>application</html>',{headers:{'content-type':'text/html; charset=utf-8'}}));
  const handlers = new Map<string,(event:any)=>void>();
  const skipWaiting=vi.fn();
  const parsedBase=new URL(base);
  vm.runInNewContext(source,{URL,Request,Response,AbortController,caches,fetch:network,self:{location:{href:base+'sw.js',protocol:parsedBase.protocol,hostname:parsedBase.hostname},addEventListener:(name:string,fn:(event:any)=>void)=>handlers.set(name,fn),skipWaiting,clients:{claim:vi.fn()}}});
  async function fetchResource(path: string, mode='navigate') {
    let result!: Promise<Response>; const pending: Promise<unknown>[]=[];
    handlers.get('fetch')!({request:{url:base+path,method:'GET',mode},respondWith:(p:Promise<Response>)=>{result=p;},waitUntil:(p:Promise<unknown>)=>pending.push(p)});
    const response=await result;await Promise.all(pending);return response;
  }
  async function lifecycle(name: string) {
    let pending!:Promise<unknown>;
    handlers.get(name)!({waitUntil:(p:Promise<unknown>)=>{pending=p;}});
    await pending;
  }
  async function prepare(port: any) {
    let pending!:Promise<unknown>;
    handlers.get('message')!({data:{type:'mappingout:prepare-offline'},ports:[port],waitUntil:(p:Promise<unknown>)=>{pending=p;}});
    await pending;
  }
  async function cacheVisited(paths:string[]) {
    let pending!:Promise<unknown>;
    handlers.get('message')!({data:{type:'mappingout:cache-visited',paths},waitUntil:(p:Promise<unknown>)=>{pending=p;}});
    await pending;
  }
  return {base,stored,cache,caches,network,fetchResource,lifecycle,prepare,cacheVisited,handlers,skipWaiting};
}
function messagePort() {
  const messages:any[]=[];
  return {messages,onmessage:null as null|((event:any)=>void),postMessage:(message:any)=>messages.push(message),start:vi.fn(),close:vi.fn()};
}
describe('offline shell and cache failures',()=>{
  it('does not replace the HTML shell when navigating to report JSON or an image',async()=>{
    const w=worker();w.stored.set(w.base,new Response('<html>original shell</html>',{headers:{'content-type':'text/html'}}));
    w.network.mockResolvedValueOnce(new Response('{"version":1}',{headers:{'content-type':'application/json'}}));
    await w.fetchResource('data/report.json');
    w.network.mockResolvedValueOnce(new Response('image bytes',{headers:{'content-type':'image/jpeg'}}));
    await w.fetchResource('assets/maps/1-1.jpg');
    expect(await w.stored.get(w.base)!.clone().text()).toBe('<html>original shell</html>');
    w.network.mockRejectedValue(new Error('offline'));
    const response=await w.fetchResource('?kind=skill&map=1%3A1');
    expect(response.headers.get('content-type')).toBe('text/html');
    expect(await response.text()).toBe('<html>original shell</html>');
    expect(await (await w.fetchResource('data/report.json')).json()).toEqual({version:1});
  });
  it('updates the shell only from entry HTML and never serves HTML for an uncached report',async()=>{
    const w=worker();await w.fetchResource('index.html?kind=boss');
    expect(await w.stored.get(w.base)!.clone().text()).toContain('application');
    w.network.mockResolvedValueOnce(new Response('{"unexpected":true}',{headers:{'content-type':'application/json'}}));
    await w.fetchResource('');
    expect(w.stored.get(w.base)!.headers.get('content-type')).toContain('text/html');
    w.network.mockRejectedValue(new Error('offline'));
    expect((await w.fetchResource('data/missing-report.json')).status).toBe(503);
  });
  it('returns a successful network response when cache writes run out of quota',async()=>{
    const w=worker();w.cache.put.mockRejectedValue(new Error('QuotaExceededError'));
    w.network.mockResolvedValue(new Response('new map bytes',{headers:{'content-type':'image/jpeg'}}));
    const response=await w.fetchResource('assets/maps/new.jpg','cors');
    expect(response.status).toBe(200);expect(await response.text()).toBe('new map bytes');
  });
  it('keeps online requests working when cache storage cannot be opened',async()=>{
    const w=worker();w.caches.open.mockRejectedValue(new Error('storage unavailable'));
    expect((await w.fetchResource('')).status).toBe(200);
    w.network.mockRejectedValue(new Error('offline'));
    expect((await w.fetchResource('')).status).toBe(503);
  });
  it('removes the previous potentially poisoned shell cache on activation',async()=>{
    const w=worker();await w.lifecycle('activate');
    expect(w.caches.delete).toHaveBeenCalledWith('mappingout-v1');
    expect(w.caches.delete).toHaveBeenCalledWith('mappingout-v2');
    expect(w.caches.delete).not.toHaveBeenCalledWith('mappingout-test-release');
    expect(w.caches.delete).not.toHaveBeenCalledWith('other-app');
  });
  it('precaches only the current shell and entry assets while bypassing stale HTTP cache',async()=>{
    const w=worker();await w.lifecycle('install');
    expect(w.caches.open).toHaveBeenCalledWith('mappingout-test-release');
    expect(w.network.mock.calls[0][0].cache).toBe('reload');
    expect(w.cache.addAll.mock.calls[0][0].map(r=>({url:r.url,cache:r.cache}))).toEqual(['build/content.worker-123.js','build/app-123.css','build/app-123.js'].map(p=>({url:w.base+p,cache:'reload'})));
    expect(w.stored.get(w.base)?.headers.get('content-type')).toContain('text/html');
    expect(w.skipWaiting).toHaveBeenCalled();
  });
  it('caches only missing resources reported as visited by the content worker',async()=>{
    const w=worker();
    const cached=w.base+'data/catalog.json';
    w.stored.set(cached,new Response('cached'));
    w.network.mockImplementation(async request=>new Response(request.url));
    await w.cacheVisited(['data/catalog.json','data/quests.json','build/QuestGuides-abc.js']);
    expect(w.network.mock.calls.map(([request])=>request.url)).toEqual([w.base+'data/quests.json',w.base+'build/QuestGuides-abc.js']);
    expect(w.stored.has(w.base+'data/quests.json')).toBe(true);
    expect(w.stored.has(w.base+'build/QuestGuides-abc.js')).toBe(true);
    await w.cacheVisited(['../outside.json','/data/armor.json','https://other.test/data/armor.json','//other.test/data/armor.json','data/../armor.json','data/%2e%2e/armor.json','data/armor.json?download=1','data/armor.json#fragment','data/unknown.json','assets/maps/1-1.jpg']);
    expect(w.network).toHaveBeenCalledTimes(2);
  });
  it('deduplicates concurrent visited requests and tolerates network or cache failures',async()=>{
    const w=worker();
    let release!:()=>void;
    const ready=new Promise<void>(resolve=>{release=resolve;});
    w.network.mockImplementation(async()=>{await ready;return new Response('visited');});
    const pending=Promise.all([w.cacheVisited(['data/quests.json']),w.cacheVisited(['data/quests.json'])]);
    release();await pending;
    expect(w.network).toHaveBeenCalledTimes(1);
    w.network.mockRejectedValue(new Error('offline'));
    await w.cacheVisited(['data/armor.json']);
    expect(w.stored.has(w.base+'data/armor.json')).toBe(false);
    w.network.mockResolvedValue(new Response('missing',{status:404}));
    await w.cacheVisited(['data/armor.json']);
    expect(w.stored.has(w.base+'data/armor.json')).toBe(false);
    w.caches.open.mockRejectedValue(new Error('storage unavailable'));
    await expect(w.cacheVisited(['data/skills.json'])).resolves.toBeUndefined();
  });
  it('keeps the old worker available if the next release cannot be fully precached',async()=>{
    const w=worker();w.cache.addAll.mockRejectedValue(new Error('network failure'));
    await expect(w.lifecycle('install')).rejects.toThrow('network failure');
    expect(w.skipWaiting).not.toHaveBeenCalled();
    expect(w.caches.delete).not.toHaveBeenCalled();
  });
  it('preserves real network 404s without falling back to HTML or caching the error',async()=>{
    const w=worker();w.network.mockResolvedValue(new Response('missing',{status:404}));
    expect((await w.fetchResource('build/missing.js')).status).toBe(404);
    expect(w.cache.put).not.toHaveBeenCalled();
  });
  it('does not install the worker from an insecure origin',async()=>{
    const w=worker('http://atlas.test/maps/');
    await expect(w.lifecycle('install')).rejects.toThrow(/Secure origin/);
    expect(w.skipWaiting).not.toHaveBeenCalled();
  });
  it('allows worker installation on the secure localhost test origin',async()=>{
    const w=worker('http://127.0.0.1:4173/maps/');
    await w.lifecycle('install');
    expect(w.skipWaiting).toHaveBeenCalled();
  });
  it('prepares all manifest assets with at most two requests and skips cached assets',async()=>{
    const w=worker();
    const manifest=['assets/maps/1-1.jpg','assets/maps/1-2.jpg','data/catalog.json','build/lazy.js'];
    w.stored.set(w.base+'assets/maps/1-1.jpg',new Response('cached'));
    let active=0,maxActive=0;
    w.network.mockImplementation(async request=>{
      if(request.url.endsWith('/offline-assets.json')) return new Response(JSON.stringify(manifest),{headers:{'content-type':'application/json'}});
      active++;maxActive=Math.max(active,maxActive);await new Promise(resolve=>setTimeout(resolve,0));active--;
      return new Response(request.url);
    });
    const port=messagePort();await w.prepare(port);
    const result=port.messages.at(-1);
    expect(result).toMatchObject({type:'mappingout:offline-result',status:'complete',total:4,completed:4,skipped:1,failed:0});
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(w.network.mock.calls.map(([request])=>request.url)).not.toContain(w.base+'assets/maps/1-1.jpg');
    expect(w.stored.has(w.base+'build/lazy.js')).toBe(true);
  });
  it('cancels preparation while the offline manifest is still downloading',async()=>{
    const w=worker();
    let requested!:()=>void;
    const started=new Promise<void>(resolve=>{requested=resolve;});
    w.network.mockImplementation(request=>new Promise<Response>((_resolve,reject)=>{
      request.signal.addEventListener('abort',()=>reject(request.signal.reason),{once:true});
      requested();
    }));
    const port=messagePort();
    const pending=w.prepare(port);
    await started;
    port.onmessage!({data:{type:'cancel'}});
    expect(w.network.mock.calls[0][0].signal.aborted).toBe(true);
    await pending;
    expect(port.messages.at(-1)).toMatchObject({type:'mappingout:offline-result',status:'cancelled',completed:0,total:0});
    expect(w.cache.put).not.toHaveBeenCalled();
  });
  it('reports failed assets and retries only resources still missing from cache',async()=>{
    const w=worker();
    w.network.mockImplementation(async request=>request.url.endsWith('/offline-assets.json')
      ? new Response(JSON.stringify(['data/catalog.json','assets/maps/1-1.jpg']),{headers:{'content-type':'application/json'}})
      : request.url.endsWith('catalog.json') ? new Response('catalog') : new Response('unavailable',{status:503}));
    const first=messagePort();await w.prepare(first);
    expect(first.messages.at(-1)).toMatchObject({status:'partial',completed:2,failed:1});
    expect(first.messages.at(-1).errors[0].path).toBe('assets/maps/1-1.jpg');
    w.network.mockImplementation(async request=>request.url.endsWith('/offline-assets.json')
      ? new Response(JSON.stringify(['data/catalog.json','assets/maps/1-1.jpg']),{headers:{'content-type':'application/json'}})
      : new Response('map'));
    const retry=messagePort();await w.prepare(retry);
    expect(retry.messages.at(-1)).toMatchObject({status:'complete',completed:2,skipped:1,failed:0});
    expect(w.network.mock.calls.filter(([request])=>request.url.endsWith('catalog.json'))).toHaveLength(1);
  });
  it('cancels active downloads and leaves completed assets available for resume',async()=>{
    const w=worker();
    w.network.mockImplementation(async request=>{
      if(request.url.endsWith('/offline-assets.json')) return new Response(JSON.stringify(['data/catalog.json','assets/maps/1-1.jpg']),{headers:{'content-type':'application/json'}});
      return new Promise((_resolve,reject)=>request.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
    });
    const port=messagePort();
    const job=w.prepare(port);
    await new Promise(resolve=>setTimeout(resolve,0));
    port.onmessage?.({data:{type:'cancel'}});
    await job;
    expect(port.messages.at(-1)).toMatchObject({type:'mappingout:offline-result',status:'cancelled'});
    expect(w.cache.put).not.toHaveBeenCalled();
  });
});

describe('offline preparation page API',()=>{
  it('rejects preparation outside HTTPS',async()=>{
    vi.stubGlobal('location',{protocol:'http:',hostname:'atlas.test'});
    vi.stubGlobal('navigator',{serviceWorker:{controller:{postMessage:vi.fn()}}});
    const {startOfflinePreparation}=await import('../src/platform/offline-preparation');
    expect(()=>startOfflinePreparation()).toThrow('offline.https-required');
    vi.unstubAllGlobals();
  });
  it('allows the secure localhost browser-test origin',async()=>{
    vi.stubGlobal('location',{protocol:'http:',hostname:'127.0.0.1'});
    const controller={postMessage:vi.fn((_message:unknown,ports:MessagePort[])=>{
      ports[0].postMessage({type:'mappingout:offline-result',status:'complete',completed:0,total:0,skipped:0,failed:0,errors:[]});
    })};
    vi.stubGlobal('navigator',{serviceWorker:{controller}});
    const {startOfflinePreparation}=await import('../src/platform/offline-preparation');
    await expect(startOfflinePreparation().promise).resolves.toMatchObject({status:'complete'});
    vi.unstubAllGlobals();
  });
  it('streams worker progress and resolves with the preparation result',async()=>{
    vi.stubGlobal('location',{protocol:'https:'});
    const controller={postMessage:vi.fn((_message:unknown,ports:MessagePort[])=>{
      ports[0].postMessage({type:'mappingout:offline-progress',completed:1,total:2,skipped:0,failed:0});
      ports[0].postMessage({type:'mappingout:offline-result',status:'complete',completed:2,total:2,skipped:1,failed:0,errors:[]});
    })};
    vi.stubGlobal('navigator',{serviceWorker:{controller}});
    const {startOfflinePreparation}=await import('../src/platform/offline-preparation');
    const updates:any[]=[];
    const task=startOfflinePreparation(update=>updates.push(update));
    await expect(task.promise).resolves.toMatchObject({status:'complete',total:2,skipped:1});
    expect(controller.postMessage).toHaveBeenCalledWith({type:'mappingout:prepare-offline'},expect.any(Array));
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({completed:1,total:2});
    vi.unstubAllGlobals();
  });
  it('sends cancellation through the preparation channel',async()=>{
    vi.stubGlobal('location',{protocol:'https:'});
    const controller={postMessage:vi.fn((_message:unknown,ports:MessagePort[])=>{
      const port=ports[0];
      port.onmessage=event=>{
        if(event.data?.type==='cancel')port.postMessage({type:'mappingout:offline-result',status:'cancelled',completed:0,total:1,skipped:0,failed:0,errors:[]});
      };
      port.start();
    })};
    vi.stubGlobal('navigator',{serviceWorker:{controller}});
    const {startOfflinePreparation}=await import('../src/platform/offline-preparation');
    const task=startOfflinePreparation();
    task.cancel();
    await expect(task.promise).resolves.toMatchObject({status:'cancelled'});
    vi.unstubAllGlobals();
  });
});
