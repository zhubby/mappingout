const normalize = value => value.toLowerCase().replaceAll('_', ' ').replace(/^the /, '').trim();

export function assertBossEvidence(record, npc, skills, expected) {
  const original = record.legacy || record;
  if (record.id !== expected.id || record.kind !== 'boss' || original.name !== expected.name || record.campaign !== expected.campaign || original.profession !== expected.profession || JSON.stringify(record.locations.map(place => place.zone)) !== JSON.stringify(expected.zones)) throw new Error(`Boss legacy identity mismatch: ${record.id}`);
  if (npc.title !== expected.title) throw new Error(`Boss source identity mismatch: ${record.id}`);
  if (!npc.boss || ![npc.profession, npc.secondaryProfession, npc.thirdProfession].includes(expected.profession)) throw new Error(`Boss profession or classification mismatch: ${record.id}`);
  if (!expected.areas.length || !expected.areas.every(area => npc.areas.some(actual => normalize(actual) === normalize(area)))) throw new Error(`Boss area evidence mismatch: ${record.id}`);
  const related = record.related?.filter(id => id.startsWith('skill:')) || [];
  if (!related.length || related.length !== skills.length || !related.every(id => skills.some(skill => skill.id === id))) throw new Error(`Boss related skill mismatch: ${record.id}`);
  for (const skill of skills) {
    if (!skill.facts.elite || !npc.skills.includes(skill.facts.title) || !skill.facts.acquisition.some(source => source.method === 'capture' && [0, record.campaign].includes(source.campaign) && skill.acquisitionTitles.includes(source.title))) throw new Error(`Boss capture evidence mismatch: ${record.id}: ${skill.id}`);
  }
}
