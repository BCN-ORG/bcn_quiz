'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './auth-provider';
import { Empty, ErrorState, PaginationNav } from './ui';
import { LeaderboardPlayer, LeaderboardTable, leaderboardPoints, type LeaderboardRow } from './leaderboard-table';
import { request } from '@/lib/api';

type Leaderboard = {
  date?: string;
  weekStart?: string;
  weekEnd?: string;
  closesAt: string;
  items: LeaderboardRow[];
  top3: LeaderboardRow[];
  top10Cutoff: number | null;
  currentUserRank: number | null;
  currentUserResult: LeaderboardRow | null;
  aroundMe: LeaderboardRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export function TopicLeaderboard({ topicId }: { topicId: string }) {
  const { user } = useAuth();
  const [mode, setMode] = useState<'daily' | 'weekly'>('daily');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Leaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestNumber = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestNumber.current;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (date) params.set(mode === 'daily' ? 'date' : 'weekStart', date);
      const next = await request.get<Leaderboard>(`/leaderboards/topics/${topicId}/${mode}?${params}`);
      if (currentRequest === requestNumber.current) setData(next);
    } catch (reason) { if (currentRequest === requestNumber.current) setError(reason instanceof Error ? reason.message : 'Không tải được bảng xếp hạng'); }
    finally { if (currentRequest === requestNumber.current) setLoading(false); }
  }, [topicId, mode, date, page]);

  useEffect(() => { void load(); }, [load]);
  const switchMode = (next: 'daily' | 'weekly') => { setMode(next); setDate(''); setPage(1); setData(null); };
  return (
    <section className="section panel leaderboard-section" id="topic-leaderboard" aria-label="Bảng xếp hạng Topic" aria-busy={loading}>
      <div className="section-title"><h2>Bảng xếp hạng</h2><div className="list-actions" role="group" aria-label="Chế độ bảng xếp hạng">
        <button type="button" className={`button ${mode === 'daily' ? '' : 'secondary'}`} aria-pressed={mode === 'daily'} onClick={() => switchMode('daily')}>Hôm nay</button>
        <button type="button" className={`button ${mode === 'weekly' ? '' : 'secondary'}`} aria-pressed={mode === 'weekly'} onClick={() => switchMode('weekly')}>Tuần này</button>
      </div></div>
      <label className="field" style={{ maxWidth: 260 }}><span>{mode === 'daily' ? 'Ngày' : 'Tuần chứa ngày'}</span><input type="date" value={date || (mode === 'daily' ? data?.date : data?.weekStart) || ''} onChange={(event) => { setDate(event.target.value); setPage(1); setData(null); }} /></label>
      {error ? <ErrorState message={error} retry={() => void load()} /> : null}
      {loading && !data ? <div className="leaderboard-skeleton" role="status" aria-label="Đang tải bảng xếp hạng">{[1, 2, 3, 4].map((item) => <span key={item} />)}</div> : null}
      {data ? <>
        <p className="leaderboard-period">{mode === 'daily' ? `Ngày ${data.date}` : `Tuần ${data.weekStart} → ${data.weekEnd}`} · giờ Việt Nam</p>
        {data.pagination.total === 0 ? <Empty title="Chưa có kết quả trong kỳ này." description="Hãy hoàn thành chủ đề để xuất hiện trên bảng xếp hạng." /> : <>
          <h3>Top 3</h3><div className="leaderboard-podium">{data.top3.map((row) => <div key={row.user.id} className={`leaderboard-top leaderboard-top-${row.rank}`}><span className="leaderboard-rank">#{row.rank}</span><LeaderboardPlayer row={row} current={row.user.id === user?.id} /><strong>{leaderboardPoints(row).toLocaleString('vi-VN')} điểm</strong></div>)}</div>
          {data.currentUserResult ? <div className="panel" style={{ marginTop: 20 }}>
            <h3>Thứ hạng của bạn: #{data.currentUserRank}</h3>
            <p><strong>{leaderboardPoints(data.currentUserResult).toLocaleString('vi-VN')} điểm</strong>{mode === 'daily' && data.pagination.total > 0 ? ` · Top ${Math.ceil((data.currentUserRank ?? 0) / data.pagination.total * 100)}% hôm nay` : ''}</p>
            {data.top10Cutoff != null && (data.currentUserRank ?? 0) > 10 ? <p>Top 10: {data.top10Cutoff} điểm · còn {Math.max(0, data.top10Cutoff - leaderboardPoints(data.currentUserResult))} điểm</p> : null}
            {data.aroundMe.some((row) => row.rank === (data.currentUserRank ?? 0) - 1) ? <p>Cách hạng trên {Math.max(0, leaderboardPoints(data.aroundMe.find((row) => row.rank === (data.currentUserRank ?? 0) - 1)!) - leaderboardPoints(data.currentUserResult))} điểm</p> : null}
          </div> : <p>Bạn chưa có kết quả trong kỳ này. Hoàn thành Topic để xuất hiện trên bảng xếp hạng.</p>}
          {mode === 'daily' ? <p>Bảng ngày {data.date} kết thúc lúc {new Date(data.closesAt).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })}.</p> : null}
          {data.aroundMe.length ? <><h3>Quanh bạn</h3><LeaderboardTable rows={data.aroundMe} mode={mode} currentUserId={user?.id} /></> : null}
          <h3>Tất cả</h3><LeaderboardTable rows={data.items} mode={mode} currentUserId={user?.id} />
          <PaginationNav {...data.pagination} disabled={loading} onChange={setPage} />
        </>}
      </> : null}
    </section>
  );
}
