import { expect, test } from './fixtures';
import { abandonOpenSession, pickCourse } from './helpers';

test('quiz: màn xác nhận nộp nêu số câu chưa làm, ưu tiên quay lại, chống bấm đúp', async ({ page }) => {
  const { courseId, topicId } = await pickCourse(page.request, 3);
  await abandonOpenSession(page.request, topicId);
  await page.goto(`/topics/${topicId}?courseId=${courseId}`);
  await page.getByRole('button', { name: /Bắt đầu làm bài/ }).click();
  await page.locator('.answer').first().click();

  await page.getByRole('button', { name: /Nộp bài/ }).first().click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Còn 1 câu chưa làm');
  const back = dialog.getByRole('button', { name: 'Quay lại làm tiếp' });
  await expect(back).toBeFocused();
  await expect(back).not.toHaveClass(/secondary/);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/Câu 1 \/ 2/).first()).toBeVisible();

  let submits = 0;
  page.on('request', (req) => { if (req.method() === 'POST' && req.url().endsWith('/submit')) submits += 1; });
  await page.getByRole('button', { name: /Nộp bài/ }).first().click();
  await dialog.getByRole('button', { name: 'Nộp bài' }).dblclick();
  await expect(page.getByText('Kết quả').first()).toBeVisible();
  expect(submits).toBe(1);
});
