/**
 * [INPUT]: 依赖任务目录、发现覆盖、固定快照与本地路线图。
 * [OUTPUT]: 校验完整收录、关系图、内容块、来源和媒体哈希。
 * [POS]: 任务资料构建门禁；来源缺口单列，禁止以缺文件替代。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=(bytes,kind='sha256')=>createHash(kind).update(bytes).digest('hex');
export async function validateQuestData(publicDir=path.join(root,'public')) {
  const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
  const fail=message=>{throw Error(`任务资料校验失败：${message}`);};
  const data=await read(path.join(publicDir,'data/quests.json'));
  const report=await read(path.join(root,'data/wiki/quest-coverage.json'));
  const discovery=await read(path.join(root,'data/wiki/quest-discovery.json'));
  const manifest=await read(path.join(root,'data/wiki/quest-images.json'));
  if(data.version!==1 || data.referenceVersion!==report.referenceVersion)fail('版本与覆盖报告不一致');
  if(data.quests.length!==report.included.length || data.coverage.included!==data.quests.length || data.coverage.discovered!==data.coverage.included+data.coverage.excluded || report.excluded.length!==data.coverage.excluded || data.coverage.sourceGaps!==report.sourceGaps.length)fail('目录收录或排除不完整');
  if(new Set(data.quests.map(q=>q.id)).size!==data.quests.length)fail('任务身份重复');
  if(JSON.stringify(data.chapters.map(c=>c.id))!==JSON.stringify(discovery.chapters.map(c=>c.id)))fail('篇章目录不完整');
  const byId=new Map(data.quests.map(q=>[q.id,q]));
  const checkedRefs=new Set(),checkedImages=new Set(),active=new Set(),visited=new Set();
  async function reference(ref){
    if(!Number.isInteger(ref?.pageid)||!Number.isInteger(ref.revid)||ref.revid<=0||!ref.title)fail('无效来源身份');
    const url=new URL(ref.revisionUrl);
    if(url.origin!=='https://wiki.guildwars.com'||url.pathname!=='/index.php'||url.searchParams.get('oldid')!==String(ref.revid)||!Number.isFinite(Date.parse(ref.revisedAt)))fail(`无效固定修订 ${ref.title}`);
    if(checkedRefs.has(ref.revid))return;
    const image=manifest.images.find(i=>i.reference.pageid===ref.pageid);
    const source=image?image.reference:await read(path.join(root,`data/wiki/pages/${ref.pageid}.json`));
    if(source.title!==ref.title||source.revid!==ref.revid||source.pageid!==ref.pageid)fail(`来源已改变 ${ref.title}`);
    if(!image && source.sha1!==hash(source.wikitext,'sha1'))fail(`快照哈希不一致 ${ref.title}`);
    checkedRefs.add(ref.revid);
  }
  function requirement(req,owner){
    if(req.op==='quest'){if(!byId.has(req.questId)||req.questId===owner||req.mode&&!['normal','hard'].includes(req.mode))fail(`前置引用无效 ${owner}`);}
    else if(req.op==='condition'){if(!req.id||!req.text)fail(`缺少条件说明 ${owner}`);}
    else if(!['all','any'].includes(req.op)||!Array.isArray(req.items))fail(`无效前置表达式 ${owner}`);
    else req.items.forEach(item=>requirement(item,owner));
  }
  function visit(id){
    if(active.has(id))fail(`前置形成循环 ${id}`);
    if(visited.has(id))return;
    active.add(id);const walk=req=>{if(req.op==='quest')visit(req.questId);else req.items?.forEach(walk);};walk(byId.get(id).requirement);active.delete(id);visited.add(id);
  }
  const unsafe=text=>/\{\{|\}\}|\[\[|\]\]|<\/?(?:script|style|iframe|div|span)\b|MO_TABLE_|MAPPINGOUT_[a-f\d]+/i.test(text);
  for(const chapter of data.chapters){if(!data.quests.some(q=>q.chapter===chapter.id))fail(`篇章为空 ${chapter.id}`);await reference(chapter.reference);}
  for(const q of data.quests){
    const expected=report.included.find(r=>r.id===q.id);
    if(!expected||expected.revid!==q.references[0]?.revid||q.id!==`quest:gww:${q.references[0].pageid}`||!q.name||q.name!==q.englishName||!q.sections.length)fail(`任务身份或正文无效 ${q.id}`);
    if(!['normal','hard','both'].includes(q.mode)||!['main','side','dungeon','elite','challenge','bounty','utility'].includes(q.kind))fail(`任务分类无效 ${q.name}`);
    if(!['detailed','instructions','target-notes','objectives-only'].includes(q.guideQuality))fail(`缺少攻略级别 ${q.name}`);
    if(new Set(q.sections.map(s=>s.id)).size!==q.sections.length)fail(`正文分节重复 ${q.name}`);
    const ids=new Set();
    if(new Set(q.images.map(image=>image.id)).size!==q.images.length)fail(`路线图身份重复 ${q.name}`);
    for(const s of q.sections)for(const b of s.blocks){if(ids.has(b.id))fail(`正文块重复 ${q.name}/${b.id}`);ids.add(b.id);if(!['paragraph','heading','item','table','notice'].includes(b.kind)||[b.text,...(b.cells||[]).flat()].some(unsafe))fail(`未解析的攻略标记 ${q.name}/${b.id}`);}
    requirement(q.requirement,q.id);
    for(const id of q.recommendedAfter)if(!byId.has(id)||id===q.id)fail(`无效推荐任务 ${q.name}`);
    for(const link of q.links)if(link.questId&&!byId.has(link.questId))fail(`任务链接不存在 ${q.name}`);
    for(const ref of q.references)await reference(ref);
    for(const image of q.images){
      if(!/^assets\/quests\/\d+-[a-f\d]{12}\.webp$/.test(image.file))fail(`非法图片路径 ${image.file}`);
      await reference(image.reference);
      const source=manifest.images.find(i=>i.file===image.file);
      if(!source||source.sha256!==image.sha256||typeof source.licenseDeclaration!=='string'||!source.originalSha1)fail(`图像来源不完整 ${image.file}`);
      if(!checkedImages.has(image.file)) {if(hash(await fs.readFile(path.join(publicDir,image.file)))!==image.sha256)fail(`图像哈希不一致 ${image.file}`);checkedImages.add(image.file);}
    }
  }
  data.quests.forEach(q=>visit(q.id));
  if(data.quests.filter(q=>q.chapter==='winds').length!==83||data.quests.filter(q=>q.chapter==='winds'&&q.kind==='main').length!==70)fail('变换之风普通、困难或支线目录不完整');
  if(data.quests.filter(q=>q.kind==='main'&&['prophecies','factions','nightfall','eotn','kryta','winds'].includes(q.chapter)).some(q=>q.guideQuality==='objectives-only'))fail('主线缺少攻略或来源指示');
  return {included:data.quests.length,revisions:checkedRefs.size,routeMaps:checkedImages.size,sourceGaps:report.sourceGaps.length,missingSourceMaps:report.missingImages.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await validateQuestData());
