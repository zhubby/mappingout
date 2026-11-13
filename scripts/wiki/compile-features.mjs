import fs from 'node:fs/promises';
import path from 'node:path';
import { web, evidenceDir, readIndex, loadPage } from './client.mjs';
import { armorFacts, materialId, materialNames, campaignIds } from './armor-facts.mjs';
import { reference, npcFacts } from './content-facts.mjs';
import { templates, plainText, section, links } from './wikitext.mjs';

const index=await readIndex(), catalog=JSON.parse(await fs.readFile(path.join(web,'public/data/catalog.json'),'utf8'));
const referenceVersion='gww-2026-11-13-crafting-calendar';
const page=async title=>{const p=await loadPage(title,index);if(!p)throw Error(`Missing source ${title}`);return p;};
function matching(title,kind) { return catalog.records.filter(r=>r.wiki?.title===title&&(!kind||r.kind===kind)); }
function zoneId(title) { const matches=matching(title,'zone');return matches.length===1?matches[0].id:undefined; }
const discovery=JSON.parse(await fs.readFile(path.join(evidenceDir,'armor-discovery.json'),'utf8'));
const sets=[], offers=[], armorers=new Map(), issues=[], excluded=[], seen=new Set();
for(const title of new Set([...discovery.roots,...discovery.related])) {
  const source=await loadPage(title,index);if(!source||seen.has(source.pageid))continue;seen.add(source.pageid);
  let facts;
  try{facts=armorFacts(source);}catch(error){issues.push({title,message:error.message});continue;}
  if(!facts)continue;
  if(!facts.offers.length){excluded.push({title,reason:'No NPC crafting recipe; starter, collector, or trophy exchange only.'});continue;}
  for(const offer of facts.offers) {
    const npc=await page(offer.armorerTitle), npcData=npcFacts(npc), id=`armorer:gww:${npc.pageid}`;
    if(!armorers.has(id))armorers.set(id,{id,name:npc.title,locations:npcData.areas,notes:plainText(npc.wikitext.split(/^==/m)[0].replace(templates(npc.wikitext,'NPC infobox')[0]?.raw||'',''))+'\n'+plainText(section(npc.wikitext,'Notes')),reference:reference(npc)});
    const {armorerTitle,...rest}=offer;
    const npcCampaign=plainText(templates(npc.wikitext,'NPC infobox')[0]?.fields.campaign||'');
    const campaign=offer.campaign||Object.entries(campaignIds).find(([name])=>name.toLowerCase()===npcCampaign.toLowerCase())?.[1]||0;
    if(source.title==='Ranger Drakescale armor'&&offer.armorRating===55)rest.notes+='\n配方核对：此页总计栏写为 600 金币，与四个部位各 200 金币矛盾。Armorer 总表也列明该阶段单件费用 200 金币，本工具据单件合计为 800 金币；材料合计仍为 28 份鞣制皮革。';
    offers.push({...rest,campaign,armorerId:id,zoneId:zoneId(offer.location)});
  }
  const chineseProf=['通用','战士','游侠','僧侣','死灵法师','幻术师','元素使','刺客','祭祀','圣言使','神唤者'];
  const style=facts.set.englishName.replace(/^(Warrior|Ranger|Monk|Necromancer|Mesmer|Elementalist|Assassin|Ritualist|Paragon|Dervish) /,'').replace(/ armor$/,'');
  const styles={Ascalon:'阿斯卡隆',Tyrian:'泰瑞亚',Krytan:'科瑞塔',Canthan:'凯珊',Istani:'伊斯坦',Sunspear:'日戟',Obsidian:'黑曜石',Norn:'诺恩',Asuran:'阿苏拉',Vabbian:'瓦比',Primeval:'原始',Monument:'纪念',Kurzick:'库尔兹柯',Luxon:'勒克森',Ancient:'远古','Elite Sunspear':'精英日戟','Elite Kurzick':'精英库尔兹柯','Elite Luxon':'精英勒克森','Elite Canthan':'精英凯珊'};
  facts.set.name=`${chineseProf[facts.set.profession]} · ${styles[style]||style}`;
  sets.push(facts.set);
}
if(issues.length) {
  await fs.writeFile(path.join(evidenceDir,'armor-issues.json'),JSON.stringify(issues,null,2)+'\n');
  throw Error(`${issues.length} armor pages require review; see armor-issues.json`);
}
const materials=[...new Map(Object.values(materialNames).map(([englishName,name])=>[materialId(englishName),{id:materialId(englishName),name,englishName}])).values()].filter(m=>offers.some(o=>o.pieces.some(p=>p.materials.some(a=>a.materialId===m.id))));
let imageManifest={};try{imageManifest=JSON.parse(await fs.readFile(path.join(evidenceDir,'armor-images.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
for(const set of sets)set.images=imageManifest[set.id]?.images||{};
const materialReferences=[];
for(const alias of Object.keys(materialNames)){const source=await loadPage('Template:'+alias,index);if(source&&!materialReferences.some(r=>r.pageid===source.pageid))materialReferences.push(reference(source));}
const armor={version:1,referenceVersion,sets,offers,armorers:[...armorers.values()],materials,references:[reference(await page('Armorer')),reference(await page('Template:Armor art infobox')),...materialReferences],issues,coverage:{discovered:sets.length+excluded.length,crafted:sets.length,excluded:excluded.length}};
await fs.writeFile(path.join(web,'public/data/armor.json'),JSON.stringify(armor)+'\n');
await fs.writeFile(path.join(evidenceDir,'armor-coverage.json'),JSON.stringify({referenceVersion,coverage:armor.coverage,excluded,issues,professions:catalog.professions.map(p=>({profession:p.id,sets:sets.filter(s=>s.profession===p.id).length,offers:offers.filter(o=>sets.some(s=>s.id===o.armorId&&s.profession===p.id)).length}))},null,2)+'\n');

function subsection(text,heading) {
  const re=new RegExp(`^(={2,6})\\s*${heading}\\s*\\1\\s*$`,'im'),match=re.exec(text);if(!match)return '';
  const rest=text.slice(match.index+match[0].length),next=new RegExp(`^={2,${match[1].length}}[^=].*?={2,${match[1].length}}\\s*$`,'m').exec(rest);
  return plainText(next?rest.slice(0,next.index):rest);
}
function switchValues(text) { return [...text.matchAll(/^\s*\|\s*(\d+)\s*=\s*([^\n]+)/gm)].map(m=>({index:Number(m[1]),value:m[2].trim()})); }
const activities=new Map(), rotations=[], references=[];
const questRules=[['ZMission','mission',69],['ZBounty','bounty',66],['ZCombat','combat',28],['ZVanquish','vanquish',136]];
for(const [template,kind,length] of questRules) {
  const cycle=await page(`Template:Cycle/${template}`), seq=switchValues(cycle.wikitext);
  if(seq.length!==length||seq.some((v,i)=>v.index!==i))throw Error(`Incomplete cycle ${template}`);
  const epoch=Number(/-\s*(\d{10})/.exec(cycle.wikitext)[1])*1000;
  const sequence=[];
  for(const {value:title} of seq) {
    const quest=await page(`${title} (${kind==='vanquish'?'Zaishen vanquish':'Zaishen quest'})`), box=templates(quest.wikitext,'Quest infobox')[0]?.fields;
    if(!box)throw Error(`Missing quest facts ${quest.title}`);
    const matches=matching(title), name=matches.find(r=>kind==='bounty'?r.kind==='boss':r.kind==='zone')?.name||title;
    const id=`activity:gww:${quest.pageid}`;
    activities.set(id,{id,kind,name,englishName:title,objective:subsection(quest.wikitext,'Objectives'),requirements:subsection(quest.wikitext,'Requirements')||subsection(quest.wikitext,'Prerequisites')|| (kind==='vanquish'?'需要解锁该篇章困难模式并抵达目标区域。':'需具备目标区域或竞技模式的进入条件；困难模式加成条件见任务目标。'),rewards:subsection(quest.wikitext,'Rewards?'),giver:`${plainText(box['given by'])} · ${plainText(box['given at'])}`,turnIn:kind==='combat'?'Zehnchu · Great Temple of Balthazar':'Zehnchu · Great Temple of Balthazar / Embark Beach',notes:subsection(quest.wikitext,'Walkthrough')+'\n'+subsection(quest.wikitext,'Notes')+(kind==='combat'?'\n同一天可重复完成；本轮勾选仅表示至少完成过一次。':'\n可在轮换期间领取并在之后完成。完成记录归属于领取时的轮换，不会修改永久技能或区域进度。'),zoneId:zoneId(title),relatedIds:matches.filter(r=>r.kind!=='zone').map(r=>r.id),references:[reference(quest)]});
    sequence.push(id);
  }
  rotations.push({id:kind,epoch,period:86400000,sequence,reference:reference(cycle)});
}
const traveler=await page('Template:Cycle/Nicholas'), travelerSource=await page('Nicholas the Traveler');
function travelerValues(name) {
  const start=traveler.wikitext.indexOf(`vardefine:${name}|`), rest=traveler.wikitext.slice(start),end=rest.search(/\}\}\s*\}\}/);
  return switchValues(rest.slice(0,end)).map(v=>plainText(v.value));
}
const locations=travelerValues('NicholasLocation'),quantities=travelerValues('NicholasQuantity'),items=travelerValues('NicholasItem');
if([locations,quantities,items].some(values=>values.length!==137))throw Error('Incomplete traveler cycle');
const travelerSequence=[];
for(let i=0;i<137;i++) {
  const id=`activity:traveler:${i}`,z=zoneId(locations[i]);travelerSequence.push(id);
  activities.set(id,{id,kind:'traveler',name:`旅者尼古拉斯 · ${matching(locations[i],'zone')[0]?.name||locations[i]}`,englishName:`Nicholas the Traveler · ${locations[i]}`,objective:`每份旅者礼物需要 ${quantities[i]} × ${items[i]}`,requirements:'需要能够进入旅者所在区域。每账号每周最多兑换 5 份礼物。',rewards:'Gift of the Traveler × 1（每次兑换）',giver:'Nicholas the Traveler',turnIn:locations[i],notes:plainText(section(travelerSource.wikitext,'Notes')),location:locations[i],zoneId:z,exchange:{item:items[i],perGift:Number(quantities[i])},references:[reference(traveler),reference(travelerSource)]});
}
rotations.push({id:'traveler',epoch:1323097200000,period:604800000,sequence:travelerSequence,reference:reference(traveler)});
const weekly=await page('Template:Automated weekly bonuses'),weeklySource=await page('Weekly bonuses');
const pve=['Extra Luck','Elonian Support','Zaishen Bounty','Factions Elite','Northern Support','Zaishen Mission','Pantheon','Faction Support','Zaishen Vanquishing'];
const pvp=['Random Arenas','Guild Versus Guild','Competitive Mission',"Heroes' Ascent",'Codex Arena','Alliance Battle'];
for(const [kind,names] of [['pve-bonus',pve],['pvp-bonus',pvp]]) {
  const sequence=[];
  for(const name of names) {
    const id=`activity:${kind}:${name.toLowerCase().replace(/[^a-z]+/g,'-')}`;sequence.push(id);
    const row=weeklySource.wikitext.split('\n').find(l=>l.includes(`|| ${name} Bonus`)&&l.split('||').length>=3);
    if(!row)throw Error(`Missing weekly effect ${name}`);
    activities.set(id,{id,kind,name:`${name} 每周奖励`,englishName:`${name} Bonus`,objective:plainText(row.split('||').slice(2).join('||')),requirements:'常规每周轮换；节庆或官方临时活动可能叠加额外效果。',rewards:plainText(row.split('||').slice(2).join('||')),giver:'Foreman the Crier / 游戏登录公告',turnIn:'无需交付',notes:'按已核验周期预测，不代表实时读取游戏公告。',references:[reference(weekly),reference(weeklySource)]});
  }
  rotations.push({id:kind,epoch:Date.parse('2013-05-13T15:00:00Z'),period:604800000,sequence,reference:reference(weekly)});
}
references.push(reference(await page('Zaishen Challenge Quest')),reference(weeklySource));
for(const title of ['Zaishen Mission','Zaishen Bounty','Zaishen Combat','Zaishen Vanquish'])references.push(reference(await page(title)));
const calendar={version:1,referenceVersion,activities:[...activities.values()],rotations,references};
await fs.writeFile(path.join(web,'public/data/calendar.json'),JSON.stringify(calendar)+'\n');
console.log({armorSets:sets.length,offers:offers.length,armorers:armorers.size,materials:materials.length,activities:activities.size,rotations:rotations.map(r=>[r.id,r.sequence.length])});
