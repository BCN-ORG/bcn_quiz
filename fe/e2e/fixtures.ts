import { test as base, expect } from '@playwright/test';

// Chuông thông báo gọi /notifications và SSE ở mọi trang; backend giới hạn 100 request/phút mỗi IP nên
// bộ test sẽ tự gây 429 và làm phiên đăng nhập hỏng giữa chừng. Các luồng quiz/nộp bài vẫn gọi API thật.
export const test = base.extend({
  page: async ({ page }, provide) => {
    await page.route('**/api/notifications**', (route) => route.abort());
    await provide(page);
    // FE làm mới token khi tab đổi trạng thái hiển thị và token cũ bị thu hồi; lưu cookie mới cho test sau.
    const statePath = process.env.E2E_AUTH_STATE;
    if (statePath) await page.context().storageState({ path: statePath }).catch(() => {});
  },
});

export { expect };
