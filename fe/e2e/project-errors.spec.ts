import { expect, test } from './fixtures';
import { pickCourse } from './helpers';

// Lỗi tải danh sách chủ đề không được lẫn vào form nộp bài hay đổi nhãn nút nộp.
test('project: lỗi tải chủ đề hiện ở phần nội dung, nút nộp vẫn là "Nộp project"', async ({ page }) => {
  const { courseId } = await pickCourse(page.request, 0, { withoutSubmission: true });
  await page.route('**/api/course/*/topics*', (route) => route.fulfill({
    status: 429, contentType: 'application/json', body: JSON.stringify({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' }),
  }));
  await page.goto(`/courses/${courseId}`);
  await expect(page.getByRole('heading', { name: 'Project cuối khóa' })).toBeVisible();

  await expect(page.locator('.topic-list ~ .form-error, .section-title ~ .form-error').first()).toContainText('thao tác quá nhanh');
  await expect(page.locator('form .form-error')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Nộp project' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thử lại' })).toHaveCount(0);
});
