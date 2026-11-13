import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const key = process.env.TAURI_SIGNING_PRIVATE_KEY || path.join(os.homedir(), '.mappingout/keys/updater.key');
if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
  try { await fs.access(key); } catch { throw Error('缺少更新签名私钥；设置 TAURI_SIGNING_PRIVATE_KEY，详见 docs/desktop.md。'); }
}
const child = spawn(process.execPath, ['scripts/desktop.mjs', 'build', '--ci', '--config', 'src-tauri/tauri.updater.conf.json', ...process.argv.slice(2)], {
  cwd: root, stdio: 'inherit', env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY: key, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD || '' },
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
