/**
 * [INPUT]: 依赖桌面构建、五套离线资料和资源签名构建器。
 * [OUTPUT]: 校验任务图及技能图标后拆分程序和独立资源包。
 * [POS]: 桌面前端构建收尾；保留旧资源在运行期的兼容入口。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { projectRoot } from '../lib/paths.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = projectRoot;
const dist = path.join(root, 'dist-desktop');
// Shared resources are signed and installed independently of the executable.
for (const name of ['sw.js', '_headers']) await fs.rm(path.join(dist, name), { force: true });
for (const name of ['index.html', 'data/catalog.json', 'data/armor.json', 'data/calendar.json', 'data/quests.json', 'data/skills.json', 'licenses/gfdl-1.3.txt']) {
  await fs.access(path.join(dist, name));
}
for (const locale of ['zh-TW','en']) for (const dataset of ['catalog','armor','calendar','quests','skills']) {
  await fs.access(path.join(dist, `data/i18n/${locale}/${dataset}.json`));
}
const fonts=JSON.parse(await fs.readFile(path.join(dist,'fonts/manifest.json'),'utf8'));
for(const font of fonts.fonts)if(font.file){
  await fs.access(path.join(dist,font.file));
  if(font.licenseFile)await fs.access(path.join(dist,font.licenseFile));
  if(font.noticeFile)await fs.access(path.join(dist,font.noticeFile));
}
const catalog = JSON.parse(await fs.readFile(path.join(dist, 'data/catalog.json'), 'utf8'));
const quests=JSON.parse(await fs.readFile(path.join(dist,'data/quests.json'),'utf8'));
for(const image of new Set(quests.quests.flatMap(q=>q.images.map(i=>i.file))))await fs.access(path.join(dist,image));
const skills=JSON.parse(await fs.readFile(path.join(dist,'data/skills.json'),'utf8'));
for(const image of new Set([...skills.skills.flatMap(s=>s.variants.map(v=>v.image)),...skills.resourceIcons.map(icon=>icon.file)]))await fs.access(path.join(dist,image));
for (const region of catalog.regions) if (region.image) await fs.access(path.join(dist, region.image));
console.log(`桌面离线资源就绪：${catalog.regions.length} 张地图；未包含 Service Worker。`);
const {buildResources}=await import('../resources/build.mjs');
await buildResources(root);
await fs.copyFile(path.join(root,'releases/resources/resources.json'),path.join(dist,'resources-bootstrap.json'));
for(const name of ['assets','data','fonts','licenses'])await fs.rm(path.join(dist,name),{recursive:true,force:true});
console.log('地图、资料和字体已移入三个独立资源包；桌面二进制仅保留程序和首次准备清单。');
