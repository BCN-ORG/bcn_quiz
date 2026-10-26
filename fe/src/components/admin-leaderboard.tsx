'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import { downloadFile, request } from '@/lib/api';
import type { Course, Pagination, Topic } from '@/lib/types';
import { Empty, ErrorState, Loading, PaginationNav } from './ui';
import { LeaderboardTable, type LeaderboardRow } from './leaderboard-table';

type Data = { items: LeaderboardRow[]; date?: string; weekStart?: string; weekEnd?: string; pagination: Pagination<LeaderboardRow>['pagination'] };

async function allPages<T>(path: string): Promise<T[]> {
  const first = await request.get<Pagination<T>>(`${path}${path.includes('?') ? '&' : '?'}page=1&limit=100`);
  const pages = await Promise.all(Array.from({ length: first.pagination.totalPages - 1 }, (_, index) =>
    request.get<Pagination<T>>(`${path}${path.includes('?') ? '&' : '?'}page=${index + 2}&limit=100`)));
  return [first, ...pages].flatMap((page) => page.items);
}

export function AdminLeaderboard() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState('');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopicId] = useState('');
  const [mode, setMode] = useState<'daily' | 'weekly'>('daily');
  const [date, setDate] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [searchFailed, setSearchFailed] = useState(false);
  const requestNumber = useRef(0);

  useEffect(() => { void allPages<Course>('/course').then(setCourses).catch((reason) => setError(reason instanceof Error ? reason.message : 'Không tải được khóa học')); }, []);
  useEffect(() => {
    setTopicId(''); setTopics([]);
    const path = courseId ? `/course/${courseId}/topics` : '/topic';
    void allPages<Topic | { topic: Topic }>(path)
      .then((rows) => setTopics([...new Map(rows.map((row) => {
        const topic = 'topic' in row ? row.topic : row;
        return [topic.id, topic] as const;
      })).values()]))
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Không tải được chủ đề'));
  }, [courseId]);
  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(query.trim()); setPage(1); }, 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    const currentRequest = ++requestNumber.current;
    if (!topicId) { setData(null); return; }
    setLoading(true); setError(''); setSearchFailed(false);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (date) params.set(mode === 'daily' ? 'date' : 'weekStart', date);
      if (search.trim()) params.set('search', search.trim());
      const next = await request.get<Data>(`/admin/leaderboards/topics/${topicId}/${mode}?${params}`);
      if (currentRequest === requestNumber.current) setData(next);
    } catch (reason) {
      if (currentRequest === requestNumber.current) {
        setSearchFailed(Boolean(search));
        setError(search ? 'Bảng xếp hạng vẫn hoạt động. Bạn có thể xóa tìm kiếm để xem toàn bộ.' : reason instanceof Error ? reason.message : 'Không tải được bảng xếp hạng');
      }
    }
    finally { if (currentRequest === requestNumber.current) setLoading(false); }
  }, [topicId, mode, date, search, page]);
  useEffect(() => { void load(); }, [load]);

  const exportRows = async () => {
    if (!topicId) return;
    setExporting(true); setError(''); setSearchFailed(false);
    try {
      const selected = date || (mode === 'daily' ? data?.date : data?.weekStart) || '';
      const params = new URLSearchParams({ format: 'xlsx' });
      if (selected) params.set(mode === 'daily' ? 'date' : 'weekStart', selected);
      await downloadFile(`/admin/leaderboards/topics/${topicId}/${mode}/export?${params}`, `${mode}-leaderboard.xlsx`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không xuất được file'); }
    finally { setExporting(false); }
  };

  return <section className="section panel" aria-label="Quản trị bảng xếp hạng">
    <div className="section-title"><h2>Bảng xếp hạng Topic</h2><button className="button" type="button" disabled={!topicId || exporting} onClick={() => void exportRows()}>{exporting ? 'Đang xuất…' : 'Xuất toàn bộ XLSX'}</button></div>
    <div className="grid grid-2">
      <label className="field"><span>Khóa học</span><select value={courseId} onChange={(event) => { setCourseId(event.target.value); setData(null); setPage(1); }}><option value="">Tất cả khóa học</option>{courses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field"><span>Chủ đề</span><select value={topicId} onChange={(event) => { setTopicId(event.target.value); setData(null); setPage(1); }}><option value="">Chọn chủ đề</option>{topics.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field"><span>Chế độ</span><select value={mode} onChange={(event) => { setMode(event.target.value as 'daily' | 'weekly'); setDate(''); setData(null); setPage(1); }}><option value="daily">Hôm nay</option><option value="weekly">Tuần này</option></select></label>
      <label className="field"><span>{mode === 'daily' ? 'Ngày' : 'Tuần chứa ngày'}</span><input type="date" value={date || (mode === 'daily' ? data?.date : data?.weekStart) || ''} onChange={(event) => { setDate(event.target.value); setData(null); setPage(1); }} /></label>
      <label className="field"><span>Tìm theo tên người dùng</span><span className="leaderboard-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên người dùng" />{query.trim() && (query.trim() !== search || loading) ? <CircleNotch className="spin" aria-label="Đang tìm kiếm" /> : null}</span></label>
    </div>
    {error ? <ErrorState title={searchFailed ? 'Không thể tìm kiếm người dùng lúc này.' : undefined} message={error} retry={() => void load()} /> : null}
    {!topicId ? <Empty title="Chọn một chủ đề" description="Mỗi Topic có bảng xếp hạng riêng." /> : null}
    {loading && !data ? <Loading label="Đang tải bảng xếp hạng" /> : null}
    {data && topicId ? <>
      <p aria-live="polite">{searchFailed ? 'Kết quả tải lần cuối' : mode === 'daily' ? `Ngày ${data.date}` : `Tuần ${data.weekStart} → ${data.weekEnd}`} · {data.pagination.total} người</p>
      {data.items.length ? <LeaderboardTable rows={data.items} mode={mode} /> : <Empty title={search ? 'Chưa có kết quả phù hợp.' : 'Chưa có kết quả trong kỳ này.'} description={search ? 'Thử tên khác hoặc xóa ô tìm kiếm.' : 'Chọn ngày hoặc tuần khác để xem.'} />}
      <PaginationNav {...data.pagination} disabled={loading} onChange={setPage} />
    </> : null}
  </section>;
}
