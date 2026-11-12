import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig(base, {
  testMatch: ['app.spec.ts', 'worker.spec.ts'],
  use: { baseURL: 'http://127.0.0.1:8787' },
  webServer: {
    command: 'npm run preview:worker',
    url: 'http://127.0.0.1:8787',
    reuseExistingServer: false,
    timeout: 60000
  }
});
