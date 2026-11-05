'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Trophy } from '@phosphor-icons/react';
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
  /** false when the server could not ask Profiles for names; names then fall back to a plain label. */
  profilesAvailable?: boolean;
  items: LeaderboardRow[];
  top3: LeaderboardRow[];
  top10Cutoff: number | null;
  currentUserRank: number | null;
  currentUserResult: LeaderboardRow | null;
  aroundMe: LeaderboardRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  /** Overall weekly board only: the viewer's all-time count of topics done out of the topics that exist. */
  progress?: { topicsDone: number; topicsTotal: number };
};

/** With a topicId: that topic's daily board. Without one: the overall weekly board (all topics together). */
export function TopicLeaderboard({ topicId }: { topicId?: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { date, page } = parseFilters(search);
  const mode: 'daily' | 'weekly' = topicId ? 'daily' : 'weekly';
  // Loaded data is tagged with the view it belongs to, so a mode/date switch shows the skeleton instead of the old board.
  const view = `${mode}|${date}`;
  const [loaded, setLoaded] = useState<{ view: string; data: Leaderboard; at: Date } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(true);
  const requestNumber = useRef(0);
  // Buttons that unmount after a click (jump, clear filter) hand keyboard focus to a stable heading instead of <body>.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLHeadingElement>(null);
  const data = loaded?.view === view ? loaded.data : null;

  // The mode is decided by the page, not by the URL, so it never appears in the query string.
  const go = useCallback((next: Omit<LeaderboardFilters, 'mode'>) => {
    const query = withFilters(new URLSearchParams(search.toString()), { mode: 'daily', ...next });
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, search]);

  const load = useCallback(async () => {
    const currentRequest = ++requestNumber.current;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LEADERBOARD_LIMIT) });
      if (date) params.set(mode === 'daily' ? 'date' : 'weekStart', date);
      const next = await request.get<Leaderboard>(topicId ? `/leaderboards/topics/${encodeURIComponent(topicId)}/daily?${params}` : `/leaderboards/weekly?${params}`);
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
  const namesUnavailable = data?.profilesAvailable === false;
  const onlyMe = Boolean(data && data.pagination.total === 1 && mine);

  return (
    <section className="section panel leaderboard-section leaderboard-card" id="topic-leaderboard" aria-label={topicId ? 'Bảng xếp hạng Topic' : 'Bảng xếp hạng tuần'} aria-busy={loading}>
      <div className="section-title"><h2 ref={titleRef} tabIndex={-1}><Trophy weight="duotone" aria-hidden="true" /> {topicId ? 'Bảng xếp hạng ngày' : 'Bảng xếp hạng tuần'}</h2></div>

      <div className="leaderboard-toolbar">
        <label className="field leaderboard-date"><span>{mode === 'daily' ? 'Ngày' : 'Tuần chứa ngày'}</span><input type="date" value={date || (mode === 'daily' ? data?.date : data?.weekStart) || ''} onChange={(event) => go({ date: event.target.value, page: 1 })} /></label>
        <div className="leaderboard-fresh">
          <p role="status" aria-live="polite">{loaded?.view === view ? `Cập nhật lúc ${clockLabel(loaded.at)} · không tự động làm mới` : error ? 'Chưa cập nhật được.' : 'Đang cập nhật…'}</p>
          <button type="button" className="button secondary" aria-disabled={loading} onClick={() => { if (!loading) void load(); }}>Làm mới</button>
        </div>
      </div>
      <div className="leaderboard-filters" role="group" aria-label="Bộ lọc đang áp dụng">
        <span className="leaderboard-chip">{mode === 'daily' ? 'Theo ngày' : 'Theo tuần'}</span>
        {period ? <span className="leaderboard-chip">{period} · giờ Việt Nam</span> : null}
        {page > 1 ? <span className="leaderboard-chip">Trang {page}</span> : null}
        {isFiltered({ mode: 'daily', date, page }) ? <button type="button" className="button secondary" onClick={() => { go({ date: '', page: 1 }); titleRef.current?.focus(); }}>Xóa bộ lọc</button> : null}
      </div>


      {mode === 'weekly' && data?.progress ? <p className="leaderboard-hint" id="leaderboard-progress">Bạn đã làm <strong>{data.progress.topicsDone}/{data.progress.topicsTotal}</strong> topic (tính từ trước đến nay). Chỉ lần làm đầu tiên của mỗi topic được cộng điểm; làm lại chỉ để ôn tập.</p> : null}
      {mode === 'weekly' ? <p className="leaderboard-hint">Điểm tuần là tổng điểm lần làm đầu tiên của các topic bạn hoàn thành từ Thứ Hai đến Chủ nhật (giờ Việt Nam).</p> : null}
      {namesUnavailable ? <p className="leaderboard-offline" role="status">Chưa tải được tên người chơi từ BCN. Điểm và thứ hạng vẫn đúng; tên sẽ hiện lại khi hệ thống kết nối được. Bạn có thể bấm Làm mới sau ít phút.</p> : null}
      {!online ? <p className="leaderboard-offline" role="status">Bạn đang ngoại tuyến. Bảng hiển thị có thể đã cũ; sẽ tự tải lại khi có mạng.</p> : null}
      {error ? <ErrorState message={error} retry={() => void load()} /> : null}
      {loading && !data ? <div className="leaderboard-skeleton" role="status" aria-label="Đang tải bảng xếp hạng">{[1, 2, 3, 4].map((item) => <span key={item} />)}</div> : null}
      {data ? <>
        {data.pagination.total === 0 ? <Empty title={mode === 'weekly' ? 'Tuần này chưa có ai hoàn thành topic.' : 'Chưa có kết quả trong kỳ này.'} description={mode === 'weekly' ? 'Làm một topic lần đầu để xuất hiện trên bảng xếp hạng tuần.' : 'Hãy hoàn thành chủ đề để xuất hiện trên bảng xếp hạng.'} /> : <>
          {mine && myRank ? <div className="panel leaderboard-me" id="leaderboard-me">
            <h3>Hạng của bạn: <span className="leaderboard-me-rank">#{myRank}</span></h3>
            <p><strong>{leaderboardPoints(mine).toLocaleString('vi-VN')} điểm</strong>{mode === 'weekly' ? ` · ${mine.topicsCompleted ?? 0} topic trong tuần` : ''}{mode === 'daily' && data.pagination.total > 0 ? ` · Top ${Math.ceil(myRank / data.pagination.total * 100)}% hôm nay` : ''}</p>
            {data.top10Cutoff != null && myRank > 10 ? <p>Top 10: {data.top10Cutoff} điểm · còn {Math.max(0, data.top10Cutoff - leaderboardPoints(mine))} điểm</p> : null}
            {data.aroundMe.some((row) => row.rank === myRank - 1) ? <p>Cách hạng trên {Math.max(0, leaderboardPoints(data.aroundMe.find((row) => row.rank === myRank - 1)!) - leaderboardPoints(mine))} điểm</p> : null}
            {onThisPage ? <p className="leaderboard-hint">Bạn đang ở trang này, dòng của bạn được tô sáng.</p>
              : <button type="button" className="button secondary" onClick={() => { go({ date, page: pageOfRank(myRank, data.pagination.limit) }); listRef.current?.focus(); }}>Đi tới trang {pageOfRank(myRank, data.pagination.limit)} (vị trí của bạn)</button>}
          </div> : <p>Bạn chưa có kết quả trong kỳ này. {mode === 'weekly' ? 'Làm một topic lần đầu để xuất hiện trên bảng xếp hạng tuần.' : 'Hoàn thành Topic để xuất hiện trên bảng xếp hạng.'}</p>}
          {onlyMe ? <p className="leaderboard-hint">Hiện chỉ có mình bạn trên bảng trong kỳ này.</p> : null}

          <h3>Top 3</h3>
          <ol className="leaderboard-podium" aria-label="Top 3">{data.top3.map((row) => <li key={row.user.id} className={`leaderboard-top leaderboard-top-${row.rank}`}><span className="leaderboard-rank"><span className="sr-only">Hạng </span>#{row.rank}</span><LeaderboardPlayer row={row} large current={row.user.id === user?.id} namesUnavailable={namesUnavailable} /><strong>{leaderboardPoints(row).toLocaleString('vi-VN')} điểm</strong></li>)}</ol>
          {mode === 'daily' ? <p className="leaderboard-hint">Bảng ngày {data.date} kết thúc lúc {new Date(data.closesAt).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })}.</p> : null}
          {data.aroundMe.length ? <><h3>Quanh bạn</h3><LeaderboardTable rows={data.aroundMe} mode={mode} currentUserId={user?.id} caption="Các hạng quanh bạn" namesUnavailable={namesUnavailable} /></> : null}
          <h3 ref={listRef} tabIndex={-1}>Tất cả</h3>
          {data.items.length ? <LeaderboardTable rows={data.items} mode={mode} currentUserId={user?.id} caption={`${period}, trang ${data.pagination.page} trên ${data.pagination.totalPages}`} namesUnavailable={namesUnavailable} /> : <><Empty title="Trang này không có dòng nào." description={`Bảng chỉ có ${data.pagination.totalPages} trang.`} /><button type="button" className="button secondary" onClick={() => { go({ date, page: 1 }); listRef.current?.focus(); }}>Về trang 1</button></>}
          {data.items.length ? <PaginationNav {...data.pagination} onChange={(next) => {
            if (loading) return;
            go({ date, page: next });
            // The pager button that was just used becomes disabled on the first/last page, which would drop focus to <body>.
            if (next <= 1 || next >= data.pagination.totalPages) listRef.current?.focus();
          }} /> : null}
        </>}
      </> : null}
    </section>
  );
}
