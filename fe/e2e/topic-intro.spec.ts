import { expect, test } from './fixtures';
import { abandonOpenSession, pickCourse } from './helpers';

// Trang giới thiệu chủ đề (trước khi bắt đầu làm bài) trên dữ liệu thật.
test('trang chủ đề: hero, 3 chỉ số, cách tính điểm và nút bắt đầu rõ ràng', async ({ page }) => {
  const { courseId, topicId } = await pickCourse(page.request, 0);
  await abandonOpenSession(page.request, topicId);
  await page.goto(`/topics/${topicId}?courseId=${courseId}`);

  const hero = page.locator('.topic-hero');
  await expect(hero.getByRole('heading', { level: 1 })).not.toBeEmpty();
  const stats = page.locator('.topic-stats > div');
  await expect(stats).toHaveCount(3);
  await expect(stats.nth(0)).toContainText('Số câu hỏi');
  await expect(stats.nth(1)).toContainText('Điểm tối đa');
  await expect(stats.nth(2)).toContainText('Mỗi câu đúng');
  await expect(page.getByRole('heading', { name: 'Cách tính điểm' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Bắt đầu làm bài/ })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Về khóa học' })).toHaveAttribute('href', `/courses/${courseId}`);
  await expect(page.getByRole('link', { name: 'Xem bảng xếp hạng' })).toHaveAttribute('href', new RegExp(`/topics/${topicId}/leaderboard`));
});

for (const width of [320, 375, 768]) {
  test(`trang chủ đề ${width}px: không cuộn ngang, nút bắt đầu thấy được`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const { courseId, topicId } = await pickCourse(page.request, 0);
    await abandonOpenSession(page.request, topicId);
    await page.goto(`/topics/${topicId}?courseId=${courseId}`);
    const start = page.getByRole('button', { name: /Bắt đầu làm bài/ });
    await expect(start).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const box = await start.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  });
}
