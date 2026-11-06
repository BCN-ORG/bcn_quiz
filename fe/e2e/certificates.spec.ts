import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { asMentorInUi } from './leaderboard-stub';

// Giao diện duyệt chứng chỉ chạy trên dữ liệu giả cùng hình dạng API thật (backend đã được kiểm trên PostgreSQL thật ở
// certificate-request.integration.spec.ts). Ở đây kiểm các trạng thái mà DB local không dễ tạo: tạm hoãn, bị từ chối, thu hồi...
const ok = (data: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ statusCode: 200, message: 'Success', data }) });
const request = (id: string, status: string, course: string, extra: Record<string, unknown> = {}) => ({
  id, status, requestedAt: '2026-11-04T03:00:00Z', resubmittedAt: null, reviewedAt: null, reviewerNote: null,
  course: { id: `c${id}`, name: course, slug: course }, certificate: null, ...extra,
});

test('học viên thấy đúng trạng thái từng yêu cầu: chờ duyệt, tạm hoãn, bị từ chối (lý do + gửi lại), đã cấp, đã thu hồi', async ({ page }) => {
  await page.route('**/api/certificate/requests/me', (route) => route.fulfill(ok({ items: [
    request('1', 'PENDING', 'Web cơ bản'),
    request('2', 'ON_HOLD', 'Dữ liệu cơ bản'),
    request('3', 'REJECTED', 'Git nâng cao', { reviewerNote: 'Thiếu minh chứng đồ án' }),
    request('4', 'APPROVED', 'JavaScript', { certificate: { id: 'k', certificateCode: 'CRT-abc-123', issuedAt: '2026-10-01T03:00:00Z', revokedAt: null } }),
    request('5', 'REVOKED', 'SQL', { reviewerNote: 'Gian lận', certificate: { id: 'k2', certificateCode: 'CRT-old', issuedAt: '2026-09-01T03:00:00Z', revokedAt: '2026-10-05T03:00:00Z' } }),
  ] })));
  await page.goto('/certificates');
  const card = (name: string) => page.getByRole('article', { name: `Chứng chỉ ${name}` });
  await expect(card('Web cơ bản')).toContainText('Chờ duyệt');
  await expect(card('Dữ liệu cơ bản')).toContainText('Tạm hoãn');
  await expect(card('Git nâng cao')).toContainText('Lý do: Thiếu minh chứng đồ án');
  await expect(card('Git nâng cao').getByRole('button', { name: 'Gửi lại yêu cầu' })).toBeVisible();
  await expect(card('JavaScript')).toContainText('CRT-abc-123');
  await expect(card('JavaScript').getByRole('link', { name: /Xác minh/ })).toHaveAttribute('href', '/verify?code=CRT-abc-123');
  // chứng chỉ bị thu hồi: có lý do, không còn mã để chia sẻ, không có nút gửi lại
  await expect(card('SQL')).toContainText('Đã thu hồi');
  await expect(card('SQL')).toContainText('Lý do: Gian lận');
  await expect(card('SQL')).not.toContainText('CRT-old');
  await expect(card('SQL').getByRole('button', { name: 'Gửi lại yêu cầu' })).toHaveCount(0);
  await expect(card('Web cơ bản').getByRole('button', { name: 'Gửi lại yêu cầu' })).toHaveCount(0);
});

test('gửi lại yêu cầu: lỗi 409 của server được hiện rõ, thành công thì tải lại danh sách', async ({ page }) => {
  let rejected = true;
  await page.route('**/api/certificate/requests/me', (route) => route.fulfill(ok({ items: [request('3', rejected ? 'REJECTED' : 'PENDING', 'Git nâng cao', { reviewerNote: 'Thiếu' })] })));
  let attempt = 0;
  await page.route('**/api/certificate/requests/*/resubmit', (route) => {
    attempt += 1;
    if (attempt === 1) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ statusCode: 409, message: 'Finish every topic (and the project, if any) before resubmitting', data: null }) });
    rejected = false;
    return route.fulfill(ok({ id: '3', status: 'PENDING' }));
  });
  await page.goto('/certificates');
  await page.getByRole('button', { name: 'Gửi lại yêu cầu' }).click();
  await expect(page.getByRole('alert')).toContainText('before resubmitting');
  await page.getByRole('button', { name: 'Gửi lại yêu cầu' }).click();
  await expect(page.getByRole('article', { name: 'Chứng chỉ Git nâng cao' })).toContainText('Chờ duyệt');
  await expect(page.getByRole('button', { name: 'Gửi lại yêu cầu' })).toHaveCount(0);
});

const adminList = { pendingCount: 2, onHoldCount: 1, profilesAvailable: true, items: [
  { id: 'r1', status: 'PENDING', requestedAt: '2026-11-04T03:00:00Z', reviewedAt: null, reviewerNote: null, course: { id: 'c1', name: 'Web cơ bản' }, certificateCode: null, user: { id: 'u1', fullName: 'Lan Anh', email: 'lananh@example.com', avatarUrl: null } },
], pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrevious: false } };
const detail = (eligible: boolean) => ({
  id: 'r1', status: 'PENDING', requestedAt: '2026-11-04T03:00:00Z', resubmittedAt: null, reviewedAt: null, reviewerNote: null,
  user: { id: 'u1', fullName: 'Lan Anh', email: 'lananh@example.com', avatarUrl: null }, certificate: null,
  eligibility: {
    eligible, courseStatus: eligible ? 'COMPLETED' : 'IN_PROGRESS', course: { id: 'c1', name: 'Web cơ bản', hasProject: false },
    topicsDone: eligible ? 2 : 1, topicsTotal: 2,
    topics: [
      { id: 't1', name: 'JS cơ bản', sortOrder: 1, quizCount: 8, completed: true, accuracy: 90, totalAttempts: 2, addedAfterRequest: false },
      { id: 't2', name: 'Chủ đề mới thêm', sortOrder: 2, quizCount: 4, completed: eligible, accuracy: eligible ? 80 : null, totalAttempts: eligible ? 1 : 0, addedAfterRequest: true },
    ],
    project: { required: false, title: null, status: null, reviewedAt: null },
    reasons: eligible ? [] : ['Chưa hoàn thành 1/2 topic: Chủ đề mới thêm'],
    warnings: ['Khóa học được thêm 1 topic sau khi học viên hoàn thành: Chủ đề mới thêm.'],
  },
});

const openAdmin = async (page: Page, eligible: boolean) => {
  await asMentorInUi(page);
  await page.route('**/api/admin/certificate-requests?**', (route) => route.fulfill(ok(adminList)));
  await page.route('**/api/admin/certificate-requests/r1', (route) => route.fulfill(ok(detail(eligible))));
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Chứng chỉ' }).click();
  await page.getByRole('button', { name: 'Xem xét' }).click();
  await expect(page.locator('#certificate-detail table')).toBeVisible();
};

test('admin: học viên đủ điều kiện thì duyệt được; thêm topic mới thì hiện cảnh báo và danh sách topic', async ({ page }) => {
  await openAdmin(page, true);
  await expect(page.locator('#certificate-detail')).toContainText('Đủ điều kiện');
  await expect(page.locator('#certificate-detail')).toContainText('Khóa học được thêm 1 topic sau khi học viên hoàn thành');
  await expect(page.locator('#certificate-detail').getByText('Mới thêm')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Duyệt', exact: true })).toBeEnabled();
});

test('admin: chưa đủ điều kiện (khóa vừa thêm topic) thì không duyệt được và nêu rõ topic còn thiếu', async ({ page }) => {
  await openAdmin(page, false);
  await expect(page.locator('#certificate-detail')).toContainText('Chưa đủ điều kiện: Chưa hoàn thành 1/2 topic: Chủ đề mới thêm');
  await expect(page.getByRole('button', { name: 'Duyệt', exact: true })).toBeDisabled();
});

test('admin: từ chối bắt buộc có lý do và gửi đúng lý do lên server; lỗi xung đột được hiện và danh sách tải lại', async ({ page }) => {
  await openAdmin(page, true);
  const bodies: unknown[] = [];
  let listCalls = 0;
  await page.route('**/api/admin/certificate-requests?**', (route) => { listCalls += 1; return route.fulfill(ok(adminList)); });
  await page.route('**/api/admin/certificate-requests/r1/review', (route) => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ statusCode: 409, message: 'Only a pending request can be rejected', data: null }) });
  });
  await page.getByRole('button', { name: 'Từ chối' }).click();
  const confirm = page.getByRole('button', { name: 'Từ chối' }).last();
  await expect(confirm).toBeDisabled(); // chưa có lý do
  await page.getByPlaceholder('Học viên sẽ đọc được nội dung này').fill('Thiếu minh chứng');
  const before = listCalls;
  await confirm.click();
  await expect(page.getByRole('alert')).toContainText('Only a pending request can be rejected');
  expect(bodies).toEqual([{ decision: 'REJECT', note: 'Thiếu minh chứng' }]);
  await expect.poll(() => listCalls).toBeGreaterThan(before);
});

test('admin: chứng chỉ đã thu hồi mà khóa học đã đổi vẫn Cấp lại được, nhưng bắt buộc nhập lý do; yêu cầu chờ duyệt chưa đủ điều kiện thì bị khóa kèm lý do', async ({ page }) => {
  await asMentorInUi(page);
  const revoked = { ...detail(false), status: 'REVOKED', reviewerNote: 'Nhầm', certificate: { certificateCode: 'CRT-1', issuedAt: '2026-10-01T03:00:00Z', revokedAt: '2026-11-01T03:00:00Z', revokedReason: 'Nhầm' } };
  await page.route('**/api/admin/certificate-requests?**', (route) => route.fulfill(ok({ ...adminList, items: [{ ...adminList.items[0], status: 'REVOKED' }] })));
  await page.route('**/api/admin/certificate-requests/r1', (route) => route.fulfill(ok(revoked)));
  const bodies: unknown[] = [];
  await page.route('**/api/admin/certificate-requests/r1/review', (route) => { bodies.push(route.request().postDataJSON()); return route.fulfill(ok({ id: 'r1', status: 'APPROVED' })); });
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Chứng chỉ' }).click();
  await page.getByRole('button', { name: 'Xem xét' }).click();
  await expect(page.locator('#certificate-detail')).toContainText('Vẫn có thể cấp lại chứng chỉ đã thu hồi');
  const reinstate = page.getByRole('button', { name: 'Cấp lại', exact: true });
  await expect(reinstate).toBeEnabled();
  await reinstate.click();
  const confirm = page.getByRole('button', { name: 'Cấp lại', exact: true }).last();
  await expect(confirm).toBeDisabled(); // cần lý do
  await page.getByPlaceholder('Học viên sẽ đọc được nội dung này').fill('Thu hồi nhầm');
  await confirm.click();
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).toEqual({ decision: 'APPROVE', note: 'Thu hồi nhầm' });
});

test('admin: nút Duyệt bị khóa thì ngay cạnh nút có nêu lý do', async ({ page }) => {
  await openAdmin(page, false);
  await expect(page.getByRole('button', { name: 'Duyệt', exact: true })).toBeDisabled();
  await expect(page.locator('#certificate-approve-blocked')).toContainText('Chưa thể duyệt: Chưa hoàn thành 1/2 topic: Chủ đề mới thêm');
});

test('trang xác minh công khai: mã đã thu hồi báo không còn hợp lệ, không hiện lý do', async ({ page }) => {
  await page.route('**/api/certificate/suggest**', (route) => route.fulfill(ok([])));
  await page.route('**/api/certificate/verify/**', (route) => route.fulfill(ok({ valid: false, revoked: true, revokedAt: '2026-10-05T03:00:00Z', certificateCode: 'CRT-old', issuedAt: '2026-09-01T03:00:00Z', course: { id: 'c', name: 'SQL', slug: 'sql' } })));
  await page.goto('/verify?code=CRT-old');
  await expect(page.locator('.verify-result')).toContainText('đã bị thu hồi và không còn hợp lệ');
  await expect(page.locator('.verify-result')).not.toContainText('Chứng chỉ hợp lệ');
});
