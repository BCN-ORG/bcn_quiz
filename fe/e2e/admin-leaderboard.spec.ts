import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { asMentorInUi, board, myUserId } from './leaderboard-stub';

// Giao diện admin dựng bằng dữ liệu giả cùng hình dạng API admin: /auth/me được vá để trang cho phép quản trị (chỉ là cổng UI).
// Quyền thật phía server (member bị 403) nằm ở leaderboard-real.spec.ts và leaderboard-permissions.spec.ts.
const openAdminBoard = async (page: Page, available: boolean) => {
  const me = await myUserId(page);
  // Lookup failed on the server: the names fall back to the plain label and the emails are null, exactly like leaderboard.service.ts.
  const payload = (mode: 'daily' | 'weekly') => {
    const data = board({ total: 3, myRank: null, me, mode, admin: true, profilesAvailable: available, names: available ? { 1: 'Trần Thị An' } : { 1: 'Người dùng', 2: 'Người dùng', 3: 'Người dùng' } });
    if (!available) for (const row of data.items) (row as { email?: string | null }).email = null;
    return data;
  };
  await asMentorInUi(page);
  await page.route(/\/api\/admin\/leaderboards\/topics\/[^/]+\/(daily|weekly)\?/, (route) => {
    const mode = new URL(route.request().url()).pathname.endsWith('/weekly') ? 'weekly' : 'daily';
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ statusCode: 200, message: 'Success', data: payload(mode) }),
    });
  });
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Bảng xếp hạng' }).click();
  const topicSelect = page.getByLabel('Chủ đề');
  await expect(topicSelect.locator('option')).not.toHaveCount(1);
  await topicSelect.selectOption({ index: 1 });
};

test('admin thấy đầy đủ thông tin người dùng: họ tên, email, ID, đúng/tổng, thời gian làm, nộp lúc', async ({ page }) => {
  await openAdminBoard(page, true);
  const table = page.getByRole('table', { name: /đầy đủ thông tin người dùng/ });
  await expect(table).toBeVisible();
  for (const header of ['Hạng', 'Họ tên', 'Email', 'ID thành viên', 'Điểm', 'Đúng / tổng', 'Thời gian làm', 'Nộp lúc']) {
    await expect(table.getByRole('columnheader', { name: header })).toBeVisible();
  }
  const first = table.locator('tbody tr').first();
  await expect(first).toContainText('Trần Thị An');
  await expect(first.getByRole('link', { name: 'nguoi1@example.com' })).toHaveAttribute('href', 'mailto:nguoi1@example.com');
  await expect(first.locator('code')).toHaveText('u1');
  await expect(first).toContainText('10/10');
  await expect(first).toContainText('01:01');
  await expect(first).toContainText(/10:15/); // 03:15Z hiển thị theo giờ Việt Nam
  await expect(page.getByRole('alert').filter({ hasText: 'Chưa lấy được họ tên và email' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Xuất toàn bộ XLSX' })).toBeEnabled();
});

test('admin: Profiles không trả lời thì có cảnh báo rõ, cột tên/email nói "chưa tải được", điểm vẫn đúng', async ({ page }) => {
  await openAdminBoard(page, false);
  const table = page.getByRole('table', { name: /đầy đủ thông tin người dùng/ });
  await expect(table).toBeVisible();
  const warning = page.getByRole('alert').filter({ hasText: 'Chưa lấy được họ tên và email' });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('PROFILES_CLIENT_SECRET');
  await expect(warning).toContainText('Unknown');
  const first = table.locator('tbody tr').first();
  await expect(first).toContainText('Chưa tải được tên');
  await expect(first).toContainText('Chưa tải được');
  await expect(first).toContainText('1.000');
  await expect(page.getByText('ẩn tên')).toHaveCount(0);
});
