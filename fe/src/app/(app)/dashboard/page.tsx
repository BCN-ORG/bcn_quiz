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
  Gift,
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
} from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { AvatarFrame } from '@/components/avatar-frame';
import { CharacterVideoPlayer } from '@/components/character-video-player';
import { EvolutionModal } from '@/components/evolution-modal';
import { LevelUpModal } from '@/components/level-up-modal';
import { Nameplate } from '@/components/nameplate';
import { NotificationCenter } from '@/components/notification-center';
import { TransferModal } from '@/components/wallet/transfer-modal';
import type { WalletBalance } from '@/lib/wallet';
import { xpApi } from '@/lib/xp';
import { leaderboardPoints } from '@/components/leaderboard-table';
import { ErrorState } from '@/components/ui';
import { serverNow } from '@/lib/api';
import {
  getCharacterProgression,
  getCharacterTierById,
  getNextCharacterTier,
  setEquippedTransmogTier,
  TRANSMOG_STORAGE_KEY,
} from '@/lib/character-progression';
import type { CharacterVideoState } from '@/lib/character-video';
import {
  dashboardQueryKeys,
  useDashboardSummary,
  useDashboardTower,
  useDashboardWallet,
} from '@/lib/dashboard-queries';

let sessionHasWoken = false;

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
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();

  const summaryQuery = useDashboardSummary(user, authLoading);
  const towerQuery = useDashboardTower(user, authLoading);
  const walletQuery = useDashboardWallet(user, authLoading);

  const courses = summaryQuery.data?.courses ?? [];
  const certificates = summaryQuery.data?.certificates ?? [];
  const sessions = summaryQuery.data?.sessions ?? [];
  const todos = summaryQuery.data?.todos ?? [];
  const transactions = summaryQuery.data?.transactions ?? [];
  const weeklyBoard = summaryQuery.data?.weeklyBoard ?? null;
  const xp = summaryQuery.data?.xp ?? null;
  const bossOverview = summaryQuery.data?.bossOverview ?? null;
  const towerOverview = towerQuery.data ?? null;
  const wallet = walletQuery.data ?? null;

  const loading = authLoading || summaryQuery.isLoading || towerQuery.isLoading;
  const error =
    summaryQuery.error instanceof Error
      ? summaryQuery.error.message
      : summaryQuery.error
        ? 'Đã có lỗi xảy ra'
        : '';

  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isEvolutionOpen, setIsEvolutionOpen] = useState(false);
  const [showLevelUpModal, setShowLevelUpModal] = useState(false);
  const [equippedTierId, setEquippedTierId] = useState<string | null>(null);
  const [dailyChestClaimedLocal, setDailyChestClaimedLocal] = useState(false);
  const [claimingChest, setClaimingChest] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [darkTheme, setDarkTheme] = useState(false);
  const heroRef = useRef<HTMLElement | null>(null);

  // Character Video dynamic state orchestration
  const [hasWoken, setHasWoken] = useState(sessionHasWoken);
  const [isLevelUp, setIsLevelUp] = useState(false);
  const initialLevelRef = useRef<number | null>(null);

  const userLevel = xp?.level ?? 3;

  useEffect(() => {
    if (xp?.equippedTierId !== undefined) {
      setEquippedTierId(xp.equippedTierId ?? null);
      setEquippedTransmogTier(xp.equippedTierId ?? null);
    } else if (typeof window !== 'undefined') {
      const savedTransmog = localStorage.getItem(TRANSMOG_STORAGE_KEY);
      if (savedTransmog) setEquippedTierId(savedTransmog);
    }
  }, [xp?.equippedTierId]);

  const handleSelectTransmog = useCallback(
    (tierId: string | null) => {
      setEquippedTierId(tierId);
      setEquippedTransmogTier(tierId);
      if (user?.id) {
        void xpApi
          .updateCosmetics(tierId)
          .then(() => {
            void queryClient.invalidateQueries({
              queryKey: dashboardQueryKeys.summary(user.id),
            });
          })
          .catch(() => undefined);
      }
    },
    [queryClient, user?.id],
  );

  const handleClaimDailyChest = useCallback(async () => {
    if (claimingChest) return;
    setClaimingChest(true);
    try {
      const res = await xpApi.claimDailyChest();
      setDailyChestClaimedLocal(true);
      if (user?.id && (res.claimed || res.alreadyClaimed)) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: dashboardQueryKeys.wallet(user.id),
          }),
          queryClient.invalidateQueries({
            queryKey: dashboardQueryKeys.summary(user.id),
          }),
        ]);
      }
    } finally {
      setClaimingChest(false);
    }
  }, [claimingChest, queryClient, user?.id]);

  const handleHeroMouseMove = useCallback((e: MouseEvent<HTMLElement>) => {
    const el = heroRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty('--px', `${(nx * 12).toFixed(2)}px`);
    el.style.setProperty('--py', `${(ny * 8).toFixed(2)}px`);
  }, []);

  const handleHeroMouseLeave = useCallback(() => {
    const el = heroRef.current;
    if (!el) return;
    el.style.setProperty('--px', '0px');
    el.style.setProperty('--py', '0px');
  }, []);

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
            setShowLevelUpModal(true);
          }
        }
        if (urlLevelUp) {
          setIsLevelUp(true);
          setShowLevelUpModal(true);
        }
        localStorage.setItem('bcn_arena_last_level', String(userLevel));
      }
    } else if (userLevel > initialLevelRef.current) {
      initialLevelRef.current = userLevel;
      setIsLevelUp(true);
      setShowLevelUpModal(true);
      if (typeof window !== 'undefined') {
        localStorage.setItem('bcn_arena_last_level', String(userLevel));
      }
    }
  }, [loading, userLevel]);

  const handleVideoStateComplete = useCallback((completedState: CharacterVideoState) => {
    if (completedState === 'milestone_level_up') {
      setIsLevelUp(false);
      sessionHasWoken = true;
      setHasWoken(true);
    } else if (completedState === 'waking') {
      sessionHasWoken = true;
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

  useEffect(() => {
    if (towerOverview?.progress.isCooldownActive && towerOverview.progress.cooldownRemainingSeconds > 0) {
      setCooldownRemaining(towerOverview.progress.cooldownRemainingSeconds);
    } else {
      setCooldownRemaining(0);
    }
  }, [towerOverview?.progress.isCooldownActive, towerOverview?.progress.cooldownRemainingSeconds]);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const interval = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          void towerQuery.refetch();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownRemaining, towerQuery]);

  if (error) {
    return (
      <ErrorState
        message={error}
        retry={() => {
          void summaryQuery.refetch();
          void towerQuery.refetch();
          void walletQuery.refetch();
        }}
      />
    );
  }

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
  const naturalProgression = getCharacterProgression(userLevel);
  const transmogCandidate = getCharacterTierById(equippedTierId);
  const characterProgression =
    transmogCandidate && userLevel >= transmogCandidate.minLevel
      ? transmogCandidate
      : naturalProgression;
  const displayLevelForVisuals = characterProgression.minLevel;
  const nextTier = getNextCharacterTier(userLevel);
  const completedQuestsCount = [isQuest1Done, isQuest2Done, isQuest3Done].filter(Boolean).length;
  const questProgressPercent = Math.round((completedQuestsCount / 3) * 100);
  const isDailyChestClaimed = dailyChestClaimedLocal || Boolean(xp?.dailyChestClaimed);

  const submittedCount = sessions.filter((s) => s.status === 'SUBMITTED').length;
  const dynamicAchievements = [
    {
      id: 'ach-level-10',
      unlocked: userLevel >= 10,
      title: 'Huyền Thoại Đấu Trường',
      desc: 'Đạt cấp độ 10 trở lên tại BCN Arena',
      pill: 'Lv.10+',
    },
    {
      id: 'ach-tower-10',
      unlocked: highestCompletedFloor >= 10,
      title: 'Kẻ Chinh Phục Tháp',
      desc: `Đã vượt qua Tầng ${Math.max(10, highestCompletedFloor)} Tháp Kiến Thức`,
      pill: 'Tháp 10+',
    },
    {
      id: 'ach-top-10',
      unlocked: Boolean(weeklyBoard?.currentUserRank && weeklyBoard.currentUserRank <= 10),
      title: 'Tinh Anh Bảng Vàng',
      desc: 'Góp mặt trong Top 10 Bảng Xếp Hạng tuần',
      pill: 'Top 10',
    },
    {
      id: 'ach-streak-3',
      unlocked: currentStreakDays >= 3,
      title: 'Ngọn Lửa Bất Diệt',
      desc: `Duy trì chuỗi học ${currentStreakDays} ngày liên tiếp`,
      pill: `${currentStreakDays} ngày`,
    },
    {
      id: 'ach-quiz-1',
      unlocked: submittedCount >= 1 || certificates.length >= 1,
      title: 'Học Giả Khởi Hành',
      desc: `Đã hoàn thành ${Math.max(1, submittedCount)} bài luyện tập`,
      pill: '+50 XP',
    },
  ];
  const unlockedAchievements = dynamicAchievements.filter((a) => a.unlocked);
  const featuredAchievement = unlockedAchievements[0] ?? {
    id: 'ach-starter',
    unlocked: false,
    title: 'Học giả Kiên Trì',
    desc: 'Hoàn thành quiz đầu tiên để mở huy hiệu',
    pill: '+50 XP',
  };

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
      <section
        ref={heroRef}
        className="rpg-hero-grand"
        data-tier={characterProgression.tierId}
        onMouseMove={handleHeroMouseMove}
        onMouseLeave={handleHeroMouseLeave}
        aria-label="Hồ sơ nhân vật BCN Arena"
      >
        {/* Parallax Background Layer */}
        <div
          className="rpg-hero-parallax-bg"
          style={{ backgroundImage: `url('${characterProgression.bannerBgUrl}')` }}
          aria-hidden="true"
        />
        {/* Tier-specific Ambient Particles */}
        <div className="rpg-hero-particles" aria-hidden="true">
          <span className="rpg-particle p1" />
          <span className="rpg-particle p2" />
          <span className="rpg-particle p3" />
          <span className="rpg-particle p4" />
          <span className="rpg-particle p5" />
          <span className="rpg-particle p6" />
        </div>
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
          <button
            type="button"
            className="rpg-hero-character-col rpg-hero-character-trigger"
            onClick={() => setIsEvolutionOpen(true)}
            aria-label={`Nhân vật: ${characterProgression.tierTitle} — Bấm để mở Sổ tay Tiến hóa`}
          >
            <div className="rpg-hero-character-glow" aria-hidden="true" />
            <CharacterVideoPlayer
              level={displayLevelForVisuals}
              state={activeVideoState}
              onStateComplete={handleVideoStateComplete}
              className="rpg-hero-character-standing"
              alt={characterProgression.tierTitle}
            />
            <span className="rpg-hero-evo-chip">
              <Sparkle size={12} weight="fill" aria-hidden="true" /> Sổ tay tiến hóa ↗
            </span>
          </button>

          {/* 2. Center: Player Progression Card */}
          <div className="rpg-hero-center-col">
            <div className="rpg-hero-profile-card">
              <div className="rpg-level-badge-row">
                <button
                  type="button"
                  className="rpg-level-badge rpg-level-badge-btn"
                  onClick={() => setIsEvolutionOpen(true)}
                  title="Xem lộ trình 7 giai đoạn & đổi ngoại hình"
                >
                  <ShieldStar size={14} weight="fill" aria-hidden="true" />
                  <span>Lv. {userLevel} · {naturalProgression.tierTitle}</span>
                </button>
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
                  {nextTier ? (
                    <span className="rpg-xp-next-tier">
                      Kế tiếp: <b>{nextTier.tierTitle}</b> (Lv.{nextTier.minLevel})
                    </span>
                  ) : (
                    <span className="rpg-xp-next-tier">Đã đạt Đỉnh Cao Tối Thượng ✨</span>
                  )}
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

          {/* Daily Quest Progress Bar + Chest */}
          <div className="rpg-quest-summary-bar" aria-label={`Hoàn thành ${completedQuestsCount} trên 3 nhiệm vụ`}>
            <div className="rpg-quest-summary-meta">
              <span>Tiến độ ngày: <strong>{completedQuestsCount}/3 nhiệm vụ</strong></span>
              {completedQuestsCount === 3 && !isDailyChestClaimed ? (
                <button
                  type="button"
                  className="rpg-quest-chest is-ready rpg-quest-chest-btn"
                  onClick={() => void handleClaimDailyChest()}
                  disabled={claimingChest}
                  title="Bấm để nhận +15 Coin thưởng rương ngày"
                >
                  <Gift size={15} weight="fill" aria-hidden="true" />
                  <span>{claimingChest ? 'Đang mở...' : 'Mở rương (+15 Coin)'}</span>
                </button>
              ) : (
                <span
                  className={`rpg-quest-chest ${isDailyChestClaimed ? 'is-claimed' : ''}`}
                  title={isDailyChestClaimed ? 'Đã nhận thưởng rương ngày hôm nay' : 'Hoàn thành 3/3 nhiệm vụ để mở rương'}
                >
                  <Gift size={15} weight="fill" aria-hidden="true" />
                  <span>{isDailyChestClaimed ? '✔ Đã nhận +15 Coin' : 'Rương (+15 Coin)'}</span>
                </span>
              )}
            </div>
            <div className="rpg-quest-summary-track">
              <div className="rpg-quest-summary-fill" style={{ width: `${questProgressPercent}%` }} />
            </div>
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
                  <AvatarFrame
                    name={top2.user?.fullName || 'Trần Thị B'}
                    avatarUrl={top2.user?.avatarUrl}
                    level={top2.userLevel ?? 6}
                    tierIdOverride={
                      user?.id && top2.user?.id === user.id
                        ? characterProgression.tierId
                        : undefined
                    }
                    size="md"
                    showLevelBadge
                  />
                  <span className="rpg-podium-rank-tag">2</span>
                </div>
                <Nameplate
                  name={top2.user?.fullName || 'Trần Thị B'}
                  level={top2.userLevel ?? 6}
                  tierIdOverride={
                    user?.id && top2.user?.id === user.id
                      ? characterProgression.tierId
                      : undefined
                  }
                  compact
                  className="rpg-podium-nameplate"
                />
                <span className="rpg-podium-score">
                  {(leaderboardPoints(top2) || 11800).toLocaleString('vi-VN')} XP
                </span>
                <div className="rpg-podium-pedestal" />
              </div>

              {/* Rank 1 (Center - Elevated) */}
              <div className="rpg-podium-col rank-1">
                <div className="rpg-podium-avatar-wrap">
                  <Crown size={18} weight="fill" className="rpg-crown-icon" aria-hidden="true" />
                  <AvatarFrame
                    name={top1.user?.fullName || 'Nguyễn Văn A'}
                    avatarUrl={top1.user?.avatarUrl}
                    level={top1.userLevel ?? 40}
                    tierIdOverride={
                      user?.id && top1.user?.id === user.id
                        ? characterProgression.tierId
                        : undefined
                    }
                    size="lg"
                    showLevelBadge
                  />
                  <span className="rpg-podium-rank-tag">1</span>
                </div>
                <Nameplate
                  name={top1.user?.fullName || 'Nguyễn Văn A'}
                  level={top1.userLevel ?? 40}
                  tierIdOverride={
                    user?.id && top1.user?.id === user.id
                      ? characterProgression.tierId
                      : undefined
                  }
                  compact
                  className="rpg-podium-nameplate"
                />
                <span className="rpg-podium-score">
                  {(leaderboardPoints(top1) || 12500).toLocaleString('vi-VN')} XP
                </span>
                <div className="rpg-podium-pedestal" />
              </div>

              {/* Rank 3 (Right) */}
              <div className="rpg-podium-col rank-3">
                <div className="rpg-podium-avatar-wrap">
                  <AvatarFrame
                    name={top3.user?.fullName || 'Lê Văn C'}
                    avatarUrl={top3.user?.avatarUrl}
                    level={top3.userLevel ?? 3}
                    tierIdOverride={
                      user?.id && top3.user?.id === user.id
                        ? characterProgression.tierId
                        : undefined
                    }
                    size="md"
                    showLevelBadge
                  />
                  <span className="rpg-podium-rank-tag">3</span>
                </div>
                <Nameplate
                  name={top3.user?.fullName || 'Lê Văn C'}
                  level={top3.userLevel ?? 3}
                  tierIdOverride={
                    user?.id && top3.user?.id === user.id
                      ? characterProgression.tierId
                      : undefined
                  }
                  compact
                  className="rpg-podium-nameplate"
                />
                <span className="rpg-podium-score">
                  {(leaderboardPoints(top3) || 10900).toLocaleString('vi-VN')} XP
                </span>
                <div className="rpg-podium-pedestal" />
              </div>
            </div>

            {/* User's Current Rank Strip */}
            <div className="rpg-my-rank-strip" data-tier={characterProgression.tierId}>
              <div className="rpg-my-rank-left">
                <span className="rpg-my-rank-num">{myRankNum}</span>
                <AvatarFrame
                  name={displayName}
                  avatarUrl={user?.avatarUrl}
                  level={userLevel}
                  tierIdOverride={characterProgression.tierId}
                  size="sm"
                />
                <Nameplate
                  name={displayName}
                  level={userLevel}
                  tierIdOverride={characterProgression.tierId}
                  showTitleBadge
                  compact
                />
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
              <h3 className="rpg-achievement-label">
                Thành tựu nổi bật ({unlockedAchievements.length}/{dynamicAchievements.length})
              </h3>
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
                <span className="rpg-achievement-title">{featuredAchievement.title}</span>
                <span className="rpg-achievement-desc">{featuredAchievement.desc}</span>
              </div>

              <span className="rpg-achievement-reward-pill">{featuredAchievement.pill}</span>
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
            if (typeof result.balance === 'number' && user?.id) {
              queryClient.setQueryData<WalletBalance | null>(
                dashboardQueryKeys.wallet(user.id),
                (prev) =>
                  prev
                    ? { ...prev, balance: result.balance! }
                    : {
                        balance: result.balance!,
                        lastSyncedAt: new Date().toISOString(),
                        syncStatus: 'SYNCED',
                        isMock: true,
                      },
              );
            } else if (user?.id) {
              void queryClient.invalidateQueries({
                queryKey: dashboardQueryKeys.wallet(user.id),
              });
            }
          }}
        />
      ) : null}

      <EvolutionModal
        open={isEvolutionOpen}
        onClose={() => setIsEvolutionOpen(false)}
        userLevel={userLevel}
        userName={displayName}
        userAvatarUrl={user?.avatarUrl}
        equippedTierId={equippedTierId}
        onSelectTransmog={handleSelectTransmog}
      />

      <LevelUpModal
        open={showLevelUpModal}
        onClose={() => setShowLevelUpModal(false)}
        level={userLevel}
        userName={displayName}
        userAvatarUrl={user?.avatarUrl}
      />
    </div>
  );
}
