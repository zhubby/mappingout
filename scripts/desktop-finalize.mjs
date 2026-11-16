import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-desktop');
// Shared resources are signed and installed independently of the executable.
for (const name of ['sw.js', '_headers']) await fs.rm(path.join(dist, name), { force: true });
for (const name of ['index.html', 'data/catalog.json', 'data/armor.json', 'data/calendar.json', 'licenses/gfdl-1.3.txt']) {
  await fs.access(path.join(dist, name));
}
for (const locale of ['zh-CN','en']) for (const dataset of ['catalog','armor','calendar']) {
  await fs.access(path.join(dist, `data/i18n/${locale}/${dataset}.json`));
}
const fonts=JSON.parse(await fs.readFile(path.join(dist,'fonts/manifest.json'),'utf8'));
for(const font of fonts.fonts)if(font.file){
  await fs.access(path.join(dist,font.file));
  if(font.licenseFile)await fs.access(path.join(dist,font.licenseFile));
  if(font.noticeFile)await fs.access(path.join(dist,font.noticeFile));
}
const catalog = JSON.parse(await fs.readFile(path.join(dist, 'data/catalog.json'), 'utf8'));
for (const region of catalog.regions) if (region.image) await fs.access(path.join(dist, region.image));
console.log(`桌面离线资源就绪：${catalog.regions.length} 张地图；未包含 Service Worker。`);
const {buildResources}=await import('./resources/build.mjs');
await buildResources(root);
await fs.copyFile(path.join(root,'releases/resources/resources.json'),path.join(dist,'resources-bootstrap.json'));
for(const name of ['assets','data','fonts','licenses'])await fs.rm(path.join(dist,name),{recursive:true,force:true});
console.log('地图、资料和字体已移入三个独立资源包；桌面二进制仅保留程序和首次准备清单。');
