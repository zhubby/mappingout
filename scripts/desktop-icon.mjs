import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'src-tauri/icons');
await fs.mkdir(dir, { recursive: true });
// Code-native compass matches the application's existing compass visual language.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<rect width="1024" height="1024" rx="210" fill="#172219"/>
<circle cx="512" cy="512" r="355" fill="#22301e" stroke="#b59d69" stroke-width="22"/>
<circle cx="512" cy="512" r="291" fill="none" stroke="#6d7951" stroke-width="9"/>
<path d="M512 102v130m0 560v130M102 512h130m560 0h130" stroke="#d5bd84" stroke-width="22"/>
<path d="M665 359 550 550 359 665 474 474Z" fill="#d5bd84"/>
<path d="m359 665 115-191 76 76Z" fill="#6d7951"/>
<circle cx="512" cy="512" r="32" fill="#172219" stroke="#d5bd84" stroke-width="12"/>
</svg>`;
const sizes = [32, 128, 256];
const buffers = [];
for (const size of sizes) {
  const buffer = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  await fs.writeFile(path.join(dir, size === 256 ? '128x128@2x.png' : `${size}x${size}.png`), buffer);
  buffers.push(buffer);
}
const header = Buffer.alloc(6 + buffers.length * 16);
header.writeUInt16LE(1, 2); header.writeUInt16LE(buffers.length, 4);
let offset = header.length;
buffers.forEach((buffer, i) => {
  const entry = 6 + i * 16;
  header[entry] = sizes[i] % 256; header[entry + 1] = sizes[i] % 256;
  header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(buffer.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
  offset += buffer.length;
});
await fs.writeFile(path.join(dir, 'icon.ico'), Buffer.concat([header, ...buffers]));
// ICNS container with PNG representations supported by modern macOS.
const chunks = [];
for (const [type, size] of [['ic07',128],['ic08',256],['ic09',512],['ic10',1024]]) {
  const png = await sharp(Buffer.from(svg)).resize(size,size).png().toBuffer();
  const chunk = Buffer.alloc(8); chunk.write(type,0,4,'ascii'); chunk.writeUInt32BE(png.length+8,4);
  chunks.push(chunk,png);
}
const icnsHeader = Buffer.alloc(8); icnsHeader.write('icns'); icnsHeader.writeUInt32BE(8+chunks.reduce((n,c)=>n+c.length,0),4);
await fs.writeFile(path.join(dir,'icon.icns'),Buffer.concat([icnsHeader,...chunks]));
