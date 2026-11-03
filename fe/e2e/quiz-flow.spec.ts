import { expect, test } from './fixtures';
import { abandonOpenSession, pickCourse } from './helpers';

// Baseline: làm bài → tự lưu → tải lại vẫn còn → nộp → xem kết quả.
test('quiz: chọn đáp án, tải lại vẫn còn, nộp bài ra kết quả', async ({ page }) => {
  const { courseId, topicId } = await pickCourse(page.request, 0);
  await abandonOpenSession(page.request, topicId);

  await page.goto(`/topics/${topicId}?courseId=${courseId}`);
  await page.getByRole('button', { name: /Bắt đầu làm bài/ }).click();
  await expect(page.getByText(/Câu 1 \/ 2/).first()).toBeVisible();

  const saved = page.waitForResponse((res) => res.url().includes('/attempt/session/') && res.url().endsWith('/save'));
  await page.locator('.answer').first().click();
  expect((await saved).ok()).toBeTruthy();
  await expect(page.locator('.answer.selected')).toHaveCount(1);

  await page.reload();
  await expect(page.locator('.answer.selected')).toHaveCount(1);
  await expect(page.locator('.question-map button.answered')).toHaveCount(1);

  await page.getByRole('button', { name: 'Câu tiếp' }).click();
  await page.locator('.answer').nth(1).click();
  await page.getByRole('button', { name: /Nộp bài/ }).first().click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Nộp bài' }).click();
  await expect(page.getByText('Kết quả').first()).toBeVisible();
  await expect(page.getByText(/Đúng \d+\/2 câu/)).toBeVisible();
});
