import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { abandonOpenSession, pickCourse } from './helpers';

async function startQuiz(page: Page, index: number) {
  const { courseId, topicId } = await pickCourse(page.request, index);
  await abandonOpenSession(page.request, topicId);
  await page.goto(`/topics/${topicId}?courseId=${courseId}`);
  await page.getByRole('button', { name: /Bắt đầu làm bài/ }).click();
  await expect(page.getByRole('radiogroup')).toBeVisible();
  return topicId;
}

test('quiz: radiogroup, phím tắt, đánh dấu xem lại và trạng thái câu không chỉ dựa vào màu', async ({ page }) => {
  await startQuiz(page, 4);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  expect(await page.getByRole('radio').count()).toBeGreaterThanOrEqual(2);

  const saved = page.waitForResponse((res) => res.url().endsWith('/save'));
  await page.keyboard.press('b');
  expect((await saved).ok()).toBeTruthy();
  await expect(page.getByRole('radio', { name: /^B/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('status')).toContainText('Đã lưu');

  await page.getByRole('button', { name: 'Đánh dấu xem lại' }).click();
  const first = page.getByRole('button', { name: /^Câu 1:/ });
  await expect(first).toHaveAttribute('aria-label', /đã làm, đánh dấu xem lại, đang xem/);
  await expect(first).toHaveAttribute('aria-current', 'step');
  await page.reload();
  await expect(page.getByRole('button', { name: /^Câu 1:/ })).toHaveAttribute('aria-label', /đánh dấu xem lại/);

  await page.keyboard.press('PageDown');
  await expect(page.getByText(/Câu 2 \/ 2/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Câu 2:/ })).toHaveAttribute('aria-label', /chưa làm/);
});

test('quiz: lỗi lưu hiện cảnh báo, tự thử lại khi có mạng và đáp án còn sau khi tải lại', async ({ page }) => {
  await startQuiz(page, 5);
  await page.route('**/attempt/session/*/save', (route) => route.abort('failed'));
  await page.getByRole('radio').first().click();
  await expect(page.locator('.notice[role=alert]')).toContainText('Chưa lưu được đáp án câu 1');
  await expect(page.getByRole('status')).toContainText('Chưa lưu được đáp án');

  await page.unroute('**/attempt/session/*/save');
  await page.getByRole('button', { name: 'Thử lại ngay' }).click();
  await expect(page.getByRole('status')).toContainText('Đã lưu');
  await expect(page.locator('.notice[role=alert]')).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('radio').first()).toHaveAttribute('aria-checked', 'true');
});

test('quiz: phiên không còn hiệu lực thì báo rõ, không tự mở phiên mới', async ({ page }) => {
  await startQuiz(page, 6);
  let starts = 0;
  page.on('request', (req) => { if (req.url().endsWith('/session/start')) starts += 1; });
  await page.route('**/attempt/session/*/save', (route) => route.fulfill({
    status: 400, contentType: 'application/json', body: JSON.stringify({ statusCode: 400, message: 'Session is not in progress' }),
  }));
  await page.getByRole('radio').first().click();
  await expect(page.locator('.notice[role=alert]')).toContainText('Phiên làm bài này không còn hiệu lực');
  await page.waitForTimeout(500);
  expect(starts).toBe(0);
});

test('quiz mobile 375px: bảng câu hỏi gọn một hàng, câu hỏi nằm trên màn đầu, không cuộn ngang', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await startQuiz(page, 7);
  const nav = await page.locator('.quiz-nav').boundingBox();
  const question = await page.locator('#question-text').boundingBox();
  expect(nav!.height).toBeLessThan(110); // dải câu hỏi + chú giải một dòng; trước khi gọn lại cao khoảng 190px
  expect(question!.y).toBeLessThan(560);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const target = await page.getByRole('radio').first().boundingBox();
  expect(target!.height).toBeGreaterThanOrEqual(44);
  expect(target!.y + target!.height).toBeLessThan(812); // đáp án đầu tiên nằm trong màn hình đầu
  await expect(page.getByRole('button', { name: 'Nộp bài' }).last()).toBeVisible();
});

test('quiz: mũi tên đổi đáp án theo radiogroup, PageDown/PageUp đổi câu', async ({ page }) => {
  await startQuiz(page, 8);
  const radios = page.getByRole('radio');
  const count = await radios.count();
  await radios.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(radios.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(radios.nth(2 % count)).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText(/Câu 1 \/ 2/).first()).toBeVisible();

  await expect(radios.nth(1)).toHaveAttribute('tabindex', '0');
  await expect(radios.nth(0)).toHaveAttribute('tabindex', '-1');

  await page.keyboard.press('PageDown');
  await expect(page.getByText(/Câu 2 \/ 2/).first()).toBeVisible();
  await page.keyboard.press('PageUp');
  await expect(page.getByText(/Câu 1 \/ 2/).first()).toBeVisible();
});

test('quiz mobile 375px: chú giải ✓ ⚑ vẫn hiển thị cạnh dải câu hỏi', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await startQuiz(page, 9);
  await expect(page.locator('.map-legend')).toBeVisible();
  await expect(page.locator('.map-legend')).toContainText('đánh dấu xem lại');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
