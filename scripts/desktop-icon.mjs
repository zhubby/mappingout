import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'src-tauri/icons');
await fs.mkdir(dir, { recursive: true });
// Editable master artwork shared by all desktop icon formats.
const svg = await fs.readFile(path.join(dir, 'icon-source.svg'));
await sharp(svg).resize(1024,1024).png().toFile(path.join(dir,'icon-master.png'));
const sizes = [16, 24, 32, 48, 64, 128, 256];
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
