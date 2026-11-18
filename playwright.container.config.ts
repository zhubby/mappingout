/**
 * [INPUT]: 依赖已启动的容器 HTTP 服务和 Playwright Chromium。
 * [OUTPUT]: 配置角色、备份、离线与容器重建验收。
 * [POS]: 容器独立验收入口；不启动 Vite 或替代 HTTP 服务。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: ['app.spec.ts', 'features.spec.ts', 'container.spec.ts'],
  timeout: 120000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.MAPPINGOUT_CONTAINER_URL || 'http://127.0.0.1:8080',
    trace: 'retain-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
