'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth-provider';
import { Empty, ErrorState, Loading, PaginationNav } from './ui';
import { request } from '@/lib/api';

type Row = {
  rank: number;
  user: { id: string; fullName: string; avatarUrl: string | null };
  score?: number;
  weeklyScore?: number;
  correctCount?: number;
  totalQuestions?: number;
  durationMs?: number;
  completedDays?: number;
};

type Leaderboard = {
  date?: string;
  weekStart?: string;
  weekEnd?: string;
  closesAt: string;
  items: Row[];
  top3: Row[];
  top10Cutoff: number | null;
  currentUserRank: number | null;
  currentUserResult: Row | null;
  aroundMe: Row[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

function points(row: Row) { return row.weeklyScore ?? row.score ?? 0; }

export function TopicLeaderboard({ topicId, refreshKey = 0 }: { topicId: string; refreshKey?: number }) {
  const { user } = useAuth();
  const [mode, setMode] = useState<'daily' | 'weekly'>('daily');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Leaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (date) params.set(mode === 'daily' ? 'date' : 'weekStart', date);
      setData(await request.get<Leaderboard>(`/leaderboards/topics/${topicId}/${mode}?${params}`));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không tải được bảng xếp hạng'); }
    finally { setLoading(false); }
  }, [topicId, mode, date, page]);

  useEffect(() => { void load(); }, [load, refreshKey]);
  const switchMode = (next: 'daily' | 'weekly') => { setMode(next); setDate(''); setPage(1); setData(null); };
  const card = (row: Row) => (
    <div key={`${mode}-${row.rank}`} className="list-row" style={{ background: row.user.id === user?.id ? 'var(--surface-hover, transparent)' : undefined }}>
      <div className="card-meta" style={{ gap: 12, minWidth: 0 }}>
        <strong>#{row.rank}</strong>
        {/* Profiles avatar URLs are external and not configured for Next image optimization. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {row.user.avatarUrl ? <img src={row.user.avatarUrl} alt="" width={32} height={32} style={{ borderRadius: '50%', objectFit: 'cover' }} /> : <span className="avatar" aria-hidden="true">{row.user.fullName.slice(0, 1)}</span>}
        <span>{row.user.fullName}{row.user.id === user?.id ? ' · Bạn' : ''}</span>
      </div>
      <strong>{points(row).toLocaleString('vi-VN')} điểm</strong>
    </div>
  );

  return (
    <section className="section panel" id="topic-leaderboard" aria-label="Bảng xếp hạng Topic">
      <div className="section-title"><h2>Bảng xếp hạng</h2><div className="list-actions" role="group" aria-label="Chế độ bảng xếp hạng">
        <button type="button" className={`button ${mode === 'daily' ? '' : 'secondary'}`} aria-pressed={mode === 'daily'} onClick={() => switchMode('daily')}>Hôm nay</button>
        <button type="button" className={`button ${mode === 'weekly' ? '' : 'secondary'}`} aria-pressed={mode === 'weekly'} onClick={() => switchMode('weekly')}>Tuần này</button>
      </div></div>
      <label className="field" style={{ maxWidth: 260 }}><span>{mode === 'daily' ? 'Ngày' : 'Tuần chứa ngày'}</span><input type="date" value={date || (mode === 'daily' ? data?.date : data?.weekStart) || ''} onChange={(event) => { setDate(event.target.value); setPage(1); }} /></label>
      {error ? <ErrorState message={error} retry={() => void load()} /> : null}
      {loading && !data ? <Loading /> : null}
      {data ? <>
        <p>{mode === 'daily' ? `Ngày ${data.date}` : `Tuần ${data.weekStart} → ${data.weekEnd}`} · múi giờ Việt Nam</p>
        {data.pagination.total === 0 ? <Empty title="Chưa có ai hoàn thành Topic này" description="Hãy trở thành người đầu tiên trên bảng xếp hạng." /> : <>
          <h3>Top 3</h3><div className="list">{data.top3.map(card)}</div>
          {data.currentUserResult ? <div className="panel" style={{ marginTop: 20 }}>
            <h3>Thứ hạng của bạn: #{data.currentUserRank}</h3>
            <p><strong>{points(data.currentUserResult).toLocaleString('vi-VN')} điểm</strong>{mode === 'daily' && data.pagination.total > 0 ? ` · Top ${Math.ceil((data.currentUserRank ?? 0) / data.pagination.total * 100)}% hôm nay` : ''}</p>
            {data.top10Cutoff != null && (data.currentUserRank ?? 0) > 10 ? <p>Top 10: {data.top10Cutoff} điểm · còn {Math.max(0, data.top10Cutoff - points(data.currentUserResult))} điểm</p> : null}
            {data.aroundMe.some((row) => row.rank === (data.currentUserRank ?? 0) - 1) ? <p>Cách hạng trên {Math.max(0, points(data.aroundMe.find((row) => row.rank === (data.currentUserRank ?? 0) - 1)!) - points(data.currentUserResult))} điểm</p> : null}
          </div> : <p>Bạn chưa có kết quả trong kỳ này. Hoàn thành Topic để xuất hiện trên bảng xếp hạng.</p>}
          {mode === 'daily' ? <p>Bảng ngày {data.date} kết thúc lúc {new Date(data.closesAt).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })}.</p> : null}
          {data.aroundMe.length ? <><h3>Quanh bạn</h3><div className="list">{data.aroundMe.map(card)}</div></> : null}
          <h3>Tất cả</h3><div className="list">{data.items.map(card)}</div>
          <PaginationNav {...data.pagination} disabled={loading} onChange={setPage} />
        </>}
      </> : null}
    </section>
  );
}
