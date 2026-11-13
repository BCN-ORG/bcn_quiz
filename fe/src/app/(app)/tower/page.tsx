'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Coins,
  HourglassHigh,
  Lightning,
  Receipt,
  Sparkle,
  Timer,
  Trophy,
  XCircle,
} from '@phosphor-icons/react';
import { Empty, ErrorState, Loading } from '@/components/ui';
import { serverNow } from '@/lib/api';
import {
  towerApi,
  TowerOverview,
  TowerQuestion,
  AnswerResponse,
  TowerRewardTransactionItem,
} from '@/lib/tower';

export default function TowerPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<TowerOverview | null>(null);

  // Gameplay state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<TowerQuestion | null>(null);
  const [currentFloor, setCurrentFloor] = useState(1);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [requiredStreak, setRequiredStreak] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Timer state
  const [remainingSeconds, setRemainingSeconds] = useState(10);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    try {
      // Submitting 'TIMEOUT' triggers failure; force reason: 'TIMEOUT' in case request lands inside backend 1.5s grace window
      const res = await towerApi.submitAnswer('TIMEOUT');
      setResultModal({ ...res, reason: 'TIMEOUT' });
      setIsPlaying(false);
      void fetchOverview();
    } catch {
      void fetchOverview();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [fetchOverview]);

  // 10s Question timer countdown
  useEffect(() => {
    if (!isPlaying || !currentQuestion) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const expiresAtMs = new Date(currentQuestion.expiresAt).getTime();

    const updateTimer = () => {
      const now = serverNow();
      const diffSec = Math.max(0, Math.ceil((expiresAtMs - now) / 1000));
      setRemainingSeconds(diffSec);

      if (diffSec <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        void handleTimeout();
      }
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 200);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, currentQuestion, handleTimeout]);

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

  const handleSelectOption = async (label: string) => {
    if (submittingRef.current || !isPlaying) return;
    submittingRef.current = true;
    setSubmitting(true);
    setActionError(null);

    try {
      const res = await towerApi.submitAnswer(label);

      if (res.result === 'CORRECT') {
        setCurrentStreak(res.currentStreak ?? currentStreak + 1);
        if (res.nextQuestion) {
          setCurrentQuestion(res.nextQuestion);
        }
      } else if (res.result === 'FLOOR_COMPLETED' || res.result === 'FAILED') {
        setIsPlaying(false);
        setResultModal(res);
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
  };

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
              <span className="status status-completed">
                Chuỗi đúng: {currentStreak}/{requiredStreak}
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

          <section className="panel quiz-question" style={{ minHeight: 'auto' }}>
            <div className="quiz-question-head">
              <span className="quiz-points">Tầng {currentFloor} • +1 Coin</span>
              <p
                className={`topic-clock tower-clock ${remainingSeconds <= 3 ? 'is-warning' : ''}`}
                role="timer"
                aria-live="off"
              >
                <Timer weight="bold" aria-hidden="true" />
                <span>Còn {remainingSeconds}s</span>
              </p>
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
              Chọn một đáp án trong vòng 10 giây. Trả lời sai hoặc hết giờ sẽ bị cooldown 4 giờ.
            </p>
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
      {resultModal ? (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={() => setResultModal(null)}
        >
          <div
            className="dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="tower-result-title"
            style={{ width: 'min(480px, 100%)', textAlign: 'center' }}
            onClick={(event) => event.stopPropagation()}
          >
            {resultModal.result === 'FLOOR_COMPLETED' ? (
              <>
                <div className="tower-result-icon" aria-hidden="true">
                  <CheckCircle size={32} weight="fill" />
                </div>
                <strong id="tower-result-title" style={{ fontSize: 20 }}>
                  Chúc mừng vượt Tầng {resultModal.completedFloor}!
                </strong>
                <div style={{ margin: '12px 0 16px' }}>
                  <span className="status status-completed" style={{ fontSize: 13, padding: '6px 12px' }}>
                    <Coins weight="fill" style={{ marginRight: 6 }} />
                    +{resultModal.rewardCoins ?? 1} Coin đã được cộng vào tài khoản
                  </span>
                </div>
                {resultModal.explanation ? (
                  <div className="review-explain" style={{ textAlign: 'left', marginTop: 0, marginBottom: 18 }}>
                    <strong>Giải thích câu cuối</strong>
                    <p style={{ margin: 0, color: 'var(--text)' }}>{resultModal.explanation}</p>
                  </div>
                ) : null}
                <div className="list-actions" style={{ justifyContent: 'center' }}>
                  {(resultModal.completedFloor ?? 0) < 100 ? (
                    <button
                      type="button"
                      className="button"
                      disabled={submitting}
                      onClick={() => {
                        setResultModal(null);
                        void handleStartFloor();
                      }}
                    >
                      Tiếp tục Tầng {resultModal.nextFloor} <ArrowRight />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setResultModal(null)}
                  >
                    Về bản đồ tháp
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="tower-result-icon is-danger" aria-hidden="true">
                  <XCircle size={32} weight="fill" />
                </div>
                <strong id="tower-result-title" style={{ fontSize: 20, color: 'var(--danger)' }}>
                  Chưa vượt qua Tầng {currentFloor}
                </strong>
                <p style={{ marginTop: 8 }}>
                  {resultModal.reason === 'TIMEOUT'
                    ? 'Bạn đã hết thời gian 10 giây để trả lời câu hỏi.'
                    : `Bạn đã trả lời chưa chính xác.${
                        resultModal.correctAnswer
                          ? ` Đáp án đúng là: ${resultModal.correctAnswer}.`
                          : ''
                      }`}
                </p>
                {resultModal.explanation ? (
                  <div className="review-explain" style={{ textAlign: 'left', marginTop: 0, marginBottom: 16 }}>
                    <strong>Giải thích</strong>
                    <p style={{ margin: 0, color: 'var(--text)' }}>{resultModal.explanation}</p>
                  </div>
                ) : null}
                <div className="notice notice-danger" style={{ marginTop: 0, marginBottom: 18 }}>
                  <strong>Cooldown 4 giờ trước khi được thử lại tầng này.</strong>
                </div>
                <div className="list-actions" style={{ justifyContent: 'center' }}>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setResultModal(null)}
                  >
                    Đóng
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

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
