import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('public/sw.js','utf8').replace('__BUILD_VERSION__','test-release').replace('[/* __BUILD_PRECACHE__ */]',JSON.stringify(['build/app-123.js','build/app-123.css','data/catalog.json']));
function worker() {
  const base = 'https://atlas.test/maps/';
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
  vm.runInNewContext(source,{URL,Request,Response,caches,fetch:network,self:{location:{href:base+'sw.js'},addEventListener:(name:string,fn:(event:any)=>void)=>handlers.set(name,fn),skipWaiting,clients:{claim:vi.fn()}}});
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
  return {base,stored,cache,caches,network,fetchResource,lifecycle,skipWaiting};
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
  it('precaches the current shell, built resources and catalog while bypassing stale HTTP cache',async()=>{
    const w=worker();await w.lifecycle('install');
    expect(w.caches.open).toHaveBeenCalledWith('mappingout-test-release');
    expect(w.network.mock.calls[0][0].cache).toBe('reload');
    expect(w.cache.addAll.mock.calls[0][0].map(r=>({url:r.url,cache:r.cache}))).toEqual(['build/app-123.js','build/app-123.css','data/catalog.json'].map(p=>({url:w.base+p,cache:'reload'})));
    expect(w.stored.get(w.base)?.headers.get('content-type')).toContain('text/html');
    expect(w.skipWaiting).toHaveBeenCalled();
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
});
