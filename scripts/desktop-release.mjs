import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function arg(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; }
const baseUrl = arg('--base-url');
if (!baseUrl || new URL(baseUrl).protocol !== 'https:') throw Error('需要 --base-url https://你的下载域名/desktop/');
const config = JSON.parse(await fs.readFile(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const bundle = path.resolve(root, arg('--bundle-dir') || 'src-tauri/target/release/bundle/nsis');
const candidates = (await fs.readdir(bundle)).filter(name => name.endsWith('-setup.exe') && !name.endsWith('-offline-setup.exe') && name.includes(`_${config.version}_`));
if (candidates.length !== 1) throw Error(`需要且只能有一个 ${config.version} 安装包，实际：${candidates.join(', ')}`);
const originalName = candidates[0];
const name = originalName.replace('-setup.exe', '-offline-setup.exe');
const source = path.join(bundle, originalName);
const signature = (await fs.readFile(`${source}.sig`, 'utf8')).trim();
if (!signature) throw Error('缺少更新签名，请使用签名构建。');
const bytes = await fs.readFile(source);
if (arg('--offline-installer')) throw Error('Only offline installers are supported; use --bundle-dir with an offline build.');
const out = path.join(root, 'releases', config.version);
await fs.mkdir(out, { recursive: true });
await fs.copyFile(source, path.join(out, name));
await fs.copyFile(`${source}.sig`, path.join(out, `${name}.sig`));
const notesFile = arg('--notes');
const notes = notesFile ? await fs.readFile(path.resolve(notesFile), 'utf8') : `MappingOut ${config.version}：离线地图、角色记录与本地备份。`;
const url = new URL(encodeURIComponent(name), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).href;
const manifest = {
  version: config.version, notes, pub_date: new Date().toISOString(),
  platforms: { [name.includes('_x86-') ? 'windows-i686' : 'windows-x86_64']: { signature, url } },
};
await fs.writeFile(path.join(out, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
let checksums = `${createHash('sha256').update(bytes).digest('hex')}  ${name}\n`;
await fs.writeFile(path.join(out, 'SHA256SUMS.txt'), checksums);
console.log(`签名发布目录：${out}\n更新清单：${url.substring(0, url.lastIndexOf('/') + 1)}latest.json`);
