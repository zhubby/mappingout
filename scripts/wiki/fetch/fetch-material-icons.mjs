/**
 * [INPUT]: 依赖护甲材料目录、Wiki 快照和共用代理客户端。
 * [OUTPUT]: 下载原始材料 PNG，记录修订、版权和文件校验值。
 * [POS]: 材料图标采集入口；编译器读取清单，构建不联网。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {api, binary, evidenceDir, fetchPages, loadPage, web} from '../lib/client.mjs';
import {reference} from '../lib/content-facts.mjs';
import {templates} from '../lib/wikitext.mjs';

const armor = JSON.parse(await fs.readFile(path.join(web, 'public/data/armor.json'), 'utf8'));
const {index, missing} = await fetchPages([...armor.materials.map(m => m.englishName), 'Template:Item infobox']);
if (missing.length) throw Error(`材料来源缺失：${missing.join(', ')}`);
const template = await loadPage('Template:Item infobox', index);
if (!template.wikitext.includes('[[Image:{{PAGENAME}}.png]]')) throw Error('物品模板的默认图标规则已变更');
const sources = [];
for (const material of armor.materials) {
  const page = await loadPage(material.englishName, index);
  const infobox = templates(page.wikitext, 'Item infobox')[0];
  if (!infobox) throw Error(`材料没有物品信息框：${page.title}`);
  const image = infobox.fields.image;
  const filename = image === undefined ? `${page.title}.png` : /^\[\[(?:File|Image):([^\]|]+)(?:\|[^\]]*)?\]\]$/i.exec(image)?.[1];
  if (!filename || !filename.endsWith('.png')) throw Error(`材料图标需要复核：${page.title}`);
  sources.push({material, page, title:`File:${filename}`});
}

const files = new Map();
for (let offset = 0; offset < sources.length; offset += 20) {
  // 文件页跳转到物品条目；保持文件页才能读取图像与版权声明。
  const result = await api({action:'query', titles:sources.slice(offset, offset + 20).map(s => s.title).join('|'), prop:'revisions|imageinfo', rvprop:'ids|timestamp|content', rvslots:'main', iiprop:'url|sha1|timestamp|size'});
  for (const page of result.query.pages) files.set(page.title, page);
  for (const alias of result.query.normalized || []) files.set(alias.from, files.get(alias.to));
}
const directory = path.join(web, 'public/assets/materials');
await fs.mkdir(directory, {recursive:true});
const icons = [];
for (const {material, page:source, title} of sources) {
  const page = files.get(title), info = page?.imageinfo?.[0], revision = page?.revisions?.[0];
  const declaration = revision?.slots?.main?.content;
  if (!info || !revision || !/\{\{arenanet image\s*\|\s*item icon\s*\}\}/i.test(declaration)) throw Error(`材料图标或版权声明未确认：${title}`);
  const bytes = await binary(info.url);
  if (createHash('sha1').update(bytes).digest('hex') !== info.sha1) throw Error(`下载时图像已变更：${title}`);
  const metadata = await sharp(bytes).metadata();
  if (metadata.format !== 'png' || metadata.width !== info.width || metadata.height !== info.height) throw Error(`材料图标格式或尺寸不符：${title}`);
  const asset = `assets/materials/${material.id.replace('material:', '')}.png`;
  await fs.writeFile(path.join(web, 'public', asset), bytes);
  icons.push({materialId:material.id, name:material.englishName, asset, itemReference:reference(source), imageField:templates(source.wikitext, 'Item infobox')[0].fields.image ?? null, source:info.descriptionurl, originalUrl:info.url, originalSha1:info.sha1, uploadedAt:info.timestamp, pageid:page.pageid, revid:revision.revid, revisedAt:revision.timestamp, revisionUrl:`https://wiki.guildwars.com/index.php?title=${encodeURIComponent(page.title)}&oldid=${revision.revid}`, license:'ArenaNet image', licenseDeclaration:declaration, rights:'ArenaNet / NCSOFT; game artwork is not licensed under GFDL.', modification:'None; original PNG.', width:metadata.width, height:metadata.height, bytes:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex')});
  console.log(`材料图标 ${icons.length}/${sources.length}：${material.englishName}`);
}
await fs.writeFile(path.join(evidenceDir, 'material-icons.json'), JSON.stringify({format:1, retrievedAt:new Date().toISOString(), templateReference:reference(template), icons}, null, 2) + '\n');
