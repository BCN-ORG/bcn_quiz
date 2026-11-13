'use client';

import Link from 'next/link';
import {
  BookOpen,
  Certificate as CertificateIcon,
  CheckCircle,
  ClockCountdown,
  Coins,
  Compass,
  Fire,
  HourglassHigh,
  Lightning,
  Medal,
  ShieldStar,
  Sparkle,
  Target,
  Trophy,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { CourseCard } from '@/components/course-card';
import {
  LeaderboardPlayer,
  RankBadge,
  leaderboardPoints,
  type LeaderboardRow,
} from '@/components/leaderboard-table';
import { Empty, ErrorState, Loading } from '@/components/ui';
import { request, serverNow } from '@/lib/api';
import { topicOpen } from '@/lib/format';
import { canReadQuestions, canReadResults } from '@/lib/permissions';
import {
  towerApi,
  type TowerOverview,
  type TowerRewardTransactionItem,
} from '@/lib/tower';
import type {
  Certificate as CourseCertificate,
  Course,
  CourseProgress,
  Pagination,
} from '@/lib/types';

type CourseTopic = NonNullable<Course['topics']>[number];

/** Phiên làm bài — lấy thêm mốc thời gian & điểm thật để tính Chuỗi ngày học (Streak) và Nhiệm vụ ngày. */
type SessionItem = {
  id: string;
  topicId: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';
  answeredCount: number;
  quizTotal?: number | null;
  score?: number | null;
  correctCount?: number | null;
  startedAt?: string | null;
  submittedAt?: string | null;
  lastSeenAt?: string | null;
  topic?: { name: string } | null;
};

/** Một bài tập trong mục "Cần hoàn thành". */
type TodoTopic = {
  topicId: string;
  topicName: string;
  courseId: string;
  courseName: string;
  quizCount: number;
  /** Phiên đang làm dở (nếu có) để hiện tiến độ + nút "Tiếp tục". */
  inProgress: { answeredCount: number; quizTotal: number | null } | null;
};

/** Dữ liệu Bảng xếp hạng tuần từ GET /leaderboards/weekly. */
type WeeklyLeaderboardSummary = {
  weekStart?: string;
  weekEnd?: string;
  closesAt?: string;
  profilesAvailable?: boolean;
  items: LeaderboardRow[];
  top3: LeaderboardRow[];
  currentUserRank: number | null;
  currentUserResult: LeaderboardRow | null;
  progress?: { topicsDone: number; topicsTotal: number };
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

/** Tải hết các trang của một API phân trang (50 mục/trang). */
async function fetchAll<T>(path: string): Promise<T[]> {
  const limit = 50;
  const first = await request.get<Pagination<T>>(`${path}?page=1&limit=${limit}`);
  const items = [...first.items];
  const total = first.pagination.total;
  let page = 2;
  while (items.length < total) {
    const data = await request.get<Pagination<T>>(`${path}?page=${page}&limit=${limit}`);
    items.push(...data.items);
    page += 1;
  }
  return items;
}

/** Chuyển timestamp bất kỳ sang ngày YYYY-MM-DD theo múi giờ Việt Nam (Asia/Ho_Chi_Minh, UTC+7). */
function toVNDateKey(iso?: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);
}

function formatVNDateKeyFromMs(ms: number): string {
  return new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);
}

function getVNWeekdayLabel(dateKey: string): string {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  const labels = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return labels[day] || 'T2';
}

function formatDayMonth(dateKey: string): string {
  const [, month, day] = dateKey.split('-');
  return day && month ? `${day}/${month}` : dateKey;
}

function formatCooldown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function getRankTitle(level: number): string {
  if (level <= 2) return 'Tân Binh BCN';
  if (level <= 5) return 'Chiến Binh Code';
  if (level <= 9) return 'Hiệp Sĩ Tri Thức';
  return 'Bậc Thầy Tháp Học Thuật';
}

function getPreviewFloors(currentFloor: number): number[] {
  const clamped = Math.max(1, Math.min(100, currentFloor));
  let start = clamped - 2;
  if (start < 1) start = 1;
  if (start + 4 > 100) start = 96;
  return Array.from({ length: 5 }, (_, idx) => start + idx);
}

function getSeasonRemainingLabel(endsAt?: string | null, nowMs = serverNow()): string {
  if (!endsAt) return 'Làm mới đầu tháng';
  const diffMs = new Date(endsAt).getTime() - nowMs;
  if (Number.isNaN(diffMs) || diffMs <= 0) return 'Sắp làm mới mùa giải';
  const days = Math.floor(diffMs / (24 * 3600_000));
  const hours = Math.floor((diffMs % (24 * 3600_000)) / 3600_000);
  if (days > 0) return `Còn ${days} ngày ${hours}h`;
  const mins = Math.max(1, Math.floor((diffMs % 3600_000) / 60_000));
  return `Còn ${hours}h ${mins}p`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<CourseProgress[]>([]);
  const [certificateCount, setCertificateCount] = useState(0);
  const [certificates, setCertificates] = useState<CourseCertificate[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [todos, setTodos] = useState<TodoTopic[]>([]);
  const [towerOverview, setTowerOverview] = useState<TowerOverview | null>(null);
  const [transactions, setTransactions] = useState<TowerRewardTransactionItem[]>([]);
  const [weeklyBoard, setWeeklyBoard] = useState<WeeklyLeaderboardSummary | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [progress, certs, sessionList, towerData, txList, weeklyData] = await Promise.all([
        canReadQuestions(user)
          ? request.get<Pagination<CourseProgress>>('/course/progress/me?limit=6')
          : Promise.resolve({
              items: [] as CourseProgress[],
              pagination: { page: 1, limit: 6, total: 0, totalPages: 1 },
            }),
        canReadResults(user)
          ? request.get<Pagination<CourseCertificate>>('/certificate/me?limit=10').catch(() => ({
              items: [] as CourseCertificate[],
              pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
            }))
          : Promise.resolve({
              items: [] as CourseCertificate[],
              pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
            }),
        canReadResults(user)
          ? fetchAll<SessionItem>('/attempt/sessions/me').catch(() => [] as SessionItem[])
          : Promise.resolve([] as SessionItem[]),
        towerApi.getOverview().catch(() => null),
        towerApi.getTransactions().catch(() => [] as TowerRewardTransactionItem[]),
        request.get<WeeklyLeaderboardSummary>('/leaderboards/weekly?page=1&limit=5').catch(() => null),
      ]);

      setCourses(progress.items);
      setCertificateCount(certs.pagination.total);
      setCertificates(certs.items);
      setSessions(sessionList);
      setTowerOverview(towerData);
      setTransactions(txList);
      setWeeklyBoard(weeklyData);

      if (towerData?.progress.isCooldownActive && towerData.progress.cooldownRemainingSeconds > 0) {
        setCooldownRemaining(towerData.progress.cooldownRemainingSeconds);
      } else {
        setCooldownRemaining(0);
      }

      // Topic đã nộp (SUBMITTED) là đã hoàn thành — không cần làm nữa.
      const submitted = new Set(
        sessionList.filter((s) => s.status === 'SUBMITTED').map((s) => s.topicId),
      );
      const inProgress = new Map<string, SessionItem>();
      sessionList
        .filter((s) => s.status === 'IN_PROGRESS')
        .forEach((s) => {
          if (!inProgress.has(s.topicId)) inProgress.set(s.topicId, s);
        });

      // Chỉ xét khóa học chưa hoàn thành (khóa đã xong thì không còn bài cần làm).
      const openCourses = progress.items.filter((item) => item.status !== 'COMPLETED');
      const topicLists = await Promise.all(
        openCourses.map((item) =>
          fetchAll<CourseTopic>(`/course/${item.course.id}/topics`).catch(() => [] as CourseTopic[]),
        ),
      );

      const list: TodoTopic[] = [];
      const seenTopics = new Set<string>();
      openCourses.forEach((item, index) => {
        topicLists[index].forEach(({ topic }) => {
          if (!topicOpen(topic.availability)) return;
          if (submitted.has(topic.id)) return;
          if (seenTopics.has(topic.id)) return;
          seenTopics.add(topic.id);
          const session = inProgress.get(topic.id) || null;
          list.push({
            topicId: topic.id,
            topicName: topic.name,
            courseId: item.course.id,
            courseName: item.course.name,
            quizCount: topic._count?.quizzes ?? 0,
            inProgress: session
              ? { answeredCount: session.answeredCount, quizTotal: session.quizTotal ?? null }
              : null,
          });
        });
      });
      setTodos(list);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Đã có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  // Đồng hồ đếm ngược cooldown theo từng giây thực tế
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const interval = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          void towerApi
            .getOverview()
            .then((fresh) => {
              setTowerOverview(fresh);
              setCooldownRemaining(
                fresh.progress.isCooldownActive ? fresh.progress.cooldownRemainingSeconds : 0,
              );
            })
            .catch(() => null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownRemaining]);

  if (loading) return <Loading label="Đang tải trung tâm học tập" />;
  if (error) return <ErrorState message={error} retry={() => void load()} />;

  // --- Tính toán chỉ số Gamification từ 100% dữ liệu thật ---
  const completedCoursesCount = courses.filter((item) => item.status === 'COMPLETED').length;
  const submittedTopicIds = new Set(
    sessions.filter((s) => s.status === 'SUBMITTED').map((s) => s.topicId),
  );
  const submittedTopicCount = submittedTopicIds.size;

  const currentFloor = towerOverview?.progress.currentFloor ?? 1;
  const highestCompletedFloor = towerOverview?.progress.highestCompletedFloor ?? 0;
  const isAllConquered = highestCompletedFloor >= 100;
  const isCooldownActive = cooldownRemaining > 0;
  const activeAttempt = towerOverview?.activeAttempt ?? null;

  // Tổng Coin thật từ giao dịch SUCCESS (hoặc kỷ lục tầng đã vượt nếu danh sách giao dịch trống)
  const successTxCoins = transactions
    .filter((tx) => tx.status === 'SUCCESS')
    .reduce((sum, tx) => sum + (tx.rewardCoins || 0), 0);
  const totalCoins =
    transactions.length > 0
      ? successTxCoins > 0
        ? successTxCoins
        : highestCompletedFloor
      : highestCompletedFloor;

  // Ngày hoạt động thực tế theo múi giờ Việt Nam (UTC+7)
  const nowMs = serverNow();
  const todayVNKey = formatVNDateKeyFromMs(nowMs);
  const yesterdayVNKey = formatVNDateKeyFromMs(nowMs - 24 * 3600_000);

  const activeDates = new Set<string>();
  sessions.forEach((s) => {
    [s.submittedAt, s.lastSeenAt, s.startedAt].forEach((ts) => {
      const key = toVNDateKey(ts);
      if (key) activeDates.add(key);
    });
  });
  transactions.forEach((tx) => {
    const key = toVNDateKey(tx.createdAt);
    if (key) activeDates.add(key);
  });
  certificates.forEach((cert) => {
    const key = toVNDateKey(cert.issuedAt);
    if (key) activeDates.add(key);
  });

  const completedToday = activeDates.has(todayVNKey);

  // Tính chuỗi ngày học liên tiếp (Streak)
  let currentStreakDays = 0;
  if (completedToday || activeDates.has(yesterdayVNKey)) {
    let cursorMs = completedToday ? nowMs : nowMs - 24 * 3600_000;
    while (activeDates.has(formatVNDateKeyFromMs(cursorMs))) {
      currentStreakDays += 1;
      cursorMs -= 24 * 3600_000;
    }
  }

  // Lịch hoạt động 7 ngày gần nhất (từ 6 ngày trước đến hôm nay)
  const weekCalendar = Array.from({ length: 7 }, (_, idx) => {
    const dayMs = nowMs - (6 - idx) * 24 * 3600_000;
    const dateKey = formatVNDateKeyFromMs(dayMs);
    return {
      dateKey,
      weekday: getVNWeekdayLabel(dateKey),
      dayMonth: formatDayMonth(dateKey),
      isDone: activeDates.has(dateKey),
      isToday: dateKey === todayVNKey,
    };
  });

  // Tính XP và Level thật từ thành tựu học tập
  const totalXp =
    submittedTopicCount * 50 +
    highestCompletedFloor * 30 +
    completedCoursesCount * 200 +
    certificateCount * 300;
  const xpRequired = 200;
  const level = Math.floor(totalXp / xpRequired) + 1;
  const xpInLevel = totalXp % xpRequired;
  const xpPercent = Math.round((xpInLevel / xpRequired) * 100);
  const rankTitle = getRankTitle(level);

  // Tiến độ nhiệm vụ hằng ngày (Daily Missions) từ dữ liệu hôm nay
  const towerClearedToday = transactions.filter(
    (tx) => toVNDateKey(tx.createdAt) === todayVNKey && tx.status !== 'FAILED',
  ).length;
  const topicsSubmittedToday = sessions.filter(
    (s) =>
      s.status === 'SUBMITTED' &&
      toVNDateKey(s.submittedAt || s.lastSeenAt || s.startedAt) === todayVNKey,
  ).length;
  const totalOpenAndDoneTopics = Math.max(
    weeklyBoard?.progress?.topicsTotal ?? 0,
    submittedTopicCount + todos.length,
    1,
  );
  const topicMissionTargetHref = todos[0]
    ? `/topics/${todos[0].topicId}?courseId=${todos[0].courseId}`
    : '/courses';

  const missionsDoneCount = [
    towerClearedToday >= 1 || isAllConquered,
    topicsSubmittedToday >= 1,
    todos.length === 0 && submittedTopicCount > 0,
  ].filter(Boolean).length;

  const previewFloors = getPreviewFloors(currentFloor);
  const towerSeasonProgressPercent = Math.min(100, Math.round((highestCompletedFloor / 100) * 100));
  const seasonRemainingText = getSeasonRemainingLabel(towerOverview?.season.endsAt, nowMs);
  const weeklyTopPlayers = weeklyBoard?.items?.slice(0, 5) ?? [];
  const namesUnavailable = weeklyBoard?.profilesAvailable === false;

  return (
    <>
      {/* SECTION 1: UNIFIED HERO & 7-DAY STREAK BAR (FULL WIDTH) */}
      <section className="gamified-hero" aria-label="Hồ sơ năng lực và chuỗi ngày học">
        <div className="gamified-hero-top">
          <div className="gamified-hero-main">
            <div className="level-badge">
              <ShieldStar weight="fill" aria-hidden="true" />
              <span className="level-badge-num">LV. {level}</span>
              <span>{rankTitle}</span>
            </div>
            <h1>Chào {user?.fullName || 'bạn'}!</h1>
            <div className="xp-bar-wrap" aria-label={`Kinh nghiệm cấp độ ${level}`}>
              <div className="xp-bar-meta">
                <span>
                  Cấp {level} → {level + 1}:{' '}
                  <strong>
                    {xpInLevel}/{xpRequired} XP
                  </strong>{' '}
                  ({xpPercent}%)
                </span>
                <span>
                  Tổng <strong>{totalXp.toLocaleString('vi-VN')} XP</strong>
                </span>
              </div>
              <div className="xp-bar-track">
                <span style={{ width: `${xpPercent}%` }} />
              </div>
            </div>
          </div>

          <div className="gamified-hero-badges" aria-label="Chỉ số nổi bật">
            <div className="stat-pill stat-pill-coin">
              <div className="stat-pill-icon" aria-hidden="true">
                <Coins weight="fill" />
              </div>
              <div>
                <span>Coin tích lũy</span>
                <strong>{totalCoins.toLocaleString('vi-VN')} Coins</strong>
              </div>
            </div>

            <div className="stat-pill stat-pill-streak">
              <div className="stat-pill-icon" aria-hidden="true">
                <Fire weight="fill" />
              </div>
              <div>
                <span>Chuỗi ngày học</span>
                <strong>{currentStreakDays} ngày liên tiếp</strong>
              </div>
            </div>

            <div className="stat-pill stat-pill-rank">
              <div className="stat-pill-icon" aria-hidden="true">
                <Trophy weight="fill" />
              </div>
              <div>
                <span>Hạng tuần</span>
                <strong>
                  {weeklyBoard?.currentUserRank
                    ? `#${weeklyBoard.currentUserRank}`
                    : 'Chưa xếp hạng'}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Integrated 7-Day Streak Strip inside Hero */}
        <div className="hero-streak-strip" aria-label="Chuỗi hoạt động 7 ngày gần nhất">
          <div className={`hero-streak-status${completedToday ? ' is-done' : ''}`}>
            {completedToday ? (
              <>
                <CheckCircle size={18} weight="fill" />
                <span>
                  <strong>Đã hoàn thành hôm nay</strong> — Chuỗi {currentStreakDays} ngày liên tiếp
                  được giữ vững!
                </span>
              </>
            ) : (
              <>
                <Fire size={18} weight="fill" />
                <span>
                  <strong>Chưa học hôm nay</strong> — Làm 1 bài quiz hoặc leo 1 tầng để giữ chuỗi!
                </span>
              </>
            )}
          </div>

          <div className="streak-week-grid" role="list" aria-label="Lịch hoạt động 7 ngày qua">
            {weekCalendar.map((day) => (
              <div
                key={day.dateKey}
                role="listitem"
                className={`streak-day${day.isDone ? ' is-done' : ''}${day.isToday ? ' is-today' : ''}`}
                title={`${day.weekday} (${day.dayMonth}): ${day.isDone ? 'Đã học' : 'Chưa có hoạt động'}`}
              >
                <small>{day.isToday ? 'H.Nay' : day.weekday}</small>
                <strong>{day.dayMonth}</strong>
                <span className="streak-day-dot" aria-hidden="true">
                  {day.isDone ? '✓' : '·'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 2: FEATURED DAILY QUIZ TOWER SPOTLIGHT (FULL WIDTH — #1 FOCAL POINT) */}
      <section className="tower-spotlight" aria-label="Leo Tháp Kiến Thức Hằng Ngày">
        <div className="tower-spotlight-body">
          {/* Left: Info & Action */}
          <div className="tower-spotlight-info">
            <div className="tower-spotlight-eyebrow">
              <span className="eyebrow">
                <Sparkle weight="fill" style={{ verticalAlign: '-2px' }} />{' '}
                {towerOverview?.season.name || 'Mùa giải Leo Tháp Hàng Tháng'}
              </span>
              <span className="tower-season-timer" title="Thời gian còn lại của mùa giải">
                <ClockCountdown weight="bold" aria-hidden="true" />
                <span>{seasonRemainingText}</span>
              </span>
            </div>

            <h2>
              Leo Tháp Kiến Thức —{' '}
              {isAllConquered ? 'Đỉnh 100 / 100' : `Tầng ${currentFloor} / 100`}
            </h2>

            <p className="tower-spotlight-desc">
              {activeAttempt
                ? `Bạn đang làm dở câu ${activeAttempt.currentQuestionNumber}/${activeAttempt.requiredStreak} tại Tầng ${activeAttempt.floor} (10s/câu) · Thưởng +1 Coin & +30 XP mỗi tầng.`
                : `Trả lời đúng liên tiếp ${currentFloor} câu (10s/câu) · Thưởng +1 Coin & +30 XP mỗi tầng.`}
            </p>

            {isCooldownActive ? (
              <div className="tower-cooldown-banner" role="status">
                <HourglassHigh size={18} weight="fill" aria-hidden="true" />
                <span>Đang hồi sức 4h:</span>
                <strong>{formatCooldown(cooldownRemaining)}</strong>
              </div>
            ) : null}

            <div className="tower-spotlight-actions">
              <Link className="button" href="/tower">
                {isAllConquered || isCooldownActive ? (
                  <Compass weight="fill" />
                ) : (
                  <Lightning weight="fill" />
                )}{' '}
                {isAllConquered
                  ? 'Xem bản đồ Tháp'
                  : isCooldownActive
                    ? 'Xem bản đồ Tháp'
                    : activeAttempt
                      ? `Tiếp tục lượt đang chơi (Tầng ${activeAttempt.floor})`
                      : `Tiếp tục leo tháp — Tầng ${currentFloor}`}
              </Link>
            </div>
          </div>

          {/* Right: Visual 5-Floor Stepping Stones & Season Progress */}
          <div className="tower-spotlight-map">
            <div className="progress-meta">
              <span>Lộ trình các tầng tiếp theo</span>
              <strong>
                Kỷ lục mùa này: Tầng {highestCompletedFloor}/100 ({towerSeasonProgressPercent}%)
              </strong>
            </div>

            <div className="tower-floor-preview" role="list" aria-label="Các tầng xung quanh">
              {previewFloors.map((floorNum) => {
                const isDone = floorNum <= highestCompletedFloor;
                const isCurrent = !isAllConquered && floorNum === currentFloor;
                const stateClass = isDone ? 'is-done' : isCurrent ? 'is-current' : 'is-locked';
                return (
                  <div
                    key={floorNum}
                    role="listitem"
                    className={`tower-step-node ${stateClass}`}
                  >
                    <strong>Tầng {floorNum}</strong>
                    <span>{isDone ? '✓ Đã vượt' : isCurrent ? 'Mục tiêu' : 'Khóa'}</span>
                    <small>+1 Coin</small>
                  </div>
                );
              })}
            </div>

            <div className="progress-track">
              <span style={{ width: `${towerSeasonProgressPercent}%` }} />
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: 2-COLUMN BALANCED GRID (LEFT = NHIỆM VỤ HÔM NAY, RIGHT = BẢNG XẾP HẠNG TUẦN) */}
      <div className="gamified-grid-main">
        {/* Left Card: Nhiệm Vụ Hôm Nay */}
        <section className="missions-card" aria-label="Nhiệm vụ hằng ngày">
          <div className="section-title" style={{ marginBottom: 0 }}>
            <div>
              <h2 style={{ fontSize: 18, margin: 0 }}>Nhiệm Vụ Hôm Nay</h2>
              <small style={{ color: 'var(--muted)' }}>
                Hoàn thành nhiệm vụ mỗi ngày để nhận Coin, XP và điểm tuần
              </small>
            </div>
            <span className="status status-completed">{missionsDoneCount}/3 hoàn thành</span>
          </div>

          <ul className="missions-list">
            {/* Mission 1: Leo Tháp Kiến Thức */}
            <li
              className={`mission-item${
                towerClearedToday >= 1 || isAllConquered ? ' is-completed' : ''
              }`}
            >
              <div className="mission-icon" aria-hidden="true">
                <Lightning weight="fill" />
              </div>
              <div className="mission-body">
                <div className="mission-head-row">
                  <strong>Leo Tháp Kiến Thức</strong>
                  <span className="mission-reward">+1 Coin · +30 XP</span>
                </div>
                <div className="mission-progress-mini">
                  <div className="progress-track">
                    <span
                      style={{
                        width: `${towerClearedToday >= 1 || isAllConquered ? 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span>{Math.min(1, towerClearedToday)}/1 tầng hôm nay</span>
                </div>
              </div>
              <Link className="button secondary" href="/tower">
                Vào tháp
              </Link>
            </li>

            {/* Mission 2: Hoàn thành Chủ đề Quiz */}
            <li className={`mission-item${topicsSubmittedToday >= 1 ? ' is-completed' : ''}`}>
              <div className="mission-icon" aria-hidden="true">
                <Target weight="fill" />
              </div>
              <div className="mission-body">
                <div className="mission-head-row">
                  <strong>Hoàn thành Chủ đề Quiz</strong>
                  <span className="mission-reward">+50 XP</span>
                </div>
                <div className="mission-progress-mini">
                  <div className="progress-track">
                    <span style={{ width: `${topicsSubmittedToday >= 1 ? 100 : 0}%` }} />
                  </div>
                  <span>{Math.min(1, topicsSubmittedToday)}/1 bài hôm nay</span>
                </div>
              </div>
              <Link className="button secondary" href={topicMissionTargetHref}>
                Làm bài
              </Link>
            </li>

            {/* Mission 3: Chinh phục Chủ đề đang mở */}
            <li
              className={`mission-item${
                todos.length === 0 && submittedTopicCount > 0 ? ' is-completed' : ''
              }`}
            >
              <div className="mission-icon" aria-hidden="true">
                <BookOpen weight="fill" />
              </div>
              <div className="mission-body">
                <div className="mission-head-row">
                  <strong>Chinh phục Chủ đề đang mở</strong>
                  <span className="mission-reward">+200 XP/khóa</span>
                </div>
                <div className="mission-progress-mini">
                  <div className="progress-track">
                    <span
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round((submittedTopicCount / totalOpenAndDoneTopics) * 100),
                        )}%`,
                      }}
                    />
                  </div>
                  <span>
                    {submittedTopicCount}/{totalOpenAndDoneTopics} chủ đề
                  </span>
                </div>
              </div>
              <Link className="button secondary" href="/courses">
                Khóa học
              </Link>
            </li>
          </ul>
        </section>

        {/* Right Card: Bảng Xếp Hạng Tuần */}
        <section className="panel leaderboard-card" aria-label="Bảng xếp hạng tuần">
          <div className="section-title" style={{ marginBottom: 0 }}>
            <div>
              <h2 style={{ fontSize: 18, margin: 0 }}>Bảng Xếp Hạng Tuần</h2>
              <small style={{ color: 'var(--muted)' }}>
                {weeklyBoard?.weekStart && weeklyBoard?.weekEnd
                  ? `Tuần ${formatDayMonth(weeklyBoard.weekStart)} → ${formatDayMonth(
                      weeklyBoard.weekEnd,
                    )}`
                  : 'Xếp hạng điểm làm bài đầu tiên trong tuần'}
              </small>
            </div>
            <Link href="/leaderboard">Xem tất cả</Link>
          </div>

          {/* Compact summary strip: user's weekly rank + 3 mini achievement tags */}
          <div className="leaderboard-summary-strip">
            <div className="leaderboard-my-rank">
              <Trophy weight="fill" aria-hidden="true" />
              <span>
                Hạng của bạn:{' '}
                <strong>
                  {weeklyBoard?.currentUserRank && weeklyBoard.currentUserResult
                    ? `#${weeklyBoard.currentUserRank} · ${leaderboardPoints(
                        weeklyBoard.currentUserResult,
                      ).toLocaleString('vi-VN')} điểm`
                    : 'Chưa xếp hạng'}
                </strong>
              </span>
            </div>
            <div className="mini-achievement-tags" aria-label="Thành tựu học tập">
              <span className="mini-achievement-tag">
                <CheckCircle weight="fill" aria-hidden="true" /> {submittedTopicCount} chủ đề
              </span>
              <span className="mini-achievement-tag">
                <Medal weight="fill" aria-hidden="true" /> {completedCoursesCount} khóa
              </span>
              <span className="mini-achievement-tag">
                <CertificateIcon weight="fill" aria-hidden="true" /> {certificateCount} chứng nhận
              </span>
            </div>
          </div>

          {weeklyTopPlayers.length ? (
            <ol className="mini-leaderboard-list" aria-label="Top 5 người chơi tuần này">
              {weeklyTopPlayers.map((row) => {
                const isMe = row.user.id === user?.id;
                return (
                  <li
                    key={row.user.id}
                    className={`mini-leaderboard-row${isMe ? ' is-me' : ''}`}
                  >
                    <RankBadge rank={row.rank} />
                    <LeaderboardPlayer
                      row={row}
                      current={isMe}
                      namesUnavailable={namesUnavailable}
                    />
                    <div className="mini-leaderboard-score">
                      {leaderboardPoints(row).toLocaleString('vi-VN')} đ
                      <small>{row.topicsCompleted ?? 0} topic</small>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <Empty
              title="Tuần này chưa có bảng điểm"
              description="Hoàn thành chủ đề đầu tiên trong tuần để dẫn đầu bảng xếp hạng!"
            />
          )}
        </section>
      </div>

      {/* SECTION 4: KHÓA HỌC & CHỦ ĐỀ CẦN HOÀN THÀNH (.figma-split) */}
      <div className="figma-split">
        <section className="panel" aria-label="Khóa học của bạn">
          <div className="section-title">
            <h2 style={{ fontSize: 18, margin: 0 }}>Khóa học của bạn</h2>
            {canReadQuestions(user) ? <Link href="/courses">Xem tất cả</Link> : null}
          </div>
          {courses.length ? (
            <div className="grid grid-2">
              {courses.slice(0, 2).map((item) => (
                <CourseCard key={item.id} course={item.course} progress={item} />
              ))}
            </div>
          ) : (
            <Empty
              title="Chưa có tiến độ khóa học"
              description="Mở một khóa học và bắt đầu làm chủ đề đầu tiên."
            />
          )}
        </section>

        {canReadResults(user) ? (
          <section className="panel" aria-label="Cần hoàn thành">
            <div className="section-title">
              <h2 style={{ fontSize: 18, margin: 0 }}>Cần hoàn thành</h2>
              <Link href="/courses">Tất cả khóa học</Link>
            </div>
            {todos.length ? (
              <div className="list todo-list">
                {todos.map((item) => (
                  <div className="list-row" key={item.topicId}>
                    <div className="todo-row-info">
                      <strong>{item.topicName}</strong>
                      <small>
                        {item.courseName} · {item.quizCount} câu
                        {item.inProgress
                          ? ` · Đang làm ${item.inProgress.answeredCount}/${
                              item.inProgress.quizTotal ?? '?'
                            } câu`
                          : ''}
                      </small>
                    </div>
                    <div className="list-actions">
                      <Link
                        className="button secondary"
                        href={`/topics/${item.topicId}?courseId=${item.courseId}`}
                      >
                        {item.inProgress ? 'Tiếp tục' : 'Làm bài'}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                title="Đã hoàn thành hết bài!"
                description="Tất cả chủ đề đang mở trong các khóa học của bạn đều đã nộp."
              />
            )}
          </section>
        ) : null}
      </div>
    </>
  );
}
