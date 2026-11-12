import { createHash } from 'node:crypto';
export function decode(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return { text: buffer.subarray(2).toString('utf16le'), encoding: 'utf-16le' };
  if (buffer[0] === 0xfe && buffer[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(buffer.subarray(2)), encoding: 'utf-16be' };
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(buffer), encoding: 'utf-8' }; }
  catch { return { text: new TextDecoder('gb18030', { fatal: true }).decode(buffer), encoding: 'gb18030' }; }
}
export function rows(text) {
  return text.replace(/^\uFEFF/, '').split(/\r?\n/).map((raw, i) => ({ raw, line: i + 1, fields: raw.split('\t').map(s => s.trim()) })).filter(r => r.raw.trim() && !/^\s*(;|\/\/)/.test(r.raw));
}
export function jpegSize(b) {
  let p = 2;
  while (p < b.length) {
    if (b[p++] !== 0xff) continue;
    const marker = b[p++];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = b.readUInt16BE(p);
    if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker)) return { height: b.readUInt16BE(p + 3), width: b.readUInt16BE(p + 5) };
    p += length;
  }
  throw new Error('Unsupported JPEG');
}
export function stableId(prefix, raw) { return `${prefix}:${createHash('sha256').update(raw).digest('hex').slice(0, 16)}`; }
