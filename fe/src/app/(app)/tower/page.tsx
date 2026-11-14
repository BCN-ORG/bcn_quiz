'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  ArrowClockwise,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Coins,
  HourglassHigh,
  Lightning,
  Receipt,
  Sparkle,
  Trophy,
  X,
  XCircle,
} from '@phosphor-icons/react';
import { Empty, ErrorState, Loading } from '@/components/ui';
import {
  towerApi,
  TowerOverview,
  TowerQuestion,
  AnswerResponse,
  TowerRewardTransactionItem,
} from '@/lib/tower';
import { QuizTimer, type TimerTier } from '@/components/quiz-timer';

export default function TowerPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<TowerOverview | null>(null);

  // Gameplay state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<TowerQuestion | null>(null);
  const [lastQuestion, setLastQuestion] = useState<TowerQuestion | null>(null);
  const [currentFloor, setCurrentFloor] = useState(1);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [requiredStreak, setRequiredStreak] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [cardTimerTier, setCardTimerTier] = useState<TimerTier>('normal');
  const submittingRef = useRef(false);

  // Result & Modals
  const [resultModal, setResultModal] = useState<AnswerResponse | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [transactions, setTransactions] = useState<TowerRewardTransactionItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Cooldown countdown
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  const fetchOverview = useCallback(async () => {
    try {
      setError(null);
      const data = await towerApi.getOverview();
      setOverview(data);
      setCurrentFloor(data.progress.currentFloor);

      if (data.progress.isCooldownActive && data.progress.cooldownRemainingSeconds > 0) {
        setCooldownRemaining(data.progress.cooldownRemainingSeconds);
      } else {
        setCooldownRemaining(0);
      }

      // If there is an active attempt in progress, restore it
      if (data.activeAttempt && data.activeAttempt.currentQuestion) {
        setIsPlaying(true);
        setCurrentFloor(data.activeAttempt.floor);
        setCurrentStreak(data.activeAttempt.currentStreak);
        setRequiredStreak(data.activeAttempt.requiredStreak);
        setCurrentQuestion(data.activeAttempt.currentQuestion);
        setLastQuestion(data.activeAttempt.currentQuestion);
      } else {
        setIsPlaying(false);
        setCurrentQuestion(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải thông tin Tháp';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  // Toggle fullscreen quiz-playing mode on body when actively answering a question
  useEffect(() => {
    const playing = Boolean(isPlaying && currentQuestion);
    document.body.classList.toggle('quiz-playing', playing);
    return () => {
      document.body.classList.remove('quiz-playing');
    };
  }, [isPlaying, currentQuestion]);

  // Reset card ambient timer color when question changes
  useEffect(() => {
    setCardTimerTier('normal');
  }, [currentQuestion?.id]);

  // Close modals on Escape
  useEffect(() => {
    if (!resultModal && !showHistory) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || submittingRef.current) return;
      if (resultModal) setResultModal(null);
      if (showHistory) setShowHistory(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [resultModal, showHistory]);

  // Cooldown countdown ticker
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const interval = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          void fetchOverview();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownRemaining, fetchOverview]);

  const handleTimeout = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    if (currentQuestion) {
      setLastQuestion(currentQuestion);
    }
    try {
      // Submitting 'TIMEOUT' triggers failure; force reason: 'TIMEOUT' in case request lands inside backend 1.5s grace window
      const res = await towerApi.submitAnswer('TIMEOUT');
      setResultModal({ ...res, reason: 'TIMEOUT' });
      setIsPlaying(false);
      if (res.cooldownRemainingSeconds) {
        setCooldownRemaining(res.cooldownRemainingSeconds);
      }
      void fetchOverview();
    } catch {
      void fetchOverview();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [currentQuestion, fetchOverview]);

  const handleStartFloor = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setActionError(null);
    try {
      const res = await towerApi.startFloor();
      setCurrentFloor(res.floor);
      setCurrentStreak(res.currentStreak);
      setRequiredStreak(res.requiredStreak);
      setCurrentQuestion(res.question);
      setLastQuestion(res.question);
      setIsPlaying(true);
      setResultModal(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể bắt đầu tầng';
      setActionError(msg);
      void fetchOverview();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleSelectOption = useCallback(async (label: string) => {
    if (submittingRef.current || !isPlaying) return;
    submittingRef.current = true;
    setSubmitting(true);
    setActionError(null);
    if (currentQuestion) {
      setLastQuestion(currentQuestion);
    }

    try {
      const res = await towerApi.submitAnswer(label);

      if (res.result === 'CORRECT') {
        setCurrentStreak(res.currentStreak ?? currentStreak + 1);
        if (res.nextQuestion) {
          setCurrentQuestion(res.nextQuestion);
          setLastQuestion(res.nextQuestion);
        }
      } else if (res.result === 'FLOOR_COMPLETED' || res.result === 'FAILED') {
        setIsPlaying(false);
        setResultModal(res);
        if (res.cooldownRemainingSeconds) {
          setCooldownRemaining(res.cooldownRemainingSeconds);
        }
        void fetchOverview();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi gửi đáp án';
      setActionError(msg);
      void fetchOverview();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [isPlaying, currentQuestion, currentStreak, fetchOverview]);

  // Keyboard shortcuts for Tower options: A-D or 1-4
  useEffect(() => {
    if (!isPlaying || !currentQuestion || submitting || resultModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(target.tagName) || event.ctrlKey || event.metaKey || event.altKey) return;
      const opts = currentQuestion.options;
      const index = /^[1-9]$/.test(event.key)
        ? Number(event.key) - 1
        : opts.findIndex((o) => o.label.toLowerCase() === event.key.toLowerCase());
      if (index >= 0 && index < opts.length) {
        event.preventDefault();
        void handleSelectOption(opts[index].label);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPlaying, currentQuestion, submitting, resultModal, handleSelectOption]);

  const handleOpenHistory = async () => {
    setShowHistory(true);
    setLoadingHistory(true);
    try {
      const items = await towerApi.getTransactions();
      setTransactions(items);
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  };

  const formatCooldown = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const txStatusClass = (status: TowerRewardTransactionItem['status']) => {
    if (status === 'SUCCESS') return 'status status-completed';
    if (status === 'FAILED') return 'status status-rejected';
    return 'status status-in_progress';
  };

  const txStatusLabel = (status: TowerRewardTransactionItem['status']) => {
    if (status === 'SUCCESS') return 'Thành công';
    if (status === 'FAILED') return 'Thất bại';
    if (status === 'PENDING') return 'Đang xử lý';
    return 'Đang đối soát';
  };

  if (loading) return <Loading label="Đang tải dữ liệu Leo Tháp" />;
  if (error || !overview) {
    return (
      <ErrorState
        title="Không thể tải dữ liệu Tháp"
        message={error || 'Đã có lỗi xảy ra'}
        retry={() => void fetchOverview()}
      />
    );
  }

  const isAllConquered = overview.progress.highestCompletedFloor >= 100;
  const streakPercent = requiredStreak
    ? Math.min(100, Math.round((currentStreak / requiredStreak) * 100))
    : 0;

  return (
    <>
      {isPlaying && currentQuestion ? (
        /* Quiz Playing View — follows Quizzy layout in topics/[id]/page.tsx */
        <>
          <div className="quiz-topbar">
            <button
              type="button"
              className="button secondary"
              onClick={() => setIsPlaying(false)}
            >
              <ArrowLeft /> Bản đồ tháp
            </button>
            <h1>Leo Tháp — Tầng {currentFloor}</h1>
            <div className="list-actions">
              <span className="quiz-floor-badge">
                <Trophy weight="fill" /> Tầng {currentFloor}
              </span>
              <span className="quiz-streak-badge">
                <Lightning weight="fill" /> Chuỗi: {currentStreak}/{requiredStreak}
              </span>
              <span className="status status-completed">
                <Coins weight="fill" /> +1 Coin
              </span>
            </div>
          </div>

          <div
            className="quiz-progress"
            aria-label={`Tiến độ tầng ${currentFloor}: câu ${currentQuestion.currentQuestionNumber} trên ${requiredStreak}`}
          >
            <span>
              Câu {currentQuestion.currentQuestionNumber} / {requiredStreak}
            </span>
            <div className="quiz-progress-bar">
              <span style={{ width: `${streakPercent}%` }} />
            </div>
            <span>{streakPercent}% hoàn thành</span>
          </div>

          {actionError ? (
            <div className="notice notice-danger" role="alert" style={{ marginTop: 0, marginBottom: 18 }}>
              <strong>{actionError}</strong>
            </div>
          ) : null}

          <section
            className={`panel quiz-question is-timer-card timer-card-${cardTimerTier}`}
            style={{ minHeight: 'auto' }}
          >
            <div className="tower-quiz-layout">
            <div className="tower-quiz-main">
            <div className="quiz-question-head">
              <span className="quiz-points">
                <Coins weight="fill" /> +1 Coin khi vượt tầng
              </span>
              <p className="save-status" role="status" aria-live="polite">
                {submitting
                  ? 'Đang chấm đáp án…'
                  : `Cần ${requiredStreak} câu đúng liên tiếp`}
              </p>
            </div>

            <h2 id="tower-question-text" style={{ overflowWrap: 'anywhere' }}>
              {currentQuestion.question}
            </h2>

            {currentQuestion.code ? (
              <pre className="code-block">
                <code>{currentQuestion.code}</code>
              </pre>
            ) : null}

            {currentQuestion.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentQuestion.imageUrl}
                alt="Minh họa cho câu hỏi"
                style={{
                  width: '100%',
                  maxHeight: 420,
                  objectFit: 'contain',
                  borderRadius: 12,
                  marginTop: 16,
                }}
              />
            ) : null}

            <div
              className="answer-list"
              role="radiogroup"
              aria-labelledby="tower-question-text"
            >
              {currentQuestion.options.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  role="radio"
                  aria-checked={false}
                  className="answer"
                  disabled={submitting}
                  onClick={() => void handleSelectOption(opt.label)}
                >
                  <span>{opt.label}</span>
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    {opt.isCode ? (
                      <code className="tower-code-option">{opt.content}</code>
                    ) : (
                      opt.content
                    )}
                  </span>
                  <span />
                </button>
              ))}
            </div>

            <p className="answer-hint">
              Chọn một đáp án trong vòng 10 giây (phím tắt: A–D hoặc 1–4). Trả lời sai hoặc hết giờ sẽ bị cooldown 4 giờ.
            </p>
            </div>
            <aside className={`tower-countdown tower-countdown-${cardTimerTier}`} aria-label="Đếm ngược">
              <QuizTimer
                expiresAt={currentQuestion.expiresAt}
                durationSeconds={10}
                onTimeout={handleTimeout}
                onTierChange={setCardTimerTier}
                isPaused={submitting}
                size={120}
                showSoundToggle
                showBadge
              />
              <p className="tower-countdown-hint">
                {cardTimerTier === 'timeout'
                  ? 'Hết giờ!'
                  : cardTimerTier === 'urgent'
                    ? 'Sắp hết giờ! Chọn đáp án ngay'
                    : cardTimerTier === 'warning'
                      ? 'Còn ít thời gian — nhanh lên'
                      : 'Chọn đáp án trong 10 giây'}
              </p>
            </aside>
            </div>
          </section>
        </>
      ) : (
        /* Overview / Tower Map View */
        <>
          <header className="page-heading">
            <div>
              <p className="eyebrow">
                <Sparkle weight="fill" style={{ verticalAlign: '-2px' }} /> {overview.season.name}
              </p>
              <h1>Leo Tháp Kiến Thức</h1>
              <p>
                Chinh phục 100 tầng tháp mỗi tháng. Vượt qua mỗi tầng nhận ngay +1 Coin. Trả lời đúng liên tiếp với 10 giây mỗi câu!
              </p>
            </div>
            <div className="list-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => void handleOpenHistory()}
              >
                <Receipt /> Lịch sử Coin
              </button>
            </div>
          </header>

          {actionError ? (
            <div
              className="notice notice-danger"
              role="alert"
              style={{
                marginTop: 0,
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <strong>{actionError}</strong>
              <button
                type="button"
                className="button secondary"
                onClick={() => setActionError(null)}
              >
                Đóng
              </button>
            </div>
          ) : null}

          <div className="figma-stats" aria-label="Số liệu Leo Tháp">
            <div className="figma-stat">
              <span>Tầng hiện tại</span>
              <strong style={{ color: 'var(--accent)' }}>
                Tầng {overview.progress.currentFloor}
              </strong>
              <small>yêu cầu {overview.progress.currentFloor} câu đúng liên tiếp</small>
            </div>
            <div className="figma-stat">
              <span>Kỷ lục mùa này</span>
              <strong>Tầng {overview.progress.highestCompletedFloor}</strong>
              <small>trên 100 tầng tháp</small>
            </div>
            <div className="figma-stat">
              <span>Coin tích lũy mùa này</span>
              <strong
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  color: 'var(--warning)',
                }}
              >
                <Coins weight="fill" /> {overview.progress.highestCompletedFloor}
              </strong>
              <small>+1 Coin mỗi tầng vượt qua</small>
            </div>
            <div className="figma-stat">
              <span>Trạng thái</span>
              {cooldownRemaining > 0 ? (
                <>
                  <strong style={{ color: 'var(--danger)' }}>
                    {formatCooldown(cooldownRemaining)}
                  </strong>
                  <small>Đang trong cooldown 4 giờ</small>
                </>
              ) : isAllConquered ? (
                <>
                  <strong style={{ color: 'var(--accent)' }}>100 / 100</strong>
                  <small>Đã chinh phục đỉnh tháp</small>
                </>
              ) : (
                <>
                  <strong style={{ color: 'var(--accent)' }}>Sẵn sàng</strong>
                  <small>
                    {overview.activeAttempt
                      ? `Đang làm dở Tầng ${overview.activeAttempt.floor}`
                      : 'Có thể leo tháp ngay'}
                  </small>
                </>
              )}
            </div>
          </div>

          <div className="topic-grid">
            <article className="topic-card">
              <h2>Thể lệ Leo Tháp</h2>
              <ul className="topic-rules">
                <li>
                  Tháp gồm 100 tầng và được làm mới vào đầu mỗi tháng ({overview.season.name}).
                </li>
                <li>
                  Ở <strong>Tầng N</strong>, bạn cần trả lời đúng liên tiếp <strong>N câu hỏi</strong> trong một lượt chơi để vượt tầng.
                </li>
                <li>
                  Mỗi câu hỏi có tối đa <strong>10 giây</strong> suy nghĩ. Độ khó tăng dần theo tầng (Tầng 1–30: Cơ bản, 31–70: Trung bình, 71–100: Nâng cao).
                </li>
                <li>
                  Vượt tầng thành công nhận ngay <strong>+1 Coin</strong>. Trả lời sai hoặc hết giờ sẽ bị <strong>cooldown 4 giờ</strong> trước khi thử lại.
                </li>
              </ul>
            </article>

            <aside className="topic-card topic-start">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="avatar" aria-hidden="true">
                  <Trophy weight="fill" size={22} />
                </div>
                <div>
                  <h2 style={{ margin: 0 }}>
                    {isAllConquered
                      ? 'Đã chinh phục đỉnh Tháp!'
                      : `Tầng ${overview.progress.currentFloor} / 100`}
                  </h2>
                  <small style={{ color: 'var(--muted)' }}>
                    Phần thưởng vượt tầng: +1 Coin
                  </small>
                </div>
              </div>

              {isAllConquered ? (
                <div className="notice notice-success" style={{ marginTop: 0 }}>
                  <strong>Bạn đã hoàn thành toàn bộ 100 tầng trong mùa giải này!</strong>
                  <p style={{ margin: '6px 0 0' }}>
                    Hẹn gặp lại bạn ở mùa giải tiếp theo để tiếp tục săn Coin.
                  </p>
                </div>
              ) : cooldownRemaining > 0 ? (
                <div className="notice notice-danger" style={{ marginTop: 0 }}>
                  <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <HourglassHigh weight="fill" /> Đang trong thời gian cooldown 4 giờ
                  </strong>
                  <p style={{ margin: '6px 0 0' }}>
                    Có thể thử lại Tầng {overview.progress.currentFloor} sau:{' '}
                    <strong>{formatCooldown(cooldownRemaining)}</strong>
                  </p>
                </div>
              ) : (
                <>
                  <p>
                    Yêu cầu trả lời đúng liên tiếp{' '}
                    <strong>{overview.progress.currentFloor} câu hỏi</strong> (10 giây/câu).
                  </p>
                  <button
                    type="button"
                    className="button"
                    onClick={() => void handleStartFloor()}
                    disabled={submitting}
                  >
                    <Lightning weight="fill" />{' '}
                    {submitting
                      ? 'Đang chuẩn bị…'
                      : overview.activeAttempt
                        ? `Tiếp tục Tầng ${overview.activeAttempt.floor}`
                        : `Bắt đầu chinh phục Tầng ${overview.progress.currentFloor}`}
                  </button>
                </>
              )}
            </aside>
          </div>

          <section className="panel" style={{ marginTop: 20 }}>
            <div className="section-title" style={{ flexWrap: 'wrap' }}>
              <h2>Bản đồ Tháp Kiến Thức (100 Tầng)</h2>
              <div className="list-actions">
                <span className="status status-completed">✓ Đã vượt (+1 Coin)</span>
                <span className="status status-in_progress">Tầng hiện tại</span>
                <span className="status">Khóa</span>
              </div>
            </div>

            <div className="tower-floor-grid">
              {Array.from({ length: 100 }, (_, i) => i + 1).map((floorNum) => {
                const isPassed = floorNum <= overview.progress.highestCompletedFloor;
                const isCurrent =
                  !isAllConquered && floorNum === overview.progress.currentFloor;
                const cellClass = isPassed
                  ? 'tower-floor-cell is-passed'
                  : isCurrent
                    ? 'tower-floor-cell is-current'
                    : 'tower-floor-cell';

                return (
                  <div key={floorNum} className={cellClass}>
                    <strong>Tầng {floorNum}</strong>
                    <small>
                      {isPassed ? '✓ +1 Coin' : isCurrent ? 'Hiện tại' : 'Khóa'}
                    </small>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      {/* Result Modal */}
      {resultModal ? (() => {
        const isVictory = resultModal.result === 'FLOOR_COMPLETED';
        const correctOption = (lastQuestion || currentQuestion)?.options?.find(
          (o) => o.label === resultModal.correctAnswer
        );

        return (
          <div
            className="dialog-backdrop"
            role="presentation"
            onClick={() => setResultModal(null)}
          >
            <div
              className={`dialog tower-result-dialog ${isVictory ? 'is-victory' : 'is-defeat'}`}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="tower-result-title"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="dialog-close-btn"
                onClick={() => setResultModal(null)}
                title="Đóng hộp thoại"
                aria-label="Đóng"
              >
                <X size={16} weight="bold" />
              </button>

              {isVictory ? (
                <>
                  <div className="tower-result-badge-halo is-victory" aria-hidden="true">
                    <Trophy size={40} weight="fill" />
                  </div>

                  <h3 id="tower-result-title" className="tower-result-heading is-victory">
                    Chúc mừng vượt Tầng {resultModal.completedFloor}!
                  </h3>

                  <div className="tower-result-reward-badges">
                    <span className="reward-chip is-coin">
                      <Coins size={16} weight="fill" /> +{resultModal.rewardCoins ?? 1} Coin nhận được
                    </span>
                    <span className="reward-chip is-record">
                      <Trophy size={16} weight="fill" /> Kỷ lục: Tầng {resultModal.completedFloor}
                    </span>
                  </div>

                  {resultModal.explanation ? (
                    <div className="tower-result-review-card">
                      <div className="review-explanation-section">
                        <div className="review-explanation-header">
                          <Sparkle size={13} weight="fill" /> Giải thích câu hoàn thành
                        </div>
                        <p className="review-explanation-text">{resultModal.explanation}</p>
                      </div>
                    </div>
                  ) : null}

                  <div className="dialog-action-buttons">
                    {(resultModal.completedFloor ?? 0) < 100 ? (
                      <button
                        type="button"
                        className="button primary full-width"
                        disabled={submitting}
                        onClick={() => {
                          setResultModal(null);
                          void handleStartFloor();
                        }}
                      >
                        Tiếp tục Tầng {resultModal.nextFloor} <ArrowRight size={18} weight="bold" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="button secondary full-width"
                      onClick={() => setResultModal(null)}
                    >
                      Về bản đồ tháp
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="tower-result-badge-halo is-defeat" aria-hidden="true">
                    {resultModal.reason === 'TIMEOUT' ? (
                      <HourglassHigh size={38} weight="fill" />
                    ) : (
                      <XCircle size={40} weight="fill" />
                    )}
                  </div>

                  <h3 id="tower-result-title" className="tower-result-heading is-defeat">
                    Chưa vượt qua Tầng {currentFloor}
                  </h3>

                  <div className="tower-result-meta-row">
                    {resultModal.reason === 'TIMEOUT' ? (
                      <span className="tower-reason-chip is-timeout">
                        <HourglassHigh size={14} weight="fill" /> Hết 10 giây suy nghĩ
                      </span>
                    ) : (
                      <span className="tower-reason-chip is-wrong">
                        <XCircle size={14} weight="fill" /> Đáp án chưa chính xác
                      </span>
                    )}
                  </div>

                  <p className="tower-result-lead">
                    {resultModal.reason === 'TIMEOUT'
                      ? 'Bạn đã không kịp chọn đáp án trong 10 giây quy định của tầng.'
                      : 'Bạn đã chọn câu trả lời chưa chính xác cho câu hỏi này.'}
                  </p>

                  {(resultModal.correctAnswer || resultModal.explanation) && (
                    <div className="tower-result-review-card">
                      {resultModal.correctAnswer ? (
                        <div className="review-answer-row">
                          <span className="review-answer-badge">
                            <CheckCircle size={14} weight="fill" /> Đáp án đúng
                          </span>
                          <div className="review-answer-content">
                            <span className="review-answer-label">{resultModal.correctAnswer}</span>
                            <span className="review-answer-text">
                              {correctOption?.content && correctOption.content !== resultModal.correctAnswer
                                ? correctOption.content
                                : `Lựa chọn ${resultModal.correctAnswer}`}
                            </span>
                          </div>
                        </div>
                      ) : null}

                      {resultModal.correctAnswer && resultModal.explanation ? (
                        <div className="review-card-divider" />
                      ) : null}

                      {resultModal.explanation ? (
                        <div className="review-explanation-section">
                          <div className="review-explanation-header">
                            <Sparkle size={13} weight="fill" /> Giải thích chi tiết
                          </div>
                          <p className="review-explanation-text">{resultModal.explanation}</p>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {cooldownRemaining > 0 ? (
                    <div className="tower-result-cooldown-card is-active">
                      <div className="cooldown-header">
                        <span className="cooldown-title">
                          <HourglassHigh size={15} weight="fill" /> Thời gian hồi chiêu
                        </span>
                        <span className="cooldown-badge is-counting">
                          {formatCooldown(cooldownRemaining)}
                        </span>
                      </div>
                      <p className="cooldown-desc">
                        Bạn có thể thử lại Tầng {currentFloor} sau khi hết thời gian hồi chiêu.
                      </p>
                    </div>
                  ) : (
                    <div className="tower-result-cooldown-card is-ready">
                      <div className="cooldown-header">
                        <span className="cooldown-title">
                          <Lightning size={15} weight="fill" /> Sẵn sàng thử lại ngay
                        </span>
                        <span className="cooldown-badge is-instant">
                          Không phải chờ
                        </span>
                      </div>
                      <p className="cooldown-desc">
                        Không bị khóa hồi chiêu. Bạn có thể chinh phục lại Tầng {currentFloor} ngay bây giờ!
                      </p>
                    </div>
                  )}

                  <div className="dialog-action-buttons">
                    {cooldownRemaining <= 0 ? (
                      <button
                        type="button"
                        className="button primary full-width"
                        disabled={submitting}
                        onClick={() => {
                          setResultModal(null);
                          void handleStartFloor();
                        }}
                      >
                        <ArrowClockwise size={18} weight="bold" /> Thử lại Tầng {currentFloor}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={`button ${cooldownRemaining > 0 ? 'primary full-width' : 'secondary full-width'}`}
                      onClick={() => setResultModal(null)}
                    >
                      Về bản đồ tháp
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })() : null}

      {/* Transactions History Modal */}
      {showHistory ? (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={() => setShowHistory(false)}
        >
          <div
            className="dialog dialog-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tower-history-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialog-header">
              <h2 id="tower-history-title">Lịch sử nhận Coin Tháp</h2>
              <button
                type="button"
                className="button secondary"
                onClick={() => setShowHistory(false)}
              >
                Đóng
              </button>
            </div>
            <div className="dialog-body">
              {loadingHistory ? (
                <Loading label="Đang tải lịch sử giao dịch" />
              ) : transactions.length === 0 ? (
                <Empty
                  title="Chưa có giao dịch thưởng Coin"
                  description="Khi bạn vượt qua một tầng tháp, lịch sử cộng Coin sẽ hiển thị tại đây."
                />
              ) : (
                <div className="list">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="list-row">
                      <div>
                        <strong>
                          Tầng {tx.floor} {tx.season?.name ? `· ${tx.season.name}` : ''}
                        </strong>
                        <small style={{ overflowWrap: 'anywhere' }}>
                          {new Date(tx.createdAt).toLocaleString('vi-VN')} · Mã: {tx.idempotencyKey}
                        </small>
                      </div>
                      <div
                        className="list-actions"
                        style={{ alignItems: 'center', flexShrink: 0 }}
                      >
                        <strong style={{ color: 'var(--warning)' }}>
                          +{tx.rewardCoins} Coin
                        </strong>
                        <span className={txStatusClass(tx.status)}>
                          {txStatusLabel(tx.status)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
