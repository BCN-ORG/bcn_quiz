'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BookOpen,
  Certificate as CertificateIcon,
  Check,
  ClockCountdown,
  Crown,
  Fire,
  MagnifyingGlass,
  Medal,
  Moon,
  PaperPlaneTilt,
  ShieldStar,
  Sparkle,
  Star,
  Sun,
  Sword,
  Trophy,
  User as UserIcon,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { CharacterVideoPlayer } from '@/components/character-video-player';
import { NotificationCenter } from '@/components/notification-center';
import { TransferModal } from '@/components/wallet/transfer-modal';
import { walletApi, type WalletBalance } from '@/lib/wallet';
import { leaderboardPoints, type LeaderboardRow } from '@/components/leaderboard-table';
import { ErrorState } from '@/components/ui';
import { request, serverNow } from '@/lib/api';
import { topicOpen } from '@/lib/format';
import { xpApi, type XpMe } from '@/lib/xp';
import { canReadQuestions, canReadResults } from '@/lib/permissions';
import { bossApi, type BossOverview } from '@/lib/boss';
import { getCharacterProgression } from '@/lib/character-progression';
import type { CharacterVideoState } from '@/lib/character-video';
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

type TodoTopic = {
  topicId: string;
  topicName: string;
  courseId: string;
  courseName: string;
  quizCount: number;
  inProgress: { answeredCount: number; quizTotal: number | null } | null;
};

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

async function fetchAll<T>(path: string): Promise<T[]> {
  const limit = 50;
  const first = await request.get<Pagination<T>>(`${path}?page=1&limit=${limit}`);
  const items = [...first.items];
  const pages = Math.min(first.pagination.totalPages, 10);
  for (let p = 2; p <= pages; p += 1) {
    const next = await request.get<Pagination<T>>(`${path}?page=${p}&limit=${limit}`);
    items.push(...next.items);
  }
  return items;
}

function toVNDateKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const vnTime = new Date(d.getTime() + 7 * 3600_000);
  return vnTime.toISOString().slice(0, 10);
}

function formatVNDateKeyFromMs(ms: number): string {
  const vnTime = new Date(ms + 7 * 3600_000);
  return vnTime.toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [courses, setCourses] = useState<CourseProgress[]>([]);
  const [, setCatalogCourses] = useState<Course[]>([]);
  const [, setCertificateCount] = useState(0);
  const [certificates, setCertificates] = useState<CourseCertificate[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [todos, setTodos] = useState<TodoTopic[]>([]);
  const [towerOverview, setTowerOverview] = useState<TowerOverview | null>(null);
  const [bossOverview, setBossOverview] = useState<BossOverview | null>(null);
  const [transactions, setTransactions] = useState<TowerRewardTransactionItem[]>([]);
  const [weeklyBoard, setWeeklyBoard] = useState<WeeklyLeaderboardSummary | null>(null);
  const [xp, setXp] = useState<XpMe | null>(null);
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [darkTheme, setDarkTheme] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Character Video dynamic state orchestration
  const [hasWoken, setHasWoken] = useState(false);
  const [isLevelUp, setIsLevelUp] = useState(false);
  const initialLevelRef = useRef<number | null>(null);

  const userLevel = xp?.level ?? 3;

  // Level up detection & session storage tracking
  useEffect(() => {
    if (loading) return;

    if (initialLevelRef.current === null) {
      initialLevelRef.current = userLevel;
      if (typeof window !== 'undefined') {
        const storedStr = localStorage.getItem('bcn_arena_last_level');
        const urlParams = new URLSearchParams(window.location.search);
        const urlLevelUp =
          urlParams.get('levelup') === 'true' || urlParams.get('level_up') === 'true';

        if (storedStr) {
          const storedLevel = parseInt(storedStr, 10);
          if (!Number.isNaN(storedLevel) && userLevel > storedLevel) {
            setIsLevelUp(true);
          }
        }
        if (urlLevelUp) {
          setIsLevelUp(true);
        }
        localStorage.setItem('bcn_arena_last_level', String(userLevel));
      }
    } else if (userLevel > initialLevelRef.current) {
      initialLevelRef.current = userLevel;
      setIsLevelUp(true);
      if (typeof window !== 'undefined') {
        localStorage.setItem('bcn_arena_last_level', String(userLevel));
      }
    }
  }, [loading, userLevel]);

  const handleVideoStateComplete = useCallback((completedState: CharacterVideoState) => {
    if (completedState === 'milestone_level_up') {
      setIsLevelUp(false);
      setHasWoken(true);
    } else if (completedState === 'waking') {
      setHasWoken(true);
    }
  }, []);

  // Initialize theme from document
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const isDark = document.documentElement.dataset.theme === 'dark';
      setDarkTheme(isDark);
    }
  }, []);

  const toggleTheme = () => {
    const next = !darkTheme;
    setDarkTheme(next);
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = next ? 'dark' : 'light';
      localStorage.setItem('quiz-theme', next ? 'dark' : 'light');
    }
  };

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/courses?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      router.push('/courses');
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [progress, catalog, certs, sessionList, towerData, txList, weeklyData, xpData, bossData, walletData] =
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
          walletApi.getBalance().catch(() => null),
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
      setWallet(walletData);

      if (towerData?.progress.isCooldownActive && towerData.progress.cooldownRemainingSeconds > 0) {
        setCooldownRemaining(towerData.progress.cooldownRemainingSeconds);
      } else {
        setCooldownRemaining(0);
      }

      const submitted = new Set(
        sessionList.filter((s) => s.status === 'SUBMITTED').map((s) => s.topicId),
      );
      const inProgress = new Map<string, SessionItem>();
      sessionList
        .filter((s) => s.status === 'IN_PROGRESS')
        .forEach((s) => {
          if (!inProgress.has(s.topicId)) inProgress.set(s.topicId, s);
        });

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

  if (error) return <ErrorState message={error} retry={() => void load()} />;

  // --- Calculations for RPG Game Lobby ---
  const currentFloor = towerOverview?.progress.currentFloor ?? 7;
  const highestCompletedFloor = towerOverview?.progress.highestCompletedFloor ?? 0;
  const isAllConquered = highestCompletedFloor >= 100;
  const remainingFloors = Math.max(0, 100 - currentFloor);

  // Real coin balance
  const successTxCoins = transactions
    .filter((tx) => tx.status === 'SUCCESS')
    .reduce((sum, tx) => sum + (tx.rewardCoins || 0), 0);
  const totalCoins =
    typeof wallet?.balance === 'number'
      ? wallet.balance
      : transactions.length > 0
        ? successTxCoins > 0
          ? successTxCoins
          : 90
        : 90;

  // Streak & Active Dates
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
  let currentStreakDays = 0;
  if (completedToday || activeDates.has(yesterdayVNKey)) {
    let cursorMs = completedToday ? nowMs : nowMs - 24 * 3600_000;
    while (activeDates.has(formatVNDateKeyFromMs(cursorMs))) {
      currentStreakDays += 1;
      cursorMs -= 24 * 3600_000;
    }
  }
  if (currentStreakDays === 0) currentStreakDays = 1;

  // Level & XP
  const currentLevelXp = xp?.xpInLevel ?? 560;
  const nextLevelXp = xp?.xpRequired ?? 700;
  const remainingLevelXp = Math.max(0, nextLevelXp - currentLevelXp);
  const xpProgressPercent =
    xp?.xpPercent ?? Math.min(100, Math.max(0, Math.round((currentLevelXp / nextLevelXp) * 100)));

  // Continue Learning (#1 Priority)
  const activeTodo = todos[0] || null;
  const activeCourse = activeTodo
    ? courses.find((c) => c.course.id === activeTodo.courseId) || null
    : courses[0] || null;
  const todoAnswered = activeTodo?.inProgress?.answeredCount ?? 3;
  const todoTotal = activeTodo?.inProgress?.quizTotal ?? activeTodo?.quizCount ?? 15;
  const todoPercent = Math.min(100, Math.round((todoAnswered / todoTotal) * 100));

  const continueCourseName = activeTodo?.courseName || activeCourse?.course.name || 'Frontend Cơ Bản';
  const continueQuizTitle = activeTodo?.topicName || 'Quiz 5';
  const continueTargetHref = activeTodo
    ? `/topics/${activeTodo.topicId}?courseId=${activeTodo.courseId}`
    : activeCourse
      ? `/courses/${activeCourse.course.id}`
      : '/courses';

  // Daily Quests
  const topicsSubmittedToday = sessions.filter(
    (s) =>
      s.status === 'SUBMITTED' &&
      toVNDateKey(s.submittedAt || s.lastSeenAt || s.startedAt) === todayVNKey,
  ).length;
  const towerClearedToday = transactions.filter(
    (tx) => toVNDateKey(tx.createdAt) === todayVNKey && tx.status !== 'FAILED',
  ).length;

  const isQuest1Done = topicsSubmittedToday >= 1;
  const isQuest2Done = currentStreakDays >= 1;
  const isQuest3Done = towerClearedToday >= 1 || isAllConquered;

  // Boss Info
  const bossName = bossOverview?.season.bossName || 'Đại Ma Vương';
  const bossParticipants = bossOverview?.community.totalParticipants ?? 128;
  const bossHpPercent =
    bossOverview?.community.bossHpPercent != null
      ? Math.min(100, Math.max(0, Math.round(bossOverview.community.bossHpPercent)))
      : 68;

  // Leaderboard Top 3 & User Rank
  const leaderboardItems = weeklyBoard?.items || [];
  const top1 = leaderboardItems[0] || {
    rank: 1,
    user: { id: 'u1', fullName: 'Nguyễn Văn A' },
    score: 12500,
  };
  const top2 = leaderboardItems[1] || {
    rank: 2,
    user: { id: 'u2', fullName: 'Trần Thị B' },
    score: 11800,
  };
  const top3 = leaderboardItems[2] || {
    rank: 3,
    user: { id: 'u3', fullName: 'Lê Văn C' },
    score: 10900,
  };

  const myRankNum = weeklyBoard?.currentUserRank ?? 12;
  const myRankScore = weeklyBoard?.currentUserResult
    ? leaderboardPoints(weeklyBoard.currentUserResult)
    : 2100;

  const displayName = user?.fullName || 'Trần Tuấn Hưng';
  const characterProgression = getCharacterProgression(userLevel);

  // Real dynamic character video state resolution:
  // - 'connecting': active while loading initial dashboard data (loading === true).
  // - 'milestone_level_up': triggers when level up is detected.
  // - 'waking': triggers on session start after loading completes (plays once, then transitions to 'idle').
  // - 'idle': default state.
  let activeVideoState: CharacterVideoState = 'idle';
  if (loading) {
    activeVideoState = 'connecting';
  } else if (isLevelUp) {
    activeVideoState = 'milestone_level_up';
  } else if (!hasWoken) {
    activeVideoState = 'waking';
  } else {
    activeVideoState = 'idle';
  }

  return (
    <div className="rpg-dashboard" role="region" aria-label="BCN Arena RPG Game Lobby">
      {/* -------------------------------------------------------------------
          A. Grand Hero Banner with Integrated Topbar & Character Progression
          ------------------------------------------------------------------- */}
      <section className="rpg-hero-grand" aria-label="Hồ sơ nhân vật BCN Arena">
        {/* Integrated Topbar */}
        <div className="rpg-hero-topbar">
          <form className="rpg-hero-search-box" onSubmit={handleSearch} role="search">
            <MagnifyingGlass size={18} className="rpg-hero-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="rpg-hero-search-input"
              placeholder="Tìm kiếm khóa học, chủ đề..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Tìm kiếm khóa học hoặc chủ đề"
            />
          </form>

          <div className="rpg-hero-topbar-actions">
            <NotificationCenter />
            <button
              type="button"
              className="rpg-hero-action-btn rpg-theme-btn"
              onClick={toggleTheme}
              aria-label={darkTheme ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
              title={darkTheme ? 'Giao diện sáng' : 'Giao diện tối'}
            >
              {darkTheme ? <Sun size={20} weight="fill" /> : <Moon size={20} weight="fill" />}
            </button>
          </div>
        </div>

        {/* 3-Column Hero Main Stage */}
        <div className="rpg-hero-stage">
          {/* 1. Left: Character Artwork Showcase (Standing Illustration) */}
          <div className="rpg-hero-character-col" aria-label={`Nhân vật: ${characterProgression.tierTitle}`}>
            <div className="rpg-hero-character-glow" aria-hidden="true" />
            <CharacterVideoPlayer
              level={userLevel}
              state={activeVideoState}
              onStateComplete={handleVideoStateComplete}
              className="rpg-hero-character-standing"
              alt={characterProgression.tierTitle}
            />
          </div>

          {/* 2. Center: Player Progression Card */}
          <div className="rpg-hero-center-col">
            <div className="rpg-hero-profile-card">
              <div className="rpg-level-badge-row">
                <span className="rpg-level-badge">
                  <ShieldStar size={14} weight="fill" aria-hidden="true" />
                  <span>Lv. {userLevel} · {characterProgression.tierTitle}</span>
                </span>
              </div>

              <h1 className="rpg-hero-title">
                Chào mừng trở lại,<br />
                <span className="rpg-name-highlight">{displayName}!</span>
              </h1>
              <p className="rpg-hero-subtitle">{characterProgression.description}</p>

              <div className="rpg-hero-xp-box" aria-label={`Kinh nghiệm: ${currentLevelXp} trên ${nextLevelXp} XP`}>
                <div className="rpg-xp-label-row">
                  <span className="rpg-xp-amount">
                    <Star size={14} weight="fill" color="#facc15" />
                    <strong>{currentLevelXp.toLocaleString('vi-VN')} / {nextLevelXp.toLocaleString('vi-VN')} XP</strong>
                  </span>
                </div>
                <div className="rpg-xp-bar-row">
                  <div
                    className="rpg-xp-track"
                    role="progressbar"
                    aria-valuenow={xpProgressPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div className="rpg-xp-fill" style={{ width: `${xpProgressPercent}%` }} />
                  </div>
                  <span className="rpg-xp-remaining">Còn {remainingLevelXp} XP để lên cấp</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Right: Player Stats (Streak & Coin combined in ONE horizontal pill) */}
          <div className="rpg-hero-stats-pill" aria-label="Chỉ số chính người chơi">
            <div className="rpg-stat-unit" title="Chuỗi ngày học liên tục">
              <div className="rpg-stat-icon streak" aria-hidden="true">
                <Fire size={28} weight="fill" />
              </div>
              <div className="rpg-stat-info">
                <span className="rpg-stat-num">{currentStreakDays} ngày</span>
                <span className="rpg-stat-label">Chuỗi học</span>
              </div>
            </div>

            <div className="rpg-stat-divider" aria-hidden="true" />

            <div className="rpg-stat-unit" title="Số coin tích lũy">
              <div className="rpg-stat-icon coin" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/dashboard/mockup-coins.png" alt="Coin" width={30} height={30} />
              </div>
              <div className="rpg-stat-info">
                <span className="rpg-stat-num">{totalCoins.toLocaleString('vi-VN')}</span>
                <span className="rpg-stat-label">Coin</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------------
          B & C. Mid Grid: Continue Learning (~68%) + Daily Quest (~32%)
          ------------------------------------------------------------------- */}
      <div className="rpg-mid-grid">
        {/* B. Continue Learning (Illustrated Adventure Banner) */}
        <section className="rpg-continue-card" aria-label="Tiếp tục hành trình học tập">
          <div className="rpg-continue-head">
            <div className="rpg-continue-tag">
              <BookOpen size={14} weight="fill" aria-hidden="true" />
              <span>Tiếp tục hành trình học tập</span>
            </div>
            <div className="rpg-continue-head-right">
              <span className="rpg-continue-progress-badge">Tiến độ {todoPercent}%</span>
              <Sparkle size={18} weight="fill" className="rpg-sparkle-icon" aria-hidden="true" />
            </div>
          </div>

          <div className="rpg-continue-body">
            <div className="rpg-continue-left">
              <div className="rpg-course-thumb">
                <span className="rpg-course-badge-mini">&lt;/&gt; Đang học</span>
                <span className="rpg-course-thumb-title">{continueCourseName}</span>
              </div>

              <div className="rpg-quiz-details">
                <h2 className="rpg-quiz-title">{continueQuizTitle}</h2>
                <p className="rpg-quiz-meta">
                  <span className="rpg-quiz-meta-dot" aria-hidden="true" />
                  <span>{todoAnswered} / {todoTotal} câu · Chủ đề: {activeTodo?.topicName || continueCourseName}</span>
                </p>
                <div className="rpg-quiz-progress-row">
                  <div
                    className="rpg-quiz-progress-track"
                    role="progressbar"
                    aria-valuenow={todoPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div className="rpg-quiz-progress-fill" style={{ width: `${todoPercent}%` }} />
                  </div>
                  <span className="rpg-quiz-percent-num">{todoPercent}%</span>
                </div>
              </div>
            </div>

            <div className="rpg-continue-actions">
              <Link href={continueTargetHref} className="rpg-btn-continue">
                <span>Tiếp tục học</span>
                <ArrowRight size={16} weight="bold" aria-hidden="true" />
              </Link>
            </div>
          </div>

          {/* Right Adventure Character Artwork */}
          <div className="rpg-continue-artwork" aria-hidden="true">
            <div className="rpg-continue-art-glow" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/characters/character-level-1.png"
              alt="Hành trình học tập"
              className="rpg-continue-art-img"
            />
          </div>
        </section>

        {/* C. Daily Quest */}
        <section className="rpg-quest-card" aria-label="Nhiệm vụ hôm nay">
          <div className="rpg-quest-head">
            <div className="rpg-quest-title-col">
              <h3 className="rpg-quest-heading">
                <Trophy size={17} weight="fill" aria-hidden="true" />
                <span>Nhiệm vụ hôm nay</span>
              </h3>
              <span className="rpg-quest-timer">
                <ClockCountdown size={11} weight="bold" aria-hidden="true" />
                <span>Làm mới sau 4h 32m</span>
              </span>
            </div>
            <Link href="/bounties" className="rpg-link-all" title="Xem tất cả nhiệm vụ tại trang Bounties">
              <span>Xem tất cả →</span>
            </Link>
          </div>

          <ul className="rpg-quest-list" role="list">
            <li className={`rpg-quest-item ${isQuest1Done ? 'is-done' : ''}`} role="listitem">
              <div className="rpg-quest-item-left">
                <div className="rpg-quest-check" aria-hidden="true">
                  <Check size={12} weight="bold" />
                </div>
                <span className="rpg-quest-name">Hoàn thành 1 Quiz</span>
              </div>
              <div className="rpg-quest-item-right">
                <span className="rpg-quest-ratio">{Math.min(1, topicsSubmittedToday)}/1</span>
                <span className={`rpg-quest-reward ${isQuest1Done ? 'reward-done' : ''}`}>
                  {isQuest1Done ? '✔ +10' : '🎁 +10'}
                </span>
              </div>
            </li>

            <li className={`rpg-quest-item ${isQuest2Done ? 'is-done' : ''}`} role="listitem">
              <div className="rpg-quest-item-left">
                <div className="rpg-quest-check" aria-hidden="true">
                  <Check size={12} weight="bold" />
                </div>
                <span className="rpg-quest-name">Duy trì chuỗi học 1 ngày</span>
              </div>
              <div className="rpg-quest-item-right">
                <span className="rpg-quest-ratio">1/1</span>
                <span className={`rpg-quest-reward ${isQuest2Done ? 'reward-done' : ''}`}>
                  {isQuest2Done ? '✔ +20' : '🎁 +20'}
                </span>
              </div>
            </li>

            <li className={`rpg-quest-item ${isQuest3Done ? 'is-done' : ''}`} role="listitem">
              <div className="rpg-quest-item-left">
                <div className="rpg-quest-check" aria-hidden="true">
                  <Check size={12} weight="bold" />
                </div>
                <span className="rpg-quest-name">Tham gia Leo Tháp</span>
              </div>
              <div className="rpg-quest-item-right">
                <span className="rpg-quest-ratio">{Math.min(1, towerClearedToday)}/1</span>
                <span className={`rpg-quest-reward ${isQuest3Done ? 'reward-done' : ''}`}>
                  {isQuest3Done ? '✔ +20' : '🎁 +20'}
                </span>
              </div>
            </li>
          </ul>
        </section>
      </div>

      {/* -------------------------------------------------------------------
          D & E. Challenge Zone + Leaderboard Grid
          ------------------------------------------------------------------- */}
      <div className="rpg-challenge-container">
        <div className="rpg-challenge-title-row">
          <Sword size={20} weight="fill" aria-hidden="true" />
          <span>Thử thách hấp dẫn</span>
        </div>

        <div className="rpg-challenge-row-grid">
          {/* Two Game Challenge Cards */}
          <div className="rpg-cards-subgrid">
            {/* Card 1: Leo Tháp Kiến Thức */}
            <div className="rpg-game-card rpg-tower-card">
              <div className="rpg-card-art-bg rpg-art-tower" aria-hidden="true" />
              <div className="rpg-card-gradient-overlay" aria-hidden="true" />

              <div className="rpg-card-top">
                <div className="rpg-card-header-row">
                  <span className="rpg-card-pill-tag rpg-tag-tower">
                    <ShieldStar size={13} weight="fill" aria-hidden="true" />
                    <span>Leo Tháp Kiến Thức</span>
                  </span>
                  <span className="rpg-card-badge-top rpg-badge-tower">
                    Tầng {currentFloor} / 100
                  </span>
                </div>
                <h3 className="rpg-card-title">Leo Tháp Kiến Thức</h3>
                <p className="rpg-card-desc">Chinh phục 100 tầng và nhận thưởng hấp dẫn!</p>
              </div>

              <div className="rpg-card-bottom">
                <div className="rpg-card-progress-wrap">
                  <div className="rpg-card-progress-meta">
                    <span className="rpg-card-note">Còn {remainingFloors} tầng để chinh phục</span>
                    <span className="rpg-card-progress-val">{currentFloor}%</span>
                  </div>
                  <div
                    className="rpg-card-progress-track rpg-tower-track"
                    role="progressbar"
                    aria-valuenow={currentFloor}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Tiến độ leo tháp: tầng ${currentFloor} trên 100`}
                  >
                    <div
                      className="rpg-card-progress-fill rpg-tower-fill"
                      style={{ width: `${Math.min(100, Math.max(0, currentFloor))}%` }}
                    />
                  </div>
                </div>

                <div className="rpg-card-action-row">
                  <Link href="/tower" className="rpg-btn-challenge rpg-btn-tower">
                    <span>Tiếp tục leo tháp</span>
                    <ArrowRight size={14} weight="bold" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>

            {/* Card 2: Săn Boss */}
            <div className="rpg-game-card rpg-boss-card">
              <div className="rpg-card-art-bg rpg-art-boss" aria-hidden="true" />
              <div className="rpg-card-gradient-overlay" aria-hidden="true" />

              <div className="rpg-card-top">
                <div className="rpg-card-header-row">
                  <span className="rpg-card-pill-tag rpg-tag-boss">
                    <Crown size={13} weight="fill" aria-hidden="true" />
                    <span>Săn Boss</span>
                  </span>
                  <span className="rpg-card-badge-top rpg-badge-boss">
                    Hạng #{myRankNum} của bạn
                  </span>
                </div>
                <h3 className="rpg-card-title">
                  Săn Boss: <span className="rpg-boss-name-highlight">{bossName}</span>
                </h3>
                <p className="rpg-card-desc">Đánh bại Boss tuần để nhận nhiều Coin!</p>
              </div>

              <div className="rpg-card-bottom">
                <div className="rpg-card-progress-wrap">
                  <div className="rpg-card-progress-meta">
                    <span className="rpg-card-note">{bossParticipants} người tham chiến</span>
                    <span className="rpg-card-progress-val">HP {bossHpPercent}%</span>
                  </div>
                  <div
                    className="rpg-card-progress-track rpg-boss-track"
                    role="progressbar"
                    aria-valuenow={bossHpPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Máu boss còn lại: ${bossHpPercent}%`}
                  >
                    <div
                      className="rpg-card-progress-fill rpg-boss-fill"
                      style={{ width: `${bossHpPercent}%` }}
                    />
                  </div>
                </div>

                <div className="rpg-card-action-row">
                  <Link href="/boss" className="rpg-btn-challenge rpg-btn-boss">
                    <span>Tham chiến</span>
                    <ArrowRight size={14} weight="bold" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* E. Leaderboard Preview */}
          <section className="rpg-leaderboard-card" aria-label="Bảng xếp hạng tuần">
            <div className="rpg-leaderboard-head">
              <h3 className="rpg-leaderboard-title">
                <Crown size={17} weight="fill" aria-hidden="true" />
                <span>Bảng xếp hạng</span>
              </h3>
              <Link href="/leaderboard" className="rpg-link-all">
                Xem tất cả →
              </Link>
            </div>

            {/* 3-Player Visual Podium */}
            <div className="rpg-podium" aria-label="Top 3 người chơi dẫn đầu">
              {/* Rank 2 (Left) */}
              <div className="rpg-podium-col rank-2">
                <div className="rpg-podium-avatar-wrap">
                  <div className="rpg-podium-avatar">
                    {top2.user?.fullName ? top2.user.fullName[0].toUpperCase() : 'B'}
                  </div>
                  <span className="rpg-podium-rank-tag">2</span>
                </div>
                <span className="rpg-podium-name" title={top2.user?.fullName || 'Trần Thị B'}>
                  {top2.user?.fullName || 'Trần Thị B'}
                </span>
                <span className="rpg-podium-score">
                  {(leaderboardPoints(top2) || 11800).toLocaleString('vi-VN')} XP
                </span>
                <div className="rpg-podium-pedestal" />
              </div>

              {/* Rank 1 (Center - Elevated) */}
              <div className="rpg-podium-col rank-1">
                <div className="rpg-podium-avatar-wrap">
                  <Crown size={18} weight="fill" className="rpg-crown-icon" aria-hidden="true" />
                  <div className="rpg-podium-avatar">
                    {top1.user?.fullName ? top1.user.fullName[0].toUpperCase() : 'A'}
                  </div>
                  <span className="rpg-podium-rank-tag">1</span>
                </div>
                <span className="rpg-podium-name" title={top1.user?.fullName || 'Nguyễn Văn A'}>
                  {top1.user?.fullName || 'Nguyễn Văn A'}
                </span>
                <span className="rpg-podium-score">
                  {(leaderboardPoints(top1) || 12500).toLocaleString('vi-VN')} XP
                </span>
                <div className="rpg-podium-pedestal" />
              </div>

              {/* Rank 3 (Right) */}
              <div className="rpg-podium-col rank-3">
                <div className="rpg-podium-avatar-wrap">
                  <div className="rpg-podium-avatar">
                    {top3.user?.fullName ? top3.user.fullName[0].toUpperCase() : 'C'}
                  </div>
                  <span className="rpg-podium-rank-tag">3</span>
                </div>
                <span className="rpg-podium-name" title={top3.user?.fullName || 'Lê Văn C'}>
                  {top3.user?.fullName || 'Lê Văn C'}
                </span>
                <span className="rpg-podium-score">
                  {(leaderboardPoints(top3) || 10900).toLocaleString('vi-VN')} XP
                </span>
                <div className="rpg-podium-pedestal" />
              </div>
            </div>

            {/* User's Current Rank Strip */}
            <div className="rpg-my-rank-strip">
              <div className="rpg-my-rank-left">
                <span className="rpg-my-rank-num">{myRankNum}</span>
                <UserIcon size={14} weight="bold" />
                <span className="rpg-my-rank-name">{displayName}</span>
              </div>
              <span className="rpg-my-rank-xp">{(myRankScore || 2100).toLocaleString('vi-VN')} XP</span>
            </div>
          </section>
        </div>
      </div>

      {/* -------------------------------------------------------------------
          F. Bottom Grid: Wallet (~50%) + Achievements (~50%)
          ------------------------------------------------------------------- */}
      <div className="rpg-bottom-grid">
        {/* Left: Ví Coin của bạn */}
        <div className="rpg-wallet-card">
          <div className="rpg-wallet-left">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/dashboard/mockup-coins.png"
              alt="BCN Coin"
              className="rpg-wallet-coins-img"
              width={58}
              height={52}
            />
            <div className="rpg-wallet-info">
              <span className="rpg-wallet-label">Ví Coin của bạn</span>
              <strong className="rpg-wallet-amount">{totalCoins.toLocaleString('vi-VN')} Coin</strong>
            </div>
          </div>

          <div className="rpg-wallet-right">
            <Link href="/wallet" className="rpg-wallet-link">
              <span>Khám phá thêm tại trang Ví Coin</span>
              <ArrowRight size={13} weight="bold" aria-hidden="true" />
            </Link>
            <button
              type="button"
              className="rpg-wallet-btn-transfer"
              onClick={() => setIsTransferOpen(true)}
            >
              <PaperPlaneTilt size={13} weight="fill" aria-hidden="true" />
              <span>Chuyển Coin</span>
            </button>
          </div>
        </div>

        {/* Right: Thành tựu nổi bật */}
        <div className="rpg-achievement-card">
          <div className="rpg-achievement-main">
            <div className="rpg-achievement-head">
              <h3 className="rpg-achievement-label">Thành tựu nổi bật</h3>
              <Link href="/certificates" className="rpg-link-all">
                Xem tất cả →
              </Link>
            </div>

            <div className="rpg-achievement-body">
              <div className="rpg-achievement-badges-col" aria-hidden="true">
                <div className="rpg-badge-icon gold">
                  <Medal size={16} weight="fill" />
                </div>
                <div className="rpg-badge-icon blue">
                  <CertificateIcon size={16} weight="fill" />
                </div>
              </div>

              <div className="rpg-achievement-text">
                <span className="rpg-achievement-title">Học giả Kiên Trì</span>
                <span className="rpg-achievement-desc">Hoàn thành 10 quiz liên tiếp</span>
              </div>

              <span className="rpg-achievement-reward-pill">+50 XP</span>
            </div>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/dashboard/mockup-trophy.png"
            alt="Cúp thành tựu vàng"
            className="rpg-achievement-trophy-img"
            width={84}
            height={44}
          />
        </div>
      </div>

      {/* Modal Chuyển Coin trên Dashboard */}
      {user ? (
        <TransferModal
          open={isTransferOpen}
          onClose={() => setIsTransferOpen(false)}
          currentBalance={totalCoins}
          currentUser={user}
          onSuccess={(result) => {
            if (typeof result.balance === 'number') {
              setWallet((prev) =>
                prev
                  ? { ...prev, balance: result.balance! }
                  : {
                      balance: result.balance!,
                      lastSyncedAt: new Date().toISOString(),
                      syncStatus: 'SYNCED',
                      isMock: true,
                    },
              );
            } else {
              void load();
            }
          }}
        />
      ) : null}
    </div>
  );
}
