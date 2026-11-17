/**
 * [INPUT]: 依赖技能与对象校订编译入口。
 * [OUTPUT]: 按顺序编译固定 Wiki 校订。
 * [POS]: 地图资料校订编排；应用资料写入由 apply 完成。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
await import('./compile-skills.mjs');
await import('./compile-content.mjs');
