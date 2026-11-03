// Đăng nhập qua Profiles thật và lưu cookie vào E2E_AUTH_STATE.
import { chromium } from '@playwright/test';

const { E2E_EMAIL, E2E_PASSWORD, E2E_AUTH_STATE } = process.env;
if (!E2E_EMAIL || !E2E_PASSWORD || !E2E_AUTH_STATE) throw new Error('Thiếu E2E_EMAIL / E2E_PASSWORD / E2E_AUTH_STATE');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:3001/api/auth/login', { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
await page.fill('input[type=email]', E2E_EMAIL);
await page.fill('input[type=password]', E2E_PASSWORD);
await page.getByRole('button', { name: 'Đăng nhập và tiếp tục' }).click();
await page.waitForResponse((r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST', { timeout: 30_000 });
// Profiles đã có phiên: đi lại luồng OAuth của Quiz để nhận cookie của Quiz.
await page.goto('http://localhost:3001/api/auth/login', { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForURL(/localhost:5173/, { timeout: 60_000 });
console.log('landed:', page.url().split('?')[0]);
await page.context().storageState({ path: E2E_AUTH_STATE });
await browser.close();
