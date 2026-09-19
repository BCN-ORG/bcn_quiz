'use client';

import Link from 'next/link';
import { ArrowRight, Certificate, BookOpen, Target } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { CourseCard } from '@/components/course-card';
import { Empty, ErrorState, Loading } from '@/components/ui';
import { request } from '@/lib/api';
import type { Certificate as CourseCertificate, CourseProgress, Pagination } from '@/lib/types';

export default function DashboardPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<CourseProgress[]>([]);
  const [certificates, setCertificates] = useState<CourseCertificate[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [progress, certs] = await Promise.all([
        request.get<Pagination<CourseProgress>>('/course/progress/me?limit=6'),
        request.get<CourseCertificate[]>('/certificate/me'),
      ]);
      setCourses(progress.items); setCertificates(certs);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Đã có lỗi xảy ra'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);
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
          <Link className="button" href="/courses">Xem khóa học <ArrowRight /></Link>
        </div>
        <div className="hero-side">
          <div className="metric"><span>Đang học</span><strong>{courses.length - completed}</strong><BookOpen /></div>
          <div className="metric"><span>Tiến độ TB</span><strong>{average}%</strong><Target /></div>
          <div className="metric"><span>Chứng chỉ</span><strong>{certificates.length}</strong><Certificate /></div>
        </div>
      </section>
      <section className="section">
        <div className="section-title"><h2>Khóa học gần đây</h2><Link href="/courses">Xem tất cả</Link></div>
        {courses.length ? <div className="grid grid-2">{courses.map((item) => <CourseCard key={item.id} course={item.course} progress={item} />)}</div> : <Empty title="Chưa có tiến độ" description="Mở một khóa học và bắt đầu topic đầu tiên." />}
      </section>
    </>
  );
}
