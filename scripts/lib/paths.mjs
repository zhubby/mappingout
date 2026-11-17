/**
 * [INPUT]: 依赖模块 URL 与 Node 路径解析。
 * [OUTPUT]: 提供独立于工作目录的工程根、工程路径与桌面环境。
 * [POS]: 构建、校验和桌面命令共用路径边界；允许显式测试根目录。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const projectPath = (...parts) => path.resolve(projectRoot, ...parts);
export function desktopEnvironment(directory = projectRoot, environment = process.env) {
  return { ...environment, TAURI_APP_PATH: path.resolve(directory, 'desktop'), TAURI_FRONTEND_PATH: path.resolve(directory) };
}
