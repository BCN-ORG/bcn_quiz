import path from 'node:path';
import { expect, test } from './fixtures';
import { clearSubmission, pickCourse } from './helpers';

const PDF = path.join(__dirname, 'fixtures/sample.pdf');
const EXE = path.join(__dirname, 'fixtures/bad.exe');
const isStorage = (url: URL) => url.port === '9010';

async function openProject(page: import('@playwright/test').Page) {
  const { courseId } = await pickCourse(page.request, 0, { withoutSubmission: true });
  await page.goto(`/courses/${courseId}`);
  await expect(page.getByRole('heading', { name: 'Project cuối khóa' })).toBeVisible();
  return courseId;
}

test('project: quy định nộp và trạng thái "Chưa nộp" hiện trước khi nộp; file sai bị chặn ngay với lý do cụ thể', async ({ page }) => {
  await openProject(page);
  await expect(page.getByText('Chưa nộp').first()).toBeVisible();
  await expect(page.getByText(/tối đa 5 file · mỗi file không quá 20 MB/)).toBeVisible();

  await page.getByRole('button', { name: 'Nộp project' }).click();
  await expect(page.locator('.form-error[role=alert]')).toContainText('Chọn ít nhất một file');

  const input = page.locator('input[type=file]');
  await input.setInputFiles(EXE);
  await expect(page.locator('.field .form-error')).toContainText('"bad.exe" không đúng định dạng');
  await expect(page.locator('.selected-files')).toHaveCount(0);

  await input.setInputFiles({ name: 'big.zip', mimeType: 'application/zip', buffer: Buffer.alloc(21 * 1024 * 1024) });
  await expect(page.locator('.field .form-error')).toContainText('vượt giới hạn 20 MB');

  await input.setInputFiles(Array.from({ length: 6 }, (_, i) => ({ name: `f${i}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.1 x') })));
  await expect(page.locator('.selected-files li')).toHaveCount(5);
  await expect(page.locator('.field .form-error')).toContainText('Chỉ nộp tối đa 5 file');

  await page.locator('.selected-files li').first().getByRole('button', { name: 'Bỏ file' }).click();
  await expect(page.locator('.selected-files li')).toHaveCount(4);
});

test('project: có tiến trình tải lên, hủy được và giữ file; rời trang bị cảnh báo', async ({ page }) => {
  await openProject(page);
  let held: import('@playwright/test').Route | undefined;
  await page.route(isStorage, (route) => { if (['PUT', 'POST'].includes(route.request().method())) held = route; else void route.continue(); });
  await page.locator('input[type=file]').setInputFiles(PDF);
  await page.getByRole('button', { name: 'Nộp project' }).click();
  await expect(page.getByRole('progressbar', { name: 'Tiến trình tải lên' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hủy tải lên' })).toBeVisible();

  const dialog = page.waitForEvent('dialog');
  void page.close({ runBeforeUnload: true });
  const guard = await dialog;
  expect(guard.type()).toBe('beforeunload');
  await guard.dismiss();

  await page.getByRole('button', { name: 'Hủy tải lên' }).click();
  await expect(page.locator('.form-error[role=alert]')).toContainText('Đã hủy tải lên');
  await expect(page.locator('.selected-files li')).toHaveCount(1);
  void held?.abort();
});

test('project: mất mạng khi tải lên giữ nguyên file, thử lại thành công và hiện xác nhận có giờ nộp', async ({ page }) => {
  const courseId = await openProject(page);
  try {
  await page.route(isStorage, (route) => (['PUT', 'POST'].includes(route.request().method()) ? route.abort('failed') : route.continue()));
  await page.locator('input[type=file]').setInputFiles(PDF);
  await page.getByRole('button', { name: 'Nộp project' }).click();
  await expect(page.locator('.form-error[role=alert]')).toContainText('Không tải được file lên kho lưu trữ');
  await expect(page.locator('.selected-files li')).toHaveCount(1);

  await page.unroute(isStorage);
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await expect(page.locator('.notice-success')).toContainText('Đã nộp bài lúc');
  await expect(page.getByText('Chờ duyệt').first()).toBeVisible();
  await expect(page.getByText(/Lần nộp gần nhất: .*\d{1,2}:\d{2}/)).toBeVisible();
  await expect(page.getByText('Nộp lại sẽ thay thế toàn bộ file đã nộp')).toBeVisible();
  } finally {
    await clearSubmission(page.request, courseId);
  }
});
