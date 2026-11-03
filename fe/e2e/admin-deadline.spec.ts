import { expect, test } from './fixtures';
import { pickCourse } from './helpers';

const API = 'http://localhost:3001/api';

// Cần user test có quyền cập nhật nội dung (vai trò MENTOR hoặc ADMIN trên Profiles local); không thì bỏ qua.
test('admin: form hạn nộp ghi dueAt thật; để trống thì xóa, ghi trực tiếp không gửi dueAt thì giữ nguyên', async ({ page }) => {
  const { courseId } = await pickCourse(page.request, 0);
  const read = async () => (await (await page.request.get(`${API}/course/${courseId}/project-requirement`)).json()).data;
  const before = await read();
  const probe = await page.request.put(`${API}/course/${courseId}/project-requirement`, {
    data: { title: before.title, description: before.description, isRequired: true },
  });
  test.skip(probe.status() === 403, 'user test không có quyền cập nhật nội dung');
  expect(probe.status()).toBeLessThan(300);
  const original = (await read()).dueAt ?? null;
  try {
    const course = (await (await page.request.get(`${API}/course/${courseId}`)).json()).data as { name: string };
    await page.goto('/admin');
    await page.getByRole('button', { name: `Sửa ${course.name}` }).click();
    const field = page.getByLabel('Hạn nộp (không bắt buộc)');
    await expect(field).toBeVisible();

    // 1) đặt hạn qua form: 2031-05-06 07:08 (giờ trình duyệt) -> backend lưu đúng thời điểm đó
    await field.fill('2031-05-06T07:08');
    const put = page.waitForResponse((res) => res.url().endsWith(`/course/${courseId}/project-requirement`) && res.request().method() === 'PUT');
    await page.getByRole('button', { name: /Lưu|Cập nhật/ }).first().click();
    expect((await put).status()).toBeLessThan(300);
    await expect(page.getByText('Đã cập nhật khóa học.')).toBeVisible();
    const expected = await page.evaluate(() => new Date('2031-05-06T07:08').toISOString());
    expect(new Date((await read()).dueAt).toISOString()).toBe(expected);

    // 2) ghi trực tiếp không gửi dueAt -> hạn giữ nguyên
    const keep = await page.request.put(`${API}/course/${courseId}/project-requirement`, {
      data: { title: before.title, description: before.description, isRequired: true },
    });
    expect(keep.status()).toBeLessThan(300);
    expect(new Date((await read()).dueAt).toISOString()).toBe(expected);

    // 3) mở lại form, xóa ô hạn nộp, lưu -> dueAt = null
    await page.reload();
    await page.getByRole('button', { name: `Sửa ${course.name}` }).click();
    const again = page.getByLabel('Hạn nộp (không bắt buộc)');
    await expect(again).toHaveValue('2031-05-06T07:08');
    await again.fill('');
    const clear = page.waitForResponse((res) => res.url().endsWith(`/course/${courseId}/project-requirement`) && res.request().method() === 'PUT');
    await page.getByRole('button', { name: /Lưu|Cập nhật/ }).first().click();
    expect((await clear).status()).toBeLessThan(300);
    await expect(page.getByText('Đã cập nhật khóa học.')).toBeVisible();
    expect((await read()).dueAt ?? null).toBeNull();
  } finally {
    await page.request.put(`${API}/course/${courseId}/project-requirement`, {
      data: { title: before.title, description: before.description, isRequired: true, dueAt: original },
    });
  }
});
