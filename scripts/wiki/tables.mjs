import { plainText, splitTopLevel } from './wikitext.mjs';

// Expand rowspans so every exported version retains its profession and collector.
export function wikiTables(source, { raw = false } = {}) {
  const tables = []; let table, cells = [], spans = [];
  function flush() {
    if (!cells.length) return;
    const row = []; let column = 0;
    function inherited() {
      while (spans[column]?.remaining) { row[column] = spans[column].text; spans[column].remaining--; column++; }
    }
    for (const cell of cells) {
      inherited();
      for (let count = 0; count < cell.colspan; count++) {
        row[column] = cell.text;
        if (cell.rowspan > 1) spans[column] = { text: cell.text, remaining: cell.rowspan - 1 };
        column++;
      }
    }
    inherited(); table.push(row); cells = [];
  }
  for (const line of source.split('\n')) {
    if (line.startsWith('{|')) { if (table) throw new Error('Nested version table needs review'); table = []; spans = []; continue; }
    if (!table) continue;
    if (line.startsWith('|-')) { flush(); continue; }
    if (line.startsWith('|}')) { flush(); tables.push(table); table = undefined; continue; }
    if (line.startsWith('|+')) continue;
    if (/^[!|]/.test(line)) {
      const delimiter = line.startsWith('!') && line.includes('!!') ? '!!' : '||';
      for (const value of splitTopLevel(line.slice(1), delimiter)) {
        let text = value, attributes = '';
        if (/^\s*(?:rowspan|colspan|style|align|class|width)\s*=/.test(value)) {
          const pieces = splitTopLevel(value); attributes = pieces.shift(); text = pieces.join('|');
        }
        cells.push({ text: raw ? text.trim() : plainText(text), rowspan: Number(/rowspan\s*=\s*["']?(\d+)/i.exec(attributes)?.[1] || 1), colspan: Number(/colspan\s*=\s*["']?(\d+)/i.exec(attributes)?.[1] || 1) });
      }
    } else if (cells.length && line.trim()) cells[cells.length - 1].text += ` ${raw ? line.trim() : plainText(line)}`;
  }
  if (table) throw new Error('Unclosed version table');
  return tables;
}
