'use client';

import Link from 'next/link';
import { ArrowRight } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { canReadQuestions, canReadResults } from '@/lib/permissions';
import { CourseCard } from '@/components/course-card';
import { Empty, ErrorState, Loading } from '@/components/ui';
import { request } from '@/lib/api';
import { topicOpen } from '@/lib/format';
import type { Certificate as CourseCertificate, Course, CourseProgress, Pagination } from '@/lib/types';

type CourseTopic = NonNullable<Course['topics']>[number];

/** Phiên làm bài — chỉ lấy trường dùng để biết topic nào đã nộp / đang làm dở. */
type SessionItem = {
  id: string;
  topicId: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';
  answeredCount: number;
  quizTotal?: number | null;
};

/** Một bài tập trong cột "Cần hoàn thành". */
type TodoTopic = {
  topicId: string;
  topicName: string;
  courseId: string;
  courseName: string;
  quizCount: number;
  /** Phiên đang làm dở (nếu có) để hiện tiến độ + nút "Tiếp tục". */
  inProgress: { answeredCount: number; quizTotal: number | null } | null;
};

/** Tải hết các trang của một API phân trang (50 mục/trang). */
async function fetchAll<T>(path: string): Promise<T[]> {
  const limit = 50;
  const first = await request.get<Pagination<T>>(`${path}?page=1&limit=${limit}`);
  const items = [...first.items];
  const total = first.pagination.total;
  let page = 2;
  while (items.length < total) {
    const data = await request.get<Pagination<T>>(`${path}?page=${page}&limit=${limit}`);
    items.push(...data.items);
    page += 1;
  }
  return items;
}

/**
 * Tổng quan — bố cục Dashboard của Figma (kịch bản 05/11/2026 đã duyệt):
 * hàng 4 thẻ số liệu thật + 2 cột (Khóa học gần đây / Cần hoàn thành).
 * Cột phải (phương án B, 07/11/2026): topic đang mở (availability OPEN) của các
 * khóa học chưa hoàn thành mà user chưa nộp bài (chưa có session SUBMITTED).
 * Hoàn thành = đã nộp là đủ (không xét điểm). Không sửa DB/BE: chỉ dùng API sẵn có
 * (/course/progress/me, /course/:id/topics, /attempt/sessions/me).
 * Hiển thị: "Khóa học gần đây" chỉ 2 khóa (xem thêm qua "Xem tất cả" → /courses);
 * "Cần hoàn thành" tối đa 4 hàng, quá thì trượt dọc trong khung (.todo-list).
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<CourseProgress[]>([]);
  const [certificateCount, setCertificateCount] = useState(0);
  const [todos, setTodos] = useState<TodoTopic[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [progress, certs, sessions] = await Promise.all([
        canReadQuestions(user)
          ? request.get<Pagination<CourseProgress>>('/course/progress/me?limit=6')
          : Promise.resolve({ items: [] as CourseProgress[], pagination: { page: 1, limit: 6, total: 0, totalPages: 1 } }),
        canReadResults(user)
          ? request.get<Pagination<CourseCertificate>>('/certificate/me?limit=1')
          : Promise.resolve({ items: [] as CourseCertificate[], pagination: { page: 1, limit: 1, total: 0, totalPages: 1 } }),
        canReadResults(user)
          ? fetchAll<SessionItem>('/attempt/sessions/me')
          : Promise.resolve([] as SessionItem[]),
      ]);
      setCourses(progress.items); setCertificateCount(certs.pagination.total);
      // Topic đã nộp (SUBMITTED) là đã hoàn thành — không cần làm nữa.
      const submitted = new Set(sessions.filter((s) => s.status === 'SUBMITTED').map((s) => s.topicId));
      const inProgress = new Map<string, SessionItem>();
      sessions.filter((s) => s.status === 'IN_PROGRESS').forEach((s) => { if (!inProgress.has(s.topicId)) inProgress.set(s.topicId, s); });
      // Chỉ xét khóa học chưa hoàn thành (khóa đã xong thì không còn bài cần làm).
      const openCourses = progress.items.filter((item) => item.status !== 'COMPLETED');
      const topicLists = await Promise.all(
        openCourses.map((item) => fetchAll<CourseTopic>(`/course/${item.course.id}/topics`).catch(() => [] as CourseTopic[])),
      );
      const list: TodoTopic[] = [];
      // Một topic có thể dùng chung cho nhiều khóa: chỉ hiện 1 lần (nộp bài tính theo topic, không theo khóa).
      // Không khử trùng thì cùng topicId xuất hiện 2 lần → React báo trùng key.
      const seenTopics = new Set<string>();
      openCourses.forEach((item, index) => {
        topicLists[index].forEach(({ topic }) => {
          if (!topicOpen(topic.availability)) return;
          if (submitted.has(topic.id)) return;
          if (seenTopics.has(topic.id)) return;
          seenTopics.add(topic.id);
          const session = inProgress.get(topic.id) || null;
          list.push({
            topicId: topic.id,
            topicName: topic.name,
            courseId: item.course.id,
            courseName: item.course.name,
            quizCount: topic._count?.quizzes ?? 0,
            inProgress: session ? { answeredCount: session.answeredCount, quizTotal: session.quizTotal ?? null } : null,
          });
        });
      });
      setTodos(list);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Đã có lỗi xảy ra'); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { void load(); }, [load]);
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} retry={() => void load()} />;

  const completed = courses.filter((item) => item.status === 'COMPLETED').length;
  const average = courses.length ? Math.round(courses.reduce((sum, item) => sum + item.progressPercent, 0) / courses.length) : 0;

  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Chào {user?.fullName || 'bạn'}</h1>
          <p>Tiếp tục nhịp học hôm nay. Mỗi topic hoàn thành sẽ được ghi vào Timeline BCN của bạn.</p>
        </div>
        {canReadQuestions(user) ? <Link className="button" href="/courses">Xem khóa học <ArrowRight /></Link> : null}
      </header>
      <div className="figma-stats" aria-label="Số liệu học tập">
        <div className="figma-stat"><span>Đang học</span><strong>{courses.length - completed}</strong><small>khóa học</small></div>
        <div className="figma-stat"><span>Đã hoàn thành</span><strong>{completed}</strong><small>khóa học</small></div>
        <div className="figma-stat"><span>Tiến độ TB</span><strong>{average}%</strong><small>trên các khóa đang học</small></div>
        <div className="figma-stat"><span>Chứng nhận</span><strong>{certificateCount}</strong><small>đã được cấp</small></div>
      </div>
      <div className="figma-split">
        <section className="section" style={{ marginTop: 0 }}>
          <div className="section-title"><h2>Khóa học gần đây</h2>{canReadQuestions(user) ? <Link href="/courses">Xem tất cả</Link> : null}</div>
          {courses.length ? <div className="grid grid-2">{courses.slice(0, 2).map((item) => <CourseCard key={item.id} course={item.course} progress={item} />)}</div> : <Empty title="Chưa có tiến độ" description="Mở một khóa học và bắt đầu topic đầu tiên." />}
        </section>
        {canReadResults(user) ? (
          <section className="panel">
            <div className="section-title"><h2>Cần hoàn thành</h2><Link href="/courses">Xem tất cả</Link></div>
            {todos.length ? (
              <div className="list todo-list">
                {todos.map((item) => (
                  <div className="list-row" key={item.topicId}>
                    <div>
                      <strong>{item.topicName}</strong>
                      <small>
                        {item.courseName} · {item.quizCount} câu hỏi
                        {item.inProgress ? ` · Đang làm ${item.inProgress.answeredCount}/${item.inProgress.quizTotal ?? '?'} câu` : ''}
                      </small>
                    </div>
                    <div className="list-actions">
                      <Link className="button secondary" href={`/topics/${item.topicId}?courseId=${item.courseId}`}>{item.inProgress ? 'Tiếp tục' : 'Làm bài'}</Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : <Empty title="Chưa có bài tập cần hoàn thành" description="Khi có topic đang mở mà bạn chưa nộp, nó sẽ hiện ở đây." />}
          </section>
        ) : null}
      </div>
    </>
  );
}
