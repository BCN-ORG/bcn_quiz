import { chromium } from '@playwright/test';

// Đăng nhập qua Profiles thật mỗi lần chạy để cookie không hết hạn giữa chừng.
// Chạy local, Profiles và Quiz cùng đặt cookie access_token/refresh_token trên host localhost nên đôi khi ghi đè nhau; thử lại tối đa 3 lần.
export default async function globalSetup() {
  for (let attempt = 1; ; attempt += 1) {
    try { await login(); return; } catch (error) { if (attempt >= 3) throw error; }
  }
}

async function login() {
  const { E2E_EMAIL, E2E_PASSWORD, E2E_AUTH_STATE } = process.env;
  if (!E2E_EMAIL || !E2E_PASSWORD || !E2E_AUTH_STATE) throw new Error('Thiếu E2E_EMAIL / E2E_PASSWORD / E2E_AUTH_STATE');
  const browser = await chromium.launch();
  try {
    await loginIn(browser, E2E_EMAIL, E2E_PASSWORD, E2E_AUTH_STATE);
  } finally {
    await browser.close();
  }
}

async function loginIn(browser: Awaited<ReturnType<typeof chromium.launch>>, email: string, password: string, statePath: string) {
  const page = await browser.newPage();
  await page.goto('http://localhost:3001/api/auth/login', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', password);
  const loggedIn = page.waitForResponse((res) => res.url().includes('/api/auth/login') && res.request().method() === 'POST', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Đăng nhập và tiếp tục' }).click();
  await loggedIn;
  // Profiles đã có phiên: đi lại luồng OAuth của Quiz để nhận cookie của Quiz.
  await page.goto('http://localhost:3001/api/auth/login', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForURL(/localhost:5173/, { timeout: 60_000 });
  // Chờ dashboard ổn định: FE có thể làm mới token khi tải, nên chỉ lưu state sau đó.
  await page.waitForLoadState('networkidle', { timeout: 30_000 });
  await page.getByRole('link', { name: 'Khóa học' }).first().waitFor({ timeout: 30_000 });
  await page.context().storageState({ path: statePath });
}
