import { createHash } from 'node:crypto';
import { wikiTables } from './tables.mjs';
import { plainText, templates, links, section } from './wikitext.mjs';
import { reference } from './content-facts.mjs';

export const professionNames=['Warrior','Ranger','Monk','Necromancer','Mesmer','Elementalist','Assassin','Ritualist','Paragon','Dervish'];
export const campaignIds={Core:0,Prophecies:1,Factions:2,Nightfall:3,'Eye of the North':4};
export const materialNames={Iron:['Iron Ingot','铁锭'],Steel:['Steel Ingot','钢锭'],Cloth:['Bolt of Cloth','布料'],Silk:['Bolt of Silk','丝绸'],Linen:['Bolt of Linen','亚麻布'],Damask:['Bolt of Damask','锦缎'],Hide:['Tanned Hide Square','鞣制皮革'],Leather:['Leather Square','皮革'],Fur:['Fur Square','毛皮'],Wood:['Wood Plank','木板'],Bone:['Bone','骨头'],Dust:['Pile of Glittering Dust','闪光尘'],Feather:['Feather','羽毛'],Scale:['Scale','鳞片'],Chitin:['Chitin Fragment','甲壳碎片'],'Deldrimor Steel':['Deldrimor Steel Ingot','戴尔狄摩钢锭'],'Elonian Leather':['Elonian Leather Square','伊洛那皮革'],Ecto:['Glob of Ectoplasm','灵质球'],Obsidian:['Obsidian Shard','黑曜石碎片'],'Obsidian Shard':['Obsidian Shard','黑曜石碎片'],Ruby:['Ruby','红宝石'],Sapphire:['Sapphire','蓝宝石'],Amber:['Amber Chunk','琥珀块'],Jadeite:['Jadeite Shard','翡翠碎片'],'Jadeite Shard':['Jadeite Shard','翡翠碎片'],'Amber Chunk':['Amber Chunk','琥珀块'],'Monstrous Claw':['Monstrous Claw','巨兽爪'],'Monstrous Fang':['Monstrous Fang','巨兽牙'],'Monstrous Eye':['Monstrous Eye','巨兽眼'],Granite:['Granite Slab','花岗岩板'],'Spiritwood':['Spiritwood Plank','灵木板'],'Spiritwood Plank':['Spiritwood Plank','灵木板'],Onyx:['Onyx Gemstone','缟玛瑙宝石'],Diamond:['Diamond','钻石'],'Deldrimor Steel Ingot':['Deldrimor Steel Ingot','戴尔狄摩钢锭']};
export const materialId=name=>'material:'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-');
Object.assign(materialNames,{Shard:['Obsidian Shard','黑曜石碎片'],Parchment:['Roll of Parchment','羊皮纸'],Vellum:['Roll of Vellum','精制羊皮纸'],Fiber:['Plant Fiber','植物纤维'],'Glass Vial':['Tempered Glass Vial','淬炼玻璃瓶'],Ink:['Vial of Ink','墨水瓶'],Charcoal:['Lump of Charcoal','木炭']});
export function materials(text) {
  const amounts=[];
  let remainder=text.replace(/<br\s*\/?\s*>/gi,' ').replace(/<sup>[\s\S]*?<\/sup>/gi,'');
  remainder=remainder.replace(/([\d,]+)\s*\{\{\s*([^{}|]+)(?:\|[^{}]*)?\s*\}\}/g,(_all,count,alias)=>{
    const key=Object.keys(materialNames).find(k=>k.toLowerCase()===alias.trim().toLowerCase());
    if(!key)throw Error(`Unknown material ${alias}`);
    amounts.push({materialId:materialId(materialNames[key][0]),quantity:Number(count.replaceAll(',',''))});return '';
  });
  if(plainText(remainder).replace(/[-–—*\s]/g,''))throw Error(`Unparsed materials: ${text}`);
  if(!amounts.length)throw Error(`Missing materials: ${text}`);
  return amounts;
}
export function gold(text) {
  const clean=text.replace(/<sup>[\s\S]*?<\/sup>/gi,'');
  const cost=templates(clean,'cost')[0];if(cost)return Number(cost.fields[1].replaceAll(',',''));
  let total=0, found=false;
  clean.replace(/([\d,.]+)\s*\{\{\s*(gold|plat|platinum)\s*\}\}/gi,(_all,amount,unit)=>{total+=Number(amount.replaceAll(',',''))*(unit.toLowerCase()==='gold'?1:1000);found=true;return '';});
  if(!found||!Number.isSafeInteger(total))throw Error(`Unparsed gold: ${text}`);
  return total;
}
function slot(name) {
  if(/helm|mask|scalp|head|eye|aura|crest|hood|spectacle|bandana|crown|woad|^scar\s+pattern/i.test(name))return 'head';
  if(/gauntlet|glove|hand|arm|bracelet|vambrace|cuff|bangle/i.test(name))return 'hands';
  if(/leg|pant|hose|skirt|trouser|chausse/i.test(name))return 'legs';
  if(/boot|shoe|sandal|foot|slipper|greave/i.test(name))return 'feet';
  return 'chest';
}
export function armorFacts(page) {
  const box=templates(page.wikitext,'armor art infobox')[0]?.fields;
  if(!box)return null;
  const profession=professionNames.indexOf(plainText(box.profession))+1;
  const campaigns=Object.keys(campaignIds).filter(c=>plainText(box.campaign).toLowerCase().includes(c.toLowerCase())).map(c=>campaignIds[c]);
  const intro=page.wikitext.split(/^==/m)[0].replace(templates(page.wikitext,'armor art infobox')[0].raw,'').split('{|')[0];
  const notes=plainText(`${intro}\n${section(page.wikitext,'Notes')}`).replace(/__NOTOC__/g,'');
  const set={id:`armor:gww:${page.pageid}`,name:page.title,englishName:page.title,profession,campaigns,category:/\[\[Category:Prestige armor/i.test(page.wikitext)?'elite':/specialgallery/i.test(page.wikitext)?'special':'basic',images:{},notes,reference:reference(page)};
  const offers=[];
  const tables=wikiTables(page.wikitext.replace(/<!--[\s\S]*?-->/g,''),{raw:true});
  for(const table of tables) {
    const header=table.find(row=>/^Location$/i.test(plainText(row[0]))&&/Armorer|Crafter/i.test(plainText(row[1])));
    if(!header)continue;
    // These are trophy exchanges at a collector, not recipes from an armorer.
    if(!/Cost/i.test(plainText(header[3])))continue;
    const pieceNames=[];
    for(let i=4;i<header.length;i++) {
      const name=plainText(header[i]);if(!name||/total cost/i.test(name))break;
      pieceNames.push(name==='Materials'?page.title:name);
    }
    if(!pieceNames.length||pieceNames.length>5)throw Error(`Invalid piece headings ${page.title}: ${pieceNames}`);
    let campaign=campaigns.length===1?campaigns[0]:0;
    for(const row of table.slice(table.indexOf(header)+1)) {
      const group=Object.keys(campaignIds).find(c=>plainText(row[0])===c&&row.every(v=>v===row[0]));
      if(group){campaign=campaignIds[group];continue;}
      if(!links(row[0]||'').length||!links(row[1]||'').length)continue;
      const rating=plainText(row[2]);if(!/^\d+(?:\s*[-–]\s*\d+)?$/.test(rating))throw Error(`Unknown AR: ${rating}`);
      const location=links(row[0])[0].title, armorerTitle=links(row[1])[0].title;
      const cost=gold(row[3]);
      let pieces=pieceNames.flatMap((name,i)=>!plainText(row[4+i]||'')?[]:[{id:slot(name),name,slot:slot(name),gold:cost,materials:materials(row[4+i])}]);
      if(page.title==='Necromancer Ragged Scar Pattern') {
        const variants=pieces.map(p=>p.name);
        if(pieces.some(p=>JSON.stringify(p.materials)!==JSON.stringify(pieces[0].materials)))throw Error('Scar variant recipes differ');
        pieces=[{...pieces[0],id:'head',slot:'head',name:variants.join(' / ')}];
      }
      if(!pieces.length)throw Error(`Empty crafting row ${page.title}`);
      if(new Set(pieces.map(p=>p.id)).size!==pieces.length)throw Error(`Ambiguous slots ${page.title}: ${pieceNames}`);
      const key=createHash('sha256').update([page.pageid,location,armorerTitle,rating].join('|')).digest('hex').slice(0,16);
      const existing=offers.find(o=>o.id===`offer:${page.pageid}:${key}`);
      if(existing) {
        for(const piece of pieces) {
          const same=existing.pieces.find(p=>p.id===piece.id);
          if(same&&JSON.stringify(same)!==JSON.stringify(piece))throw Error(`Conflicting piece ${page.title}`);
          if(!same)existing.pieces.push(piece);
        }
      } else offers.push({id:`offer:${page.pageid}:${key}`,armorId:set.id,armorerTitle,location,campaign,armorRating:Number(rating.split(/[-–]/)[0]),...(rating.includes('-')||rating.includes('–')?{ratingByProfession:{1:80,2:70,3:60,4:60,5:60,6:60,7:70,8:60,9:80,10:70}}:{}),pieces,notes,reference:reference(page)});
    }
  }
  return {set,offers};
}
