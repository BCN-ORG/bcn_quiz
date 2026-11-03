import path from 'node:path';
import type { Route } from '@playwright/test';
import { expect, test } from './fixtures';
import { clearSubmission, pickCourse } from './helpers';

const PDF = path.join(__dirname, 'fixtures/sample.pdf');

// Bấm link nội bộ (sidebar) khi còn file chưa nộp hoặc đang tải lên phải hỏi lại, chọn ở lại thì không rời trang.
test('project: rời trang bằng link nội bộ bị hỏi khi có file chưa nộp và khi đang tải lên', async ({ page }) => {
  const { courseId } = await pickCourse(page.request, 0, { withoutSubmission: true });
  const courseUrl = new RegExp(`/courses/${courseId}$`);
  try {
    await page.goto(`/courses/${courseId}`);
    await expect(page.getByRole('heading', { name: 'Project cuối khóa' })).toBeVisible();

    const messages: string[] = [];
    let accept = false;
    page.on('dialog', (dialog) => {
      if (dialog.type() !== 'confirm') { void dialog.dismiss(); return; }
      messages.push(dialog.message());
      void (accept ? dialog.accept() : dialog.dismiss());
    });

    await page.locator('input[type=file]').setInputFiles(PDF);
    await page.getByRole('link', { name: 'Tổng quan' }).click();
    await expect.poll(() => messages.length).toBe(1);
    expect(messages[0]).toContain('chưa nộp');
    await expect(page).toHaveURL(courseUrl);

    let held: Route | undefined;
    await page.route((url) => url.port === '9010', (route) => { if (['PUT', 'POST'].includes(route.request().method())) held = route; else void route.continue(); });
    await page.getByRole('button', { name: 'Nộp project' }).click();
    await expect.poll(() => Boolean(held)).toBe(true);
    await page.getByRole('link', { name: 'Tổng quan' }).click();
    await expect.poll(() => messages.length).toBe(2);
    expect(messages[1]).toContain('đang được tải lên');
    await expect(page).toHaveURL(courseUrl);

    accept = true;
    await page.getByRole('link', { name: 'Tổng quan' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    void held?.abort();
  } finally {
    await clearSubmission(page.request, courseId);
  }
});
