import { expect, test } from './fixtures';
import { pickCourse } from './helpers';

const API = 'http://localhost:3001/api';

type PostSignature = { method: 'POST'; postUrl: string; fields: Record<string, string>; downloadUrl: string; publicId: string; maxBytes: number };

// Kiểm chứng chính sách ở phía MinIO thật: kích thước, Content-Type và key do server quyết định, không phải client.
test('upload: presigned POST được MinIO thực thi (kích thước, Content-Type, key)', async ({ page }) => {
  const { courseId } = await pickCourse(page.request, 0);
  const res = await page.request.post(`${API}/course/${courseId}/upload/signature`, { data: { method: 'POST' } });
  expect(res.ok()).toBeTruthy();
  const sig = (await res.json()).data as PostSignature;
  expect(sig.method).toBe('POST');
  expect(sig.maxBytes).toBe(20 * 1024 * 1024);

  const post = (fields: Record<string, string>, size: number) =>
    page.request.post(sig.postUrl, { multipart: { ...fields, file: { name: 'x.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(size, 1) } } });

  // sai Content-Type, sai key hoặc quá 20 MiB đều bị từ chối trước khi lưu
  expect((await post({ ...sig.fields, 'Content-Type': 'text/html' }, 1024)).status()).toBeGreaterThanOrEqual(400);
  expect((await post({ ...sig.fields, key: `${sig.publicId}-other` }, 1024)).status()).toBeGreaterThanOrEqual(400);
  expect((await post(sig.fields, 21 * 1024 * 1024)).status()).toBeGreaterThanOrEqual(400);

  const ok = await post(sig.fields, 1024);
  expect(ok.status()).toBeLessThan(300);

  // Đọc lại object đã lưu: MinIO phải phục vụ nó như tệp tải xuống, không phải nội dung chạy được.
  const stored = await page.request.get(sig.downloadUrl);
  expect(stored.status()).toBe(200);
  expect(stored.headers()['content-type']).toBe('application/octet-stream');
  expect(stored.headers()['content-disposition']).toBe('attachment');
});

test('upload: không có method thì vẫn nhận chữ ký PUT như cũ (tương thích ngược)', async ({ page }) => {
  const { courseId } = await pickCourse(page.request, 0);
  const res = await page.request.post(`${API}/course/${courseId}/upload/signature`, { data: {} });
  expect(res.ok()).toBeTruthy();
  const sig = (await res.json()).data as { method: string; uploadUrl: string };
  expect(sig.method).toBe('PUT');
  expect(sig.uploadUrl).toContain('X-Amz-Signature');

  const bad = await page.request.post(`${API}/course/${courseId}/upload/signature`, { data: { method: 'GET' } });
  expect(bad.status()).toBe(400);
});
