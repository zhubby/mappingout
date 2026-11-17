/**
 * [INPUT]: 依赖个人记录校验和版本迁移。
 * [OUTPUT]: 解析与生成 v3 备份信封。
 * [POS]: Web 和原生备份共用格式边界。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { t } from '../i18n';
import type { Backup, Personal } from '../shared/contracts/personal';
import { validatePersonal, migratePersonalV1, migratePersonalV2 } from './validation';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, limit = 1000): v is string => typeof v === 'string' && v.length <= limit;
export function parseBackup(text: string): Backup {
  if (text.length > 20_000_000) throw new Error(t("备份超过 20 MB。"));
  let v; try { v = JSON.parse(text); } catch { throw new Error(t("无法读取 JSON 备份。")); }
  if (!object(v) || v.format !== 'mappingout-backup' || ![1,2,3].includes(v.version as number) || !str(v.exportedAt) || isNaN(Date.parse(v.exportedAt))) throw new Error(t("不支持此备份格式或版本。"));
  return { format: 'mappingout-backup', version: 3, exportedAt: v.exportedAt, data: v.version===1?migratePersonalV1(v.data):v.version===2?migratePersonalV2(v.data):validatePersonal(v.data), ...(v.version===1||v.version===2?{migratedFrom:v.version as 1|2}:{}) };
}
export function makeBackup(data: Personal): Backup { return { format: 'mappingout-backup', version: 3, exportedAt: new Date().toISOString(), data: validatePersonal(data) }; }
