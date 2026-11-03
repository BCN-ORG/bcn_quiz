import path from 'node:path';
import { expect, test } from './fixtures';
import { clearSubmission, pickCourse } from './helpers';

// Baseline: chọn file → nộp → thấy trạng thái "Chờ duyệt" và tên file.
test('project: chọn PDF và nộp bài thấy trạng thái chờ duyệt', async ({ page }) => {
  const { courseId } = await pickCourse(page.request, 0, { withoutSubmission: true });
  try {
    await page.goto(`/courses/${courseId}`);
    await expect(page.getByRole('heading', { name: 'Project cuối khóa' })).toBeVisible();

    await page.locator('input[type=file]').setInputFiles(path.join(__dirname, 'fixtures/sample.pdf'));
    const storageRequest = page.waitForRequest((req) => new URL(req.url()).port === '9010');
    await page.getByRole('button', { name: /Nộp project|Cập nhật bài nộp|Nộp lại project/ }).click();
    await expect(page.getByText('Chờ duyệt').first()).toBeVisible({ timeout: 30_000 });
    expect((await storageRequest).method()).toBe('POST'); // tải lên bằng presigned POST do MinIO thực thi chính sách
    await expect(page.getByRole('link', { name: 'sample.pdf' })).toBeVisible();
  } finally {
    await clearSubmission(page.request, courseId);
  }
});
