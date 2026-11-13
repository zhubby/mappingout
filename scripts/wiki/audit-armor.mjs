import fs from 'node:fs/promises';
import path from 'node:path';
import { web, evidenceDir } from './client.mjs';
import { wikiTables } from './tables.mjs';
import { gold, materials } from './armor-facts.mjs';
import { links, plainText } from './wikitext.mjs';

const armor=JSON.parse(await fs.readFile(path.join(web,'public/data/armor.json'),'utf8'));
let checkedGoldTotals=0,checkedMaterialTotals=0;const reviewedSourceDiscrepancies=[];
const sum=pieces=>{const result=new Map();for(const p of pieces)for(const m of p.materials)result.set(m.materialId,(result.get(m.materialId)||0)+m.quantity);return Object.fromEntries([...result].sort());};
for(const set of armor.sets){
  const source=JSON.parse(await fs.readFile(path.join(evidenceDir,`pages/${set.reference.pageid}.json`),'utf8'));
  for(const table of wikiTables(source.wikitext.replace(/<!--[\s\S]*?-->/g,''),{raw:true})){
    const header=table.find(r=>plainText(r[0])==='Location'&&/Armorer|Crafter/.test(plainText(r[1])));if(!header)continue;
    const totalColumn=header.findIndex(v=>plainText(v)==='Total cost');if(totalColumn<0)continue;
    for(const row of table.slice(table.indexOf(header)+1)){
      if(!links(row[0]||'').length||!links(row[1]||'').length||!plainText(row[totalColumn]||''))continue;
      const rating=plainText(row[2]),location=links(row[0])[0].title,npc=links(row[1])[0].title;
      const offer=armor.offers.find(o=>o.armorId===set.id&&o.location===location&&armor.armorers.find(n=>n.id===o.armorerId).name===npc&&String(o.armorRating)===rating);if(!offer)continue;
      const expected=gold(row[totalColumn]),actual=offer.pieces.reduce((sum,p)=>sum+p.gold,0);checkedGoldTotals++;
      if(expected!==actual){
        if(set.englishName!=='Ranger Drakescale armor'||rating!=='55'||expected!==600||actual!==800||!offer.notes.includes('800'))throw Error(`Unreviewed source gold discrepancy: ${set.englishName} ${npc}`);
        reviewedSourceDiscrepancies.push({offerId:offer.id,title:set.englishName,armorer:npc,sourceTotal:expected,pieceTotal:actual,resolution:'4 pieces × 200 gold = 800 gold; Armorer overview independently lists the 200 gold per-piece fee. Original total cell is retained in pinned source.'});
      }
      if(plainText(row[totalColumn+1]||'')){
        const expectedMaterials=JSON.stringify(sum([{materials:materials(row.slice(totalColumn+1).join('<br>'))}])),actualMaterials=JSON.stringify(sum(offer.pieces));
        if(expectedMaterials!==actualMaterials)throw Error(`Source material total differs: ${set.englishName} ${npc}: ${expectedMaterials} / ${actualMaterials}`);
        checkedMaterialTotals++;
      }
    }
  }
}
const report={referenceVersion:armor.referenceVersion,sets:armor.sets.length,offers:armor.offers.length,checkedGoldTotals,checkedMaterialTotals,reviewedSourceDiscrepancies};
console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--write'))await fs.writeFile(path.join(evidenceDir,'armor-totals-audit.json'),JSON.stringify(report,null,2)+'\n');
