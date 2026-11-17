/**
 * [INPUT]: 依赖统一路径模块与独立 Node 子进程。
 * [OUTPUT]: 验证非工程工作目录、空格路径和显式工程根。
 * [POS]: 工程重排的路径回归；不启动或发布桌面应用。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import fs from 'node:fs/promises';
import { validateDeploymentData } from '../scripts/validate/validate-data.mjs';
import { validateQuestData } from '../scripts/validate/validate-quests.mjs';
import { validateSkillData } from '../scripts/validate/validate-skills.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { desktopEnvironment, projectRoot } from '../scripts/lib/paths.mjs';
describe('project paths', { timeout: 30000 }, () => {
  it('resolves the repository when invoked outside it', () => {
    const module = pathToFileURL(path.join(projectRoot, 'scripts/lib/paths.mjs')).href;
    const result = execFileSync(process.execPath, ['--input-type=module', '-e', `const m = await import(${JSON.stringify(module)}); console.log(m.projectRoot)`], { cwd: tmpdir(), encoding: 'utf8' });
    expect(result.trim()).toBe(projectRoot);
  });
  it('keeps spaces and explicit roots intact while preserving environment', () => {
    const root = path.join(tmpdir(), 'MappingOut path test');
    expect(desktopEnvironment(root, { PATH: 'toolchain', TOKEN: 'fixture' })).toEqual({ PATH: 'toolchain', TOKEN: 'fixture', TAURI_APP_PATH: path.join(root, 'desktop'), TAURI_FRONTEND_PATH: root });
  });
  it('runs the data CLI from a foreign working directory', () => {
    const result = execFileSync(process.execPath, [path.join(projectRoot, 'scripts/validate/validate-data.mjs')], { cwd: tmpdir(), encoding: 'utf8', timeout: 30000 });
    expect(result).toContain('部署资料校验通过');
    expect(result).toContain('maps: 20');
  });
  it('reads evidence from the explicit root containing spaces', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'mappingout path test '));
    try {
      const publicDir = path.join(root, 'public');
      await fs.mkdir(path.join(publicDir, 'data'), { recursive: true });
      for (const file of ['catalog.json', 'report.json']) await fs.copyFile(path.join(projectRoot, 'public/data', file), path.join(publicDir, 'data', file));
      await expect(validateDeploymentData(publicDir, root)).rejects.toMatchObject({ path: path.join(root, 'data/maps/verification.json') });
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
  it.each([
    { name: 'quests', validate: validateQuestData, metadata: ['quest-coverage.json', 'quest-discovery.json', 'quest-images.json'] },
    { name: 'skills', validate: validateSkillData, metadata: ['skill-library-coverage.json', 'skill-library-discovery.json', 'skill-library-images.json'] },
  ])('keeps $name snapshot reads inside the explicit root', async ({ validate, metadata }) => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'mappingout evidence test '));
    try {
      await fs.mkdir(path.join(root, 'data/wiki'), { recursive: true });
      for (const file of metadata) await fs.copyFile(path.join(projectRoot, 'data/wiki', file), path.join(root, 'data/wiki', file));
      await expect(validate(path.join(projectRoot, 'public'), root)).rejects.toMatchObject({ code: 'ENOENT', path: expect.stringContaining(path.join(root, 'data/wiki/pages')) });
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
});
