import { templates, plainText, links } from './wikitext.mjs';
import { reference } from './content-facts.mjs';

export function locationFacts(page) {
  const box = templates(page.wikitext).find(template => /^(Location|Mission|Quest|Arena) infobox$/i.test(template.name));
  if (!box) throw new Error(`Missing location infobox: ${page.title}`);
  const fields = box.fields;
  const category = box.name.toLowerCase().split(' ')[0];
  const type = category === 'arena' ? 'Arena' : category === 'quest' ? 'Quest' : plainText(fields.type);
  if (!type) throw new Error(`Missing location type: ${page.title}`);
  return {
    title: page.title, type, campaign: plainText(fields.campaign), region: plainText(fields.region),
    vanquishable: templates(page.wikitext, 'Vanquisher').length > 0,
    exits: [...new Set(links(fields.exits || '').map(link => link.title))],
    levels: plainText(fields.levels), reference: reference(page)
  };
}
