import { defineConfig } from '@playwright/test';

// Chạy trên stack local thật (Profiles :3000/:3002, Quiz BE :3001, Quiz FE :5173).
// E2E_EMAIL / E2E_PASSWORD / E2E_AUTH_STATE đến từ môi trường, không lưu trong repo.
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  workers: 1,
  globalSetup: './e2e/global-setup.ts',
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    storageState: process.env.E2E_AUTH_STATE,
    screenshot: 'only-on-failure',
  },
});
