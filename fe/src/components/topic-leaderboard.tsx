'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './auth-provider';
import { Empty, ErrorState, PaginationNav } from './ui';
import { LeaderboardPlayer, LeaderboardTable, leaderboardPoints, type LeaderboardRow } from './leaderboard-table';
import { request } from '@/lib/api';
import { LEADERBOARD_LIMIT, clockLabel, isFiltered, pageOfRank, parseFilters, withFilters, type LeaderboardFilters } from '@/lib/leaderboard-filters';

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
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { mode, date, page } = parseFilters(search);
  // Loaded data is tagged with the view it belongs to, so a mode/date switch shows the skeleton instead of the old board.
  const view = `${mode}|${date}`;
  const [loaded, setLoaded] = useState<{ view: string; data: Leaderboard; at: Date } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(true);
  const requestNumber = useRef(0);
  const data = loaded?.view === view ? loaded.data : null;

  const go = useCallback((next: LeaderboardFilters) => {
    const query = withFilters(new URLSearchParams(search.toString()), next);
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, search]);

  const load = useCallback(async () => {
    const currentRequest = ++requestNumber.current;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LEADERBOARD_LIMIT) });
      if (date) params.set(mode === 'daily' ? 'date' : 'weekStart', date);
      const next = await request.get<Leaderboard>(`/leaderboards/topics/${topicId}/${mode}?${params}`);
      if (currentRequest === requestNumber.current) setLoaded({ view, data: next, at: new Date() });
    } catch (reason) { if (currentRequest === requestNumber.current) setError(reason instanceof Error ? reason.message : 'Không tải được bảng xếp hạng'); }
    finally { if (currentRequest === requestNumber.current) setLoading(false); }
  }, [topicId, mode, date, page, view]);

  // One request per URL change; nothing here polls.
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => { setOnline(true); void load(); };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, [load]);

  const mine = data?.currentUserResult ?? null;
  const myRank = data?.currentUserRank ?? null;
  const onThisPage = Boolean(data && user && data.items.some((row) => row.user.id === user.id));
  const period = data ? (mode === 'daily' ? `Ngày ${data.date}` : `Tuần ${data.weekStart} → ${data.weekEnd}`) : '';
  const onlyMe = Boolean(data && data.pagination.total === 1 && mine);

  return (
    <section className="section panel leaderboard-section" id="topic-leaderboard" aria-label="Bảng xếp hạng Topic" aria-busy={loading}>
      <div className="section-title"><h2>Bảng xếp hạng</h2><div className="list-actions" role="group" aria-label="Chế độ bảng xếp hạng">
        <button type="button" className={`button ${mode === 'daily' ? '' : 'secondary'}`} aria-pressed={mode === 'daily'} onClick={() => go({ mode: 'daily', date: '', page: 1 })}>Hôm nay</button>
        <button type="button" className={`button ${mode === 'weekly' ? '' : 'secondary'}`} aria-pressed={mode === 'weekly'} onClick={() => go({ mode: 'weekly', date: '', page: 1 })}>Tuần này</button>
      </div></div>
      <label className="field" style={{ maxWidth: 260 }}><span>{mode === 'daily' ? 'Ngày' : 'Tuần chứa ngày'}</span><input type="date" value={date || (mode === 'daily' ? data?.date : data?.weekStart) || ''} onChange={(event) => go({ mode, date: event.target.value, page: 1 })} /></label>

      <div className="leaderboard-filters" role="group" aria-label="Bộ lọc đang áp dụng">
        <span className="leaderboard-chip">{mode === 'daily' ? 'Theo ngày' : 'Theo tuần'}</span>
        {period ? <span className="leaderboard-chip">{period} · giờ Việt Nam</span> : null}
        {page > 1 ? <span className="leaderboard-chip">Trang {page}</span> : null}
        {isFiltered({ mode, date, page }) ? <button type="button" className="button secondary" onClick={() => go({ mode: 'daily', date: '', page: 1 })}>Xóa bộ lọc</button> : null}
      </div>

      <div className="leaderboard-fresh">
        <p role="status" aria-live="polite">{loaded?.view === view ? `Cập nhật lúc ${clockLabel(loaded.at)} · không tự động làm mới` : 'Đang cập nhật…'}</p>
        <button type="button" className="button secondary" disabled={loading} onClick={() => void load()}>Làm mới</button>
      </div>

      {!online ? <p className="leaderboard-offline" role="status">Bạn đang ngoại tuyến. Bảng hiển thị có thể đã cũ; sẽ tự tải lại khi có mạng.</p> : null}
      {error ? <ErrorState message={error} retry={() => void load()} /> : null}
      {loading && !data ? <div className="leaderboard-skeleton" role="status" aria-label="Đang tải bảng xếp hạng">{[1, 2, 3, 4].map((item) => <span key={item} />)}</div> : null}
      {data ? <>
        {data.pagination.total === 0 ? <Empty title="Chưa có kết quả trong kỳ này." description="Hãy hoàn thành chủ đề để xuất hiện trên bảng xếp hạng." /> : <>
          {mine && myRank ? <div className="panel leaderboard-me" id="leaderboard-me">
            <h3>Hạng của bạn: #{myRank}</h3>
            <p><strong>{leaderboardPoints(mine).toLocaleString('vi-VN')} điểm</strong>{mode === 'daily' && data.pagination.total > 0 ? ` · Top ${Math.ceil(myRank / data.pagination.total * 100)}% hôm nay` : ''}</p>
            {data.top10Cutoff != null && myRank > 10 ? <p>Top 10: {data.top10Cutoff} điểm · còn {Math.max(0, data.top10Cutoff - leaderboardPoints(mine))} điểm</p> : null}
            {data.aroundMe.some((row) => row.rank === myRank - 1) ? <p>Cách hạng trên {Math.max(0, leaderboardPoints(data.aroundMe.find((row) => row.rank === myRank - 1)!) - leaderboardPoints(mine))} điểm</p> : null}
            {onThisPage ? <p className="leaderboard-hint">Bạn đang ở trang này, dòng của bạn được tô sáng.</p>
              : <button type="button" className="button secondary" disabled={loading} onClick={() => go({ mode, date, page: pageOfRank(myRank, data.pagination.limit) })}>Đi tới trang {pageOfRank(myRank, data.pagination.limit)} (vị trí của bạn)</button>}
          </div> : <p>Bạn chưa có kết quả trong kỳ này. Hoàn thành Topic để xuất hiện trên bảng xếp hạng.</p>}
          {onlyMe ? <p className="leaderboard-hint">Hiện chỉ có mình bạn trên bảng trong kỳ này.</p> : null}

          <h3>Top 3</h3>
          <ol className="leaderboard-podium" aria-label="Top 3">{data.top3.map((row) => <li key={row.user.id} className={`leaderboard-top leaderboard-top-${row.rank}`}><span className="leaderboard-rank"><span className="sr-only">Hạng </span>#{row.rank}</span><LeaderboardPlayer row={row} current={row.user.id === user?.id} /><strong>{leaderboardPoints(row).toLocaleString('vi-VN')} điểm</strong></li>)}</ol>
          {mode === 'daily' ? <p className="leaderboard-hint">Bảng ngày {data.date} kết thúc lúc {new Date(data.closesAt).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })}.</p> : null}
          {data.aroundMe.length ? <><h3>Quanh bạn</h3><LeaderboardTable rows={data.aroundMe} mode={mode} currentUserId={user?.id} caption="Các hạng quanh bạn" /></> : null}
          <h3>Tất cả</h3>
          {data.items.length ? <LeaderboardTable rows={data.items} mode={mode} currentUserId={user?.id} caption={`${period}, trang ${data.pagination.page} trên ${data.pagination.totalPages}`} /> : <><Empty title="Trang này không có dòng nào." description={`Bảng chỉ có ${data.pagination.totalPages} trang.`} /><button type="button" className="button secondary" onClick={() => go({ mode, date, page: 1 })}>Về trang 1</button></>}
          <PaginationNav {...data.pagination} disabled={loading} onChange={(next) => go({ mode, date, page: next })} />
        </>}
      </> : null}
    </section>
  );
}
