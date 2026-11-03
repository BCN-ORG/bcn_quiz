import type { Route } from '@playwright/test';
import { expect, test } from './fixtures';
import { abandonOpenSession, pickCourse } from './helpers';

// Hai lần chọn liên tiếp trên cùng một câu không được làm đáp án cũ ghi đè đáp án mới trên server.
test('quiz: chọn A rồi B nhanh trên cùng một câu thì server giữ B sau khi tải lại', async ({ page }) => {
  const { courseId, topicId } = await pickCourse(page.request, 2);
  await abandonOpenSession(page.request, topicId);
  await page.goto(`/topics/${topicId}?courseId=${courseId}`);
  await page.getByRole('button', { name: /Bắt đầu làm bài/ }).click();
  await expect(page.getByRole('radiogroup')).toBeVisible();

  let first: Route | undefined;
  await page.route('**/attempt/session/*/save', (route) => {
    if (!first) first = route;
    else void route.continue();
  });
  const radios = page.getByRole('radio');
  const labelA = (await radios.nth(0).innerText()).trim();
  const labelB = (await radios.nth(1).innerText()).trim();
  await radios.nth(0).click();
  await expect.poll(() => Boolean(first)).toBe(true);
  await radios.nth(1).click();
  await page.waitForTimeout(400);
  await first!.continue();

  await expect(page.getByRole('status')).toContainText('Đã lưu');
  await page.unroute('**/attempt/session/*/save');
  await page.reload();
  const checked = page.getByRole('radio', { checked: true });
  await expect(checked).toHaveCount(1);
  expect((await checked.innerText()).trim()).toBe(labelB);
  expect(labelA).not.toBe(labelB);
});

// Kết quả của lần lưu thuộc phiên cũ không được rò sang phiên mới sau khi làm lại.
test('quiz: lần lưu còn bay của phiên cũ không làm hỏng phiên mới sau "Làm lại"', async ({ page }) => {
  const { courseId, topicId } = await pickCourse(page.request, 3);
  await abandonOpenSession(page.request, topicId);
  await page.goto(`/topics/${topicId}?courseId=${courseId}`);
  await page.getByRole('button', { name: /Bắt đầu làm bài/ }).click();
  await expect(page.getByRole('radiogroup')).toBeVisible();

  let held: Route | undefined;
  const bodies: string[] = [];
  await page.route('**/attempt/session/*/save', (route) => {
    bodies.push(route.request().postData() ?? '');
    if (!held) held = route;
    else void route.continue();
  });
  await page.getByRole('radio').first().click();
  await expect.poll(() => Boolean(held)).toBe(true);

  await page.getByRole('button', { name: 'Bỏ bài dở & làm lại' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Làm lại từ đầu' }).click();
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(0);

  await held!.continue();
  await page.waitForTimeout(800);
  await expect(page.locator('.notice[role=alert]')).toHaveCount(0);
  expect(bodies.every((body) => body.includes('selectedAnswer'))).toBe(true);
  expect(bodies).toHaveLength(1);
});
