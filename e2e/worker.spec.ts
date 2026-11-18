/**
 * [INPUT]: 依赖 Workers 本地服务和共用分发回归。
 * [OUTPUT]: 注册 Workers 的 HTTP、离线与缓存升级验收。
 * [POS]: Workers 配置的薄入口；分发断言由 distribution.ts 提供。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { distributionTests } from './distribution';

distributionTests();
