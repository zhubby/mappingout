/**
 * [INPUT]: 依赖统一工程路径、Rust 工具链与 Tauri CLI。
 * [OUTPUT]: 从工程根执行桌面开发与构建，透传参数和退出码。
 * [POS]: npm 桌面命令入口；显式定位 desktop 与前端根目录。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { projectRoot as root, desktopEnvironment } from '../lib/paths.mjs';

const cargoBin = path.join(process.env.CARGO_HOME || path.join(os.homedir(), '.cargo'), 'bin');
const env = { ...desktopEnvironment(), PATH: `${cargoBin}${path.delimiter}${process.env.PATH || ''}` };
if (!existsSync(path.join(cargoBin, process.platform === 'win32' ? 'cargo.exe' : 'cargo'))) {
  console.warn('需要 Rust stable 与 Windows C++ Build Tools；详见 docs/guides/desktop.md。');
}
const cli = path.join(root, 'node_modules/@tauri-apps/cli/tauri.js');
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], { cwd: root, env, stdio: 'inherit' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
