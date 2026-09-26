'use client';

import Link from 'next/link';
import { ArrowRight, Certificate, BookOpen, Target } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { canReadQuestions, canReadResults } from '@/lib/permissions';
import { CourseCard } from '@/components/course-card';
import { Empty, ErrorState, Loading } from '@/components/ui';
import { request } from '@/lib/api';
import type { Certificate as CourseCertificate, CourseProgress, Pagination } from '@/lib/types';

export default function DashboardPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<CourseProgress[]>([]);
  const [certificateCount, setCertificateCount] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [progress, certs] = await Promise.all([
        canReadQuestions(user)
          ? request.get<Pagination<CourseProgress>>('/course/progress/me?limit=6')
          : Promise.resolve({ items: [] as CourseProgress[], pagination: { page: 1, limit: 6, total: 0, totalPages: 1 } }),
        canReadResults(user)
          ? request.get<Pagination<CourseCertificate>>('/certificate/me?limit=1')
          : Promise.resolve({ items: [] as CourseCertificate[], pagination: { page: 1, limit: 1, total: 0, totalPages: 1 } }),
      ]);
      setCourses(progress.items); setCertificateCount(certs.pagination.total);
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
      <section className="hero-grid">
        <div className="hero-panel">
          <p className="eyebrow">Chào {user?.fullName || 'bạn'}</p>
          <h1>Tiếp tục nhịp học hôm nay.</h1>
          <p>Mỗi topic hoàn thành sẽ được ghi vào Timeline BCN của bạn.</p>
          {canReadQuestions(user) ? <Link className="button" href="/courses">Xem khóa học <ArrowRight /></Link> : null}
        </div>
        <div className="hero-side">
          <div className="metric"><span>Đang học</span><strong>{courses.length - completed}</strong><BookOpen /></div>
          <div className="metric"><span>Tiến độ TB</span><strong>{average}%</strong><Target /></div>
          <div className="metric"><span>Chứng chỉ</span><strong>{certificateCount}</strong><Certificate /></div>
        </div>
      </section>
      <section className="section">
        <div className="section-title"><h2>Khóa học gần đây</h2>{canReadQuestions(user) ? <Link href="/courses">Xem tất cả</Link> : null}</div>
        {courses.length ? <div className="grid grid-2">{courses.map((item) => <CourseCard key={item.id} course={item.course} progress={item} />)}</div> : <Empty title="Chưa có tiến độ" description="Mở một khóa học và bắt đầu topic đầu tiên." />}
      </section>
    </>
  );
}
