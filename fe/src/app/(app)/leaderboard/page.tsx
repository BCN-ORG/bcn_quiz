'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Briefcase,
  Coins,
  ShieldStar,
  Sword,
  Trophy,
  User,
} from '@phosphor-icons/react';
import { useAuth } from '@/components/auth-provider';
import {
  LeaderboardPlayer,
  LeaderboardTable,
  PodiumCup,
  RankBadge,
  leaderboardPoints,
  type LeaderboardRow,
} from '@/components/leaderboard-table';
import { Empty, ErrorState, Loading, PaginationNav } from '@/components/ui';
import { request } from '@/lib/api';
import { LEADERBOARD_LIMIT, clockLabel } from '@/lib/leaderboard-filters';

type ModuleTab = 'weekly' | 'tower' | 'boss' | 'bounty';

type LeaderboardData = {
  mode: ModuleTab;
  weekStart?: string;
  weekEnd?: string;
  closesAt?: string;
  profilesAvailable?: boolean;
  items: LeaderboardRow[];
  top3: LeaderboardRow[];
  top10Cutoff: number | null;
  currentUserRank: number | null;
  currentUserResult: LeaderboardRow | null;
  aroundMe: LeaderboardRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrevious: boolean };
  progress?: { topicsDone: number; topicsTotal: number };
  season?: {
    id: string;
    name: string;
    seasonKey?: string;
    weekKey?: string;
    bossName?: string;
    bossImageUrl?: string | null;
    startsAt: string;
    endsAt: string;
  };
};

function ModuleLeaderboardView({ tab, page }: { tab: ModuleTab; page: number }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const viewKey = `${tab}|${page}`;
  const [loaded, setLoaded] = useState<{ view: string; data: LeaderboardData; at: Date } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(true);
  const requestNumber = useRef(0);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLHeadingElement>(null);

  const data = loaded?.view === viewKey ? loaded.data : null;

  const load = useCallback(async () => {
    const currentRequest = ++requestNumber.current;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LEADERBOARD_LIMIT) });
      const endpoint =
        tab === 'tower'
          ? `/leaderboards/tower?${params}`
          : tab === 'boss'
            ? `/leaderboards/boss?${params}`
            : tab === 'bounty'
              ? `/leaderboards/bounty?${params}`
              : `/leaderboards/weekly?${params}`;

      const next = await request.get<LeaderboardData>(endpoint);
      if (currentRequest === requestNumber.current) {
        setLoaded({ view: viewKey, data: next, at: new Date() });
      }
    } catch (reason) {
      if (currentRequest === requestNumber.current) {
        setError(reason instanceof Error ? reason.message : 'Không tải được bảng xếp hạng');
      }
    } finally {
      if (currentRequest === requestNumber.current) {
        setLoading(false);
      }
    }
  }, [tab, page, viewKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => {
      setOnline(true);
      void load();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [load]);

  const goToPage = (nextPage: number) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (nextPage > 1) {
      nextParams.set('page', String(nextPage));
    } else {
      nextParams.delete('page');
    }
    router.push(nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname, { scroll: false });
  };

  const fmtDay = (iso?: string | null) => {
    if (!iso) return '';
    const [, m, day] = iso.split('-');
    return day && m ? `${day}/${m}` : iso;
  };

  const namesUnavailable = data?.profilesAvailable === false;
  const isMine = Boolean(data?.currentUserRank && data.currentUserResult);

  return (
    <section
      className="section panel leaderboard-section leaderboard-card"
      id={`leaderboard-${tab}`}
      aria-label={`Bảng xếp hạng ${tab}`}
      aria-busy={loading}
    >
      {/* Module Meta Strip */}
      <div className="leaderboard-meta-strip">
        <div className="leaderboard-meta-info">
          <div className="leaderboard-meta-icon-badge">
            {tab === 'boss' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data?.season?.bossImageUrl || '/images/boss-pixel.png'}
                alt={data?.season?.bossName || 'Boss Tuần'}
                className="leaderboard-boss-mini-avatar"
              />
            ) : tab === 'tower' ? (
              <ShieldStar size={32} weight="duotone" style={{ color: 'var(--accent-strong)' }} aria-hidden="true" />
            ) : tab === 'bounty' ? (
              <Briefcase size={32} weight="duotone" style={{ color: '#eab308' }} aria-hidden="true" />
            ) : (
              <Trophy size={32} weight="duotone" style={{ color: '#d97706' }} aria-hidden="true" />
            )}
          </div>
          <div className="leaderboard-meta-text">
            <h2 ref={titleRef} tabIndex={-1} className="leaderboard-meta-title">
              {tab === 'weekly'
                ? data ? `Tuần ${fmtDay(data.weekStart)} → ${fmtDay(data.weekEnd)}` : 'Bảng xếp hạng tuần'
                : tab === 'tower'
                  ? data?.season?.name || 'Mùa giải Leo Tháp'
                  : tab === 'boss'
                    ? data?.season?.name || 'Săn Boss Tuần'
                    : 'Bảng Xếp Hạng Thợ Săn Nhiệm Vụ'}
            </h2>
            <p className="leaderboard-meta-sub">
              {tab === 'weekly'
                ? `Chốt điểm Chủ nhật 23:59 (giờ Việt Nam)${data?.progress ? ` · Bạn đã hoàn thành ${data.progress.topicsDone}/${data.progress.topicsTotal} topic` : ''}`
                : tab === 'tower'
                  ? 'Mục tiêu chinh phục 100 tầng tháp · Làm mới mỗi tháng'
                  : tab === 'boss'
                    ? `${data?.season?.bossName || 'Ma Vương Hư Không'} · Chốt kết quả Chủ nhật 23:59`
                    : 'Vinh danh các thợ săn xuất sắc hoàn thành nhiều dự án Freelancer Bounty và tích lũy nhiều coin nhất.'}
            </p>
          </div>
        </div>

        <div className="leaderboard-fresh">
          <p role="status" aria-live="polite">
            {loaded?.view === viewKey
              ? `Cập nhật lúc ${clockLabel(loaded.at)}`
              : error
                ? 'Chưa cập nhật được'
                : 'Đang tải…'}
          </p>
          <button
            type="button"
            className="button secondary leaderboard-refresh-btn"
            aria-disabled={loading}
            onClick={() => {
              if (!loading) void load();
            }}
          >
            Làm mới
          </button>
        </div>
      </div>

      {namesUnavailable && (
        <p className="leaderboard-offline" role="status">
          Chưa tải được tên người chơi từ BCN Profiles. Điểm và thứ hạng vẫn đúng; tên sẽ hiện lại khi kết nối ổn định.
        </p>
      )}
      {!online && (
        <p className="leaderboard-offline" role="status">
          Bạn đang ngoại tuyến. Dữ liệu hiển thị có thể đã cũ; sẽ tự cập nhật khi có mạng.
        </p>
      )}
      {error && <ErrorState message={error} retry={() => void load()} />}

      {loading && !data && (
        <div className="leaderboard-skeleton" role="status" aria-label="Đang tải bảng xếp hạng">
          {[1, 2, 3, 4].map((item) => (
            <span key={item} />
          ))}
        </div>
      )}

      {data && (
        <>
          {/* User Hero Rank Banner */}
          {isMine ? (
            <div className="leaderboard-user-hero joined">
              <div className="leaderboard-user-hero-body">
                <div className="leaderboard-user-hero-rank">
                  <span className="leaderboard-user-hero-label">Thứ hạng của bạn</span>
                  <RankBadge rank={data.currentUserRank!} />
                </div>
                <div className="leaderboard-user-hero-stats">
                  {tab === 'weekly' && (
                    <>
                      <span>Tổng điểm: <strong>{(data.currentUserResult?.weeklyScore ?? 0).toLocaleString('vi-VN')} đ</strong></span>
                      <span className="leaderboard-stat-sub">({data.currentUserResult?.topicsCompleted ?? 0} topic hoàn thành)</span>
                    </>
                  )}
                  {tab === 'tower' && (
                    <>
                      <span>Tầng cao nhất: <strong>Tầng {data.currentUserResult?.highestCompletedFloor ?? 0}/100</strong></span>
                    </>
                  )}
                  {tab === 'boss' && (
                    <>
                      <span>Sát thương cao nhất: <strong>{(data.currentUserResult?.highestScore ?? 0).toLocaleString('vi-VN')} đ</strong></span>
                      <span className="leaderboard-stat-sub">(Combo x{data.currentUserResult?.bestCombo ?? 0} · {data.currentUserResult?.totalAttempts ?? 0} lượt đánh)</span>
                    </>
                  )}
                  {tab === 'bounty' && (
                    <>
                      <span>Nhiệm vụ: <strong>{data.currentUserResult?.completedBountiesCount ?? 0}</strong></span>
                      <span className="leaderboard-stat-sub">· Tổng Coin: <strong style={{ color: '#eab308' }}>+{(data.currentUserResult?.totalCoinsEarned ?? 0).toLocaleString('vi-VN')} Coin</strong></span>
                    </>
                  )}
                </div>
              </div>
              <Link
                href={tab === 'tower' ? '/tower' : tab === 'boss' ? '/boss' : tab === 'bounty' ? '/bounties' : '/courses'}
                className="leaderboard-hero-cta"
              >
                <span>{tab === 'tower' ? 'Tiếp tục leo tháp' : tab === 'boss' ? 'Vào săn Boss' : tab === 'bounty' ? 'Nhận nhiệm vụ mới' : 'Học thêm topic'}</span>
                <ArrowRight weight="bold" />
              </Link>
            </div>
          ) : (
            <div className="leaderboard-user-hero unjoined">
              <div className="leaderboard-user-hero-msg">
                {tab === 'weekly' && 'Bạn chưa có điểm trong tuần này. Hoàn thành topic bài tập để xuất hiện trên bảng xếp hạng tuần!'}
                {tab === 'tower' && 'Bạn chưa vượt tầng nào trong mùa giải này. Vượt qua tầng 1 tại Leo Tháp để ghi danh bảng vàng!'}
                {tab === 'boss' && 'Bạn chưa tham chiến săn Boss tuần này. Hãy gia nhập trận chiến để ghi danh bảng vàng!'}
                {tab === 'bounty' && 'Bạn chưa hoàn thành nhiệm vụ nào. Nhận và nộp dự án Freelancer Bounty để ghi danh thợ săn!'}
              </div>
              <Link
                href={tab === 'tower' ? '/tower' : tab === 'boss' ? '/boss' : tab === 'bounty' ? '/bounties' : '/courses'}
                className="leaderboard-hero-cta"
              >
                <span>{tab === 'tower' ? 'Chinh phục ngay' : tab === 'boss' ? 'Tham chiến ngay' : tab === 'bounty' ? 'Săn nhiệm vụ ngay' : 'Khám phá khóa học'}</span>
                <ArrowRight weight="bold" />
              </Link>
            </div>
          )}

          {data.pagination.total === 0 ? (
            <Empty
              title={
                tab === 'weekly'
                  ? 'Tuần này chưa có ai hoàn thành topic.'
                  : tab === 'tower'
                    ? 'Mùa giải này chưa có ai vượt tầng tháp.'
                    : tab === 'boss'
                      ? 'Tuần này chưa có ai tham chiến săn Boss.'
                      : 'Chưa có thợ săn nào hoàn thành nhiệm vụ.'
              }
              description={
                tab === 'weekly'
                  ? 'Hãy làm một topic lần đầu để mở màn bảng xếp hạng tuần.'
                  : tab === 'tower'
                    ? 'Hãy là người đầu tiên chinh phục Tháp Kiến Thức!'
                    : tab === 'boss'
                      ? 'Hãy giáng những đòn đầu tiên lên Boss cộng đồng!'
                      : 'Hãy là người đầu tiên nhận và hoàn thành nhiệm vụ Freelancer Bounty!'
              }
            />
          ) : (
            <>
              {/* Podium Top 3 */}
              <div className="leaderboard-podium-section">
                <div className="leaderboard-section-heading">
                  <Trophy size={18} weight="fill" className="leaderboard-heading-icon" aria-hidden="true" />
                  <h3>Top 3 Vinh Danh</h3>
                </div>
                <ol className="leaderboard-podium" aria-label="Top 3">
                  {[1, 2, 3].map((rank) => {
                    const row = data.top3.find((item) => item.rank === rank);
                    return (
                      <li key={rank} className={`leaderboard-slot leaderboard-slot-${rank}`}>
                        {row ? (
                          <div className={`leaderboard-top leaderboard-top-${rank}`}>
                            <PodiumCup rank={rank} />
                            <LeaderboardPlayer
                              row={row}
                              large
                              current={row.user.id === user?.id}
                              namesUnavailable={namesUnavailable}
                            />
                            {tab === 'tower' ? (
                              <strong>Tầng {row.highestCompletedFloor ?? row.score ?? 0}</strong>
                            ) : tab === 'boss' ? (
                              <div>
                                <strong>{(row.highestScore ?? row.score ?? 0).toLocaleString('vi-VN')} đ</strong>
                                <small style={{ display: 'block', color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>
                                  Combo x{row.bestCombo ?? 0}
                                </small>
                              </div>
                            ) : tab === 'bounty' ? (
                              <div>
                                <strong>{(row.completedBountiesCount ?? 0).toLocaleString('vi-VN')} nhiệm vụ</strong>
                                <small
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    color: '#eab308',
                                    fontSize: 13,
                                    fontWeight: 700,
                                    marginTop: 2,
                                  }}
                                >
                                  <Coins weight="fill" size={14} aria-hidden="true" />
                                  +{(row.totalCoinsEarned ?? 0).toLocaleString('vi-VN')} Coin
                                </small>
                              </div>
                            ) : (
                              <strong>{leaderboardPoints(row, 'weekly').toLocaleString('vi-VN')} điểm</strong>
                            )}
                          </div>
                        ) : (
                          <div className={`leaderboard-top leaderboard-top-${rank} leaderboard-top-empty`}>
                            <PodiumCup rank={rank} faded />
                            <span className="leaderboard-empty-avatar" aria-hidden="true">
                              <User />
                            </span>
                            <p className="leaderboard-empty-label">HẠNG {rank}</p>
                            <p className="leaderboard-empty-rank">Chưa có người đạt hạng này</p>
                          </div>
                        )}
                        <div className={`leaderboard-step leaderboard-step-${rank}`} aria-hidden="true">
                          <span className="leaderboard-step-num">{rank}</span>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {/* Around Me */}
              {data.aroundMe.length > 0 && (
                <div className="leaderboard-table-section">
                  <div className="leaderboard-section-heading">
                    <User size={18} weight="bold" className="leaderboard-heading-icon" aria-hidden="true" />
                    <h3>Quanh bạn</h3>
                  </div>
                  <LeaderboardTable
                    rows={data.aroundMe}
                    mode={tab}
                    currentUserId={user?.id}
                    caption="Các hạng quanh bạn"
                    namesUnavailable={namesUnavailable}
                  />
                </div>
              )}

              {/* All Items */}
              <div className="leaderboard-table-section">
                <div className="leaderboard-section-heading">
                  <Trophy size={18} weight="bold" className="leaderboard-heading-icon" aria-hidden="true" />
                  <h3 ref={listRef} tabIndex={-1}>
                    Tất cả người chơi
                  </h3>
                </div>
                {data.items.length > 0 ? (
                  <LeaderboardTable
                    rows={data.items}
                    mode={tab}
                    currentUserId={user?.id}
                    caption={`Bảng xếp hạng ${tab}, trang ${data.pagination.page} trên ${data.pagination.totalPages}`}
                    namesUnavailable={namesUnavailable}
                  />
                ) : (
                  <>
                    <Empty
                      title="Trang này không có dữ liệu."
                      description={`Bảng chỉ có ${data.pagination.totalPages} trang.`}
                    />
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => {
                        goToPage(1);
                        listRef.current?.focus();
                      }}
                    >
                      Về trang 1
                    </button>
                  </>
                )}
              </div>

              {/* Pagination */}
              {data.pagination.totalPages > 1 && (
                <PaginationNav
                  {...data.pagination}
                  onChange={(next) => {
                    if (loading) return;
                    goToPage(next);
                    if (next <= 1 || next >= data.pagination.totalPages) {
                      listRef.current?.focus();
                    }
                  }}
                />
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

export default function LeaderboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get('tab');
  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  const page = Number.isInteger(pageParam) && pageParam >= 1 ? pageParam : 1;

  const tab: ModuleTab =
    tabParam === 'tower'
      ? 'tower'
      : tabParam === 'boss'
        ? 'boss'
        : tabParam === 'bounty'
          ? 'bounty'
          : 'weekly';

  const switchTab = (nextTab: ModuleTab) => {
    if (nextTab === tab) return;
    const nextParams = new URLSearchParams();
    if (nextTab !== 'weekly') {
      nextParams.set('tab', nextTab);
    }
    // Always reset page to 1 on tab switch to avoid mixing pagination state
    router.push(nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname, { scroll: false });
  };

  return (
    <>
      <header className="page-heading">
        <div>
          <h1>{tab === 'bounty' ? 'Bảng Xếp Hạng Thợ Săn Nhiệm Vụ' : 'Bảng xếp hạng'}</h1>
          <p>
            {tab === 'bounty'
              ? 'Vinh danh các thợ săn xuất sắc hoàn thành nhiều dự án Freelancer Bounty và tích lũy nhiều coin nhất.'
              : 'Vinh danh thành tích học tập, leo tháp tri thức và chiến công săn boss cộng đồng.'}
          </p>
        </div>
      </header>

      {/* Module Navigation Tabs */}
      <nav className="leaderboard-module-tabs" role="tablist" aria-label="Chọn bảng xếp hạng module">
        <button
          role="tab"
          aria-selected={tab === 'weekly'}
          className={`leaderboard-tab-btn tab-weekly ${tab === 'weekly' ? 'active' : ''}`}
          onClick={() => switchTab('weekly')}
        >
          <Trophy weight={tab === 'weekly' ? 'fill' : 'bold'} aria-hidden="true" />
          <span>Bài tập tuần</span>
        </button>

        <button
          role="tab"
          aria-selected={tab === 'tower'}
          className={`leaderboard-tab-btn tab-tower ${tab === 'tower' ? 'active' : ''}`}
          onClick={() => switchTab('tower')}
        >
          <ShieldStar weight={tab === 'tower' ? 'fill' : 'bold'} aria-hidden="true" />
          <span>Leo Tháp</span>
        </button>

        <button
          role="tab"
          aria-selected={tab === 'boss'}
          className={`leaderboard-tab-btn tab-boss ${tab === 'boss' ? 'active' : ''}`}
          onClick={() => switchTab('boss')}
        >
          <Sword weight={tab === 'boss' ? 'fill' : 'bold'} aria-hidden="true" />
          <span>Săn Boss</span>
        </button>

        <button
          role="tab"
          aria-selected={tab === 'bounty'}
          className={`leaderboard-tab-btn tab-bounty ${tab === 'bounty' ? 'active' : ''}`}
          onClick={() => switchTab('bounty')}
        >
          <Briefcase weight={tab === 'bounty' ? 'fill' : 'bold'} aria-hidden="true" />
          <span>Thợ Săn Nhiệm Vụ</span>
        </button>
      </nav>

      {/* Dedicated isolated view per tab with key={tab} */}
      <Suspense fallback={<Loading label="Đang tải bảng xếp hạng…" />}>
        <ModuleLeaderboardView key={tab} tab={tab} page={page} />
      </Suspense>
    </>
  );
}
