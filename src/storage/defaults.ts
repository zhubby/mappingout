/**
 * [INPUT]: 依赖个人记录契约。
 * [OUTPUT]: 生成空的 v3 个人记录。
 * [POS]: 新存储与测试共用默认值；每次返回独立对象。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import type { Personal } from '../shared/contracts/personal';
export const emptyPersonal = (): Personal => ({ characters: [], progress: [], notes: [], armorPlans: [], activityProgress: [], questProgress: [], questProfiles: [], preferences: { characterId: '', layers: ['skill', 'boss', 'green', 'collector', 'pet', 'treasure', 'zone'], calendarTimezone:'Asia/Shanghai' } });
