import { templates, links, plainText } from './wikitext.mjs';
import { reference } from './content-facts.mjs';

// A level-three Rewards section must end before sibling sections such as Dialogue.
export function headingSection(text, heading) {
  const headings = [...text.matchAll(/^(={2,6})\s*([^=\n]+?)\s*\1\s*$/gm)];
  const index = headings.findIndex(match => match[2].trim().toLowerCase() === heading.toLowerCase());
  if (index < 0) return '';
  const start = headings[index], end = headings.slice(index + 1).find(match => match[1].length <= start[1].length);
  return text.slice(start.index + start[0].length, end?.index).trim();
}

export function questFacts(page) {
  const box = templates(page.wikitext, 'Quest infobox')[0]?.fields;
  if (!box) throw new Error(`Missing quest infobox: ${page.title}`);
  const rewards = headingSection(page.wikitext, 'Rewards') || headingSection(page.wikitext, 'Reward');
  const rewardedSkills = [...new Set([
    ...templates(rewards, 'Skill icon').map(template => plainText(template.fields[1])),
    ...links(rewards).map(link => link.title)
  ])];
  if (!box['given by'] || !box['given at'] || !rewards) throw new Error(`Incomplete quest evidence: ${page.title}`);
  return {
    title: page.title, givenBy: plainText(box['given by']), givenAt: plainText(box['given at']),
    prerequisites: plainText(box['preceded by']), rewards: plainText(rewards), rewardedSkills,
    reference: reference(page)
  };
}

export async function questPages(page, load) {
  if (templates(page.wikitext, 'Quest infobox').length) return [page];
  if (!templates(page.wikitext, 'disambig').length) throw new Error(`Unrecognized quest source: ${page.title}`);
  const titles = [...new Set(links(page.wikitext).map(link => link.title))];
  const pages = [];
  for (const title of titles) {
    const branch = await load(title);
    if (!branch || !templates(branch.wikitext, 'Quest infobox').length) throw new Error(`Missing quest branch: ${title}`);
    pages.push(branch);
  }
  if (!pages.length) throw new Error(`No quest branches: ${page.title}`);
  return pages;
}

export function chestFacts(page) {
  const box = templates(page.wikitext, 'Interactive object infobox')[0]?.fields;
  if (!box || !/chest/i.test(plainText(box.type))) throw new Error(`Not a reward chest: ${page.title}`);
  const items = [];
  for (const category of ['Unique items', 'Only from this chest', 'Others', 'Other', 'Rare crafting materials']) {
    for (const line of headingSection(page.wikitext, category).split('\n').filter(line => /^\*/.test(line))) {
      const item = links(line)[0];
      if (item && !/^(Item rarity|Polymock)$/i.test(item.title)) items.push({ title: item.title, category });
    }
  }
  if (!items.length) throw new Error(`Chest drop list missing: ${page.title}`);
  return { title: page.title, introduction: plainText(page.wikitext.split(/^==/m)[0].replace(/__NOTOC__/g, '').replace(templates(page.wikitext, 'Interactive object infobox')[0].raw, '').replace(/\{\{interactive-object-stub\}\}/gi, '')), items, reference: reference(page) };
}
