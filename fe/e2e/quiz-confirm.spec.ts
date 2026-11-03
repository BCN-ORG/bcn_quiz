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

  // Giữ request nộp bài lại để có khoảng thời gian "đang nộp", rồi thử nộp thêm bằng mọi đường có thể.
  let submits = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/attempt/session/*/submit', async (route) => {
    submits += 1;
    await gate;
    await route.continue();
  });
  await page.getByRole('button', { name: /Nộp bài/ }).first().click();
  await dialog.getByRole('button', { name: 'Nộp bài' }).click();
  await expect.poll(() => submits).toBe(1);
  await expect(dialog).toBeHidden();

  // Trong lúc đang nộp: mọi nút "Nộp bài" bị khóa và ép bấm cũng không tạo thêm request.
  for (const button of await page.getByRole('button', { name: /Nộp bài/ }).all()) {
    await expect(button).toBeDisabled();
    await button.click({ force: true, noWaitAfter: true }).catch(() => {});
  }
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  expect(submits).toBe(1);

  release?.();
  await expect(page.getByText('Kết quả').first()).toBeVisible();
  expect(submits).toBe(1);
});
