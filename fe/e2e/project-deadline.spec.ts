import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { clearSubmission, pickCourse } from './helpers';

const PDF = path.join(__dirname, 'fixtures/sample.pdf');

// Khóa học E2E chưa có hạn nộp, nên ta gắn `dueAt` vào đúng phản hồi của đề bài để kiểm chứng giao diện.
// Việc nộp bài vẫn đi qua backend thật (backend không biết hạn này, đúng với quy tắc "không chặn nộp muộn").
async function withDueAt(page: Page, dueAt: Date | null) {
  await page.route(/\/api\/course\/[^/]+\/project-requirement$/, async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.data.dueAt = dueAt ? dueAt.toISOString() : null;
    const headers = { ...response.headers() };
    delete headers['content-length'];
    await route.fulfill({ response, json, headers });
  });
}

const open = async (page: Page, courseId: string) => {
  await page.goto(`/courses/${courseId}`);
  await expect(page.getByRole('heading', { name: 'Project cuối khóa' })).toBeVisible();
};

test('hạn nộp: còn thời gian thì hiện giờ hạn và thời gian còn lại', async ({ page }) => {
  const { courseId } = await pickCourse(page.request, 0, { withoutSubmission: true });
  await withDueAt(page, new Date(Date.now() + (2 * 60 + 10) * 60_000 + 30_000));
  await open(page, courseId);
  const due = page.locator('.project-due');
  await expect(due).toContainText('Hạn nộp:');
  await expect(due).toContainText(/còn 2 giờ (9|10) phút/);
  await expect(due).not.toHaveClass(/is-overdue/);
});

test('hạn nộp: quá hạn vẫn cho nộp và nói rõ sẽ gắn nhãn "Nộp muộn"', async ({ page }) => {
  const { courseId } = await pickCourse(page.request, 0, { withoutSubmission: true });
  await withDueAt(page, new Date(Date.now() - (3 * 60 + 5) * 60_000 - 30_000));
  await open(page, courseId);
  const due = page.locator('.project-due');
  await expect(due).toContainText(/Đã quá hạn 3 giờ [56] phút/);
  await expect(due).toHaveClass(/is-overdue/);
  await expect(due).toContainText('Nộp muộn');
  await expect(page.getByRole('button', { name: 'Nộp project' })).toBeEnabled();
});

test('hạn nộp: không có hạn thì không hiện khối hạn nộp', async ({ page }) => {
  const { courseId } = await pickCourse(page.request, 0, { withoutSubmission: true });
  await withDueAt(page, null);
  await open(page, courseId);
  await expect(page.locator('.project-due')).toHaveCount(0);
});

test('hạn nộp: nộp sau hạn được backend nhận và có nhãn "Nộp muộn"; nộp đúng hạn thì không', async ({ page }) => {
  const { courseId } = await pickCourse(page.request, 0, { withoutSubmission: true });
  try {
    await withDueAt(page, new Date(Date.now() - 60 * 60_000));
    await open(page, courseId);
    await page.locator('input[type=file]').setInputFiles(PDF);
    const created = page.waitForResponse((res) => res.url().endsWith('/project-submission') && res.request().method() === 'POST');
    await page.getByRole('button', { name: 'Nộp project' }).click();
    expect((await created).status()).toBeLessThan(300);
    await expect(page.locator('.status-late')).toHaveText('Nộp muộn');
    await expect(page.getByText('Chờ duyệt').first()).toBeVisible();

    await page.unroute(/\/api\/course\/[^/]+\/project-requirement$/);
    await withDueAt(page, new Date(Date.now() + 24 * 60 * 60_000));
    await page.reload();
    await expect(page.getByText('Chờ duyệt').first()).toBeVisible();
    await expect(page.locator('.status-late')).toHaveCount(0);
  } finally {
    await clearSubmission(page.request, courseId);
  }
});
