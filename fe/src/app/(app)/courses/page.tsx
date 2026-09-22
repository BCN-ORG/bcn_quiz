'use client';

import { MagnifyingGlass } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { CourseCard } from '@/components/course-card';
import { Empty, ErrorState, Loading, PaginationNav } from '@/components/ui';
import { request } from '@/lib/api';
import type { Course, CourseProgress, Pagination } from '@/lib/types';

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [progress, setProgress] = useState<CourseProgress[]>([]);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 12, total: 0, totalPages: 1 });
  const load = useCallback(async (targetPage = page) => {
    setLoading(true); setError('');
    try {
      const [catalog, mine] = await Promise.all([
        request.get<Pagination<Course>>(`/course?page=${targetPage}&limit=12&q=${encodeURIComponent(search)}`),
        request.get<Pagination<CourseProgress>>('/course/progress/me?limit=100'),
      ]);
      setCourses(catalog.items); setProgress(mine.items); setPagination(catalog.pagination);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Đã có lỗi xảy ra'); }
    finally { setLoading(false); }
  }, [page, search]);
  useEffect(() => { void load(page); }, [load, page]);
  useEffect(() => {
    const timer = window.setTimeout(() => { setPage(1); setSearch(query.trim()); }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  if (loading && !courses.length && !search) return <Loading />;
  if (error) return <ErrorState message={error} retry={() => void load()} />;
  return (
    <>
      <header className="page-heading"><div><p className="eyebrow">Thư viện học tập</p><h1>Khóa học</h1><p>Chọn lộ trình, hoàn thành quiz và nộp project nếu khóa học yêu cầu.</p></div></header>
      <label className="field" style={{ maxWidth: 520 }}><span>Tìm khóa học</span><div style={{ position: 'relative' }}><MagnifyingGlass size={18} style={{ position: 'absolute', left: 13, top: 14, color: 'var(--muted)' }} /><input className="search-input" style={{ paddingLeft: 42 }} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập tên hoặc nội dung" /></div></label>
      <section className="section">{courses.length ? <div className="grid grid-2">{courses.map((course) => <CourseCard key={course.id} course={course} progress={progress.find((item) => item.courseId === course.id)} />)}</div> : <Empty title="Không tìm thấy khóa học" description="Thử từ khóa ngắn hơn." />}<PaginationNav {...pagination} disabled={loading} onChange={setPage} /></section>
    </>
  );
}
