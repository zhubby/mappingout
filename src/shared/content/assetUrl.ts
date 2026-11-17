/**
 * [INPUT]: 依赖构建期 BASE_URL。
 * [OUTPUT]: 提供运行资源 URL。
 * [POS]: 资源地址边界；保留 Web 和桌面路径语义。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
export const assetUrl = (asset: string) => `${import.meta.env.BASE_URL}${asset}`;
