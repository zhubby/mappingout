/**
 * [INPUT]: 依赖 Node 文件与本模块的显式输入。
 * [OUTPUT]: 提供中文校订查询。
 * [POS]: 位于 scripts/wiki/lib；运行资料输入与脚本分离。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
export function reviewedTranslation(page, translations) {
  const value = translations[page.title];
  if (!value) return null;
  if (value.revid !== page.revid || typeof value.text !== 'string' || !value.text.trim()) throw new Error(`Translation needs revision review: ${page.title}`);
  return value;
}
