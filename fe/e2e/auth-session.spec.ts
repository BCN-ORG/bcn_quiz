import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Cookie `quiz_access_token` có Max-Age = expires_in (15 phút) nên trình duyệt xoá nó khi hết hạn; refresh token sống 30 ngày.
// Các test giả lập "15 phút đã trôi qua" bằng cách xoá đúng cookie đó, trên Profiles + Quiz thật (xoay refresh token và phát hiện dùng lại là thật).
const ACCESS = 'quiz_access_token';
const REFRESH = 'quiz_refresh_token';

const signedIn = (page: Page) => page.locator('.user-compact');
const pathOf = (page: Page) => new URL(page.url()).pathname;
const cookieNames = async (context: BrowserContext) => (await context.cookies()).map((cookie) => cookie.name);
const returnToTab = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

async function openDashboard(page: Page) {
  await page.goto('/dashboard');
  await expect(signedIn(page)).toBeVisible();
}

test('quay lại tab sau khi access token hết hạn: tự làm mới, không bị đưa ra màn hình đăng nhập', async ({ page }) => {
  await openDashboard(page);
  await page.context().clearCookies({ name: ACCESS });

  await returnToTab(page);

  await expect(signedIn(page)).toBeVisible();
  await expect.poll(async () => cookieNames(page.context())).toContain(ACCESS);
  expect(pathOf(page)).toBe('/dashboard');
});

test('tải lại trang sau khi access token hết hạn: vẫn đăng nhập', async ({ page }) => {
  await openDashboard(page);
  await page.context().clearCookies({ name: ACCESS });

  await page.reload();

  await expect(signedIn(page)).toBeVisible();
  expect(pathOf(page)).toBe('/dashboard');
});

test('hai tab cùng quay lại một lúc: chỉ một lần làm mới, cả hai vẫn đăng nhập (Profiles thu hồi phiên nếu dùng lại refresh token)', async ({ page, context }) => {
  const second = await context.newPage();
  await second.route('**/api/notifications**', (route) => route.abort());
  await openDashboard(page);
  await openDashboard(second);
  await context.clearCookies({ name: ACCESS });

  let refreshCalls = 0;
  context.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith('/auth/refresh')) refreshCalls += 1; });
  await Promise.all([returnToTab(page), returnToTab(second)]);

  await expect(signedIn(page)).toBeVisible();
  await expect(signedIn(second)).toBeVisible();
  await expect.poll(async () => cookieNames(context)).toContain(ACCESS);
  await page.waitForTimeout(500);
  expect(refreshCalls).toBe(1);
  expect(pathOf(page)).toBe('/dashboard');
  expect(pathOf(second)).toBe('/dashboard');

  // phiên còn sống thật: gọi API được bảo vệ vẫn thành công sau khi xoay token
  const me = await page.request.get('http://localhost:3001/api/auth/me');
  expect(me.status()).toBe(200);
  await second.close();
});

test('lỗi mạng hay lỗi máy chủ thoáng qua khi quay lại tab không làm mất phiên', async ({ page }) => {
  await openDashboard(page);
  for (const failure of ['abort', '500', '429'] as const) {
    await page.route('**/api/auth/me', (route) => failure === 'abort'
      ? route.abort()
      : route.fulfill({ status: Number(failure), contentType: 'application/json', body: JSON.stringify({ statusCode: Number(failure), message: 'transient' }) }));
    await returnToTab(page);
    await page.waitForTimeout(700);
    await expect(signedIn(page), failure).toBeVisible();
    expect(pathOf(page), failure).toBe('/dashboard');
    await page.unroute('**/api/auth/me');
  }
});

test('hết cả access lẫn refresh token: đăng xuất đúng cách, không lặp vô hạn', async ({ browser }) => {
  // context riêng, không lưu lại state: không được làm hỏng phiên dùng chung của các test khác
  const context = await browser.newContext({ storageState: process.env.E2E_AUTH_STATE });
  const page = await context.newPage();
  await page.route('**/api/notifications**', (route) => route.abort());
  let refreshCalls = 0;
  context.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith('/auth/refresh')) refreshCalls += 1; });
  await context.clearCookies({ name: ACCESS });
  await context.clearCookies({ name: REFRESH });

  await page.goto('/dashboard');

  await expect(page.getByRole('button', { name: /Tiếp tục với tài khoản BCN/ }).or(page.getByRole('link', { name: /Tiếp tục với tài khoản BCN/ }))).toBeVisible();
  expect(pathOf(page)).toBe('/');
  await page.waitForTimeout(1000);
  expect(refreshCalls).toBeLessThanOrEqual(2);
  await context.close();
});
