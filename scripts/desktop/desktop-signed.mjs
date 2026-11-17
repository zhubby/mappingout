/**
 * [INPUT]: 依赖发布门禁、更新私钥与桌面 CLI。
 * [OUTPUT]: 执行校验后的签名构建并透传退出码。
 * [POS]: 正式桌面构建入口；私钥由环境或本地路径提供。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { projectRoot } from '../lib/paths.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const root = projectRoot;
const { checkRelease } = await import('../validate/check-release.mjs');
const readiness = checkRelease(root);
if(readiness.errors.length) throw Error(`Release blocked:\n${readiness.errors.slice(0,20).join('\n')}`);
if(readiness.acceptedFindings.length) console.warn('Version-specific release exception:', readiness.acceptedFindings);
const key = process.env.TAURI_SIGNING_PRIVATE_KEY || path.join(os.homedir(), '.mappingout/keys/updater.key');
if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
  try { await fs.access(key); } catch { throw Error('缺少更新签名私钥；设置 TAURI_SIGNING_PRIVATE_KEY，详见 docs/guides/desktop.md。'); }
}
const child = spawn(process.execPath, ['scripts/desktop/desktop.mjs', 'build', '--ci', '--config', 'desktop/tauri.updater.conf.json', ...process.argv.slice(2)], {
  cwd: root, stdio: 'inherit', env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY: key, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD || '' },
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
