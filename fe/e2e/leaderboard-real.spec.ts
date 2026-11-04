import { request as playwrightRequest, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { abandonOpenSession, pickCourse } from './helpers';

// Trên stack thật: điểm vừa nộp xuất hiện đúng hạng, nộp lại không ghi đè kết quả chính thức,
// và API bảng xếp hạng giữ đúng quy tắc phân quyền / riêng tư. Kết quả của bài nộp lại nằm trong DB local (bất biến theo thiết kế).
const API = 'http://localhost:3001/api';

type Board = { currentUserRank: number | null; currentUserResult: { score: number } | null; pagination: { total: number } };
const board = async (page: Page, topicId: string, query = '') => {
  const res = await page.request.get(`${API}/leaderboards/topics/${topicId}/daily${query}`);
  return { status: res.status(), text: await res.text() };
};
const parse = (text: string) => JSON.parse(text).data as Board;

async function takeQuiz(page: Page, courseId: string, topicId: string, optionIndex: number) {
  await abandonOpenSession(page.request, topicId);
  await page.goto(`/topics/${topicId}?courseId=${courseId}`);
  await page.getByRole('button', { name: /Bắt đầu làm bài/ }).click();
  await expect(page.getByText(/Câu 1 \/ 2/).first()).toBeVisible();
  await page.locator('.answer').nth(optionIndex).click();
  await page.getByRole('button', { name: 'Câu tiếp' }).click();
  await page.locator('.answer').nth(optionIndex).click();
  await page.getByRole('button', { name: /Nộp bài/ }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Nộp bài' }).click();
  await expect(page.getByText(/hạng ngày #/)).toBeVisible();
  return (await page.getByText(/hạng ngày #/).innerText()).match(/hạng ngày #(\d+)/)![1];
}

test('thật: nộp xong hạng khớp trang kết quả; nộp lại không đổi điểm chính thức', async ({ page }) => {
  const { courseId, topicId } = await pickCourse(page.request, 0);

  const rank1 = await takeQuiz(page, courseId, topicId, 0);
  const afterFirst = parse((await board(page, topicId)).text);
  expect(afterFirst.currentUserResult).not.toBeNull();
  expect(String(afterFirst.currentUserRank)).toBe(rank1);

  await page.goto(`/topics/${topicId}/leaderboard`);
  await expect(page.getByRole('heading', { name: `Hạng của bạn: #${rank1}` })).toBeVisible();
  await expect(page.locator('tr[aria-current="true"]').first()).toContainText('Bạn');

  // lượt thứ hai (đáp án khác) là luyện tập: điểm chính thức của ngày không đổi
  const rank2 = await takeQuiz(page, courseId, topicId, 1);
  await expect(page.getByText(/Lượt luyện tập/)).toBeVisible();
  const afterRetry = parse((await board(page, topicId)).text);
  expect(afterRetry.currentUserResult!.score).toBe(afterFirst.currentUserResult!.score);
  expect(afterRetry.currentUserRank).toBe(afterFirst.currentUserRank);
  expect(rank2).toBe(rank1);
});

test('thật: quyền và riêng tư của API bảng xếp hạng', async ({ page }) => {
  const { topicId } = await pickCourse(page.request, 0);

  // chưa đăng nhập: 401 (kiểm ở server, không phải ẩn trên UI)
  const anonymous = await playwrightRequest.newContext({ storageState: undefined });
  expect((await anonymous.get(`${API}/leaderboards/topics/${topicId}/daily`)).status()).toBe(401);
  expect((await anonymous.get(`${API}/admin/leaderboards/topics/${topicId}/daily`)).status()).toBe(401);
  await anonymous.dispose();

  // thành viên đọc được, payload không có email; ô search của admin bị bỏ qua
  const plain = await board(page, topicId);
  expect(plain.status).toBe(200);
  expect(plain.text).not.toMatch(/"email"/);
  const searched = await board(page, topicId, '?search=zzzz-khong-co');
  expect(searched.status).toBe(200);
  expect(parse(searched.text).pagination.total).toBe(parse(plain.text).pagination.total);

  // thành viên không gọi được endpoint admin (danh sách, xuất file)
  for (const path of ['daily', 'weekly', 'daily/export']) {
    const res = await page.request.get(`${API}/admin/leaderboards/topics/${topicId}/${path}`);
    expect(res.status(), path).toBe(403);
  }
});
