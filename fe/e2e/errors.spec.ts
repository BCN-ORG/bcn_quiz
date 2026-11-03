import { expect, test } from './fixtures';
import { pickCourse } from './helpers';

test('lỗi giới hạn tốc độ và mất mạng hiện thông báo tiếng Việt kèm cách xử lý', async ({ page }) => {
  const { courseId, topicId } = await pickCourse(page.request, 0);
  const url = `/topics/${topicId}?courseId=${courseId}`;

  await page.route('**/api/topic/*', (route) => route.fulfill({
    status: 429, contentType: 'application/json', body: JSON.stringify({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' }),
  }));
  await page.goto(url);
  await expect(page.getByText('Bạn thao tác quá nhanh. Hãy chờ vài giây rồi thử lại.')).toBeVisible();
  await expect(page.getByText('ThrottlerException')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible();

  await page.unroute('**/api/topic/*');
  await page.route('**/api/topic/*', (route) => route.abort('failed'));
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await expect(page.getByText('Mất kết nối mạng. Kiểm tra kết nối rồi thử lại.')).toBeVisible();
  await expect(page.getByText('Failed to fetch')).toHaveCount(0);

  await page.unroute('**/api/topic/*');
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await expect(page.getByRole('button', { name: /Bắt đầu làm bài/ })).toBeVisible();
});
