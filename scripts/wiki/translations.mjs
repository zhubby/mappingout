export function reviewedTranslation(page, translations) {
  const value = translations[page.title];
  if (!value) return null;
  if (value.revid !== page.revid || typeof value.text !== 'string' || !value.text.trim()) throw new Error(`Translation needs revision review: ${page.title}`);
  return value;
}
