import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cargoBin = path.join(process.env.CARGO_HOME || path.join(os.homedir(), '.cargo'), 'bin');
const env = { ...process.env, PATH: `${cargoBin}${path.delimiter}${process.env.PATH || ''}` };
if (!existsSync(path.join(cargoBin, process.platform === 'win32' ? 'cargo.exe' : 'cargo'))) {
  console.warn('需要 Rust stable 与 Windows C++ Build Tools；详见 docs/desktop.md。');
}
const cli = path.join(root, 'node_modules/@tauri-apps/cli/tauri.js');
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], { cwd: root, env, stdio: 'inherit' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
