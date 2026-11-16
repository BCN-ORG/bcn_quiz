'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowCounterClockwise,
  Briefcase,
  CheckCircle,
  Clock,
  Coins,
  DeviceMobile,
  GameController,
  Gift,
  Globe,
  Hourglass,
  Lightning,
  Lock,
  PaintBrush,
  Play,
  Robot,
  ShieldCheck,
  Sparkle,
  Star,
  Target,
  Trash,
  Trophy,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { useAuth } from '@/components/auth-provider';
import { request } from '@/lib/api';
import { xpApi, type XpMe } from '@/lib/xp';
import type { Bounty, BountyAssignment, BountyCategory, BountyStats } from '@/lib/types';
import { Loading, Empty, PaginationNav } from '@/components/ui';

interface CategoryItem {
  key: BountyCategory | 'ALL';
  label: string;
  icon: typeof Lightning;
}

const CATEGORIES: CategoryItem[] = [
  { key: 'ALL', label: 'Tất cả', icon: Lightning },
  { key: 'WEB', label: 'Web Dev', icon: Globe },
  { key: 'APP', label: 'Mobile App', icon: DeviceMobile },
  { key: 'GAME', label: 'Game Dev', icon: GameController },
  { key: 'DESIGN', label: 'UI/UX Design', icon: PaintBrush },
  { key: 'AI', label: 'AI & Data', icon: Robot },
];

export default function BountyBoardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [activeAssignment, setActiveAssignment] = useState<BountyAssignment | null>(null);
  const [isLockedByActiveQuest, setIsLockedByActiveQuest] = useState(false);
  const [stats, setStats] = useState<BountyStats>({ openCount: 0, totalRewardPool: 0, userCompletedCount: 0 });
  const [history, setHistory] = useState<BountyAssignment[]>([]);
  const [userXp, setUserXp] = useState<XpMe | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<BountyCategory | 'ALL'>('ALL');
  const [activeTab, setActiveTab] = useState<'board' | 'history'>('board');
  const [bountyPage, setBountyPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  // Modals state
  const [inspectBounty, setInspectBounty] = useState<Bounty | null>(null);
  const [submittingUrl, setSubmittingUrl] = useState('');
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewStep, setReviewStep] = useState<number | null>(null);
  const [celebrationData, setCelebrationData] = useState<{
    coins: number;
    xp: number;
    bountyTitle: string;
    feedback: string;
  } | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);

  // User simulated wallet animation
  const [displayCoins, setDisplayCoins] = useState<number>(1250);
  const [timeLeft, setTimeLeft] = useState<{ minutes: number; seconds: number; percent: number }>({
    minutes: 0,
    seconds: 0,
    percent: 100,
  });

  // Fetch initial data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [bountiesRes, statsRes, historyRes, xpRes] = await Promise.all([
        request.get<{ activeAssignment: BountyAssignment | null; isLockedByActiveQuest: boolean; bounties: Bounty[] }>(
          '/bounties',
        ),
        request.get<BountyStats>('/bounties/stats'),
        request.get<BountyAssignment[]>('/bounties/history'),
        xpApi.getMe().catch(() => null),
      ]);

      setBounties(bountiesRes.bounties || []);
      setActiveAssignment(bountiesRes.activeAssignment);
      setIsLockedByActiveQuest(bountiesRes.isLockedByActiveQuest);
      setStats(statsRes);
      setHistory(historyRes || []);
      setUserXp(xpRes);
    } catch (err: unknown) {
      console.error('Error fetching bounty board data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Timer tick for active assignment
  useEffect(() => {
    if (!activeAssignment || activeAssignment.status !== 'IN_PROGRESS') return;

    const calculateTime = () => {
      const now = Date.now();
      const expiresAt = new Date(activeAssignment.expiresAt).getTime();
      const acceptedAt = new Date(activeAssignment.acceptedAt).getTime();
      const totalDuration = Math.max(expiresAt - acceptedAt, 1);
      const diff = Math.max(0, expiresAt - now);

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      const percent = Math.min(100, Math.max(0, (diff / totalDuration) * 100));

      setTimeLeft({ minutes, seconds, percent });

      if (diff <= 0) {
        fetchData();
      }
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [activeAssignment]);

  // Filtered bounties
  const filteredBounties = useMemo(() => {
    if (selectedCategory === 'ALL') return bounties;
    return bounties.filter((b) => b.category === selectedCategory);
  }, [bounties, selectedCategory]);

  useEffect(() => {
    setBountyPage(1);
  }, [selectedCategory]);

  const displayedBounties = useMemo(() => {
    const start = (bountyPage - 1) * 6;
    return filteredBounties.slice(start, start + 6);
  }, [filteredBounties, bountyPage]);

  const displayedHistory = useMemo(() => {
    const start = (historyPage - 1) * 6;
    return history.slice(start, start + 6);
  }, [history, historyPage]);

  // List of approved assignments not yet claimed
  const unclaimedApprovedList = useMemo(() => {
    return history.filter(
      (h) => h.status === 'APPROVED' && (!h.transaction || h.transaction.status !== 'COMPLETED'),
    );
  }, [history]);

  // Handle Accept Bounty
  const handleAccept = async (bounty: Bounty) => {
    try {
      setErrorToast(null);
      const newAssignment = await request.post<BountyAssignment>(`/bounties/${bounty.id}/accept`);
      setActiveAssignment(newAssignment);
      setIsLockedByActiveQuest(true);
      setInspectBounty(null);
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể nhận nhiệm vụ này.';
      setErrorToast(msg);
    }
  };

  // Handle Abandon Bounty
  const handleAbandon = async () => {
    if (!activeAssignment) return;
    if (!confirm('Bạn có chắc chắn muốn bỏ nhiệm vụ này? Tiến trình làm bài sẽ không được lưu.')) return;

    try {
      await request.post(`/bounties/${activeAssignment.bountyId}/abandon`);
      setActiveAssignment(null);
      setIsLockedByActiveQuest(false);
      setSubmittingUrl('');
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể hủy nhiệm vụ.';
      setErrorToast(msg);
    }
  };

  // Handle Submit Deliverable
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAssignment || !submittingUrl.trim()) return;

    try {
      setIsSubmitting(true);
      setErrorToast(null);

      // 4-step stepper animation
      setReviewStep(1);
      await new Promise((r) => setTimeout(r, 450));

      setReviewStep(2);
      await new Promise((r) => setTimeout(r, 450));

      setReviewStep(3);
      await new Promise((r) => setTimeout(r, 500));

      const res = await request.post<{
        assignment: BountyAssignment;
        message?: string;
      }>(`/bounties/${activeAssignment.bountyId}/submit`, {
        projectUrl: submittingUrl.trim(),
        submissionNotes: submissionNotes.trim() || undefined,
      });

      setReviewStep(4);
      await new Promise((r) => setTimeout(r, 400));

      // Reset state
      setReviewStep(null);
      setSubmittingUrl('');
      setSubmissionNotes('');

      setSuccessToast(res.message || 'Nộp bài thành công! Bài làm đang chờ Mentor/Admin duyệt.');

      await fetchData();
    } catch (err: unknown) {
      setReviewStep(null);
      const msg = err instanceof Error ? err.message : 'Có lỗi khi nộp bài.';
      setErrorToast(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Claim Reward
  const handleClaimReward = async (assignment: BountyAssignment) => {
    try {
      setIsClaiming(true);
      setErrorToast(null);
      const res = await request.post<{
        success: boolean;
        rewardCoins?: number;
        rewardXp?: number;
        assignment?: BountyAssignment;
        message?: string;
      }>(`/bounties/assignments/${assignment.id}/claim`);

      const earnedCoins = res.rewardCoins ?? assignment.bounty?.rewardCoins ?? 0;
      const earnedXp = res.rewardXp ?? assignment.bounty?.rewardXp ?? 0;

      // Animate coins count-up
      setDisplayCoins((prev) => prev + earnedCoins);

      // Celebration popup
      setCelebrationData({
        coins: earnedCoins,
        xp: earnedXp,
        bountyTitle: assignment.bounty?.title || 'Nhiệm vụ Freelancer',
        feedback: assignment.reviewFeedback || 'Nghiệm thu hoàn tất! Thưởng đã được chuyển vào ví của bạn.',
      });

      setSuccessToast(`Chúc mừng bạn đã nhận +${earnedCoins} Coin và +${earnedXp} XP!`);

      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể nhận thưởng lúc này.';
      setErrorToast(msg);
    } finally {
      setIsClaiming(false);
    }
  };

  // Handle Retry a rejected assignment
  const handleRetry = async (item: BountyAssignment) => {
    if (!item.bounty) return;
    if (activeAssignment && activeAssignment.status === 'IN_PROGRESS') {
      setErrorToast('Bạn đang có nhiệm vụ đang làm. Hãy hoàn thành hoặc hủy trước khi thử lại.');
      return;
    }
    await handleAccept(item.bounty);
    setActiveTab('board');
  };

  // Safe URL validator for XSS prevention in history links
  const isSafeUrl = (url: string | null | undefined): boolean => {
    if (!url) return false;
    const lower = url.trim().toLowerCase();
    return lower.startsWith('http://') || lower.startsWith('https://');
  };

  // Overall completion progress percentage
  const totalTracked = stats.openCount + stats.userCompletedCount;
  const completionPercentage = totalTracked > 0 ? Math.round((stats.userCompletedCount / totalTracked) * 100) : 0;

  if (loading) {
    return <Loading label="Đang tải Bảng nhiệm vụ Freelancer..." />;
  }

  return (
    <div className="bounty-page">
      {/* Toast Error Alert */}
      {errorToast && (
        <div className="bounty-alert" role="alert">
          <div className="bounty-alert-body">
            <WarningCircle size={22} weight="fill" />
            <p>{errorToast}</p>
          </div>
          <button
            type="button"
            className="bounty-alert-close"
            onClick={() => setErrorToast(null)}
            aria-label="Đóng thông báo"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Toast Success Alert */}
      {successToast && (
        <div className="bounty-alert success" role="alert">
          <div className="bounty-alert-body">
            <CheckCircle size={22} weight="fill" />
            <p>{successToast}</p>
          </div>
          <button
            type="button"
            className="bounty-alert-close"
            onClick={() => setSuccessToast(null)}
            aria-label="Đóng thông báo"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* 1. TOP HUD: Player Hunter Profile Bar */}
      <div className="bounty-hud">
        <div className="bounty-hud-user">
          <div className="bounty-hud-avatar">
            {user?.fullName?.charAt(0) || user?.email?.charAt(0) || 'H'}
          </div>
          <div className="bounty-hud-info">
            <h3>
              <span>{user?.fullName || user?.email || 'Học viên BCN'}</span>
              <span className="bounty-hud-tag">
                {userXp ? `LV. ${userXp.level} ${userXp.rankTitle}` : 'Thợ Săn BCN'}
              </span>
            </h3>
            <p className="bounty-hud-sub">
              <span>Chuyên viên Freelancer</span>
              <span>•</span>
              <span className="bounty-hud-status-ready">Sẵn sàng nhận nhiệm vụ</span>
            </p>
          </div>
        </div>

        {/* Coin & XP Wallet Indicators */}
        <div className="bounty-hud-wallets">
          <div className="bounty-wallet-pill">
            <Coins size={22} weight="fill" />
            <div>
              <div className="bounty-wallet-label">Ví BCN Coin</div>
              <div className="bounty-wallet-val">
                {displayCoins.toLocaleString('vi-VN')} <span className="bounty-wallet-unit">Coin</span>
              </div>
            </div>
          </div>

          <div className="bounty-wallet-pill xp">
            <Sparkle size={22} weight="fill" />
            <div>
              <div className="bounty-wallet-label">Kinh nghiệm</div>
              <div className="bounty-wallet-val">
                {(userXp?.totalXp || 2450).toLocaleString('vi-VN')} <span className="bounty-wallet-unit">XP</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Unclaimed Rewards Banner */}
      {unclaimedApprovedList.length > 0 && (
        <div className="bounty-unclaimed-banner">
          <div className="bounty-unclaimed-info">
            <Trophy size={32} weight="fill" className="bounty-unclaimed-icon" />
            <div>
              <h4>
                <Sparkle size={20} weight="fill" style={{ verticalAlign: '-3px', marginRight: 6 }} />
                Bạn có {unclaimedApprovedList.length} nhiệm vụ đã được duyệt!
              </h4>
              <p>Mentor đã nghiệm thu xong bài làm của bạn. Hãy bấm nhận thưởng để cộng Coin và XP vào ví ngay.</p>
            </div>
          </div>
          <div className="bounty-unclaimed-actions">
            {unclaimedApprovedList.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={isClaiming}
                onClick={() => handleClaimReward(item)}
                className="button bounty-claim-btn"
              >
                <Gift size={18} weight="fill" />
                <span>Nhận thưởng ngay: {item.bounty?.title} (+{item.bounty?.rewardCoins} Coin +{item.bounty?.rewardXp} XP)</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 2. AREA A: HERO SECTION (Title, Description, Metrics, Progress Bar) */}
      <div className="bounty-hero">
        <div className="bounty-hero-grid">
          <div>
            <div className="bounty-hero-badge">
              <Briefcase size={14} weight="bold" />
              <span>Nhiệm Vụ Thực Chiến</span>
            </div>
            <h1>Bảng Nhiệm Vụ Freelancer</h1>
            <p>
              Nhận job mô phỏng từ khách hàng thực tế, thực hành code, nộp link bài làm để nhận thưởng BCN Coin,
              XP và ghi danh vào hồ sơ năng lực Portfolio của bạn.
            </p>

            <div className="bounty-hero-tabs">
              <button
                type="button"
                onClick={() => setActiveTab('board')}
                className={`bounty-tab-btn ${activeTab === 'board' ? 'is-active' : ''}`}
              >
                Khám phá nhiệm vụ
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`bounty-tab-btn ${activeTab === 'history' ? 'is-active' : ''}`}
              >
                Lịch sử nộp bài ({history.length})
              </button>
            </div>
          </div>

          {/* 3 Metric counters & Progress */}
          <div>
            <div className="bounty-hero-metrics">
              <div className="bounty-metric-tile">
                <p className="bounty-metric-label">Job Đang Mở</p>
                <h4 className="bounty-metric-value">{stats.openCount}</h4>
                <span className="bounty-metric-sub">Sẵn sàng nhận</span>
              </div>

              <div className="bounty-metric-tile">
                <p className="bounty-metric-label">Quỹ Thưởng</p>
                <h4 className="bounty-metric-value highlight-gold">{stats.totalRewardPool.toLocaleString('vi-VN')}</h4>
                <span className="bounty-metric-sub">BCN Coin</span>
              </div>

              <div className="bounty-metric-tile">
                <p className="bounty-metric-label">Đã Hoàn Thành</p>
                <h4 className="bounty-metric-value">{stats.userCompletedCount}</h4>
                <span className="bounty-metric-sub">Nhiệm vụ</span>
              </div>
            </div>

            {/* Overall Progress Bar */}
            <div className="bounty-overview-progress">
              <div className="bounty-progress-head">
                <span>Tiến độ hoàn thành BCN Freelancer</span>
                <span>{completionPercentage}% ({stats.userCompletedCount}/{totalTracked || 1})</span>
              </div>
              <div className="bounty-progress-bar-wrap">
                <div
                  className="bounty-progress-bar-fill"
                  style={{ width: `${Math.min(100, Math.max(0, completionPercentage))}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. AREA B: DAILY & WEEKLY MISSIONS PREVIEW */}
      <div className="bounty-preview-section">
        {/* Daily Mission Card */}
        <div className="bounty-preview-card">
          <div className="bounty-preview-header">
            <div className="bounty-preview-title-row">
              <div className="bounty-preview-icon">
                <Target size={18} weight="fill" />
              </div>
              <div className="bounty-preview-body">
                <strong>Nhiệm vụ Ngày: Thực hành Freelancer</strong>
                <p>Nhận và hoàn thành 1 nhiệm vụ bất kỳ trên bảng hôm nay</p>
              </div>
            </div>
            <span className="bounty-preview-badge">Hằng ngày</span>
          </div>

          <div className="bounty-preview-progress">
            <div className="progress-track">
              <span style={{ width: `${stats.userCompletedCount > 0 ? 100 : 0}%` }} />
            </div>
            <span>{stats.userCompletedCount > 0 ? '1/1' : '0/1'} hoàn thành</span>
          </div>

          <div className="bounty-preview-footer">
            <div className="bounty-preview-rewards">
              <span className="bounty-reward-coin">+50 Coin</span>
              <span>•</span>
              <span className="bounty-reward-xp">+100 XP</span>
            </div>
            <span className="status status-approved">
              {stats.userCompletedCount > 0 ? 'Đã đạt' : 'Đang diễn ra'}
            </span>
          </div>
        </div>

        {/* Weekly Goal Card */}
        <div className="bounty-preview-card is-weekly">
          <div className="bounty-preview-header">
            <div className="bounty-preview-title-row">
              <div className="bounty-preview-icon">
                <Trophy size={18} weight="fill" />
              </div>
              <div className="bounty-preview-body">
                <strong>Mục tiêu Tuần: Chuyên gia BCN</strong>
                <p>Nghiệm thu thành công 3 dự án để thăng hạng Freelancer</p>
              </div>
            </div>
            <span className="bounty-preview-badge">Hằng tuần</span>
          </div>

          <div className="bounty-preview-progress">
            <div className="progress-track">
              <span style={{ width: `${Math.min(100, Math.round((stats.userCompletedCount / 3) * 100))}%` }} />
            </div>
            <span>{Math.min(3, stats.userCompletedCount)}/3 dự án</span>
          </div>

          <div className="bounty-preview-footer">
            <div className="bounty-preview-rewards">
              <span className="bounty-reward-coin">+200 Coin</span>
              <span>•</span>
              <span className="bounty-reward-xp">+350 XP</span>
            </div>
            <span className="status status-approved">
              {stats.userCompletedCount >= 3 ? 'Đạt mốc' : 'Tuần này'}
            </span>
          </div>
        </div>
      </div>

      {/* 4. ACTIVE QUEST BOX (If user currently has an assigned mission) */}
      {activeAssignment && (
        <div className="bounty-active-box">
          <div className="bounty-active-head">
            <div className="bounty-active-badge">
              {activeAssignment.status === 'IN_PROGRESS' && (
                <>
                  <span className="bounty-active-dot" />
                  <span>Nhiệm Vụ Đang Thực Hiện</span>
                </>
              )}
              {activeAssignment.status === 'SUBMITTED' && (
                <span className="bounty-status-tag warning">
                  <Hourglass size={15} weight="bold" />
                  <span>Chờ Mentor/Admin duyệt</span>
                </span>
              )}
              {activeAssignment.status === 'APPROVED' && (
                <span className="bounty-status-tag success">
                  <CheckCircle size={15} weight="bold" />
                  <span>Đã được phê duyệt</span>
                </span>
              )}
              {activeAssignment.status === 'REJECTED' && (
                <span className="bounty-status-tag danger">
                  <WarningCircle size={15} weight="bold" />
                  <span>Chưa đạt yêu cầu</span>
                </span>
              )}
            </div>

            {/* Live countdown timer for IN_PROGRESS or status indicator */}
            {activeAssignment.status === 'IN_PROGRESS' ? (
              <div className="bounty-timer">
                <Clock size={16} weight="bold" />
                <span>
                  {String(timeLeft.minutes).padStart(2, '0')}:{String(timeLeft.seconds).padStart(2, '0')}
                </span>
                <span className="bounty-metric-sub">còn lại</span>
              </div>
            ) : activeAssignment.status === 'SUBMITTED' ? (
              <div className="bounty-timer">
                <Hourglass size={16} weight="bold" />
                <span>Đang chờ duyệt</span>
              </div>
            ) : null}
          </div>

          <div className="bounty-active-body">
            {/* Quest info */}
            <div className="bounty-active-info">
              <div>
                <h3 className="bounty-active-title">
                  {activeAssignment.bounty.title}
                </h3>
                <p className="bounty-active-desc">
                  {activeAssignment.bounty.description}
                </p>
              </div>

              {/* Client info & Reward */}
              <div className="bounty-active-meta">
                <div className="bounty-client-tag">
                  <div className="bounty-client-avatar">
                    {activeAssignment.bounty.clientName.charAt(0)}
                  </div>
                  <span>
                    Khách hàng: <strong>{activeAssignment.bounty.clientName}</strong> ({activeAssignment.bounty.clientRole})
                  </span>
                </div>

                <div className="bounty-reward-pill">
                  <Coins size={14} weight="fill" />
                  <span>+{activeAssignment.bounty.rewardCoins} Coin</span>
                </div>

                <div className="bounty-reward-pill xp">
                  <Sparkle size={14} weight="fill" />
                  <span>+{activeAssignment.bounty.rewardXp} XP</span>
                </div>
              </div>

              {/* Tasks Checklist */}
              {Array.isArray(activeAssignment.bounty.tasks) && activeAssignment.bounty.tasks.length > 0 && (
                <div className="bounty-tasks-box">
                  <p className="bounty-tasks-title">
                    Checklist tiêu chuẩn nghiệm thu:
                  </p>
                  <div className="bounty-tasks-list">
                    {activeAssignment.bounty.tasks.map((t, idx) => (
                      <div key={idx} className="bounty-task-item">
                        <CheckCircle size={15} weight="fill" />
                        <span>{t.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right side: Form or Status View based on status */}
            <div className="bounty-active-form">
              {activeAssignment.status === 'IN_PROGRESS' && (
                <form onSubmit={handleSubmit} className="bounty-field">
                  <div className="bounty-field">
                    <label className="bounty-field-label">
                      Link dự án nghiệm thu (GitHub / Figma / Vercel demo) <span className="bounty-field-required">*</span>
                    </label>
                    <input
                      type="url"
                      required
                      placeholder="https://github.com/username/project hoặc https://vercel.app"
                      value={submittingUrl}
                      onChange={(e) => setSubmittingUrl(e.target.value)}
                      className="bounty-input"
                    />
                  </div>

                  <div className="bounty-field">
                    <label className="bounty-field-label is-muted">
                      Ghi chú nghiệm thu (tùy chọn)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Mô tả tóm tắt tính năng bạn đã hoàn thành..."
                      value={submissionNotes}
                      onChange={(e) => setSubmissionNotes(e.target.value)}
                      className="bounty-textarea"
                    />
                  </div>

                  <div className="bounty-form-actions">
                    <button
                      type="submit"
                      disabled={isSubmitting || !submittingUrl.trim()}
                      className="button bounty-submit-btn"
                    >
                      <ShieldCheck size={18} weight="bold" />
                      <span>{isSubmitting ? 'Đang gửi bài...' : 'Nộp dự án nghiệm thu'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleAbandon}
                      className="button danger"
                      title="Bỏ nhiệm vụ này"
                    >
                      <Trash size={18} />
                    </button>
                  </div>
                </form>
              )}

              {activeAssignment.status === 'SUBMITTED' && (
                <div className="bounty-field">
                  <div className="bounty-submitted-box">
                    <div>
                      <strong>Trạng thái: </strong>
                      <span className="status status-pending_review">Chờ Mentor/Admin duyệt</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--muted)' }}>
                      Bài làm của bạn đang được Mentor/Admin nghiệm thu và đối chiếu checklist. Bạn sẽ nhận được thông báo ngay khi có kết quả!
                    </p>
                    {activeAssignment.projectUrl && (
                      <div>
                        <strong>Link bài nộp: </strong>
                        <a href={activeAssignment.projectUrl} target="_blank" rel="noopener noreferrer">
                          {activeAssignment.projectUrl}
                        </a>
                      </div>
                    )}
                    {activeAssignment.submissionNotes && (
                      <div>
                        <strong>Ghi chú: </strong>
                        <span>{activeAssignment.submissionNotes}</span>
                      </div>
                    )}
                  </div>

                  <div className="bounty-form-actions">
                    <button
                      type="button"
                      onClick={handleAbandon}
                      className="button secondary"
                    >
                      <Trash size={16} />
                      <span>Hủy lượt nộp / Bỏ nhiệm vụ</span>
                    </button>
                  </div>
                </div>
              )}

              {activeAssignment.status === 'APPROVED' && (
                <div className="bounty-field">
                  <div className="bounty-submitted-box" style={{ borderColor: 'var(--accent)' }}>
                    <div>
                      <strong>Trạng thái: </strong>
                      {activeAssignment.transaction?.status === 'COMPLETED' ? (
                        <span className="status status-approved">Đã hoàn thành &amp; Đã nhận thưởng</span>
                      ) : (
                        <span className="status status-approved">Đã phê duyệt (Chờ nhận thưởng)</span>
                      )}
                    </div>
                    {activeAssignment.reviewFeedback && (
                      <p className="bounty-history-feedback">
                        &quot;{activeAssignment.reviewFeedback}&quot;
                      </p>
                    )}
                  </div>

                  {(!activeAssignment.transaction || activeAssignment.transaction.status !== 'COMPLETED') ? (
                    <button
                      type="button"
                      disabled={isClaiming}
                      onClick={() => handleClaimReward(activeAssignment)}
                      className="button bounty-claim-btn"
                    >
                      <Gift size={20} weight="fill" />
                      <span>
                             Nhận thưởng ngay (+{activeAssignment.bounty.rewardCoins} Coins +{activeAssignment.bounty.rewardXp} XP)
                      </span>
                    </button>
                  ) : (
                    <span className="status status-approved" style={{ textAlign: 'center', padding: '0.625rem' }}>
                      <CheckCircle size={16} weight="fill" /> Đã nhận thưởng thành công
                    </span>
                  )}
                </div>
              )}

              {activeAssignment.status === 'REJECTED' && (
                <div className="bounty-field">
                  <div className="bounty-rejected-box">
                    <p className="bounty-rejected-title">Chưa đạt yêu cầu</p>
                    <p className="bounty-rejected-note">
                      &quot;{activeAssignment.reviewFeedback || 'Bài làm chưa đạt tiêu chuẩn checklist.'}&quot;
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="bounty-field">
                    <label className="bounty-field-label">
                      Cập nhật link dự án mới:
                    </label>
                    <input
                      type="url"
                      required
                      placeholder="https://github.com/username/project"
                      value={submittingUrl}
                      onChange={(e) => setSubmittingUrl(e.target.value)}
                      className="bounty-input"
                    />
                    <textarea
                      rows={2}
                      placeholder="Ghi chú sửa đổi..."
                      value={submissionNotes}
                      onChange={(e) => setSubmissionNotes(e.target.value)}
                      className="bounty-textarea"
                    />
                    <div className="bounty-form-actions">
                      <button
                        type="submit"
                        disabled={isSubmitting || !submittingUrl.trim()}
                        className="button bounty-submit-btn"
                      >
                        <ShieldCheck size={18} weight="bold" />
                        <span>Nộp lại bài làm</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleAbandon}
                        className="button danger"
                        title="Bỏ nhiệm vụ này"
                      >
                        <Trash size={18} />
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: BOUNTY BOARD */}
      {activeTab === 'board' ? (
        <div className="bounty-field">
          {/* Category Filter Tabs */}
          <div className="bounty-filter-row">
            {CATEGORIES.map((cat) => {
              const IconComp = cat.icon;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat.key);
                    setBountyPage(1);
                  }}
                  className={`bounty-filter-chip ${selectedCategory === cat.key ? 'is-active' : ''}`}
                >
                  <IconComp size={16} weight="bold" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Locked Notice banner if active quest exists */}
          {isLockedByActiveQuest && (
            <div className="bounty-locked-banner">
              <Lock size={18} weight="fill" />
              <span>
                <strong>Chế độ tập trung (Single Active Quest):</strong> Bạn đang có 1 nhiệm vụ đang làm. Các nhiệm vụ
                khác sẽ tạm khóa cho đến khi bạn hoàn thành hoặc bỏ nhiệm vụ hiện tại!
              </span>
            </div>
          )}

          {/* AREA C: BOUNTY CARDS GRID */}
          {filteredBounties.length === 0 ? (
            <Empty title="Không có nhiệm vụ nào" description="Hiện tại chưa có nhiệm vụ nào trong danh mục này." />
          ) : (
            <>
              <div className="bounty-grid">
                {displayedBounties.map((bounty) => {
                  const isActive = activeAssignment?.bountyId === bounty.id;
                  const isLocked = isLockedByActiveQuest && !isActive;

                  return (
                    <div key={bounty.id} className="bounty-card">
                      {/* Locked Veil Overlay */}
                      {isLocked && (
                        <div className="bounty-card-locked-veil">
                          <div className="bounty-card-locked-icon">
                            <Lock size={20} weight="fill" />
                          </div>
                          <p>Tạm khóa do đang có nhiệm vụ khác</p>
                          <button
                            type="button"
                            onClick={() => setInspectBounty(bounty)}
                          >
                            Xem thông tin chi tiết
                          </button>
                        </div>
                      )}

                      <div className="bounty-card-main">
                        {/* Card Header: Client & Category */}
                        <div className="bounty-card-header">
                          <div className="bounty-card-client">
                            <div className="bounty-client-avatar-sm">
                              {bounty.clientName.charAt(0)}
                            </div>
                            <div>
                              <div className="bounty-client-name">
                                {bounty.clientName}
                              </div>
                              <div className="bounty-client-role">
                                {bounty.clientCompany || bounty.clientRole}
                              </div>
                            </div>
                          </div>

                          <span className="bounty-category-tag">
                            {bounty.category}
                          </span>
                        </div>

                        {/* Title & Description */}
                        <div>
                          <h4 className="bounty-card-title">
                            {bounty.title}
                          </h4>
                          <p className="bounty-card-desc">
                            {bounty.description}
                          </p>
                        </div>

                        {/* Skills Tags */}
                        {Array.isArray(bounty.skills) && bounty.skills.length > 0 && (
                          <div className="bounty-skills-wrap">
                            {bounty.skills.slice(0, 3).map((skill, idx) => (
                              <span key={idx} className="bounty-skill-chip">
                                {skill}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Card Footer: Difficulty, Reward & CTA */}
                      <div className="bounty-card-foot">
                        <div>
                          <div className="bounty-stars">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                size={13}
                                weight={i < bounty.difficulty ? 'fill' : 'regular'}
                                className={i < bounty.difficulty ? 'bounty-star-filled' : 'bounty-star-empty'}
                              />
                            ))}
                          </div>
                          <div className="bounty-rewards-row">
                            <span className="bounty-reward-coin">
                              +{bounty.rewardCoins} Coin
                            </span>
                            <span className="bounty-reward-xp">
                              +{bounty.rewardXp} XP
                            </span>
                          </div>
                        </div>

                        {isActive ? (
                          <span className="bounty-status-active-badge">
                            Đang làm
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setInspectBounty(bounty)}
                            className="button secondary"
                          >
                            Chi tiết
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <PaginationNav
                page={bountyPage}
                totalPages={Math.max(1, Math.ceil(filteredBounties.length / 6))}
                total={filteredBounties.length}
                onChange={setBountyPage}
              />
            </>
          )}
        </div>
      ) : (
        /* TAB CONTENT: HISTORY (Area D: Reward Experience) */
        <div className="bounty-history-panel">
          <div className="bounty-history-head">
            <h3>Lịch sử các nhiệm vụ đã thực hiện</h3>
            <span className="bounty-history-count">{history.length} bản ghi</span>
          </div>

          {history.length === 0 ? (
            <div className="bounty-history-empty">
              Bạn chưa hoàn thành nhiệm vụ nào. Hãy nhận một job trên bảng nhiệm vụ để bắt đầu!
            </div>
          ) : (
            <>
              <div className="bounty-history-list">
                {displayedHistory.map((item) => {
                  const isApproved = item.status === 'APPROVED';
                  const isClaimed = isApproved && item.transaction?.status === 'COMPLETED';
                  const isSubmitted = item.status === 'SUBMITTED';
                  const isRejected = item.status === 'REJECTED';
                  const isExpired = item.status === 'EXPIRED';
                  const isAbandoned = item.status === 'ABANDONED';

                  return (
                    <div key={item.id} className="bounty-history-item">
                      <div className="bounty-history-info">
                        <div className="bounty-history-title-row">
                          <span
                            className={`status ${
                              isClaimed
                                ? 'status-approved'
                                : isApproved
                                ? 'status-approved'
                                : isSubmitted
                                ? 'status-pending_review'
                                : isExpired
                                ? 'status-expired'
                                : isRejected || isAbandoned
                                ? 'status-rejected'
                                : 'status-pending_review'
                            }`}
                          >
                            {isClaimed
                              ? 'Đã hoàn thành & Đã nhận thưởng'
                              : isApproved
                              ? 'Đã duyệt (Chờ nhận thưởng)'
                              : isSubmitted
                              ? 'Chờ Mentor/Admin duyệt'
                              : isExpired
                              ? 'QUÁ HẠN'
                              : isAbandoned
                              ? 'ĐÃ HỦY'
                              : isRejected
                              ? 'Chưa đạt yêu cầu'
                              : item.status}
                          </span>
                          <h4>{item.bounty?.title || 'Nhiệm vụ Freelancer'}</h4>
                        </div>

                        {/* Stored XSS defense: Only render link if safe protocol */}
                        {isSafeUrl(item.projectUrl) ? (
                          <p className="bounty-history-link">
                            <a
                              href={item.projectUrl!}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {item.projectUrl}
                            </a>
                          </p>
                        ) : item.projectUrl ? (
                          <p className="bounty-history-link">
                            {item.projectUrl}
                          </p>
                        ) : null}

                        {/* Status Notes & Reviewer Feedback */}
                        {isSubmitted && (
                          <p className="bounty-history-feedback">
                            Bài nộp đang được Mentor/Admin nghiệm thu và đối chiếu checklist.
                          </p>
                        )}

                        {item.reviewFeedback && (
                          <p className={isRejected ? 'bounty-rejected-feedback' : 'bounty-history-feedback'}>
                            {isRejected && <strong>Góp ý từ Reviewer: </strong>}
                            &quot;{item.reviewFeedback}&quot;
                          </p>
                        )}
                      </div>

                      <div className="bounty-history-side">
                        {isApproved && (
                          <div className="bounty-history-reward">
                            +{item.bounty?.rewardCoins} Coin • +{item.bounty?.rewardXp} XP
                          </div>
                        )}
                        <div className="bounty-history-date">
                          {new Date(item.acceptedAt).toLocaleDateString('vi-VN')}
                        </div>

                        {/* Prominent Claim Button if Approved & not claimed */}
                        {isApproved && !isClaimed && (
                          <button
                            type="button"
                            disabled={isClaiming}
                            onClick={() => handleClaimReward(item)}
                            className="button bounty-claim-btn-sm"
                            style={{ marginTop: '0.5rem' }}
                          >
                            <Gift size={15} weight="fill" />
                            <span>     Nhận thưởng ngay</span>
                          </button>
                        )}

                        {/* Retry button if Rejected */}
                        {isRejected && (
                          <button
                            type="button"
                            disabled={isLockedByActiveQuest}
                            onClick={() => handleRetry(item)}
                            className="button secondary sm"
                            style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}
                            title={isLockedByActiveQuest ? 'Cần hoàn thành nhiệm vụ đang làm trước' : 'Làm lại nhiệm vụ này'}
                          >
                            <ArrowCounterClockwise size={14} />
                            <span>Thử lại</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <PaginationNav
                page={historyPage}
                totalPages={Math.max(1, Math.ceil(history.length / 6))}
                total={history.length}
                onChange={setHistoryPage}
              />
            </>
          )}
        </div>
      )}

      {/* 5. MODAL: INSPECT BOUNTY DETAIL & ACCEPT */}
      {inspectBounty && (
        <div className="bounty-modal-backdrop" onClick={() => setInspectBounty(null)}>
          <div className="bounty-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="bounty-modal-header">
              <span className="bounty-category-tag">
                {inspectBounty.category}
              </span>
              <button
                type="button"
                onClick={() => setInspectBounty(null)}
                className="bounty-modal-close"
                aria-label="Đóng chi tiết"
              >
                <X size={20} />
              </button>
            </div>

            <div className="bounty-field">
              <h3 className="bounty-modal-title">
                {inspectBounty.title}
              </h3>
              <p className="bounty-modal-desc">
                {inspectBounty.description}
              </p>
            </div>

            {/* Client Note quote */}
            {inspectBounty.clientNotes && (
              <div className="bounty-client-quote">
                &quot;{inspectBounty.clientNotes}&quot; — <strong>{inspectBounty.clientName}</strong>
              </div>
            )}

            {/* Checklist */}
            {Array.isArray(inspectBounty.tasks) && inspectBounty.tasks.length > 0 && (
              <div className="bounty-modal-tasks">
                <p>Hạng mục công việc cần hoàn thành:</p>
                <div className="bounty-modal-tasks-scroll">
                  {inspectBounty.tasks.map((task, i) => (
                    <div key={i} className="bounty-task-item">
                      <CheckCircle size={15} weight="fill" />
                      <span>{task.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reward & Duration details */}
            <div className="bounty-modal-stats">
              <div className="bounty-modal-stat-item">
                <div className="bounty-modal-stat-label">Phần thưởng</div>
                <div className="bounty-modal-stat-val gold">+{inspectBounty.rewardCoins} Coin</div>
              </div>
              <div className="bounty-modal-stat-item">
                <div className="bounty-modal-stat-label">Kinh nghiệm</div>
                <div className="bounty-modal-stat-val purple">+{inspectBounty.rewardXp} XP</div>
              </div>
              <div className="bounty-modal-stat-item">
                <div className="bounty-modal-stat-label">Thời gian làm</div>
                <div className="bounty-modal-stat-val">
                  {inspectBounty.durationMinutes} phút
                </div>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="bounty-modal-actions">
              <button
                type="button"
                onClick={() => setInspectBounty(null)}
                className="button secondary"
              >
                Đóng
              </button>

              <button
                type="button"
                disabled={isLockedByActiveQuest}
                onClick={() => handleAccept(inspectBounty)}
                className="button"
              >
                {isLockedByActiveQuest ? (
                  <>
                    <Lock size={16} />
                    <span>Đang làm job khác</span>
                  </>
                ) : (
                  <>
                    <Play size={16} weight="fill" />
                    <span>Nhận nhiệm vụ này</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL: 4-STEP SUBMISSION PROGRESS STEPPER */}
      {reviewStep !== null && (
        <div className="bounty-modal-backdrop">
          <div className="bounty-modal-card is-compact">
            <div className="bounty-stepper-icon">
              <Hourglass size={28} weight="duotone" />
            </div>

            <h3 className="bounty-modal-title">
              Đang gửi bài nghiệm thu
            </h3>
            <p className="bounty-modal-desc">
              Hệ thống đang kiểm tra định dạng và chuyển dự án của bạn tới Mentor/Admin
            </p>

            {/* 4 Steps Checklist */}
            <div className="bounty-stepper-list">
              <div className={`bounty-stepper-item ${reviewStep >= 1 ? 'is-active' : ''}`}>
                <CheckCircle size={18} weight={reviewStep >= 1 ? 'fill' : 'regular'} />
                <span>1. Đã nhận link dự án nghiệm thu</span>
              </div>

              <div className={`bounty-stepper-item ${reviewStep >= 2 ? 'is-active' : ''}`}>
                <CheckCircle size={18} weight={reviewStep >= 2 ? 'fill' : 'regular'} />
                <span>2. Tiếp nhận ghi chú bài nộp</span>
              </div>

              <div className={`bounty-stepper-item ${reviewStep >= 3 ? 'is-active' : ''}`}>
                <CheckCircle size={18} weight={reviewStep >= 3 ? 'fill' : 'regular'} />
                <span>3. Chuyển thông tin tới hàng đợi duyệt</span>
              </div>

              <div className={`bounty-stepper-item ${reviewStep >= 4 ? 'is-active' : ''}`}>
                <CheckCircle size={18} weight={reviewStep >= 4 ? 'fill' : 'regular'} />
                <span>4. Nộp bài thành công! Đang chờ Mentor duyệt</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL: VICTORY COIN BURST CELEBRATION */}
      {celebrationData && (
        <div className="bounty-modal-backdrop">
          <div className="bounty-modal-card is-compact">
            <div className="bounty-celebration-trophy">
              <Trophy size={36} weight="fill" />
            </div>

            <h3 className="bounty-modal-title">
                   Nhận Thưởng Thành Công!
            </h3>
            <p className="bounty-modal-desc">
              <strong>{celebrationData.bountyTitle}</strong>
            </p>

            {/* Coins & XP gained badges */}
            <div className="bounty-celebration-rewards">
              <div className="bounty-celebration-reward-pill">
                <div className="bounty-celebration-reward-label">Thưởng BCN Coin</div>
                <div className="bounty-celebration-reward-val">
                  +{celebrationData.coins} Coin
                </div>
              </div>

              <div className="bounty-celebration-reward-pill xp">
                <div className="bounty-celebration-reward-label">Kinh nghiệm XP</div>
                <div className="bounty-celebration-reward-val">
                  +{celebrationData.xp} XP
                </div>
              </div>
            </div>

            <p className="bounty-celebration-feedback">
              &quot;{celebrationData.feedback}&quot;
            </p>

            <button
              type="button"
              onClick={() => setCelebrationData(null)}
              className="button"
            >
              Tuyệt vời, tiếp tục thăng hạng!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
