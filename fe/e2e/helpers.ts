import type { APIRequestContext } from '@playwright/test';

const API = 'http://localhost:3001/api';

export type Fixture = { courseId: string; topicId: string };

/** Lấy khóa học E2E có sẵn trong DB local; `index` chọn khóa khác nhau để các test không đụng nhau. */
/** GET có thử lại khi chạm giới hạn 100 request/phút của backend (429); mọi mã khác 200 là lỗi, không được coi là "không có dữ liệu". */
async function getJson(request: APIRequestContext, url: string) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const res = await request.get(url);
    if (res.status() === 429) { await new Promise((resolve) => setTimeout(resolve, 3000)); continue; }
    if (!res.ok()) throw new Error(`GET ${url} -> ${res.status()}`);
    return (await res.json()).data;
  }
  throw new Error(`GET ${url} bị giới hạn tốc độ (429)`);
}

/** Lấy khóa học E2E có sẵn trong DB local; `index` chọn khóa khác nhau để các test không đụng nhau. */
export async function pickCourse(request: APIRequestContext, index: number, opts: { withoutSubmission?: boolean } = {}): Promise<Fixture> {
  const courses = (await getJson(request, `${API}/course?page=1&limit=50`)).items as Array<{ id: string; hasProject: boolean }>;
  let course: { id: string } | undefined;
  if (opts.withoutSubmission) {
    let seen = 0;
    for (const item of courses.filter((candidate) => candidate.hasProject)) {
      if (await getJson(request, `${API}/course/${item.id}/project-submission/me`)) continue;
      if (seen === index) { course = item; break; }
      seen += 1;
    }
  } else {
    course = courses.filter((item) => item.hasProject)[index];
  }
  if (!course) throw new Error(`Không có khóa học E2E thứ ${index}`);
  const topics = (await getJson(request, `${API}/course/${course.id}/topics?page=1&limit=10`)).items as Array<{ topic: { id: string } }>;
  return { courseId: course.id, topicId: topics[0].topic.id };
}

/** Bỏ phiên làm bài đang dở (nếu có) để mỗi test bắt đầu từ trạng thái sạch. */
export async function abandonOpenSession(request: APIRequestContext, topicId: string) {
  const res = await request.get(`${API}/topic/${topicId}/session/resume`);
  const session = (await res.json()).data as { id: string; status: string } | null;
  if (session?.status === 'IN_PROGRESS') await request.post(`${API}/attempt/session/${session.id}/abandon`);
}

/** Xóa bài nộp của chính user test để khóa học E2E dùng lại được cho lần chạy sau. */
export async function clearSubmission(request: APIRequestContext, courseId: string) {
  const mine = await getJson(request, `${API}/course/${courseId}/project-submission/me`);
  if (mine) await request.delete(`${API}/course/${courseId}/project-submission/${mine.id}`);
}
