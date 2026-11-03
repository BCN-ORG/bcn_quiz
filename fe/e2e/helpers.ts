import type { APIRequestContext } from '@playwright/test';

const API = 'http://localhost:3001/api';

export type Fixture = { courseId: string; topicId: string };

/** Lấy khóa học E2E có sẵn trong DB local; `index` chọn khóa khác nhau để các test không đụng nhau. */
export async function pickCourse(request: APIRequestContext, index: number, opts: { withoutSubmission?: boolean } = {}): Promise<Fixture> {
  const courses = (await (await request.get(`${API}/course?page=1&limit=50`)).json()).data.items as Array<{ id: string; hasProject: boolean }>;
  let candidates = courses.filter((item) => item.hasProject);
  if (opts.withoutSubmission) {
    const free = [];
    for (const item of candidates) {
      const mine = (await (await request.get(`${API}/course/${item.id}/project-submission/me`)).json()).data;
      if (!mine) free.push(item);
    }
    candidates = free;
  }
  const course = candidates[index];
  if (!course) throw new Error(`Không có khóa học E2E thứ ${index}`);
  const topics = (await (await request.get(`${API}/course/${course.id}/topics?page=1&limit=10`)).json()).data.items as Array<{ topic: { id: string } }>;
  return { courseId: course.id, topicId: topics[0].topic.id };
}

/** Bỏ phiên làm bài đang dở (nếu có) để mỗi test bắt đầu từ trạng thái sạch. */
export async function abandonOpenSession(request: APIRequestContext, topicId: string) {
  const res = await request.get(`${API}/topic/${topicId}/session/resume`);
  const session = (await res.json()).data as { id: string; status: string } | null;
  if (session?.status === 'IN_PROGRESS') await request.post(`${API}/attempt/session/${session.id}/abandon`);
}
