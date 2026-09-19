'use client';

import { MagnifyingGlass } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { CourseCard } from '@/components/course-card';
import { Empty, ErrorState, Loading } from '@/components/ui';
import { request } from '@/lib/api';
import type { Course, CourseProgress, Pagination } from '@/lib/types';

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [progress, setProgress] = useState<CourseProgress[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = async () => {
    try {
      const [catalog, mine] = await Promise.all([
        request.get<Pagination<Course>>('/course?limit=100'),
        request.get<Pagination<CourseProgress>>('/course/progress/me?limit=100'),
      ]);
      setCourses(catalog.items); setProgress(mine.items);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Đã có lỗi xảy ra'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => courses.filter((course) => `${course.name} ${course.description}`.toLowerCase().includes(query.toLowerCase())), [courses, query]);
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} retry={() => void load()} />;
  return (
    <>
      <header className="page-heading"><div><p className="eyebrow">Thư viện học tập</p><h1>Khóa học</h1><p>Chọn lộ trình, hoàn thành quiz và nộp project nếu khóa học yêu cầu.</p></div></header>
      <label className="field" style={{ maxWidth: 520 }}><span>Tìm khóa học</span><div style={{ position: 'relative' }}><MagnifyingGlass size={18} style={{ position: 'absolute', left: 13, top: 14, color: 'var(--muted)' }} /><input className="search-input" style={{ paddingLeft: 42 }} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập tên hoặc nội dung" /></div></label>
      <section className="section">{visible.length ? <div className="grid grid-2">{visible.map((course) => <CourseCard key={course.id} course={course} progress={progress.find((item) => item.courseId === course.id)} />)}</div> : <Empty title="Không tìm thấy khóa học" description="Thử từ khóa ngắn hơn." />}</section>
    </>
  );
}
