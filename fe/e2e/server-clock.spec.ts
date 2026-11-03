import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { abandonOpenSession, pickCourse } from './helpers';

// Chủ đề E2E không có hạn đóng nên ta chỉ đổi `endsAt` trong phản hồi của chính chủ đề đó
// (và lệch đồng hồ server qua header Date) để kiểm chứng logic phía giao diện.
async function skewServer(page: Page, topicId: string, opts: { skewMs: number; endsInMs: number; dropDate?: boolean; rawDate?: string }) {
  const serverNow = () => Date.now() + opts.skewMs;
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/notifications')) { await route.abort(); return; }
    const response = await route.fetch();
    const headers = { ...response.headers() };
    delete headers['content-length'];
    if (opts.dropDate) delete headers.date;
    else if (opts.rawDate !== undefined) headers.date = opts.rawDate;
    else headers.date = new Date(serverNow()).toUTCString();
    if (new URL(url).pathname.endsWith(`/api/topic/${topicId}`) && route.request().method() === 'GET') {
      const json = await response.json();
      json.data.endsAt = new Date(serverNow() + opts.endsInMs).toISOString();
      await route.fulfill({ response, json, headers });
      return;
    }
    await route.fulfill({ response, headers });
  });
}

test('đồng hồ: trình duyệt đọc được header Date của API thật (CORS exposedHeaders)', async ({ page }) => {
  await page.goto('/dashboard');
  const date = await page.evaluate(async () => (await fetch('http://localhost:3001/api/auth/me', { credentials: 'include' })).headers.get('date'));
  expect(date).toBeTruthy();
  expect(Number.isNaN(Date.parse(date!))).toBe(false);
});

test('đồng hồ: đếm ngược theo giờ server dù đồng hồ máy lệch 2 giờ, và chủ đề không có hạn thì không hiện', async ({ page }) => {
  const { courseId, topicId } = await pickCourse(page.request, 11);
  await abandonOpenSession(page.request, topicId);
  await page.goto(`/topics/${topicId}?courseId=${courseId}`);
  await expect(page.getByRole('button', { name: /Bắt đầu làm bài/ })).toBeVisible();
  await expect(page.locator('.topic-clock')).toHaveCount(0);

  // Máy lệch 2 giờ so với server: nếu dùng đồng hồ máy sẽ ra khoảng 02:30:00 thay vì 00:30:00.
  await skewServer(page, topicId, { skewMs: 2 * 3600_000, endsInMs: 30 * 60_000 + 500 });
  await page.reload();
  await expect(page.locator('.topic-clock')).toContainText(/Còn 00:(29|30):\d\d/);
  await expect(page.locator('.topic-clock')).not.toHaveClass(/is-warning/);

  await page.getByRole('button', { name: /Bắt đầu làm bài/ }).click();
  await expect(page.getByRole('radiogroup')).toBeVisible();
  await expect(page.locator('.topic-clock')).toContainText(/Còn 00:(29|30):\d\d/);
});

test('đồng hồ: dưới 5 phút đổi sang cảnh báo và thông báo một lần cho trình đọc màn hình', async ({ page }) => {
  const { courseId, topicId } = await pickCourse(page.request, 12);
  await skewServer(page, topicId, { skewMs: -90 * 60_000, endsInMs: 4 * 60_000 + 50_000 });
  await page.goto(`/topics/${topicId}?courseId=${courseId}`);
  await expect(page.locator('.topic-clock.is-warning')).toContainText(/Còn 00:0[34]:\d\d/);
  await expect(page.locator('.topic-clock-announce')).toHaveText('Còn dưới 5 phút');
  await expect(page.locator('.topic-clock-announce')).toHaveAttribute('aria-live', 'polite');
});

test('đồng hồ: về 0 hiện "Hết giờ" và không tự nộp bài', async ({ page }) => {
  const { courseId, topicId } = await pickCourse(page.request, 13);
  await abandonOpenSession(page.request, topicId);
  let submits = 0;
  page.on('request', (req) => { if (req.url().endsWith('/submit')) submits += 1; });
  await skewServer(page, topicId, { skewMs: 3600_000, endsInMs: 3_000 });
  await page.goto(`/topics/${topicId}?courseId=${courseId}`);
  await page.getByRole('button', { name: /Bắt đầu làm bài/ }).click();
  await expect(page.locator('.topic-clock')).toContainText('Hết giờ', { timeout: 10_000 });
  await expect(page.locator('.topic-clock-announce')).toHaveText('Đã hết giờ làm bài');
  await page.waitForTimeout(500);
  expect(submits).toBe(0);
});

test('đồng hồ: thiếu header Date thì dùng đồng hồ máy, không hiện NaN', async ({ page }) => {
  const { courseId, topicId } = await pickCourse(page.request, 14);
  await skewServer(page, topicId, { skewMs: 0, endsInMs: 3 * 60_000 + 500, dropDate: true });
  await page.goto(`/topics/${topicId}?courseId=${courseId}`);
  await expect(page.locator('.topic-clock')).toContainText(/Còn 00:0[23]:\d\d/);
  await expect(page.locator('.topic-clock')).not.toContainText('NaN');
});

test('đồng hồ: header Date sai định dạng ("1", "12") bị bỏ qua thay vì lệch hàng chục năm', async ({ page }) => {
  const { courseId, topicId } = await pickCourse(page.request, 14);
  // Date đúng định dạng nhưng lệch quá xa (proxy sai hoặc bị làm giả) cũng bị bỏ qua: giới hạn độ lệch 24 giờ.
  const yearAhead = new Date(Date.now() + 365 * 24 * 3600_000).toUTCString();
  for (const rawDate of ['1', '12', 'tomorrow', 'Thu, 01 Jan 1970 00:00:00 GMT', yearAhead]) {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await skewServer(page, topicId, { skewMs: 0, endsInMs: 3 * 60_000 + 500, rawDate });
    await page.goto(`/topics/${topicId}?courseId=${courseId}`);
    await expect(page.locator('.topic-clock')).toContainText(/Còn 00:0[23]:\d\d/);
  }
});
