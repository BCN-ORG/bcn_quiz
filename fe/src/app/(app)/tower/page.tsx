'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Coins,
  HourglassHigh,
  Lightning,
  Sparkle,
  Timer,
  Trophy,
  XCircle,
  ArrowRight,
  Receipt,
  CheckCircle,
} from '@phosphor-icons/react';
import { Loading, ErrorState } from '@/components/ui';
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

  // Timer state
  const [remainingSeconds, setRemainingSeconds] = useState(10);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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

      // If there was an active attempt in progress
      if (data.activeAttempt && data.activeAttempt.currentQuestion) {
        setIsPlaying(true);
        setCurrentFloor(data.activeAttempt.floor);
        setCurrentStreak(data.activeAttempt.currentStreak);
        setRequiredStreak(data.activeAttempt.requiredStreak);
        setCurrentQuestion(data.activeAttempt.currentQuestion);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải thông tin Tháp';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  // Cooldown countdown ticker
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const interval = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          fetchOverview();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownRemaining, fetchOverview]);

  const handleTimeout = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      // Submitting an empty or invalid label triggers backend timeout validation
      const res = await towerApi.submitAnswer('TIMEOUT');
      setResultModal(res);
      setIsPlaying(false);
      fetchOverview();
    } catch {
      fetchOverview();
    } finally {
      setSubmitting(false);
    }
  }, [submitting, fetchOverview]);

  // 10s Question timer countdown
  useEffect(() => {
    if (!isPlaying || !currentQuestion) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const expiresAtMs = new Date(currentQuestion.expiresAt).getTime();

    const updateTimer = () => {
      const now = Date.now();
      const diffSec = Math.max(0, Math.ceil((expiresAtMs - now) / 1000));
      setRemainingSeconds(diffSec);

      if (diffSec <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        handleTimeout();
      }
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 200);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, currentQuestion, handleTimeout]);

  const handleStartFloor = async () => {
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
      fetchOverview();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectOption = async (label: string) => {
    if (submitting || !isPlaying) return;
    setSubmitting(true);
    setActionError(null);

    try {
      const res = await towerApi.submitAnswer(label);

      if (res.result === 'CORRECT') {
        setCurrentStreak(res.currentStreak ?? currentStreak + 1);
        if (res.nextQuestion) {
          setCurrentQuestion(res.nextQuestion);
        }
      } else if (res.result === 'FLOOR_COMPLETED') {
        setIsPlaying(false);
        setResultModal(res);
        fetchOverview();
      } else if (res.result === 'FAILED') {
        setIsPlaying(false);
        setResultModal(res);
        fetchOverview();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi gửi đáp án';
      setActionError(msg);
      fetchOverview();
    } finally {
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

  if (loading) return <main className="center-page"><Loading label="Đang tải dữ liệu Leo Tháp" /></main>;
  if (error || !overview) {
    return (
      <main className="center-page">
        <ErrorState title="Không thể tải dữ liệu Tháp" message={error || 'Đã có lỗi xảy ra'} retry={fetchOverview} />
      </main>
    );
  }

  return (
    <div className="content-container">
      {/* Header Banner */}
      <div className="course-header" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span className="badge primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Sparkle weight="fill" /> {overview.season.name}
              </span>
              {cooldownRemaining > 0 && (
                <span className="badge danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <HourglassHigh weight="bold" /> Cooldown: {formatCooldown(cooldownRemaining)}
                </span>
              )}
            </div>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700 }}>
              Daily Quiz Tower — Leo Tháp Kiến Thức
            </h1>
            <p style={{ margin: '4px 0 0 0', color: 'var(--muted)' }}>
              Chinh phục 100 tầng tháp. Mỗi tầng thưởng 1 Coin. Trả lời đúng liên tiếp, 10 giây/câu!
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="button secondary"
              onClick={handleOpenHistory}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Receipt size={18} /> Lịch sử Coin
            </button>
          </div>
        </div>

        {/* Action Error Banner */}
        {actionError && (
          <div
            style={{
              marginTop: 16,
              padding: '10px 16px',
              borderRadius: 8,
              background: 'var(--surface-2)',
              border: '1px solid var(--danger)',
              color: 'var(--danger)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Stats Row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16,
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid var(--line)',
          }}
        >
          <div className="stat-card" style={{ background: 'var(--surface)', padding: 16, borderRadius: 8 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Tầng hiện tại</span>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent)' }}>
              Tầng {overview.progress.currentFloor}
            </div>
          </div>
          <div className="stat-card" style={{ background: 'var(--surface)', padding: 16, borderRadius: 8 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Kỷ lục mùa này</span>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#10b981' }}>
              Tầng {overview.progress.highestCompletedFloor}
            </div>
          </div>
          <div className="stat-card" style={{ background: 'var(--surface)', padding: 16, borderRadius: 8 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Coin tích lũy mùa này</span>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Coins weight="fill" /> {overview.progress.highestCompletedFloor} Coins
            </div>
          </div>
        </div>
      </div>

      {/* Main Area: Play View or Tower Map */}
      {isPlaying && currentQuestion ? (
        <div
          style={{
            background: 'var(--surface)',
            border: '2px solid var(--accent)',
            borderRadius: 12,
            padding: 24,
            maxWidth: 800,
            margin: '0 auto',
            boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
          }}
        >
          {/* Question Top Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="badge primary" style={{ fontSize: '0.9rem', padding: '6px 12px' }}>
                Tầng {currentFloor}
              </span>
              <span style={{ fontWeight: 600 }}>
                Chuỗi đúng: {currentStreak} / {requiredStreak} câu
              </span>
            </div>

            {/* Countdown Badge */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 20,
                fontWeight: 700,
                fontSize: '1.1rem',
                backgroundColor: remainingSeconds <= 3 ? '#fee2e2' : '#e0f2fe',
                color: remainingSeconds <= 3 ? '#dc2626' : '#0284c7',
                border: `2px solid ${remainingSeconds <= 3 ? '#ef4444' : '#38bdf8'}`,
              }}
            >
              <Timer size={22} weight="bold" />
              <span>{remainingSeconds}s</span>
            </div>
          </div>

          {/* Streak Progress Track */}
          <div
            style={{
              height: 8,
              background: 'var(--line)',
              borderRadius: 4,
              overflow: 'hidden',
              marginBottom: 24,
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, (currentStreak / requiredStreak) * 100)}%`,
                background: 'linear-gradient(90deg, var(--accent) 0%, #10b981 100%)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>

          {/* Question Text */}
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.5, margin: 0 }}>
              Câu {currentQuestion.currentQuestionNumber}: {currentQuestion.question}
            </h2>
            {currentQuestion.code && (
              <pre
                style={{
                  background: 'var(--surface-2)',
                  padding: 14,
                  borderRadius: 6,
                  marginTop: 12,
                  overflowX: 'auto',
                  fontSize: '0.9rem',
                }}
              >
                <code>{currentQuestion.code}</code>
              </pre>
            )}
            {currentQuestion.imageUrl && (
              <img
                src={currentQuestion.imageUrl}
                alt="Question diagram"
                style={{ maxWidth: '100%', borderRadius: 8, marginTop: 12 }}
              />
            )}
          </div>

          {/* Options Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            {currentQuestion.options.map((opt) => (
              <button
                key={opt.label}
                type="button"
                disabled={submitting}
                onClick={() => handleSelectOption(opt.label)}
                className="button secondary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: 14,
                  textAlign: 'left',
                  borderRadius: 8,
                  fontSize: '1rem',
                  border: '1px solid var(--line)',
                  background: 'var(--surface)',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'var(--surface-2)',
                    fontWeight: 700,
                    color: 'var(--accent)',
                    flexShrink: 0,
                  }}
                >
                  {opt.label}
                </span>
                <span style={{ flex: 1 }}>{opt.content}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Overview Stage: Ready to Play */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Action Box */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: 16,
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: '2rem',
              }}
            >
              <Trophy weight="fill" />
            </div>

            <div>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
                Tầng {overview.progress.currentFloor} / 100
              </h2>
              <p style={{ margin: '6px 0 0 0', color: 'var(--muted)' }}>
                Yêu cầu: Trả lời đúng liên tiếp {overview.progress.currentFloor} câu hỏi.
                Thời gian: 10 giây mỗi câu.
              </p>
            </div>

            {cooldownRemaining > 0 ? (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  padding: '12px 20px',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <HourglassHigh size={24} weight="fill" />
                <div style={{ textAlign: 'left' }}>
                  <strong>Đang trong thời gian cooldown 4 giờ</strong>
                  <div>Thử lại sau: <strong>{formatCooldown(cooldownRemaining)}</strong></div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="button primary"
                onClick={handleStartFloor}
                disabled={submitting}
                style={{
                  fontSize: '1.1rem',
                  padding: '12px 32px',
                  borderRadius: 8,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontWeight: 600,
                }}
              >
                <Lightning weight="fill" size={20} /> Bắt đầu chinh phục Tầng {overview.progress.currentFloor}
              </button>
            )}
          </div>

          {/* 100-Floor Map Grid */}
          <div style={{ background: 'var(--surface)', padding: 24, borderRadius: 12, border: '1px solid var(--line)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 600 }}>
              Bản đồ Tháp Kiến Thức (100 Tầng)
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(68px, 1fr))',
                gap: 8,
              }}
            >
              {Array.from({ length: 100 }, (_, i) => i + 1).map((floorNum) => {
                const isPassed = floorNum <= overview.progress.highestCompletedFloor;
                const isCurrent = floorNum === overview.progress.currentFloor;

                let bg = 'var(--surface-2)';
                let color = 'var(--muted)';
                let borderColor = 'var(--line)';

                if (isPassed) {
                  bg = '#ecfdf5';
                  color = '#065f46';
                  borderColor = '#10b981';
                } else if (isCurrent) {
                  bg = '#fef3c7';
                  color = '#92400e';
                  borderColor = '#f59e0b';
                }

                return (
                  <div
                    key={floorNum}
                    style={{
                      border: `1px solid ${borderColor}`,
                      background: bg,
                      color,
                      borderRadius: 6,
                      padding: '8px 4px',
                      textAlign: 'center',
                      fontSize: '0.85rem',
                      fontWeight: isCurrent ? 700 : 500,
                    }}
                  >
                    <div>{floorNum}</div>
                    <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                      {isPassed ? '✓ 1 coin' : isCurrent ? 'Hiện tại' : 'Khóa'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Result Modal */}
      {resultModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 12,
              padding: 24,
              maxWidth: 480,
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            {resultModal.result === 'FLOOR_COMPLETED' ? (
              <>
                <div
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: '50%',
                    background: '#ecfdf5',
                    color: '#059669',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px auto',
                  }}
                >
                  <CheckCircle size={36} weight="fill" />
                </div>
                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#059669' }}>
                  Chúc mừng hoàn thành Tầng {resultModal.completedFloor}!
                </h2>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: '#fef3c7',
                    color: '#b45309',
                    padding: '8px 16px',
                    borderRadius: 20,
                    fontWeight: 700,
                    margin: '16px 0',
                  }}
                >
                  <Coins size={22} weight="fill" />
                  <span>+1 Coin đã được cộng vào tài khoản</span>
                </div>
                {resultModal.explanation && (
                  <p style={{ fontSize: '0.9rem', color: 'var(--muted)', textAlign: 'left', background: 'var(--surface-2)', padding: 12, borderRadius: 6 }}>
                    <strong>Giải thích:</strong> {resultModal.explanation}
                  </p>
                )}
                <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => {
                      setResultModal(null);
                      handleStartFloor();
                    }}
                  >
                    Tiếp tục Tầng {resultModal.nextFloor} <ArrowRight />
                  </button>
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
                <div
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: '50%',
                    background: '#fef2f2',
                    color: '#dc2626',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px auto',
                  }}
                >
                  <XCircle size={36} weight="fill" />
                </div>
                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#dc2626' }}>
                  Chưa vượt qua Tầng {currentFloor}
                </h2>
                <p style={{ margin: '8px 0', color: 'var(--muted)' }}>
                  {resultModal.reason === 'TIMEOUT'
                    ? 'Bạn đã hết thời gian 10 giây để trả lời câu hỏi.'
                    : `Bạn đã trả lời chưa chính xác. Đáp án đúng là: ${resultModal.correctAnswer ?? ''}`}
                </p>
                {resultModal.explanation && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--muted)', textAlign: 'left', background: 'var(--surface-2)', padding: 10, borderRadius: 6 }}>
                    <strong>Giải thích:</strong> {resultModal.explanation}
                  </p>
                )}
                <div
                  style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#b91c1c',
                    padding: '10px',
                    borderRadius: 8,
                    margin: '16px 0',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                  }}
                >
                  Cooldown 4 giờ trước khi được chơi lại tầng này.
                </div>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setResultModal(null)}
                >
                  Đóng
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Transactions History Drawer */}
      {showHistory && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 12,
              padding: 24,
              maxWidth: 640,
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
                Lịch sử nhận Coin Tháp
              </h3>
              <button
                type="button"
                className="button secondary"
                onClick={() => setShowHistory(false)}
              >
                Đóng
              </button>
            </div>

            {loadingHistory ? (
              <Loading label="Đang tải lịch sử giao dịch..." />
            ) : transactions.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--muted)', margin: '32px 0' }}>
                Chưa có giao dịch thưởng coin nào trong mùa giải này.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    style={{
                      border: '1px solid var(--line)',
                      borderRadius: 8,
                      padding: 12,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>Tầng {tx.floor}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                        Mã: {tx.idempotencyKey}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                        {new Date(tx.createdAt).toLocaleString('vi-VN')}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: '#f59e0b' }}>
                        +{tx.rewardCoins} Coin
                      </div>
                      <span
                        className={`badge ${
                          tx.status === 'SUCCESS'
                            ? 'primary'
                            : tx.status === 'PENDING'
                            ? 'warning'
                            : 'danger'
                        }`}
                        style={{ fontSize: '0.7rem' }}
                      >
                        {tx.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
