/**
 * [INPUT]: 依赖 Playwright、桌面生产前端和测试 IPC。
 * [OUTPUT]: 配置独立端口的桌面更新界面回归。
 * [POS]: 桌面前端测试入口；原生安装由独立 QA 验证。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {defineConfig, devices} from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'desktop-updates.spec.ts',
  outputDir: 'test-results/updates',
  timeout: 30000,
  workers: 1,
  use: {baseURL:'http://127.0.0.1:4175', viewport:{width:1440,height:920}, trace:'retain-on-failure'},
  projects: [{name:'desktop-updates', use:{...devices['Desktop Chrome'], channel:'msedge'}}],
  webServer: {
    command:'npx vite preview --mode desktop --host 127.0.0.1 --port 4175 --strictPort',
    url:'http://127.0.0.1:4175',
    reuseExistingServer: false,
  },
});
