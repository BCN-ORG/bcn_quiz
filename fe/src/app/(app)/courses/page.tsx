'use client';

import { MagnifyingGlass } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CourseCard } from '@/components/course-card';
import { Empty, ErrorState, Loading, PaginationNav } from '@/components/ui';
import { request } from '@/lib/api';
import type { Course, CourseProgress, Pagination } from '@/lib/types';

type CourseTab = 'all' | 'in-progress' | 'completed';
const TAB_SIZE = 12;
const TABS: CourseTab[] = ['all', 'in-progress', 'completed'];

/**
 * Khóa học — thẻ lưới 3 cột (07/11/2026, anh duyệt bỏ số người tham gia):
 * một thẻ lớn chứa tìm kiếm + tab lọc + danh sách dạng thẻ (ảnh bìa, tên, số chủ đề,
 * trạng thái + tiến độ nếu đã học). Không có số người tham gia vì dữ liệu Course
 * chưa có trường đó.
 * Tab lọc chỉ lọc lại dữ liệu đã tải (danh sách tiến độ), không gọi thêm API
 * và không thêm tính năng mới. Tab "Tất cả" giữ nguyên phân trang server cũ.
 */
export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [progress, setProgress] = useState<CourseProgress[]>([]);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<CourseTab>('all');
  const [tabPage, setTabPage] = useState(1);
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

  // Tab trạng thái lọc từ danh sách tiến độ đã tải (tối đa 100 khóa).
  const tabCourses = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = tab === 'completed'
      ? progress.filter((item) => item.status === 'COMPLETED')
      : progress.filter((item) => item.status !== 'COMPLETED');
    const list = base.map((item) => item.course);
    return q ? list.filter((course) => course.name.toLowerCase().includes(q)) : list;
  }, [tab, progress, query]);

  const displayed = tab === 'all'
    ? courses
    : tabCourses.slice((tabPage - 1) * TAB_SIZE, tabPage * TAB_SIZE);
  const displayedPagination = tab === 'all'
    ? pagination
    : { page: tabPage, limit: TAB_SIZE, total: tabCourses.length, totalPages: Math.max(1, Math.ceil(tabCourses.length / TAB_SIZE)) };
  const handlePage = (next: number) => { if (tab === 'all') setPage(next); else setTabPage(next); };
  const selectTab = (next: CourseTab) => { setTab(next); setTabPage(1); };

  // Viên nền trượt theo nút tab đang chọn (hiệu ứng chuyển tab 08/11/2026):
  // đo vị trí/rộng thật của nút đang chọn rồi cho viên nền trượt tới bằng transform.
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [pill, setPill] = useState({ left: 0, width: 0, ready: false });
  const updatePill = useCallback(() => {
    const button = tabRefs.current[TABS.indexOf(tab)];
    if (!button) return;
    setPill({ left: button.offsetLeft, width: button.offsetWidth, ready: true });
  }, [tab]);
  // Chạy lại khi tab đổi, khi tải xong (tab mới hiện ra) và khi danh sách đổi.
  useEffect(() => { updatePill(); }, [updatePill, loading, courses.length]);
  useEffect(() => {
    window.addEventListener('resize', updatePill);
    void document.fonts.ready.then(() => updatePill());
    return () => window.removeEventListener('resize', updatePill);
  }, [updatePill]);

  if (loading && !courses.length && !search) return <Loading />;
  if (error) return <ErrorState message={error} retry={() => void load()} />;
  return (
    <>
      <header className="page-heading"><div><h1>Khóa học</h1><p>Chọn lộ trình, hoàn thành quiz và nộp project nếu khóa học yêu cầu.</p></div></header>
      <section className="panel" aria-label="Danh sách khóa học">
        <label className="field" style={{ maxWidth: 520 }}><span>Tìm khóa học</span><div style={{ position: 'relative' }}><MagnifyingGlass size={18} style={{ position: 'absolute', left: 13, top: 14, color: 'var(--muted)' }} /><input className="search-input" style={{ paddingLeft: 42 }} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập tên hoặc nội dung" /></div></label>
        <div className="tabs tabs-slide" role="tablist" aria-label="Lọc khóa học theo trạng thái" style={{ marginTop: 16 }}>
          <span className="tabs-pill" aria-hidden="true" style={{ transform: `translateX(${pill.left}px)`, width: pill.width, opacity: pill.ready ? 1 : 0 }} />
          <button ref={(el) => { tabRefs.current[0] = el; }} role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'active' : ''} onClick={() => selectTab('all')}>Tất cả</button>
          <button ref={(el) => { tabRefs.current[1] = el; }} role="tab" aria-selected={tab === 'in-progress'} className={tab === 'in-progress' ? 'active' : ''} onClick={() => selectTab('in-progress')}>Đang học</button>
          <button ref={(el) => { tabRefs.current[2] = el; }} role="tab" aria-selected={tab === 'completed'} className={tab === 'completed' ? 'active' : ''} onClick={() => selectTab('completed')}>Đã hoàn thành</button>
        </div>
        <div className="grid grid-3" style={{ marginTop: 18 }}>
          {displayed.length ? displayed.map((course) => {
            const item = progress.find((entry) => entry.courseId === course.id);
            return <CourseCard key={course.id} course={course} progress={item} />;
          }) : (
            <Empty
              title={tab === 'all' ? 'Không tìm thấy khóa học' : tab === 'in-progress' ? 'Chưa có khóa đang học' : 'Chưa hoàn thành khóa nào'}
              description={tab === 'all' ? 'Thử từ khóa ngắn hơn.' : tab === 'in-progress' ? 'Mở một khóa học và bắt đầu topic đầu tiên.' : 'Hoàn thành một khóa học để xem tại đây.'}
            />
          )}
        </div>
        <PaginationNav {...displayedPagination} disabled={loading} onChange={handlePage} />
      </section>
    </>
  );
}
