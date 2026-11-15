import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { useSyncExternalStore } from 'react';
import zh from './zh-CN.json';
import en from './en.json';

export type Locale = 'zh-CN' | 'en';
export type UiKey = keyof typeof zh;
export const localeKey = 'mappingout.locale';
function initialLocale(): Locale {
  try { return localStorage.getItem(localeKey) === 'en' ? 'en' : 'zh-CN'; }
  catch { return 'zh-CN'; }
}
void i18next.use(initReactI18next).init({
  lng: initialLocale(), supportedLngs: ['zh-CN', 'en'], fallbackLng: false,
  resources: { 'zh-CN': { translation: zh }, en: { translation: en } },
  initAsync: false, keySeparator: false, nsSeparator: false,
  interpolation: { escapeValue: false }, returnEmptyString: false,
});
export function getLocale(): Locale { return i18next.language === 'en' ? 'en' : 'zh-CN'; }
function applyDocumentLocale() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = getLocale();
  document.title = getLocale() === 'en' ? 'MappingOut — Tyria Explorer' : 'MappingOut · 泰瑞亚探索志';
}
applyDocumentLocale();
i18next.on('languageChanged', applyDocumentLocale);
export function setLocale(locale: Locale) {
  try { localStorage.setItem(localeKey, locale); } catch { /* The session can still switch. */ }
  void i18next.changeLanguage(locale);
}
const subscribe = (callback: () => void) => {
  i18next.on('languageChanged', callback);
  return () => { i18next.off('languageChanged', callback); };
};
export function useLocale() { return useSyncExternalStore(subscribe, getLocale, () => 'zh-CN' as const); }
const messages = new Map<string, { key: UiKey; values?: Record<string, unknown> }>();
export function t(key: UiKey, values?: Record<string, unknown>): string {
  const result = i18next.t(key, values ?? {}) as string;
  messages.set(result, { key, values });
  if(messages.size>2000)messages.delete(messages.keys().next().value!);
  return result;
}
const nativeMessages: Record<string, UiKey> = {
  'native.backup-too-large':'备份超过 20 MB。', 'native.invalid-backup':'备份内容无效，原有数据未修改。',
  'native.invalid-directory':'无效的备份目录。', 'native.invalid-kind':'无效的备份类型。',
  'native.invalid-name':'无效的备份文件名。', 'native.symlink':'不能读取备份链接。',
  'native.io':'本地文件操作失败，请检查路径和文件权限。',
};
// Only use for application messages, never for notes, names, or plan titles.
export function displayMessage(value: string): string {
  const code=value.replace(/^Error:\s*/, '').split(':')[0];
  if(nativeMessages[code])return t(nativeMessages[code]);
  const saved=messages.get(value)||messages.get(value.replace(/^Error:\s*/, ''));
  if(!saved)return value;
  const values=Object.fromEntries(Object.entries(saved.values??{}).map(([key,v])=>[key,typeof v==='string'&&/^Error:|^native\./.test(v)?displayMessage(v):v]));
  return t(saved.key,values);
}
export function number(value: number) { return value.toLocaleString(getLocale()); }
export function dateTime(value: number | string) { return new Date(value).toLocaleString(getLocale()); }
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key === localeKey) void i18next.changeLanguage(event.newValue === 'en' ? 'en' : 'zh-CN');
});
