export function splitTopLevel(text, delimiter = '|') {
  const parts = []; let braces = 0, brackets = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const pair = text.slice(i, i + 2);
    if (pair === '{{') { braces++; i++; }
    else if (pair === '}}') { braces--; i++; }
    else if (pair === '[[') { brackets++; i++; }
    else if (pair === ']]') { brackets--; i++; }
    else if (!braces && !brackets && text.startsWith(delimiter, i)) { parts.push(text.slice(start, i)); start = i + delimiter.length; i += delimiter.length - 1; }
  }
  parts.push(text.slice(start));
  return parts;
}
export function templates(text, wanted) {
  const result = []; let depth = 0, start = 0;
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  for (let i = 0; i < text.length - 1; i++) {
    const pair = text.slice(i, i + 2);
    if (pair === '{{') { if (!depth) start = i; depth++; i++; }
    else if (pair === '}}' && depth) {
      depth--; i++;
      if (!depth) {
        const source = text.slice(start + 2, i - 1);
        const [rawName, ...parameters] = splitTopLevel(source);
        const name = rawName.trim().replaceAll('_', ' ');
        if (!wanted || name.toLowerCase() === wanted.toLowerCase()) {
          const fields = {}; let positional = 0;
          for (const p of parameters) {
            const parts = splitTopLevel(p, '=');
            if (parts.length > 1) fields[parts.shift().trim().toLowerCase()] = parts.join('=').trim();
            else fields[String(++positional)] = p.trim();
          }
          result.push({ name, fields, raw: text.slice(start, i + 1) });
        }
      }
    }
  }
  return result;
}
export function plainText(value = '') {
  let text = value.replace(/<!--[\s\S]*?-->/g, '').replace(/<ref\b[^>]*>[\s\S]*?<\/ref>|<ref\b[^>]*\/>/gi, '').replace(/\[\[(?:Category|File|Image|de|fr|es|pl|ja):[^\]]+\]\]/gi, '');
  const professionIcons = { w: 'Warrior', r: 'Ranger', mo: 'Monk', n: 'Necromancer', me: 'Mesmer', e: 'Elementalist', a: 'Assassin', rt: 'Ritualist', p: 'Paragon', d: 'Dervish', x: 'No profession', any: 'Any profession' };
  for (let i = 0; i < 10 && text.includes('{{'); i++) {
    const found = templates(text);
    if (!found.length) break;
    for (const t of found) {
      const p = t.fields, name = t.name.toLowerCase(); let replacement;
      if (name === 'gr' || name === 'gr2') {
        const a = Number(p[1]), b = Number(p[2]);
        const range = name === 'gr' ? `${a}…${Math.round(a + 12 * (b - a) / 15)}…${b}` : `${p[1]}…${p[2]}`;
        replacement = `${['+', '-'].includes(p[3]) ? p[3] : ''}${range}${p[4] === '%' ? '%' : ''}`;
      } else if (/^\d+\/\d+$/.test(name)) { const [a, b] = name.split('/').map(Number); replacement = String(a / b); }
      else if (['gray', 'grey', 'sic', 'skill icon', 'monster skill icon', 'item icon', 'npc icon'].includes(name)) replacement = p[1] || '';
      else if (name === '!' || name === 'pipe') replacement = '|';
      else if (name === 'anomaly' || name === 'bug' || name === 'note') replacement = p[1] || '';
      else if (professionIcons[name]) replacement = professionIcons[name];
      else if (name === 'npc location') replacement = `${p[1]}${p[2] ? ` (${p[2]})` : ''}`;
      else if (name === 'see' || name === 'main') replacement = `See: ${p[1] || ''}`;
      else if (name === 'gold') replacement = 'gold';
      else if (['gw2w', 'interactive-object-stub'].includes(name)) replacement = '';
      else if (name === 'section-stub') replacement = '[Incomplete source section]';
      else if (name === 'ongoing drop research' || name === 'ongoing item research') replacement = 'Drop research is ongoing.';
      else if (/ nav$/.test(name) || ['clear', 'weapon-stub', 'unique-weapon-stub'].includes(name)) replacement = '';
      else if (name === 'verify') replacement = '[Source claim needs verification]';
      else if (name === 'otheruses' || name === 'other uses') replacement = `About ${p[1] || 'this item'}; for ${p[2] || 'other uses'}, see ${p[3] || ''}.`;
      else replacement = t.raw; // Unknown templates remain visible: never silently delete mechanics.
      text = text.replace(t.raw, replacement);
    }
  }
  return text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/\[(https?:\/\/[^\s\]]+)\s+([^\]]+)\]/g, '$2').replace(/'{2,5}/g, '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/?(?:span|div|small|big|sup|sub|b|i|em|strong|center|s|del|u|p|noinclude|includeonly|onlyinclude|gallery|code|pre|nowiki|font|table|tr|td|th)\b[^>]*>/gi, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\[s\]/g, 's').replace(/[ \t]+/g, ' ').trim();
}
export function section(text, heading) {
  const parts = text.split(/^==\s*([^=\n]+?)\s*==\s*$/m);
  for (let i = 1; i < parts.length; i += 2) if (parts[i].trim().toLowerCase() === heading.toLowerCase()) return parts[i + 1];
  return '';
}
export function links(text) { return [...text.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g)].map(m => ({ title: m[1].replaceAll('_', ' ').trim(), label: (m[2] || m[1]).trim() })); }
