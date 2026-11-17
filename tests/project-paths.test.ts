/**
 * [INPUT]: 依赖统一路径模块与独立 Node 子进程。
 * [OUTPUT]: 验证非工程工作目录、空格路径和显式工程根。
 * [POS]: 工程重排的路径回归；不启动或发布桌面应用。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { desktopEnvironment, projectRoot } from '../scripts/lib/paths.mjs';
describe('project paths', () => {
  it('resolves the repository when invoked outside it', () => {
    const module = pathToFileURL(path.join(projectRoot, 'scripts/lib/paths.mjs')).href;
    const result = execFileSync(process.execPath, ['--input-type=module', '-e', `const m = await import(${JSON.stringify(module)}); console.log(m.projectRoot)`], { cwd: tmpdir(), encoding: 'utf8' });
    expect(result.trim()).toBe(projectRoot);
  });
  it('keeps spaces and explicit roots intact while preserving environment', () => {
    const root = path.join(tmpdir(), 'MappingOut path test');
    expect(desktopEnvironment(root, { PATH: 'toolchain', TOKEN: 'fixture' })).toEqual({ PATH: 'toolchain', TOKEN: 'fixture', TAURI_APP_PATH: path.join(root, 'desktop'), TAURI_FRONTEND_PATH: root });
  });
});
