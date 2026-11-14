'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
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
  Play,
  ShieldStar,
  Sparkle,
  Sword,
  Target,
  Trophy,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import {
  LeaderboardPlayer,
  RankBadge,
  leaderboardPoints,
  type LeaderboardRow,
} from '@/components/leaderboard-table';
import { Empty, ErrorState, Loading } from '@/components/ui';
import { request, serverNow } from '@/lib/api';
import { topicOpen } from '@/lib/format';
import { xpApi, type XpMe } from '@/lib/xp';
import { canReadQuestions, canReadResults } from '@/lib/permissions';
import { bossApi, type BossOverview } from '@/lib/boss';
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

function getGreeting(nowMs = serverNow()): string {
  const vnHour = new Date(nowMs + 7 * 3600_000).getUTCHours();
  if (vnHour >= 5 && vnHour < 12) return 'Chào buổi sáng';
  if (vnHour >= 12 && vnHour < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

function getSeasonRemainingLabel(endsAt?: string | null, nowMs = serverNow()): string {
  if (!endsAt) return 'Làm mới đầu tháng';
  const diffMs = new Date(endsAt).getTime() - nowMs;
  if (Number.isNaN(diffMs) || diffMs <= 0) return 'Sắp làm mới';
  const days = Math.floor(diffMs / (24 * 3600_000));
  const hours = Math.floor((diffMs % (24 * 3600_000)) / 3600_000);
  if (days > 0) return `Còn ${days} ngày ${hours}h`;
  const mins = Math.max(1, Math.floor((diffMs % 3600_000) / 60_000));
  return `Còn ${hours}h ${mins}p`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<CourseProgress[]>([]);
  const [catalogCourses, setCatalogCourses] = useState<Course[]>([]);
  const [certificateCount, setCertificateCount] = useState(0);
  const [certificates, setCertificates] = useState<CourseCertificate[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [todos, setTodos] = useState<TodoTopic[]>([]);
  const [towerOverview, setTowerOverview] = useState<TowerOverview | null>(null);
  const [bossOverview, setBossOverview] = useState<BossOverview | null>(null);
  const [transactions, setTransactions] = useState<TowerRewardTransactionItem[]>([]);
  const [weeklyBoard, setWeeklyBoard] = useState<WeeklyLeaderboardSummary | null>(null);
  const [xp, setXp] = useState<XpMe | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [progress, catalog, certs, sessionList, towerData, txList, weeklyData, xpData, bossData] =
        await Promise.all([
          canReadQuestions(user)
            ? request.get<Pagination<CourseProgress>>('/course/progress/me?limit=12')
            : Promise.resolve({
                items: [] as CourseProgress[],
                pagination: { page: 1, limit: 12, total: 0, totalPages: 1 },
              }),
          canReadQuestions(user)
            ? request.get<Pagination<Course>>('/course?page=1&limit=6').catch(() => ({
                items: [] as Course[],
                pagination: { page: 1, limit: 6, total: 0, totalPages: 1 },
              }))
            : Promise.resolve({
                items: [] as Course[],
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
          xpApi.getMe().catch(() => null),
          bossApi.getOverview().catch(() => null),
        ]);

      setCourses(progress.items);
      setCatalogCourses(catalog.items);
      setCertificateCount(certs.pagination.total);
      setCertificates(certs.items);
      setSessions(sessionList);
      setTowerOverview(towerData);
      setBossOverview(bossData);
      setTransactions(txList);
      setWeeklyBoard(weeklyData);
      setXp(xpData);

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

      // Chỉ xét khóa học chưa hoàn thành để tìm bài tập tiếp theo
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

  // --- Tính toán chỉ số Gamification & Streak từ dữ liệu thật ---
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

  // Tổng Coin thật từ giao dịch SUCCESS
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

  // Lịch hoạt động 7 ngày gần nhất
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

  // Tiến độ thử thách Tháp & Boss
  const towerSeasonProgressPercent = Math.min(100, Math.round((highestCompletedFloor / 100) * 100));
  const seasonRemainingText = getSeasonRemainingLabel(towerOverview?.season.endsAt, nowMs);
  const bossSeasonRemainingText = getSeasonRemainingLabel(bossOverview?.season.endsAt, nowMs);
  const bossMaxHp = bossOverview?.season.bossMaxHp ?? 10000;
  const bossCurrentHp = bossOverview?.community.bossCurrentHp ?? bossMaxHp;
  const bossHpPercent =
    bossOverview?.community.bossHpPercent ??
    (bossMaxHp > 0 ? Math.round((bossCurrentHp / bossMaxHp) * 100) : 100);
  const hasJoinedBoss = Boolean(
    bossOverview?.personal.hasParticipated ||
      (bossOverview?.personal.totalAttempts && bossOverview.personal.totalAttempts > 0) ||
      (bossOverview?.personal.personalBest && bossOverview.personal.personalBest > 0),
  );

  // Tiến độ 3 nhiệm vụ hằng ngày (D & E)
  const towerClearedToday = transactions.filter(
    (tx) => toVNDateKey(tx.createdAt) === todayVNKey && tx.status !== 'FAILED',
  ).length;
  const topicsSubmittedToday = sessions.filter(
    (s) =>
      s.status === 'SUBMITTED' &&
      toVNDateKey(s.submittedAt || s.lastSeenAt || s.startedAt) === todayVNKey,
  ).length;

  const topicMissionTargetHref = todos[0]
    ? `/topics/${todos[0].topicId}?courseId=${todos[0].courseId}`
    : '/courses';

  const isMission1Done = topicsSubmittedToday >= 1;
  const isMission2Done = towerClearedToday >= 1 || isAllConquered;
  // Mirrors the BE rule (BOSS_XP_MIN_CORRECT / BOSS_REWARD_MIN_PERSONAL_SCORE = 5): joining alone earns nothing.
  const isMission3Done = (bossOverview?.personal.personalBest ?? 0) >= 5;

  const missionsDoneCount = [isMission1Done, isMission2Done, isMission3Done].filter(Boolean).length;

  // Bảng xếp hạng tuần
  const weeklyTopPlayers = weeklyBoard?.items?.slice(0, 5) ?? [];
  const namesUnavailable = weeklyBoard?.profilesAvailable === false;

  // Section B: Continue Learning (#1 Focal Point)
  const activeTodo = todos[0] || null;
  const activeCourse = activeTodo
    ? courses.find((c) => c.course.id === activeTodo.courseId) || null
    : courses[0] || null;

  const isTodoInProgress = Boolean(activeTodo?.inProgress);
  const todoAnswered = activeTodo?.inProgress?.answeredCount ?? 0;
  const todoTotal = activeTodo?.inProgress?.quizTotal ?? activeTodo?.quizCount ?? 0;
  const todoPercent = todoTotal > 0 ? Math.min(100, Math.round((todoAnswered / todoTotal) * 100)) : 0;
  const continueLearningPercent = activeTodo
    ? (isTodoInProgress ? todoPercent : (activeCourse?.progressPercent ?? 0))
    : (activeCourse?.progressPercent ?? 0);

  // Section F: Course Discovery
  const displayCourses = catalogCourses.length > 0 ? catalogCourses : courses.map((p) => p.course);
  const progressMap = new Map<string, CourseProgress>(courses.map((p) => [p.course.id, p]));

  return (
    <>
      {/* ===================================================================
          SECTION A: Welcome & Learning Overview
          =================================================================== */}
      <section className="gamified-hero" aria-label="Chào mừng và tổng quan học tập">
        <div className="gamified-hero-top">
          <div className="gamified-hero-main">
            <div className="level-badge">
              <ShieldStar weight="fill" aria-hidden="true" />
              <span className="level-badge-num">{xp ? `LV. ${xp.level}` : 'LV. —'}</span>
              <span>{xp ? xp.rankTitle : 'Tập sự'}</span>
            </div>
            <h1>
              {getGreeting(nowMs)}, {user?.fullName || 'bạn'}!
            </h1>
            <p className="gamified-hero-note">
              {completedToday
                ? `Tuyệt vời! Bạn đã duy trì chuỗi học tập ${currentStreakDays} ngày liên tiếp. Hãy tiếp tục giữ vững phong độ!`
                : 'Học một chút mỗi ngày để tích lũy kiến thức bền vững và chinh phục các thử thách tri thức.'}
            </p>
            {xp ? (
              <div className="xp-bar-wrap" aria-label={`Kinh nghiệm cấp độ ${xp.level}`}>
                <div className="xp-bar-meta">
                  <span>
                    Cấp {xp.level} → {xp.level + 1}:{' '}
                    <strong>
                      {xp.xpInLevel}/{xp.xpRequired} XP
                    </strong>{' '}
                    ({xp.xpPercent}%)
                  </span>
                  <span>
                    Tổng <strong>{xp.totalXp.toLocaleString('vi-VN')} XP</strong>
                    {xp.nextRankTitle ? ` · Tiếp theo: ${xp.nextRankTitle}` : ''}
                  </span>
                </div>
                <div className="xp-bar-track">
                  <span style={{ width: `${Math.min(100, Math.max(0, xp.xpPercent))}%` }} />
                </div>
              </div>
            ) : (
              <div className="xp-bar-wrap" aria-label="Kinh nghiệm đang cập nhật">
                <div className="xp-bar-meta">
                  <span>Đang cập nhật dữ liệu kinh nghiệm...</span>
                </div>
                <div className="xp-bar-track">
                  <span style={{ width: '0%' }} />
                </div>
              </div>
            )}
          </div>

          <div className="gamified-hero-badges" aria-label="Chỉ số học tập nổi bật">
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
          </div>
        </div>

        {/* 7-Day Activity Strip */}
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
                  <strong>Chưa học hôm nay</strong> — Hoàn thành 1 bài quiz để duy trì chuỗi!
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

      {/* ===================================================================
          SECTION B: Continue Learning — PRIMARY CTA (#1 Focal Point)
          =================================================================== */}
      <section className="continue-learning-section" aria-label="Tiếp tục học tập">
        {activeTodo ? (
          <div className="continue-learning-card">
            <div className="continue-learning-eyebrow">
              <Play weight="fill" />
              <span>Đang học dở · Mục tiêu số 1</span>
            </div>
            <div className="continue-learning-main">
              <div className="continue-learning-info">
                <div className="continue-learning-course">
                  <BookOpen weight="fill" size={16} />
                  <span>Khóa học:</span>
                  <strong>{activeTodo.courseName}</strong>
                </div>
                <h2 className="continue-learning-title">{activeTodo.topicName}</h2>
                <div className="continue-learning-meta">
                  <span>
                    <Target weight="bold" /> {activeTodo.quizCount} câu hỏi trắc nghiệm
                  </span>
                  {isTodoInProgress ? (
                    <span>
                      <ClockCountdown weight="bold" /> Đang làm {todoAnswered}/{todoTotal} câu ({todoPercent}%)
                    </span>
                  ) : (
                    <span>
                      <Sparkle weight="bold" /> Sẵn sàng bắt đầu bài học tiếp theo
                    </span>
                  )}
                  {activeCourse ? (
                    <span>
                      <Medal weight="bold" /> Khóa học đã xong {activeCourse.progressPercent}%
                    </span>
                  ) : null}
                </div>
                <div className="continue-learning-progress">
                  <div className="continue-learning-progress-head">
                    <span>{isTodoInProgress ? 'Tiến độ câu hỏi hiện tại' : 'Tiến độ khóa học'}</span>
                    <strong>{continueLearningPercent}%</strong>
                  </div>
                  <div className="progress-track">
                    <span style={{ width: `${Math.min(100, Math.max(0, continueLearningPercent))}%` }} />
                  </div>
                </div>
              </div>

              <div className="continue-learning-action">
                <Link
                  className="continue-learning-cta-btn"
                  href={`/topics/${activeTodo.topicId}?courseId=${activeTodo.courseId}`}
                >
                  <Lightning weight="fill" size={20} />
                  <span>Tiếp tục học</span>
                </Link>
              </div>
            </div>
          </div>
        ) : activeCourse ? (
          <div className="continue-learning-card">
            <div className="continue-learning-eyebrow">
              <BookOpen weight="fill" />
              <span>Khóa học đang theo dõi</span>
            </div>
            <div className="continue-learning-main">
              <div className="continue-learning-info">
                <div className="continue-learning-course">
                  <span>Khóa học:</span>
                  <strong>{activeCourse.course.name}</strong>
                </div>
                <h2 className="continue-learning-title">
                  {activeCourse.status === 'COMPLETED'
                    ? 'Bạn đã hoàn thành khóa học này!'
                    : 'Tất cả chủ đề đang mở đã hoàn thành!'}
                </h2>
                <div className="continue-learning-meta">
                  <span>
                    <BookOpen weight="bold" /> {activeCourse.course._count?.topics ?? 0} chủ đề
                  </span>
                  <span>
                    <Medal weight="bold" /> Tiến độ khóa học: {activeCourse.progressPercent}%
                  </span>
                </div>
                <div className="continue-learning-progress">
                  <div className="continue-learning-progress-head">
                    <span>Tiến độ hoàn thành khóa học</span>
                    <strong>{activeCourse.progressPercent}%</strong>
                  </div>
                  <div className="progress-track">
                    <span style={{ width: `${activeCourse.progressPercent}%` }} />
                  </div>
                </div>
              </div>

              <div className="continue-learning-action">
                <Link
                  className="continue-learning-cta-btn"
                  href={`/courses/${activeCourse.course.id}`}
                >
                  <BookOpen weight="fill" size={20} />
                  <span>Xem khóa học</span>
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="continue-learning-card is-empty">
            <div className="continue-learning-eyebrow">
              <Sparkle weight="fill" />
              <span>Bắt đầu hành trình</span>
            </div>
            <h2 className="continue-learning-title" style={{ marginTop: 8 }}>
              Bắt đầu hành trình học tập
            </h2>
            <p style={{ color: 'var(--muted)', maxWidth: 560, margin: '8px 0 18px', lineHeight: 1.5 }}>
              Khám phá các khóa học công nghệ và bài tập trắc nghiệm thực chiến trên BCN Quiz để nâng cao
              kiến thức và tích lũy XP ngay hôm nay.
            </p>
            <Link className="continue-learning-cta-btn" href="/courses">
              <Compass weight="fill" size={20} />
              <span>Khám phá khóa học ngay</span>
            </Link>
          </div>
        )}
      </section>

      {/* ===================================================================
          SECTION C: Featured Challenges (Unified Gamification Section)
          =================================================================== */}
      <section className="featured-challenges-section" aria-label="Thử thách nổi bật">
        <div className="featured-challenges-grid">
          {/* Card 1: Leo Tháp Kiến Thức (Daily Quiz Tower) */}
          <div className="challenge-card tower-challenge">
            <div className="challenge-head">
              <span className="tower-eyebrow">
                <Sparkle weight="fill" /> {towerOverview?.season.name || 'Mùa giải Tháp Kiến Thức'}
              </span>
              <span className="challenge-timer" title="Thời gian còn lại của mùa giải">
                <ClockCountdown weight="bold" aria-hidden="true" />
                <span>{seasonRemainingText}</span>
              </span>
            </div>

            <div className="challenge-body">
              <h3 className="challenge-title">
                Leo Tháp Kiến Thức — {isAllConquered ? 'Đỉnh 100 / 100' : `Tầng ${currentFloor} / 100`}
              </h3>

              <p className="challenge-desc">
                {activeAttempt
                  ? `Đang làm dở câu ${activeAttempt.currentQuestionNumber}/${activeAttempt.requiredStreak} tại Tầng ${activeAttempt.floor} (10s/câu).`
                  : isAllConquered
                    ? 'Bạn đã chinh phục toàn bộ 100 tầng Tháp Kiến Thức trong mùa giải này!'
                    : `Mục tiêu: Vượt tầng ${currentFloor} · Trả lời đúng liên tiếp ${currentFloor} câu (10s/câu).`}
              </p>

              {isCooldownActive ? (
                <div className="tower-cooldown-banner" role="status">
                  <HourglassHigh size={16} weight="fill" aria-hidden="true" />
                  <span>Đang hồi sức 4h:</span>
                  <strong>{formatCooldown(cooldownRemaining)}</strong>
                </div>
              ) : null}

              <div className="challenge-progress-box">
                <div className="progress-meta">
                  <span>Tiến độ mùa giải</span>
                  <strong>
                    Kỷ lục: Tầng {highestCompletedFloor}/100 ({towerSeasonProgressPercent}%)
                  </strong>
                </div>
                <div className="progress-track">
                  <span style={{ width: `${towerSeasonProgressPercent}%` }} />
                </div>
              </div>
            </div>

            <div className="challenge-footer">
              <span className="challenge-reward-badge">
                <Coins weight="fill" /> +1 Coin · +30 XP/tầng
              </span>
              <Link className="button" href="/tower">
                {isAllConquered || isCooldownActive ? (
                  <Compass weight="fill" />
                ) : (
                  <Lightning weight="fill" />
                )}
                <span>
                  {isAllConquered || isCooldownActive
                    ? 'Xem bản đồ Tháp'
                    : activeAttempt
                      ? `Tiếp tục Tầng ${activeAttempt.floor}`
                      : `Tiếp tục leo Tháp`}
                </span>
              </Link>
            </div>
          </div>

          {/* Card 2: Săn Boss Tuần (Weekly Community Boss Battle) */}
          <div className="challenge-card boss-challenge">
            <div className="challenge-head">
              <span className="eyebrow boss-eyebrow">
                <Sword weight="fill" /> Săn Boss Tuần
              </span>
              <span className="challenge-timer boss-timer" title="Thời gian còn lại của tuần">
                <ClockCountdown weight="bold" aria-hidden="true" />
                <span>{bossSeasonRemainingText}</span>
              </span>
            </div>

            <div className="challenge-body">
              <div className="boss-challenge-header-row">
                <div className="boss-challenge-avatar-wrap">
                  <Image
                    src="/images/boss-pixel.png"
                    alt={bossOverview?.season.bossName || 'Săn Boss Tuần'}
                    width={48}
                    height={48}
                    className="boss-spotlight-img"
                  />
                </div>
                <div className="boss-challenge-title-group">
                  <h3 className="challenge-title">
                    {bossOverview?.season.bossName || 'Hắc Long Tri Thức'}
                  </h3>
                  <div className="boss-personal-status">
                    {hasJoinedBoss ? (
                      <span className="boss-pb-badge">
                        <Trophy weight="fill" aria-hidden="true" />
                        <span>
                          Điểm cao:{' '}
                          <strong>
                            {(bossOverview?.personal.personalBest ?? 0).toLocaleString('vi-VN')} đ
                          </strong>
                        </span>
                      </span>
                    ) : (
                      <span className="boss-pb-badge not-joined">Chưa tham gia tuần này</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="boss-hp-box">
                <div className="boss-spotlight-hp-head">
                  <span className="boss-hp-title">Máu Boss Cộng Đồng</span>
                  <strong className="boss-hp-value">
                    {bossCurrentHp.toLocaleString('vi-VN')} / {bossMaxHp.toLocaleString('vi-VN')} HP
                    <span className="boss-hp-pct"> ({bossHpPercent}%)</span>
                  </strong>
                </div>
                <div
                  className="boss-hp-bar-track"
                  role="progressbar"
                  aria-label="Máu Boss Cộng Đồng"
                  aria-valuenow={bossHpPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="boss-hp-bar-fill"
                    style={{ width: `${Math.max(0, Math.min(100, bossHpPercent))}%` }}
                  />
                </div>
                <div className="boss-hp-subinfo">
                  <span>
                    <Fire weight="fill" style={{ verticalAlign: '-1px', color: '#ef4444' }} />{' '}
                    {bossOverview?.community.totalParticipants
                      ? `${bossOverview.community.totalParticipants.toLocaleString('vi-VN')} người tham chiến`
                      : 'Hợp lực cùng cộng đồng hạ gục Boss'}
                  </span>
                  {bossOverview?.activeSession ? (
                    <span className="boss-active-status">Đang có phiên dở</span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="challenge-footer">
              <span className="challenge-reward-badge">
                <Coins weight="fill" /> 5 mốc · Tối đa 25 Coin
              </span>
              <Link className="button boss-cta-button" href="/boss">
                <Sword weight="fill" />
                <span>Vào Săn Boss</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================
          SECTIONS D & E: 2-Column Balanced Section (Missions & Leaderboard)
          =================================================================== */}
      <div className="gamified-grid-main">
        {/* Section D: Daily Missions (Nhiệm vụ hôm nay) */}
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
            {/* Mission 1: Hoàn thành 1 bài quiz bất kỳ */}
            <li className={`mission-item${isMission1Done ? ' is-completed' : ''}`}>
              <div className="mission-icon" aria-hidden="true">
                <Target weight="fill" />
              </div>
              <div className="mission-body">
                <div className="mission-head-row">
                  <strong>Hoàn thành 1 bài quiz bất kỳ</strong>
                  <span className={`mission-status-pill ${isMission1Done ? 'is-done' : 'is-pending'}`}>
                    {isMission1Done ? 'Hoàn thành' : 'Chưa hoàn thành'}
                  </span>
                  <span className="mission-reward">+50 XP · ≥1 câu đúng, trả lời ≥ nửa bài</span>
                </div>
                <div className="mission-progress-mini">
                  <div className="progress-track">
                    <span style={{ width: `${isMission1Done ? 100 : 0}%` }} />
                  </div>
                  <span>{Math.min(1, topicsSubmittedToday)}/1 bài hôm nay</span>
                </div>
              </div>
              <Link className="button secondary" href={topicMissionTargetHref}>
                {isMission1Done ? 'Làm thêm' : 'Làm bài'}
              </Link>
            </li>

            {/* Mission 2: Chinh phục 1 tầng Tháp Kiến Thức */}
            <li className={`mission-item${isMission2Done ? ' is-completed' : ''}`}>
              <div className="mission-icon" aria-hidden="true">
                <Lightning weight="fill" />
              </div>
              <div className="mission-body">
                <div className="mission-head-row">
                  <strong>Chinh phục 1 tầng Tháp Kiến Thức</strong>
                  <span className={`mission-status-pill ${isMission2Done ? 'is-done' : 'is-pending'}`}>
                    {isMission2Done ? 'Hoàn thành' : 'Chưa hoàn thành'}
                  </span>
                  <span className="mission-reward">+1 Coin · +30 XP</span>
                </div>
                <div className="mission-progress-mini">
                  <div className="progress-track">
                    <span style={{ width: `${isMission2Done ? 100 : 0}%` }} />
                  </div>
                  <span>{Math.min(1, towerClearedToday)}/1 tầng hôm nay</span>
                </div>
              </div>
              <Link className="button secondary" href="/tower">
                Vào Tháp
              </Link>
            </li>

            {/* Mission 3: Tham chiến Săn Boss Tuần */}
            <li className={`mission-item${isMission3Done ? ' is-completed' : ''}`}>
              <div className="mission-icon" aria-hidden="true">
                <Sword weight="fill" />
              </div>
              <div className="mission-body">
                <div className="mission-head-row">
                  <strong>Tham chiến Săn Boss Tuần</strong>
                  <span className={`mission-status-pill ${isMission3Done ? 'is-done' : 'is-pending'}`}>
                    {isMission3Done ? 'Hoàn thành' : 'Chưa hoàn thành'}
                  </span>
                  <span className="mission-reward">+50 XP · chơi hết 5 phút, ≥5 câu đúng</span>
                </div>
                <div className="mission-progress-mini">
                  <div className="progress-track">
                    <span style={{ width: `${isMission3Done ? 100 : 0}%` }} />
                  </div>
                  <span>{isMission3Done ? '1/1' : '0/1'} lượt tuần này</span>
                </div>
              </div>
              <Link className="button secondary" href="/boss">
                Vào Săn Boss
              </Link>
            </li>
          </ul>
        </section>

        {/* Section E: Leaderboard Preview (Bảng xếp hạng tuần) */}
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
                  <li key={row.user.id} className={`mini-leaderboard-row${isMe ? ' is-me' : ''}`}>
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

      {/* ===================================================================
          SECTION F: Course Discovery (Khám phá khóa học)
          =================================================================== */}
      <section className="course-discovery-section panel" aria-label="Khám phá khóa học">
        <div className="section-title">
          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Khám Phá Khóa Học</h2>
            <small style={{ color: 'var(--muted)' }}>
              Lộ trình bài bản, kiến thức cập nhật kèm bài tập thực hành theo từng chủ đề
            </small>
          </div>
          {canReadQuestions(user) ? (
            <Link href="/courses">
              Xem tất cả ({displayCourses.length}) <ArrowRight size={14} style={{ verticalAlign: '-1px' }} />
            </Link>
          ) : null}
        </div>

        {displayCourses.length ? (
          <div className="course-discovery-grid">
            {displayCourses.map((c) => {
              const prog = progressMap.get(c.id);
              const isCompleted = prog?.status === 'COMPLETED';
              const isInProgress = prog?.status === 'IN_PROGRESS';
              const topicCount = c._count?.topics ?? c.topics?.length ?? 0;

              return (
                <div className="discovery-card" key={c.id}>
                  <div className="discovery-card-thumb">
                    {c.imageUrl ? (
                      <Image
                        src={c.imageUrl}
                        alt={c.name}
                        fill
                        unoptimized
                        sizes="(max-width: 680px) 100vw, 33vw"
                        style={{ objectFit: 'cover' }}
                      />
                    ) : (
                      <BookOpen size={36} aria-hidden="true" />
                    )}
                  </div>
                  <div className="discovery-card-body">
                    <h3 className="discovery-card-title">{c.name}</h3>
                    <p className="discovery-card-desc">
                      {c.description || 'Nội dung học và bài luyện tập theo chủ đề chuyên sâu.'}
                    </p>
                    <div className="discovery-card-meta">
                      <span>
                        <BookOpen size={15} style={{ verticalAlign: '-2px' }} /> {topicCount} chủ đề
                      </span>
                      {isCompleted ? (
                        <span className="course-status-pill is-completed">Hoàn thành</span>
                      ) : isInProgress ? (
                        <span className="course-status-pill is-in-progress">
                          Đang học ({prog?.progressPercent ?? 0}%)
                        </span>
                      ) : (
                        <span className="course-status-pill is-not-started">Chưa học</span>
                      )}
                    </div>
                    <div className="discovery-card-actions">
                      <Link
                        className={`button ${isCompleted ? 'secondary' : ''}`}
                        href={`/courses/${c.id}`}
                      >
                        {isCompleted ? 'Xem chi tiết' : isInProgress ? 'Tiếp tục học' : 'Học ngay'}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty
            title="Chưa có khóa học nào"
            description="Các khóa học mới sẽ sớm được cập nhật trên hệ thống."
          />
        )}
      </section>
    </>
  );
}
