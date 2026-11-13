import fs from 'node:fs/promises';
import path from 'node:path';

export async function validateFeatureData(publicDir, atlas) {
  const fail=message=>{throw Error(`新增资料校验失败：${message}`);};
  async function json(name){try{return JSON.parse(await fs.readFile(path.join(publicDir,'data',name),'utf8'));}catch{fail(`缺失或无效的 ${name}`);}}
  const armor=await json('armor.json'),calendar=await json('calendar.json');
  atlas ||= await json('catalog.json');
  const atlasIds=new Set(atlas.records.map(r=>r.id)),zoneIds=new Set(atlas.records.filter(r=>r.kind==='zone').map(r=>r.id));
  for(const item of [...armor.offers,...calendar.activities]){if(item.zoneId&&!zoneIds.has(item.zoneId))fail(`关联区域不存在 ${item.zoneId}`);if(item.relatedIds?.some(id=>!atlasIds.has(id)))fail('关联资料不存在');}
  const unique=(values,label)=>{if(new Set(values).size!==values.length)fail(`${label}编号重复`);};
  function ref(r){try{const url=new URL(r.revisionUrl);if(!r.pageid||!Number.isInteger(r.revid)||url.origin!=='https://wiki.guildwars.com'||url.searchParams.get('oldid')!==String(r.revid)||!r.title||!Number.isFinite(Date.parse(r.revisedAt)))throw Error();}catch{fail('Wiki 来源无效');}}
  const integer=(value,min=0)=>Number.isSafeInteger(value)&&value>=min;
  if(armor.version!==1||calendar.version!==1||!armor.referenceVersion||armor.referenceVersion!==calendar.referenceVersion)fail('数据版本不一致');
  for(const key of ['sets','offers','armorers','materials']){if(!Array.isArray(armor[key])||!armor[key].length)fail(`护甲 ${key} 为空`);unique(armor[key].map(v=>v.id),key);}
  if(armor.coverage.crafted!==armor.sets.length||armor.coverage.discovered!==armor.coverage.crafted+armor.coverage.excluded||armor.issues.length)fail('护甲覆盖报告不一致或仍有未处理的解析错误');
  if(Array.from({length:10},(_,i)=>i+1).some(id=>!armor.sets.some(s=>s.profession===id)))fail('护甲未覆盖全部十职业');
  for(const set of armor.sets){ref(set.reference);if(!integer(set.profession)||set.profession>10||!['basic','elite','special'].includes(set.category)||!armor.offers.some(o=>o.armorId===set.id))fail(`护甲外观无有效配方 ${set.id}`);
    for(const image of Object.values(set.images)){if(!/^assets\/armor\/\d+-(?:male|female)\.webp$/.test(image))fail('非法护甲图片引用');let bytes;try{bytes=await fs.readFile(path.join(publicDir,image));}catch{fail(`缺少护甲图片 ${image}`);}if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')fail(`护甲图片损坏 ${image}`);}
  }
  armor.armorers.forEach(n=>ref(n.reference));armor.references?.forEach(ref);
  for(const offer of armor.offers){ref(offer.reference);if(!armor.sets.some(s=>s.id===offer.armorId)||!armor.armorers.some(n=>n.id===offer.armorerId)||!integer(offer.armorRating,1)||!integer(offer.campaign)||offer.campaign>4||!offer.location||!Array.isArray(offer.pieces)||!offer.pieces.length||offer.pieces.length>5)fail(`制作方案无效 ${offer.id}`);unique(offer.pieces.map(p=>p.id),'护甲部位');for(const piece of offer.pieces){if(!['head','chest','hands','legs','feet'].includes(piece.slot)||piece.id!==piece.slot||!integer(piece.gold)||!piece.materials.length)fail('护甲部位无效');unique(piece.materials.map(m=>m.materialId),'配方材料');for(const m of piece.materials)if(!integer(m.quantity,1)||!armor.materials.some(v=>v.id===m.materialId))fail('材料数量或引用无效');}}
  if(!Array.isArray(calendar.activities)||!calendar.activities.length||!Array.isArray(calendar.rotations))fail('活动资料为空');
  unique(calendar.activities.map(a=>a.id),'活动');unique(calendar.rotations.map(r=>r.id),'轮换');
  const lengths={mission:69,bounty:66,combat:28,vanquish:136,traveler:137,'pve-bonus':9,'pvp-bonus':6};
  if(calendar.rotations.length!==7)fail('必须包含七类轮换');
  for(const r of calendar.rotations){ref(r.reference);if(!integer(r.epoch)||r.sequence.length!==lengths[r.id]||r.period!==(['mission','bounty','combat','vanquish'].includes(r.id)?86400000:604800000)||r.sequence.some(id=>!calendar.activities.some(a=>a.id===id&&a.kind===r.id)))fail(`轮换序列不完整 ${r.id}`);}
  for(const a of calendar.activities){if(!a.name||!a.objective||!a.rewards||!a.requirements||!a.references?.length)fail(`活动内容不完整 ${a.id}`);a.references.forEach(ref);if(a.kind==='traveler'&&(!a.exchange?.item||!integer(a.exchange.perGift,1)))fail('旅者兑换材料无效');}
  calendar.references.forEach(ref);
  return {armorSets:armor.sets.length,armorOffers:armor.offers.length,activities:calendar.activities.length};
}
