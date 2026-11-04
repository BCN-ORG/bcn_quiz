import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { TOPIC, board, myUserId, stubBoard, stubTopic } from './leaderboard-stub';

// Giao diện bảng xếp hạng chạy trên dữ liệu giả (cùng hình dạng với API thật, thứ hạng duy nhất như server)
// để kiểm được các trạng thái và số liệu mà DB local không có (hàng chục người, đồng hạng điểm, mất mạng...).
// Kết quả thật của bảng nằm ở leaderboard-real.spec.ts và leaderboard.integration.spec.ts.

const open = async (page: Page, query = '') => {
  await stubTopic(page);
  await page.goto(`/topics/${TOPIC}/leaderboard${query}`);
};
const view = (page: Page) => new URL(page.url());

test('URL giữ bộ lọc: tải lại/chia sẻ khôi phục chế độ, ngày, trang; tham số sai bị bỏ qua', async ({ page }) => {
  const me = await myUserId(page);
  const seen: URL[] = [];
  await stubBoard(page, (q, mode) => board({ total: 45, myRank: 37, me, page: Number(q.get('page') ?? 1), mode }), (url) => seen.push(url));
  await open(page, '?courseId=c1&mode=weekly&date=2026-11-04&page=2');

  await expect(page.getByRole('button', { name: 'Tuần này' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Trang 2', { exact: true })).toBeVisible();
  const first = seen.at(-1)!;
  expect(first.pathname).toMatch(/\/weekly$/);
  expect(first.searchParams.get('weekStart')).toBe('2026-11-04');
  expect(first.searchParams.get('page')).toBe('2');

  // chuyển trang giữ nguyên courseId và bộ lọc
  await page.getByRole('button', { name: 'Trang sau' }).click();
  await expect.poll(() => view(page).searchParams.get('page')).toBe('3');
  expect(view(page).searchParams.get('courseId')).toBe('c1');
  expect(view(page).searchParams.get('mode')).toBe('weekly');

  // xóa bộ lọc: về mặc định, giữ courseId
  await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
  await expect.poll(() => view(page).searchParams.has('mode') || view(page).searchParams.has('page') || view(page).searchParams.has('date')).toBe(false);
  expect(view(page).searchParams.get('courseId')).toBe('c1');
  await expect(page.getByRole('button', { name: 'Hôm nay' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Xóa bộ lọc' })).toHaveCount(0);

  // tham số sai: không bao giờ gửi lên API
  seen.length = 0;
  await page.goto(`/topics/${TOPIC}/leaderboard?mode=hack&date=2026-13-45&page=-3`);
  await expect(page.getByRole('table', { name: /trang 1 trên 3/ })).toBeVisible();
  const bad = seen.at(-1)!;
  expect(bad.pathname).toMatch(/\/daily$/);
  expect(bad.searchParams.has('date')).toBe(false);
  expect(bad.searchParams.get('page')).toBe('1');
  await expect(page.getByRole('button', { name: 'Xóa bộ lọc' })).toHaveCount(0);

  // năm ngoài 2000-2099 (ví dụ 0000-01-01) cũng không được gửi đi
  seen.length = 0;
  await page.goto(`/topics/${TOPIC}/leaderboard?date=0000-01-01`);
  await expect(page.getByRole('table', { name: /trang 1 trên 3/ })).toBeVisible();
  expect(seen.at(-1)!.searchParams.has('date')).toBe(false);
});

test('hạng của bạn: ngoài trang thì có nút nhảy tới đúng trang; trong trang thì dòng được tô sáng', async ({ page }) => {
  const me = await myUserId(page);
  const rank = { value: 37 };
  await stubBoard(page, (q) => board({ total: 45, myRank: rank.value, me, page: Number(q.get('page') ?? 1) }));
  await open(page);

  await expect(page.getByRole('heading', { name: 'Hạng của bạn: #37' })).toBeVisible();
  await expect(page.locator('.leaderboard-current')).toHaveCount(1); // chỉ có dòng trong "Quanh bạn"
  await page.getByRole('button', { name: /Đi tới trang 2/ }).click();
  await expect.poll(() => view(page).searchParams.get('page')).toBe('2');
  const all = page.getByRole('table', { name: /trang 2 trên 3/ });
  const mine = all.locator('tr[aria-current="true"]');
  await expect(mine).toHaveCount(1);
  await expect(mine).toContainText('Hạng #37');
  await expect(mine).toContainText('Bạn');
  await expect(page.getByText('Bạn đang ở trang này')).toBeVisible();
  await expect(page.getByRole('button', { name: /Đi tới trang/ })).toHaveCount(0);

  // ranh giới: hạng 20 là trang 1, hạng 21 là trang 2
  rank.value = 20;
  await page.goto(`/topics/${TOPIC}/leaderboard`);
  await expect(page.getByRole('heading', { name: 'Hạng của bạn: #20' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Đi tới trang/ })).toHaveCount(0);
  rank.value = 21;
  await page.goto(`/topics/${TOPIC}/leaderboard`);
  await expect(page.getByRole('button', { name: 'Đi tới trang 2 (vị trí của bạn)' })).toBeVisible();
});

test('bảng có caption, th scope, đọc được "Hạng 3 ... 956 điểm", số căn phải', async ({ page }) => {
  const me = await myUserId(page);
  await stubBoard(page, (q) => board({ total: 45, myRank: 3, me, page: Number(q.get('page') ?? 1) }));
  await open(page);
  const table = page.getByRole('table', { name: /trang 1 trên 3/ });
  await expect(table).toBeVisible();
  await expect(table.locator('caption')).toHaveCount(1);
  await expect(table.locator('thead th[scope="col"]')).toHaveCount(5);
  await expect(table.locator('tbody th[scope="row"]')).toHaveCount(20);
  const row = table.getByRole('row', { name: /Hạng #3.*Người chơi 3.*956 điểm/ });
  await expect(row).toHaveCount(1);
  const cell = table.locator('tbody tr').first().locator('td.num').nth(1);
  const style = await cell.evaluate((el) => { const s = getComputedStyle(el); return { align: s.textAlign, nums: s.fontVariantNumeric }; });
  expect(style.align).toBe('right');
  expect(style.nums).toContain('tabular-nums');
  // top 3 cũng có chữ "Hạng", không chỉ màu hay huy chương
  await expect(page.getByRole('list', { name: 'Top 3' }).getByRole('listitem').nth(1)).toContainText('Hạng #2');
});

test('trạng thái: đang tải, chưa có ai, chỉ có mình bạn, lỗi rồi thử lại', async ({ page }) => {
  const me = await myUserId(page);
  const mode = { current: 'slow' as 'slow' | 'empty' | 'only' | 'error' | 'ok' };
  await stubBoard(page, async (q) => {
    if (mode.current === 'slow') { await new Promise((r) => setTimeout(r, 1500)); return board({ total: 45, myRank: null, me }); }
    if (mode.current === 'empty') return board({ total: 0, myRank: null, me });
    if (mode.current === 'only') return board({ total: 1, myRank: 1, me });
    return board({ total: 45, myRank: null, me, page: Number(q.get('page') ?? 1) });
  });
  await open(page);
  await expect(page.locator('.leaderboard-skeleton')).toBeVisible();
  await expect(page.getByRole('table', { name: /trang 1 trên 3/ })).toBeVisible();

  mode.current = 'empty';
  await page.getByRole('button', { name: 'Làm mới' }).click();
  await expect(page.getByText('Chưa có kết quả trong kỳ này.')).toBeVisible();

  mode.current = 'only';
  await page.getByRole('button', { name: 'Làm mới' }).click();
  await expect(page.getByText('Hiện chỉ có mình bạn trên bảng')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hạng của bạn: #1' })).toBeVisible();

  // lỗi máy chủ: hiện lỗi + Thử lại; thử lại xong thì có bảng
  let fail = true;
  await page.route(/\/api\/leaderboards\/topics\/[^/]+\/daily\?/, async (route) => {
    if (fail) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ statusCode: 500, message: 'Internal' }) });
    return route.fallback();
  });
  mode.current = 'ok';
  await page.getByRole('button', { name: 'Làm mới' }).click();
  await expect(page.locator('.state-panel.error')).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await expect(page.getByRole('table', { name: /trang 1 trên 3/ })).toBeVisible();
  await expect(page.locator('.state-panel.error')).toHaveCount(0);
});

test('mất mạng: có thông báo ngoại tuyến, có mạng lại thì tự tải lại đúng một lần', async ({ page }) => {
  const me = await myUserId(page);
  let requests = 0;
  await stubBoard(page, () => board({ total: 45, myRank: null, me }), () => { requests += 1; });
  await open(page);
  await expect(page.getByRole('table', { name: /trang 1 trên 3/ })).toBeVisible();
  const before = requests;

  await page.context().setOffline(true);
  await expect(page.getByText(/đang ngoại tuyến/)).toBeVisible();
  await page.context().setOffline(false);
  await expect(page.getByText(/đang ngoại tuyến/)).toHaveCount(0);
  await expect.poll(() => requests).toBe(before + 1);
  await page.waitForTimeout(500);
  expect(requests).toBe(before + 1);
});

test('không polling: không có request khi thời gian trôi; "Làm mới" gửi đúng một request và đổi nhãn giờ', async ({ page }) => {
  const me = await myUserId(page);
  let requests = 0;
  await page.clock.install();
  await stubBoard(page, () => board({ total: 45, myRank: null, me }), () => { requests += 1; });
  await open(page);
  await expect(page.getByRole('table', { name: /trang 1 trên 3/ })).toBeVisible();
  await expect(page.getByText(/Cập nhật lúc \d\d:\d\d/)).toBeVisible();
  await page.waitForTimeout(300);
  const loaded = requests; // React StrictMode runs the mount effect twice in `next dev`, so compare against this baseline

  await page.clock.fastForward('30:00');
  await page.waitForTimeout(300);
  expect(requests).toBe(loaded);

  await page.getByRole('button', { name: 'Làm mới' }).click();
  await expect.poll(() => requests).toBe(loaded + 1);
  await page.waitForTimeout(300);
  expect(requests).toBe(loaded + 1);
});

test('tên trống được gọi đúng tên: "Chưa đặt tên" khi Profiles trả lời, "Chưa tải được tên" khi không hỏi được; không còn chữ "ẩn tên"', async ({ page }) => {
  const me = await myUserId(page);
  const names = { 2: 'Người dùng', 4: '   ', 5: '\u200B' };
  await stubBoard(page, () => board({ total: 5, myRank: null, me, names, profilesAvailable: true }));
  await open(page);
  const table = page.getByRole('table', { name: /trang 1 trên 1/ });
  await expect(table.getByText('Chưa đặt tên')).toHaveCount(3);
  await expect(page.getByText(/Chưa tải được tên người chơi/)).toHaveCount(0);
  await expect(page.getByText('ẩn tên')).toHaveCount(0);

  await page.unroute(/\/api\/leaderboards\/topics\/[^/]+\/(daily|weekly)\?/);
  await stubBoard(page, () => board({ total: 5, myRank: null, me, names, profilesAvailable: false }));
  await page.getByRole('button', { name: 'Làm mới' }).click();
  await expect(page.getByText(/Chưa tải được tên người chơi từ BCN/)).toBeVisible();
  await expect(table.getByText('Chưa tải được tên')).toHaveCount(3);
  await expect(table.getByText('Chưa đặt tên')).toHaveCount(0);
  await expect(page.getByText('ẩn tên')).toHaveCount(0);
});

test('riêng tư: kể cả khi API lỡ trả thêm email, giao diện thành viên không hiển thị email', async ({ page }) => {
  const me = await myUserId(page);
  await stubBoard(page, () => board({ total: 5, myRank: 2, me, admin: true }));
  await open(page);
  await expect(page.getByRole('table', { name: /trang 1 trên 1/ })).toBeVisible();
  const text = await page.locator('#topic-leaderboard').innerText();
  expect(text).not.toContain('@example.com');
  expect(await page.locator('#topic-leaderboard a[href^="mailto:"]').count()).toBe(0);
});

test('kết quả cũ không ghi đè kết quả mới khi đổi bộ lọc nhanh', async ({ page }) => {
  const me = await myUserId(page);
  await stubBoard(page, async (q, mode) => {
    if (mode === 'weekly') { await new Promise((r) => setTimeout(r, 1500)); return board({ total: 5, myRank: null, me, mode, names: { 1: 'BẢNG TUẦN CŨ' } }); }
    return board({ total: 5, myRank: null, me, mode, names: { 1: 'BẢNG NGÀY MỚI' } });
  });
  await open(page);
  await expect(page.getByText('BẢNG NGÀY MỚI').first()).toBeVisible();
  await page.getByRole('button', { name: 'Tuần này' }).click();
  await page.getByRole('button', { name: 'Hôm nay' }).click();
  await page.waitForTimeout(2200);
  await expect(page.getByText('BẢNG NGÀY MỚI').first()).toBeVisible();
  await expect(page.getByText('BẢNG TUẦN CŨ')).toHaveCount(0);
});

for (const mode of ['daily', 'weekly'] as const) {
  test(`mobile 375px (${mode}): không cuộn ngang, cột phụ ẩn, hạng/điểm vẫn thấy`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    const me = await myUserId(page);
    await stubBoard(page, (q, m) => board({ total: 45, myRank: 37, me, mode: m, page: Number(q.get('page') ?? 1), names: { 1: 'Nguyễn Văn Một Cái Tên Rất Rất Dài Để Thử Cắt Chữ' } }));
    await open(page, mode === 'weekly' ? '?mode=weekly' : '');
    const table = page.getByRole('table', { name: /trang 1 trên 3/ });
    await expect(table).toBeVisible();
    const overflow = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth - window.innerWidth, body: document.body.scrollWidth - window.innerWidth }));
    expect(overflow.doc).toBeLessThanOrEqual(0);
    expect(overflow.body).toBeLessThanOrEqual(0);
    await expect(table.locator('thead th.leaderboard-detail').first()).toBeHidden();
    await expect(table.locator('tbody tr').first().locator('td.num').first()).toBeVisible();
  });
}

const activeText = (page: Page) => page.evaluate(() => (document.activeElement === document.body ? 'BODY' : (document.activeElement?.textContent ?? '').trim().slice(0, 40)));

test('bàn phím: tiêu điểm không rơi về <body> sau Trang sau, Làm mới, Đi tới trang, Xóa bộ lọc', async ({ page }) => {
  const me = await myUserId(page);
  await stubBoard(page, async (q) => {
    await new Promise((r) => setTimeout(r, 300)); // đủ lâu để nút ở trạng thái đang tải
    return board({ total: 45, myRank: 37, me, page: Number(q.get('page') ?? 1) });
  });
  await open(page, '?page=1');
  await expect(page.getByRole('table', { name: /trang 1 trên 3/ })).toBeVisible();

  const next = page.getByRole('button', { name: 'Trang sau' });
  await next.focus();
  await page.keyboard.press('Enter'); // -> trang 2: nút vẫn còn, tiêu điểm ở lại
  expect(await activeText(page)).toBe('Trang sau');
  await expect(page.getByRole('table', { name: /trang 2 trên 3/ })).toBeVisible();
  expect(await activeText(page)).toBe('Trang sau');
  await page.keyboard.press('Enter'); // -> trang cuối: nút bị khóa, tiêu điểm sang tiêu đề danh sách
  await expect(page.getByRole('table', { name: /trang 3 trên 3/ })).toBeVisible();
  await expect.poll(() => activeText(page)).toBe('Tất cả');

  const refresh = page.getByRole('button', { name: 'Làm mới' });
  await refresh.focus();
  await page.keyboard.press('Enter');
  const section = page.locator('#topic-leaderboard');
  await expect(section).toHaveAttribute('aria-busy', 'true'); // nút đã đi qua trạng thái "đang tải"
  expect(await refresh.evaluate((el) => getComputedStyle(el).opacity)).toBe('0.55'); // trông như bị khóa khi đang tải
  await expect(section).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => activeText(page)).toBe('Làm mới'); // một nút `disabled` sẽ bị trình duyệt bỏ tiêu điểm

  await page.goto(`/topics/${TOPIC}/leaderboard`);
  await expect(page.getByRole('table', { name: /trang 1 trên 3/ })).toBeVisible();
  await page.getByRole('button', { name: /Đi tới trang 2/ }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => activeText(page)).toBe('Tất cả');

  await page.getByRole('button', { name: 'Xóa bộ lọc' }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => activeText(page)).toBe('Bảng xếp hạng');
});

test('Back hoàn tác bộ lọc: đổi chế độ rồi quay lại thì trở về chế độ trước', async ({ page }) => {
  const me = await myUserId(page);
  await stubBoard(page, (q, mode) => board({ total: 45, myRank: null, me, mode, page: Number(q.get('page') ?? 1) }));
  await open(page);
  await expect(page.getByRole('table', { name: /trang 1 trên 3/ })).toBeVisible();
  await page.getByRole('button', { name: 'Tuần này' }).click();
  await expect(page.getByRole('button', { name: 'Tuần này' })).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Hôm nay' })).toHaveAttribute('aria-pressed', 'true');
  expect(view(page).searchParams.has('mode')).toBe(false);

  // bấm lại đúng chế độ đang chọn không thêm mục lịch sử
  const length = await page.evaluate(() => history.length);
  await page.getByRole('button', { name: 'Hôm nay' }).click();
  expect(await page.evaluate(() => history.length)).toBe(length);
});

test('chữ cái đầu của tên có emoji không bị cắt đôi; trang vượt giới hạn có lối về trang 1 và không có phân trang sai', async ({ page }) => {
  const me = await myUserId(page);
  await stubBoard(page, (q) => board({ total: 45, myRank: null, me, page: Number(q.get('page') ?? 1), names: { 1: '😀 Foo', 2: '🎉' } }));
  await open(page);
  const table = page.getByRole('table', { name: /trang 1 trên 3/ });
  await expect(table).toBeVisible();
  const initials = await table.locator('.leaderboard-initials').allInnerTexts();
  expect(initials.slice(0, 2)).toEqual(['😀F', '🎉']);
  expect(initials.join('')).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/);

  await page.goto(`/topics/${TOPIC}/leaderboard?page=9`);
  await expect(page.getByText('Trang này không có dòng nào.')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Phân trang' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Về trang 1' }).click();
  await expect(page.getByRole('table', { name: /trang 1 trên 3/ })).toBeVisible();
  await expect.poll(() => activeText(page)).toBe('Tất cả'); // nút vừa bấm đã biến mất, tiêu điểm không rơi về <body>
});

test('lần tải đầu lỗi: nhãn nói "Chưa cập nhật được", không phải "Đang cập nhật"', async ({ page }) => {
  await page.route(/\/api\/leaderboards\/topics\/[^/]+\/daily\?/, (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ statusCode: 500, message: 'Internal' }) }));
  await open(page);
  await expect(page.locator('.state-panel.error')).toBeVisible();
  await expect(page.getByText('Chưa cập nhật được.')).toBeVisible();
  await expect(page.getByText('Đang cập nhật…')).toHaveCount(0);
});
