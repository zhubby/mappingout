/**
 * [INPUT]: 依赖生产 Web 构建和 Edge 浏览器。
 * [OUTPUT]: 配置地图、任务、技能、双语、加载进度与菜单回归。
 * [POS]: 网页验收入口；桌面 IPC 与 Workers 使用独立配置。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ testDir: './e2e', testMatch: ['app.spec.ts','features.spec.ts','i18n.spec.ts','loading.spec.ts','dropdowns.spec.ts','quests.spec.ts','skills.spec.ts'], timeout: 30000, fullyParallel: false, workers: 1, use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' }, projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'msedge' } }], webServer: { command: 'npm run preview -- --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI } });
