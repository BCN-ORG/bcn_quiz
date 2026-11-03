import path from 'node:path';
import { expect, test } from '@playwright/test';
import { pickCourse } from './helpers';

// Baseline: chọn file → nộp → thấy trạng thái "Chờ duyệt" và tên file.
test('project: chọn PDF và nộp bài thấy trạng thái chờ duyệt', async ({ page, request }) => {
  const { courseId } = await pickCourse(request, 0, { withoutSubmission: true });
  await page.goto(`/courses/${courseId}`);
  await expect(page.getByRole('heading', { name: 'Project cuối khóa' })).toBeVisible();

  await page.locator('input[type=file]').setInputFiles(path.join(__dirname, 'fixtures/sample.pdf'));
  await page.getByRole('button', { name: /Nộp project|Cập nhật bài nộp|Nộp lại project/ }).click();
  await expect(page.getByText('Chờ duyệt').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'sample.pdf' })).toBeVisible();
});
