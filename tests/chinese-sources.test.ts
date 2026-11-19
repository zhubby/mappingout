/**
 * [INPUT]: 依赖中文 Wiki 术语提取与固定页面样本。
 * [OUTPUT]: 验证英文身份匹配、来源优先与同站冲突保留。
 * [POS]: 资料维护边界回归；不把名称命中当作正文审校。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {describe,expect,it} from 'vitest';
import {extractChineseTerms} from '../scripts/i18n/chinese-sources.mjs';
const page=(title:string,wikitext:string,site='fandom',pageid=1)=>({site,title,pageid,revid:7,wikitext,url:'https://example.test/wiki/'+encodeURIComponent(title),retrievedAt:'2026-11-19T00:00:00Z'});
describe('Chinese Wiki term evidence',()=>{
 it('extracts an English skill identity without importing its obsolete numbers',()=>{
  const terms=extractChineseTerms([page('劈擊','{{技能列中|\n名稱=劈擊|\n英名=Cleave|\n描述=造成10傷害。|\n}}')]);
  expect(terms.terms.Cleave.text).toBe('劈擊');
  expect(terms.terms.Cleave.references[0]).toMatchObject({site:'fandom',pageid:1,revid:7});
  expect(terms.terms['造成10傷害。']).toBeUndefined();
 });
 it('prefers a pinned Fandom name to a different Huiji name',()=>{
  const terms=extractChineseTerms([page('Template:Eye of the North','[[極地之眼]]'),page('Template:Eye of the North','[[北方之眼]]','huiji',2)]);
  expect(terms.terms['Eye of the North'].text).toBe('極地之眼');
  expect(terms.terms['Eye of the North'].aliases).toContain('北方之眼');
 });
 it('does not silently select between conflicting equal-strength identities',()=>{
  const terms=extractChineseTerms([page('甲','{{技能列中|名稱=甲|英名=Shared name|}}'),page('乙','{{技能列中|名稱=乙|英名=Shared name|}}','fandom',2)]);
  expect(terms.terms['Shared name']).toBeUndefined();
  expect(terms.conflicts['Shared name'].map((term:{text:string})=>term.text)).toEqual(['甲','乙']);
 });
 it('removes presentation markup from names and preserves article templates',()=>{
  const terms=extractChineseTerms([page('列表','[[gww:Heart of the Shiverpeaks|席娃山脈<br>之心]]'),page('模板:Spell','[[咒文魔法]]','fandom',2)]);
  expect(terms.terms['Heart of the Shiverpeaks'].text).toBe('席娃山脈之心');
  expect(terms.terms.Spell.text).toBe('咒文魔法');
 });
 it.each(['File:金幣.png','Image:金幣.png','圖像:Gold.png','影像:Gold.png','檔案:Gold.png',':分類:金幣'])('does not turn %s into an English translation',target=>{
  const terms=extractChineseTerms([page('模板:Cost',`[[${target}]]`)]);
  expect(terms.terms.Cost).toBeUndefined();
 });
});
