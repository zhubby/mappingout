/**
 * [INPUT]: 依赖固定 Wiki 事实、双语资料和翻译审校规则。
 * [OUTPUT]: 验证事实、数值、worker 校验、聚合进度与资源超时。
 * [POS]: 资料准确性回归；防止译文覆盖事实或沿用失效审校。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {englishSource,numericIssues,numericSignature,translationReviewMatches} from '../scripts/i18n/english-source.mjs';
import {contentFields} from '../src/i18n/content-fields';
import {loadContent} from '../src/i18n/content';

const read=(file:string)=>JSON.parse(fs.readFileSync(file,'utf8'));
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
function stubContentWorker(){
  class WorkerStub{
    onmessage?:((event:MessageEvent)=>void)|null=null;
    onerror?:((event:ErrorEvent)=>void)|null=null;
    postMessage(request:unknown){
      void import('../src/i18n/content.worker').then(({handleContentRequest})=>handleContentRequest(request as never,message=>this.onmessage?.({data:message} as MessageEvent)));
    }
    terminate(){}
  }
  vi.stubGlobal('Worker',WorkerStub);
}
afterEach(()=>vi.unstubAllGlobals());

describe('English Wiki authority',()=>{
  it('takes a description from the Wiki facts even when the legacy Chinese is wrong',()=>{
    const reference={title:'Cleave',pageid:1,revid:123};
    const data={records:[{id:'skill:1',kind:'skill',name:'劈擊',description:'舊版誤寫傷害 999',skill:{description:'Elite Axe Attack. +10 damage.',reference},wiki:reference}]};
    const field=contentFields(data,'catalog').find(f=>f.key.endsWith('/description')&&!f.key.includes('/skill/'))!;
    const source=englishSource(data,'catalog',field);
    expect(source.text).toBe('Elite Axe Attack. +10 damage.');
    expect(source.references).toEqual([reference]);
    expect(englishSource({records:[{id:'legacy',description:'無法確認的舊說明'}]},'catalog',{key:'records/legacy/description',path:['records',0,'description'],source:'無法確認的舊說明'})).toBeUndefined();
  });
  it('cites the PvP revision for PvP fields and preserves unresolved identities',()=>{
    const data={records:[{id:'skill:1',skill:{reference:{title:'Skill',pageid:1,revid:10},pvp:{description:'PvP effect 15%.',reference:{title:'Skill (PvP)',pageid:2,revid:20}}}}]};
    const field=contentFields(data,'catalog').find(f=>f.key.includes('/pvp/description'))!;
    expect(englishSource(data,'catalog',field).references).toEqual([{title:'Skill (PvP)',pageid:2,revid:20}]);
    const unresolved={records:[{id:'green:1',kind:'green',name:'火之刃',englishName:"Hierophant's Chest",wiki:{identityStatus:'unresolved'}}]};
    expect(englishSource(unresolved,'catalog',contentFields(unresolved,'catalog')[0]).text).toBe('Unresolved legacy item');
  });
  it('invalidates approval when English, its revision evidence, or Chinese changes',()=>{
    const text='傷害降低 25%。',source={englishHash:hash('25% less damage.'),evidenceHash:'revision-1'};
    const review={...source,translationHash:hash(text),reviewer:'manual'};
    expect(translationReviewMatches(source,text,review)).toBe(true);
    expect(translationReviewMatches({...source,englishHash:hash('25% more damage.')},text,review)).toBe(false);
    expect(translationReviewMatches({...source,evidenceHash:'revision-2'},text,review)).toBe(false);
    expect(translationReviewMatches(source,'受到 25% 傷害。',review)).toBe(false);
  });
  it('rejects a changed English pack even when both languages still claim the same old hash',async()=>{
    const raw=JSON.stringify({activities:[{id:'a',objective:'Damage reduced by 25%.'}]}),sourceHash=hash(raw);
    const fields={'activities/a/objective':'Damage reduced by 25%.'},englishHash=hash(JSON.stringify(fields));
    const common={version:1,dataset:'calendar',sourceHash,englishHash,baselineHash:'pinned-evidence'};
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,status:200,headers:{get:()=>null},body:null,text:async()=>url.includes('/en/')?JSON.stringify({...common,locale:'en',fields:{'activities/a/objective':'Damage increased by 25%.'}}):url.includes('/zh-TW/')?JSON.stringify({...common,locale:'zh-TW',fields:{'activities/a/objective':'傷害降低 25%。'}}):raw})));
    stubContentWorker();
    await expect(loadContent('calendar')).rejects.toThrow('Stale English translation baseline');
  });
});

describe('content worker',()=>{
  function resources(){
    const raw=JSON.stringify({activities:[{id:'a',name:'活動',objective:'Reach the city.'}]});
    const fields={'activities/a/name':'Festival','activities/a/objective':'Reach the city.'};
    const sourceHash=hash(raw),englishHash=hash(JSON.stringify(fields)),baselineHash='pinned-evidence';
    const pack=(locale:'zh-TW'|'en',localized:Record<string,string>)=>JSON.stringify({version:1,dataset:'calendar',locale,sourceHash,englishHash,baselineHash,fields:localized});
    return new Map([
      ['/data/calendar.json',raw],
      ['/data/i18n/zh-TW/calendar.json',pack('zh-TW',{'activities/a/name':'活動','activities/a/objective':'前往城市。'})],
      ['/data/i18n/en/calendar.json',pack('en',fields)],
    ]);
  }
  it('validates exact hashes and projects the requested locale off-thread',async()=>{
    vi.resetModules();
    const data=resources(),messages:any[]=[];
    const fetcher=vi.fn(async(url:string)=>({ok:true,status:200,headers:{get:()=>null},body:null,text:async()=>data.get(url)!}));
    const {handleContentRequest}=await import('../src/i18n/content.worker');
    await handleContentRequest({id:1,dataset:'calendar',locale:'en',baseUrl:'/'},message=>messages.push(message),fetcher as never);
    const phases=messages.map(message=>message.type==='progress'?message.progress.phase:message.type);
    expect(phases.filter((phase,index)=>phase!==phases[index-1])).toEqual(['fetching','verifying','projecting','success']);
    expect(messages.at(-1).result.data.activities[0].name).toBe('Festival');
    expect(messages.at(-1).result.original.activities[0].name).toBe('活動');
  });
  it('aggregates interleaved downloads without resetting bytes or counting a started file as complete',async()=>{
    vi.resetModules();
    const data=resources(),encoder=new TextEncoder();
    const bodies=new Map([...data].map(([path,text])=>[path,encoder.encode(text)]));
    const streams=new Map<string,ReadableStreamDefaultController<Uint8Array>>();
    const messages:any[]=[];
    const fetcher=vi.fn(async(url:string)=>new Response(new ReadableStream<Uint8Array>({start(controller){streams.set(url,controller);}}),{headers:{'content-length':String(bodies.get(url)!.length)}}));
    const {handleContentRequest}=await import('../src/i18n/content.worker');
    const pending=handleContentRequest({id:1,dataset:'calendar',locale:'en',baseUrl:'/'},message=>messages.push(message),fetcher as never);
    const downloads=()=>messages.filter(message=>message.type==='progress'&&message.progress.phase==='fetching').map(message=>message.progress);
    const total=[...bodies.values()].reduce((sum,body)=>sum+body.length,0);
    await vi.waitFor(()=>expect(downloads().at(-1)?.totalBytes).toBe(total));
    for(const [path,body]of bodies)streams.get(path)!.enqueue(body.slice(0,7));
    await vi.waitFor(()=>expect(downloads().at(-1)?.loadedBytes).toBe(21));
    expect(downloads().at(-1)?.completedResources).toBe(0);
    const paths=[...bodies.keys()];
    for(const path of [paths[2],paths[0],paths[1]]){
      streams.get(path)!.enqueue(bodies.get(path)!.slice(7));
      streams.get(path)!.close();
    }
    await pending;
    const progress=downloads();
    expect(progress.every((value,index)=>index===0||value.loadedBytes>=progress[index-1].loadedBytes)).toBe(true);
    expect(progress.filter(value=>value.totalBytes!==undefined).every(value=>value.totalBytes===total)).toBe(true);
    expect(progress.at(-1)).toMatchObject({loadedBytes:total,totalBytes:total,completedResources:3,resourceCount:3});
    expect(messages.at(-1).type).toBe('success');
  });
  it.each([null,'gzip'])('keeps %s length indeterminate until the decoded stream completes',async(encoding)=>{
    vi.resetModules();
    const {readTextResource}=await import('../src/i18n/content.worker');
    let controller!:ReadableStreamDefaultController<Uint8Array>;
    const body=new TextEncoder().encode('資料內容');
    const headers=encoding?{'content-encoding':encoding,'content-length':'2'}:{};
    const fetcher=vi.fn(async()=>new Response(new ReadableStream<Uint8Array>({start(value){controller=value;}}),{headers}));
    const progress:{loadedBytes:number;totalBytes?:number}[]=[];
    const pending=readTextResource('/data/calendar.json',value=>progress.push(value),fetcher as never);
    await vi.waitFor(()=>expect(progress).toHaveLength(1));
    controller.enqueue(body);
    await vi.waitFor(()=>expect(progress.at(-1)?.loadedBytes).toBe(body.length));
    expect(progress.every(value=>value.totalBytes===undefined)).toBe(true);
    controller.close();
    await expect(pending).resolves.toBe('資料內容');
    expect(progress.at(-1)).toEqual({loadedBytes:body.length,totalBytes:body.length});
  });
  it('rejects packs whose English baseline hashes diverge',async()=>{
    vi.resetModules();
    const data=resources(),english=JSON.parse(data.get('/data/i18n/en/calendar.json')!);
    english.baselineHash='different-evidence';
    data.set('/data/i18n/en/calendar.json',JSON.stringify(english));
    const messages:any[]=[];
    const fetcher=vi.fn(async(url:string)=>({ok:true,status:200,headers:{get:()=>null},body:null,text:async()=>data.get(url)!}));
    const {handleContentRequest}=await import('../src/i18n/content.worker');
    await handleContentRequest({id:2,dataset:'calendar',locale:'en',baseUrl:'/'},message=>messages.push(message),fetcher as never);
    expect(messages.at(-1)).toMatchObject({type:'error',error:'Stale English translation baseline: calendar'});
  });
  it('rejects language packs with a missing content field',async()=>{
    vi.resetModules();
    const data=resources(),chinese=JSON.parse(data.get('/data/i18n/zh-TW/calendar.json')!);
    delete chinese.fields['activities/a/objective'];
    data.set('/data/i18n/zh-TW/calendar.json',JSON.stringify(chinese));
    const messages:any[]=[];
    const fetcher=vi.fn(async(url:string)=>({ok:true,status:200,headers:{get:()=>null},body:null,text:async()=>data.get(url)!}));
    const {handleContentRequest}=await import('../src/i18n/content.worker');
    await handleContentRequest({id:3,dataset:'calendar',locale:'en',baseUrl:'/'},message=>messages.push(message),fetcher as never);
    expect(messages.at(-1)).toMatchObject({type:'error',error:'Missing zh-TW translation: activities/a/objective'});
  });
  it('rejects resources that make no progress for thirty seconds',async()=>{
    vi.resetModules();vi.useFakeTimers();
    const {readTextResource}=await import('../src/i18n/content.worker');
    const fetcher=vi.fn((_url:string,init:{signal:AbortSignal})=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('aborted')))));
    const reading=readTextResource('/data/calendar.json',()=>{},fetcher as never);
    const rejection=expect(reading).rejects.toThrow('Data read timed out without progress');
    await vi.advanceTimersByTimeAsync(30_000);
    await rejection;
    vi.useRealTimers();
  });
  it('rejects a resource after five minutes even while bytes keep arriving',async()=>{
    vi.resetModules();vi.useFakeTimers();
    const {readTextResource}=await import('../src/i18n/content.worker');
    let timer:ReturnType<typeof setTimeout>;
    const stream=new ReadableStream<Uint8Array>({start(controller){const send=()=>{controller.enqueue(new TextEncoder().encode('x'));timer=setTimeout(send,20_000);};timer=setTimeout(send,20_000);},cancel(){clearTimeout(timer);}});
    const fetcher=vi.fn(async()=>({ok:true,status:200,headers:{get:()=>null},body:stream}));
    const reading=readTextResource('/data/calendar.json',()=>{},fetcher as never);
    const rejection=expect(reading).rejects.toThrow('Data resource exceeded five minutes');
    await vi.advanceTimersByTimeAsync(300_000);
    await rejection;
    vi.useRealTimers();
  });
});

describe.each([['HTTP without subtle', {}], ['no Crypto API', undefined]])('content integrity: %s',(_name,cryptoApi)=>{
  it.each(['valid','changed source','changed English'])('checks %s with no Web Crypto',async(scenario)=>{
    vi.resetModules();
    vi.stubGlobal('crypto',cryptoApi);
    const raw=JSON.stringify({activities:[{id:'a',objective:'Damage reduced by 25%.'}]}),sourceHash=hash(raw);
    const fields={'activities/a/objective':'Damage reduced by 25%.'},englishHash=hash(JSON.stringify(fields));
    const common={version:1,dataset:'calendar',sourceHash,englishHash,baselineHash:'pinned-evidence'};
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,status:200,headers:{get:()=>null},body:null,text:async()=>url.includes('/en/')?JSON.stringify({...common,locale:'en',fields:scenario==='changed English'?{'activities/a/objective':'Damage increased by 25%.'}:fields}):url.includes('/zh-TW/')?JSON.stringify({...common,locale:'zh-TW',fields:{'activities/a/objective':'傷害降低 25%。'}}):scenario==='changed source'?raw+' ':raw})));
    stubContentWorker();
    const {loadContent:load}=await import('../src/i18n/content');
    if(scenario==='valid')await expect(load('calendar')).resolves.toBeUndefined();
    else await expect(load('calendar')).rejects.toThrow(scenario==='changed source'?'Stale zh-TW content pack':'Stale English translation baseline');
  });
});

describe('numeric and semantic regressions',()=>{
  it('preserves signed progressions, percentages, ranges, multiplicity and order',()=>{
    expect(numericSignature('+10…34…40 damage, -2 Energy, 75%, 11–22 damage')).toEqual(['+10...34...40','-2','75%','11-22']);
    expect(numericIssues('75% chance','75 機率')).toContain('quantity-or-unit');
    expect(numericIssues('10 damage, 2 seconds','2 點傷害，10 秒')).toContain('quantity-order');
    expect(numericIssues('33%','33%%')).toContain('corrupt-token');
    // Identical digits cannot distinguish "less damage" from "damage taken".
    expect(numericIssues('25% less damage','受到 25% 傷害')).toEqual([]);
    expect(translationReviewMatches({englishHash:hash('25% less damage'),evidenceHash:'a'},'受到 25% 傷害',undefined)).toBe(false);
  });
  it('keeps damage reduction and the separate adrenaline/energy effects explicit',()=>{
    const catalog=read('public/data/catalog.json'),zh=read('public/data/i18n/zh-TW/catalog.json').fields;
    const text=(title:string)=>zh[`records/${catalog.records.find((r:any)=>r.englishName===title).id}/description`];
    expect(text('"There\'s Nothing to Fear!"')).toContain('傷害降低 20…35%');
    expect(text('Weapon of Fury')).toContain('怒氣增加 100%，並獲得 1 點能量');
    expect(text('Practiced Stance')).toContain('持續時間延長 30…246…300%');
    expect(text('Dwarven Battle Stance')).toContain('你的攻擊技能命中時會中斷敵人');
  });
  it('preserves all 54 PvP source bindings without inheriting Simplified approvals',()=>{
    const catalog=read('public/data/catalog.json'),zh=read('public/data/i18n/zh-TW/catalog.json').fields;
    const baseline=read('data/i18n/baseline/catalog.json'),reviews=read('data/i18n/review.json').reviews;
    const variants=catalog.records.filter((r:any)=>r.skill?.pvp);
    expect(variants).toHaveLength(54);
    for(const row of variants){
      const key=`records/${row.id}/skill/pvp/description`;
      expect(translationReviewMatches(baseline.fields[key],zh[key],reviews[`zh-TW/catalog/${key}`])).toBe(false);
      expect(baseline.fields[key].references).toContainEqual(expect.objectContaining({revid:row.skill.pvp.reference.revid}));
    }
    const row=variants.find((r:any)=>r.englishName==='Wanderlust');
    expect(zh[`records/${row.id}/skill/pvp/description`]).toContain('將敵人擊倒，且精魂失去 70…54…50 點體力');
  });
  it('renders sacrifices with one percent sign and removes the obsolete Winds warning',()=>{
    const catalog=read('public/data/catalog.json'),zh=read('public/data/i18n/zh-TW/catalog.json').fields;
    for(const row of catalog.records.filter((r:any)=>r.skill)){
      expect(row.details.join(' ')).not.toContain('%%');
      for(let i=0;i<row.details.length;i++)expect(zh[`records/${row.id}/details/${i}`]).not.toContain('%%');
    }
    const winds=catalog.records.find((r:any)=>r.englishName==='Winds');
    expect(winds.skill.reference.revid).toBe(2743523);
    expect(winds.skill.warnings).toEqual([]);
  });
  it('keeps all 137 traveler quantities in the translated objectives and the 5-gift account limit',()=>{
    const calendar=read('public/data/calendar.json'),zh=read('public/data/i18n/zh-TW/calendar.json').fields;
    const activities=calendar.activities.filter((a:any)=>a.kind==='traveler');
    expect(activities).toHaveLength(137);
    for(const row of activities){
      const key=`activities/${row.id}`;
      expect(zh[`${key}/objective`]).toBe(`每份旅者禮物需要 ${row.exchange.perGift} × ${zh[`${key}/exchange/item`]}。`);
      expect(zh[`${key}/requirements`]).toContain('每帳號每週最多兌換 5 份');
    }
  });
});
