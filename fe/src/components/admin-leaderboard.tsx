'use client';

import { useCallback, useEffect, useState } from 'react';
import { downloadFile, request } from '@/lib/api';
import type { Course, Pagination, Topic } from '@/lib/types';
import { Empty, ErrorState, Loading, PaginationNav } from './ui';

type Row = {
  rank: number;
  user: { id: string; fullName: string };
  email?: string | null;
  score?: number;
  weeklyScore?: number;
  correctCount?: number;
  totalQuestions?: number;
  accuracy?: number;
  durationMs?: number;
  submittedAt?: string;
  completedDays?: number;
  totalDurationMs?: number;
  lastSubmittedAt?: string;
};
type Data = { items: Row[]; date?: string; weekStart?: string; weekEnd?: string; pagination: Pagination<Row>['pagination'] };

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
    if (!topicId) { setData(null); return; }
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (date) params.set(mode === 'daily' ? 'date' : 'weekStart', date);
      if (search.trim()) params.set('search', search.trim());
      setData(await request.get<Data>(`/admin/leaderboards/topics/${topicId}/${mode}?${params}`));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không tải được bảng xếp hạng'); }
    finally { setLoading(false); }
  }, [topicId, mode, date, search, page]);
  useEffect(() => { void load(); }, [load]);

  const exportRows = async () => {
    if (!topicId) return;
    setExporting(true); setError('');
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
      <label className="field"><span>Khóa học</span><select value={courseId} onChange={(event) => { setCourseId(event.target.value); setPage(1); }}><option value="">Tất cả khóa học</option>{courses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field"><span>Chủ đề</span><select value={topicId} onChange={(event) => { setTopicId(event.target.value); setPage(1); }}><option value="">Chọn chủ đề</option>{topics.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field"><span>Chế độ</span><select value={mode} onChange={(event) => { setMode(event.target.value as 'daily' | 'weekly'); setDate(''); setPage(1); }}><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
      <label className="field"><span>{mode === 'daily' ? 'Ngày' : 'Tuần chứa ngày'}</span><input type="date" value={date || (mode === 'daily' ? data?.date : data?.weekStart) || ''} onChange={(event) => { setDate(event.target.value); setPage(1); }} /></label>
      <label className="field"><span>Tìm theo tên người dùng</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên người dùng" /></label>
    </div>
    {error ? <ErrorState message={error} retry={() => void load()} /> : null}
    {!topicId ? <Empty title="Chọn một chủ đề" description="Mỗi Topic có bảng xếp hạng riêng." /> : null}
    {loading && !data ? <Loading /> : null}
    {data && topicId ? <>
      <p>{mode === 'daily' ? `Ngày ${data.date}` : `Tuần ${data.weekStart} → ${data.weekEnd}`} · {data.pagination.total} người</p>
      {data.items.length ? <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 800, borderCollapse: 'collapse' }}><thead><tr>
        {(mode === 'daily' ? ['Hạng', 'User', 'Điểm', 'Đúng', 'Tổng câu', 'Chính xác', 'Thời gian', 'Nộp lúc'] : ['Hạng', 'User', 'Điểm tuần', 'Số ngày', 'Tổng thời gian', 'Nộp gần nhất']).map((label) => <th key={label} scope="col" style={{ textAlign: 'left', padding: 8 }}>{label}</th>)}
      </tr></thead><tbody>{data.items.map((row) => <tr key={row.user.id}>
        <td style={{ padding: 8 }}>#{row.rank}</td><td style={{ padding: 8 }}><strong>{row.user.fullName}</strong><br /><small>{row.user.id}{row.email ? ` · ${row.email}` : ''}</small></td>
        {mode === 'daily' ? <><td>{row.score}</td><td>{row.correctCount}</td><td>{row.totalQuestions}</td><td>{Math.round((row.accuracy ?? 0) * 100)}%</td><td>{Math.round((row.durationMs ?? 0) / 1000)}s</td><td>{row.submittedAt ? new Date(row.submittedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—'}</td></>
          : <><td>{row.weeklyScore}</td><td>{row.completedDays}</td><td>{Math.round((row.totalDurationMs ?? 0) / 1000)}s</td><td>{row.lastSubmittedAt ? new Date(row.lastSubmittedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—'}</td></>}
      </tr>)}</tbody></table></div> : <Empty title="Chưa có kết quả" description="Chọn ngày hoặc tuần khác để xem." />}
      <PaginationNav {...data.pagination} disabled={loading} onChange={setPage} />
    </> : null}
  </section>;
}
