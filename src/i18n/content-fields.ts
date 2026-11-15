export type Dataset = 'catalog' | 'armor' | 'calendar';
export interface TextField { key: string; path: (string | number)[]; source: string; english?: string }
const schemas: Record<Dataset, string[]> = {
  catalog: [
    'campaigns.*.name', 'campaigns.*.shortName', 'regions.*.name', 'professions.*.name',
    'records.*.name', 'records.*.description', 'records.*.details.*', 'records.*.attribute',
    'records.*.locations.*.note', 'records.*.locations.*.boss',
    ...['skill', 'skill.pvp'].flatMap(prefix => ['title','professionName','attribute','type','description','conciseDescription','acquisition.*.title','acquisition.*.areas.*','acquisition.*.text','warnings.*.text'].map(p => `records.*.${prefix}.${p}`)),
    ...['title','areas.*','skills.*','skillsText','drops.*','notes','service'].map(p=>`records.*.npc.${p}`),
    ...['title','type','campaign','region','exits.*'].map(p=>`records.*.area.${p}`),
    'stories.*.title','stories.*.introduction','stories.*.arcs.*.title','stories.*.arcs.*.text','stories.*.arcs.*.missions.*','stories.*.arcs.*.note',
  ],
  armor: ['sets.*.name','sets.*.notes','offers.*.location','offers.*.notes','offers.*.pieces.*.name','armorers.*.name','armorers.*.locations.*','armorers.*.notes','materials.*.name'],
  calendar: ['name','objective','requirements','rewards','giver','turnIn','notes','location','exchange.item'].map(p=>`activities.*.${p}`),
};
// Keys use stable entity IDs where available. IDs, facts, source revisions, legacy
// originals, coordinates, recipe amounts and rotation epochs never enter this list.
export function contentFields(data: unknown, dataset: Dataset): TextField[] {
  const output: TextField[]=[];
  for(const pattern of schemas[dataset]) {
    function visit(value: unknown, parts: string[], path: (string|number)[], key: string[], parent?: Record<string, unknown>) {
      if(!parts.length) {
        if(typeof value==='string' && value.trim()) {
          const unresolved=(parent?.wiki as {identityStatus?:string}|undefined)?.identityStatus==='unresolved';
          let english=path.at(-1)==='name'&&!unresolved&&typeof parent?.englishName==='string'?parent.englishName:undefined;
          if(!unresolved&&path.at(-1)==='description'&&parent?.id&&parent?.kind==='skill')english=(parent.skill as {description?:string}|undefined)?.description;
          if(!unresolved&&path.at(-1)==='description'&&parent?.id&&parent?.kind==='green')english=(parent.item as {acquisitionText?:string}|undefined)?.acquisitionText;
          output.push({key:key.join('/'),path,source:value,...(english?{english}:{})});
        }
        return;
      }
      const [part,...rest]=parts;
      if(part==='*' && Array.isArray(value)) value.forEach((item,index)=>visit(item,rest,[...path,index],[...key,typeof item==='object'&&item!==null&&'id'in item?String(item.id):String(index)]));
      else if(value&&typeof value==='object'&&part in value) visit((value as Record<string,unknown>)[part],rest,[...path,part],[...key,part],value as Record<string,unknown>);
    }
    visit(data,pattern.split('.'),[],[]);
  }
  return output;
}

export function atPath(data: unknown, path: (string|number)[]): unknown {
  return path.reduce<unknown>((value,key)=>(value as Record<string|number, unknown>)[key],data);
}
