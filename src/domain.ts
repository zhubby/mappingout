import type { Catalog, Entry, Filters, Personal, Place } from './types';
export const defaultFilters: Filters = { q: '', campaign: '', region: '', zone: '', kind: 'skill', profession: '', attribute: '', incomplete: false, selected: '', map: '1:1' };
export function normalizeFilters(f: Filters): Filters {
  return { ...f, attribute: !f.kind || f.kind === 'skill' ? f.attribute : '', profession: !f.kind || f.kind === 'skill' || f.kind === 'boss' ? f.profession : '' };
}
export function readFilters(search: string): Filters {
  const p = new URLSearchParams(search), result = { ...defaultFilters };
  for (const k of ['q','campaign','region','zone','kind','profession','attribute','selected','map'] as const) if (p.has(k)) (result[k] as string) = p.get(k)!;
  if (!['','skill','boss','green','collector','pet','treasure','zone'].includes(result.kind)) result.kind = 'skill';
  result.incomplete = p.get('incomplete') === '1'; return normalizeFilters(result);
}
export function filtersSearch(f: Filters) {
  const p = new URLSearchParams(); Object.entries(f).forEach(([k,v]) => { if (typeof v === 'boolean') { if (v) p.set(k, '1'); } else if (v !== '') p.set(k,v); }); return `?${p}`;
}
export function completed(state: Personal, id: string) { return state.progress.find(p => p.characterId === state.preferences.characterId && p.entryId === id); }
export function trackable(e: Entry) { return (e.kind === 'skill' && !e.skill?.special) || e.kind === 'treasure' || (e.kind === 'zone' && e.vanquishable); }
export function toggleProgress(state: Personal, entryId: string, date?: string): Personal {
  const characterId = state.preferences.characterId; if (!state.characters.some(c => c.id === characterId)) return state;
  const old = completed(state, entryId);
  return setProgress(state, entryId, characterId, !old?.done, date);
}
export function setProgress(state: Personal, entryId: string, characterId: string, done: boolean, date?: string): Personal {
  if (!state.characters.some(c => c.id === characterId)) throw new Error('此角色已在其他页面删除，请重新选择角色。');
  return { ...state, progress: [...state.progress.filter(p => !(p.entryId === entryId && p.characterId === characterId)), { entryId, characterId, done, ...(date ? { date } : {}) }] };
}
export function preferredPlace(entry: Entry, filters: Filters): Place | undefined {
  const places = entry.locations.filter(p => p.valid && (!filters.campaign || p.region.startsWith(`${filters.campaign}:`)) && (!filters.region || p.region === filters.region) && (!filters.zone || p.zone === filters.zone || entry.id === `zone:${filters.zone}`));
  return places.find(p => p.region === filters.map) || places[0];
}
export function deleteCharacter(state: Personal, id: string): Personal {
  const characters = state.characters.filter(c => c.id !== id);
  return { ...state, characters, progress: state.progress.filter(p => p.characterId !== id), notes: state.notes.filter(n => n.characterId !== id), armorPlans:state.armorPlans.filter(p=>p.characterId!==id), activityProgress:state.activityProgress.filter(p=>p.characterId!==id), preferences: { ...state.preferences, characterId: state.preferences.characterId === id ? characters[0]?.id || '' : state.preferences.characterId } };
}
export function belongsToRegion(entry: Entry, region: string) {
  return entry.locations.some(place => place.region === region) || (entry.kind === 'zone' && entry.area?.atlasRegion === region);
}
export function query(data: Catalog, f: Filters, state: Personal): Entry[] {
  f = normalizeFilters(f);
  const terms = f.q.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return data.records.filter(e => {
    if (f.kind && e.kind !== f.kind) return false;
    if (f.campaign && e.campaign !== Number(f.campaign) && !e.locations.some(l => l.region.startsWith(`${f.campaign}:`))) return false;
    if (f.region && !belongsToRegion(e, f.region)) return false;
    if (f.zone && e.id !== `zone:${f.zone}` && !e.locations.some(l => l.zone === f.zone)) return false;
    if (f.profession && e.profession !== Number(f.profession)) return false;
    if (f.attribute && e.attribute !== f.attribute) return false;
    if (f.incomplete && (!trackable(e) || completed(state, e.id)?.done)) return false;
    const text = [e.name, e.englishName, e.description, e.attribute, e.details.join(' '), e.skill?.description,
      e.skill?.acquisition?.map(s => s.text).join(' '), e.legacy?.name, e.legacy?.description, e.legacy?.details.join(' '),
      e.locations.map(l => `${l.boss || ''} ${l.note}`).join(' ')].filter(Boolean).join(' ').toLocaleLowerCase();
    return terms.every(t => text.includes(t));
  });
}
export const assetUrl = (asset: string) => `${import.meta.env.BASE_URL}${asset}`;
