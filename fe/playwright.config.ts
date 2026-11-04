import { defineConfig } from '@playwright/test';

// Chạy trên stack local thật (Profiles :3000/:3002, Quiz BE :3001, Quiz FE :5173).
// E2E_EMAIL / E2E_PASSWORD / E2E_AUTH_STATE đến từ môi trường, không lưu trong repo.
// Backend giới hạn 100 request/phút mỗi IP. Bộ test đầy đủ vượt ngưỡng đó, nên chạy theo hai lượt cách nhau hơn 1 phút,
// ví dụ: `playwright test e2e/a* e2e/e* e2e/l* e2e/p*` rồi `playwright test e2e/q* e2e/s* e2e/t* e2e/u*` (các file theo chữ cái đầu).
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
