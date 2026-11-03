import { expect, test } from './fixtures';
import { pickCourse } from './helpers';

test('trạng thái đang tải dùng skeleton có nhãn, rồi nhường chỗ cho nội dung', async ({ page }) => {
  const { courseId, topicId } = await pickCourse(page.request, 10);
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/topic/*', async (route) => {
    if (route.request().url().includes('/session/') || route.request().url().includes('/quizzes')) { await route.continue(); return; }
    await gate;
    await route.continue();
  });
  await page.goto(`/topics/${topicId}?courseId=${courseId}`);

  const loading = page.locator('.skeleton-panel');
  await expect(loading).toBeVisible();
  await expect(loading).toHaveAttribute('role', 'status');
  await expect(loading).toContainText('Đang chuẩn bị bài quiz');
  await expect(loading.locator('.skeleton').first()).toBeVisible();

  release?.();
  await expect(page.getByRole('button', { name: /Bắt đầu làm bài/ })).toBeVisible();
  await expect(page.locator('.skeleton-panel')).toHaveCount(0);
});
