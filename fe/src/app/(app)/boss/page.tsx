'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Coins,
  Fire,
  HourglassHigh,
  Receipt,
  SpeakerHigh,
  SpeakerSlash,
  Sword,
  Trophy,
  X,
} from '@phosphor-icons/react';
import { ErrorState, Loading } from '@/components/ui';
import { serverNow } from '@/lib/api';
import {
  bossApi,
  BossOverview,
  BossQuestion,
  BossAnswerResponse,
  BossTransactionItem,
} from '@/lib/boss';

const SOUND_STORAGE_KEY = 'bcn_boss_sound_enabled';

// ---------------------------------------------------------------------------
// Audio Synthesizer (Web Audio API)
// ---------------------------------------------------------------------------
let globalAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!globalAudioCtx) {
      globalAudioCtx = new AudioCtx();
    }
    if (globalAudioCtx.state === 'suspended') {
      void globalAudioCtx.resume();
    }
    return globalAudioCtx;
  } catch {
    return null;
  }
}

function playSound(type: 'hit' | 'miss' | 'end', enabled: boolean) {
  if (!enabled || typeof window === 'undefined') return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'hit') {
      // Crisp upward combat pip
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.13);
    } else if (type === 'miss') {
      // Dull low buzz
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.2);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.15, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.23);
    } else if (type === 'end') {
      // Fanfare
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(554, now + 0.12);
      osc.frequency.setValueAtTime(659, now + 0.24);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.42);
    }
  } catch {
    // Ignore audio restrictions
  }
}

export default function BossPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<BossOverview | null>(null);

  // Sound state
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Battle session state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<BossQuestion | null>(null);
  const [sessionScore, setSessionScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [sessionRemaining, setSessionRemaining] = useState(300); // 5 minutes (seconds)
  const [questionRemaining, setQuestionRemaining] = useState(10); // 10s per question
  const [submitting, setSubmitting] = useState(false);
  const [combatError, setCombatError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const hasTimedOutRef = useRef(false);
  const feedbackTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  // Visual combat effects
  const [isHit, setIsHit] = useState(false);
  const [isDodge, setIsDodge] = useState(false);
  const [showSlash, setShowSlash] = useState(false);
  const [floatingDmg, setFloatingDmg] = useState<{ text: string; isMiss: boolean } | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [wrongFeedback, setWrongFeedback] = useState<{
    correctAnswer: string;
    content?: string | null;
    explanation?: string | null;
  } | null>(null);

  // Modals
  const [resultModal, setResultModal] = useState<BossAnswerResponse | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [transactions, setTransactions] = useState<BossTransactionItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Activate Dark Arena theme on body when on this page
  useEffect(() => {
    document.body.classList.add('boss-arena-mode');
    return () => {
      document.body.classList.remove('boss-arena-mode');
    };
  }, []);

  // Load sound setting from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SOUND_STORAGE_KEY);
      if (stored !== null) setSoundEnabled(stored !== 'false');
    } catch {
      // Ignore storage restrictions
    }
  }, []);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try {
      localStorage.setItem(SOUND_STORAGE_KEY, String(next));
    } catch {
      // Ignore
    }
    if (next) playSound('hit', true);
  };

  const fetchOverview = useCallback(async () => {
    try {
      setError(null);
      const data = await bossApi.getOverview();
      setOverview(data);

      if (data.activeSession && data.activeSession.currentQuestion) {
        setIsPlaying(true);
        setCurrentQuestion(data.activeSession.currentQuestion);
        setSessionScore(data.activeSession.score);
        setCombo(data.activeSession.combo);
        setMaxCombo(data.activeSession.maxCombo);
        setSessionRemaining(data.activeSession.sessionRemainingSeconds);
      } else {
        setIsPlaying(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải thông tin Boss Battle';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  // Close modals on Escape
  useEffect(() => {
    if (!resultModal && !showHistory && !confirmAbandon) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submittingRef.current) {
        if (resultModal) setResultModal(null);
        if (showHistory) setShowHistory(false);
        if (confirmAbandon) setConfirmAbandon(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [resultModal, showHistory, confirmAbandon]);

  // ---------------------------------------------------------------------------
  // Combat FX & Handlers
  // ---------------------------------------------------------------------------
  const clearFeedbackTimers = useCallback(() => {
    feedbackTimersRef.current.forEach((id) => clearTimeout(id));
    feedbackTimersRef.current = [];
  }, []);

  useEffect(() => {
    return () => clearFeedbackTimers();
  }, [clearFeedbackTimers]);

  const triggerCombatFeedback = useCallback((type: 'hit' | 'miss') => {
    clearFeedbackTimers();
    if (type === 'hit') {
      setIsHit(true);
      setShowSlash(true);
      setFloatingDmg({ text: '+1 ST', isMiss: false });
      playSound('hit', soundEnabled);
      feedbackTimersRef.current.push(
        setTimeout(() => setIsHit(false), 400),
        setTimeout(() => setShowSlash(false), 350),
        setTimeout(() => setFloatingDmg(null), 950),
      );
    } else {
      setIsDodge(true);
      setFloatingDmg({ text: 'HỤT!', isMiss: true });
      playSound('miss', soundEnabled);
      feedbackTimersRef.current.push(
        setTimeout(() => setIsDodge(false), 500),
        setTimeout(() => setFloatingDmg(null), 950),
      );
    }
  }, [soundEnabled, clearFeedbackTimers]);

  const handleTimeUp = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      const res = await bossApi.submitAnswer('TIMEOUT');
      setIsPlaying(false);
      setSelectedOption(null);
      setWrongFeedback(null);
      setCombatError(null);
      setResultModal(res);
      playSound('end', soundEnabled);
      void fetchOverview();
    } catch {
      void fetchOverview();
    } finally {
      submittingRef.current = false;
    }
  }, [fetchOverview, soundEnabled]);

  const handleAdvanceAfterWrong = useCallback(async () => {
    if (submittingRef.current || !isPlaying) return;
    submittingRef.current = true;
    setCombatError(null);
    try {
      const res = await bossApi.nextQuestion();
      setSelectedOption(null);
      setWrongFeedback(null);
      if (typeof res.sessionRemainingSeconds === 'number') {
        setSessionRemaining(res.sessionRemainingSeconds);
      }
      if (res.result === 'SESSION_COMPLETED' || !res.question) {
        setIsPlaying(false);
        setResultModal(res as unknown as BossAnswerResponse);
        playSound('end', soundEnabled);
        void fetchOverview();
      } else {
        setCurrentQuestion(res.question);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải câu hỏi tiếp theo';
      setCombatError(msg);
    } finally {
      submittingRef.current = false;
    }
  }, [isPlaying, soundEnabled, fetchOverview]);

  const handleQuestionTimeout = useCallback(async () => {
    if (submittingRef.current || !isPlaying || wrongFeedback) return;
    submittingRef.current = true;
    setCombatError(null);
    try {
      const res = await bossApi.submitAnswer('TIMEOUT');
      triggerCombatFeedback('miss');
      setCombo(0);
      if (typeof res.sessionRemainingSeconds === 'number') {
        setSessionRemaining(res.sessionRemainingSeconds);
      }
      if (res.result === 'SESSION_COMPLETED' || !res.nextQuestion) {
        setIsPlaying(false);
        setSelectedOption(null);
        setWrongFeedback(null);
        setResultModal(res);
        playSound('end', soundEnabled);
        void fetchOverview();
      } else {
        setCurrentQuestion(res.nextQuestion);
        setSelectedOption(null);
        setWrongFeedback(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể đồng bộ hết giờ câu hỏi';
      setCombatError(msg);
    } finally {
      submittingRef.current = false;
    }
  }, [isPlaying, wrongFeedback, triggerCombatFeedback, soundEnabled, fetchOverview]);

  const handleSelectOption = useCallback(async (label: string) => {
    if (submittingRef.current || !isPlaying || wrongFeedback) return;
    submittingRef.current = true;
    setSubmitting(true);
    setCombatError(null);
    setSelectedOption(label);

    try {
      const res = await bossApi.submitAnswer(label);
      if (typeof res.sessionRemainingSeconds === 'number') {
        setSessionRemaining(res.sessionRemainingSeconds);
      }

      if (res.result === 'CORRECT') {
        triggerCombatFeedback('hit');
        setSessionScore(res.score ?? sessionScore + 1);
        setCombo(res.combo ?? combo + 1);
        setMaxCombo(res.maxCombo ?? maxCombo);
        setSelectedOption(null);
        setWrongFeedback(null);
        if (res.nextQuestion) {
          setCurrentQuestion(res.nextQuestion);
        } else {
          setIsPlaying(false);
          setResultModal(res);
          playSound('end', soundEnabled);
          void fetchOverview();
        }
      } else if (res.result === 'WRONG_ANSWER') {
        triggerCombatFeedback('miss');
        setCombo(0);
        setWrongFeedback({
          correctAnswer: res.correctAnswer || '',
          content: res.correctAnswerContent,
          explanation: res.explanation,
        });
      } else if (res.result === 'TIMEOUT') {
        triggerCombatFeedback('miss');
        setCombo(0);
        setSelectedOption(null);
        setWrongFeedback(null);
        if (res.nextQuestion) {
          setCurrentQuestion(res.nextQuestion);
        } else {
          setIsPlaying(false);
          setResultModal(res);
          playSound('end', soundEnabled);
          void fetchOverview();
        }
      } else if (res.result === 'SESSION_COMPLETED') {
        setIsPlaying(false);
        setSelectedOption(null);
        setWrongFeedback(null);
        setResultModal(res);
        playSound('end', soundEnabled);
        void fetchOverview();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi gửi đáp án';
      setCombatError(msg);
      setSelectedOption(null);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [isPlaying, wrongFeedback, triggerCombatFeedback, sessionScore, combo, maxCombo, soundEnabled, fetchOverview]);

  // ---------------------------------------------------------------------------
  // 5-Minute Session Countdown Timer
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setSessionRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          void handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isPlaying, handleTimeUp]);

  // ---------------------------------------------------------------------------
  // 10-Second Question Timer
  // ---------------------------------------------------------------------------
  useEffect(() => {
    hasTimedOutRef.current = false;
  }, [currentQuestion?.id, wrongFeedback]);

  useEffect(() => {
    if (!isPlaying || !currentQuestion) return;

    const expiresAt = new Date(currentQuestion.questionExpiresAt).getTime();
    let interval: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      const now = serverNow();
      const diffSec = Math.max(0, (expiresAt - now) / 1000);
      setQuestionRemaining(diffSec);

      if (diffSec <= 0) {
        if (interval !== null) {
          clearInterval(interval);
          interval = null;
        }
        if (hasTimedOutRef.current) return;
        hasTimedOutRef.current = true;

        if (wrongFeedback) {
          // Finished 10s wait after wrong answer: advance to next question
          void handleAdvanceAfterWrong();
        } else {
          // Question timed out without answer
          void handleQuestionTimeout();
        }
      }
    };

    tick();
    if (!hasTimedOutRef.current) {
      interval = setInterval(tick, 100);
    }
    return () => {
      if (interval !== null) clearInterval(interval);
    };
  }, [isPlaying, currentQuestion, wrongFeedback, handleAdvanceAfterWrong, handleQuestionTimeout]);

  // ---------------------------------------------------------------------------
  // Gameplay Handlers
  // ---------------------------------------------------------------------------
  const handleStartSession = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    setCombatError(null);
    setSelectedOption(null);
    setWrongFeedback(null);
    try {
      const res = await bossApi.startSession();
      if (res.question) {
        setCurrentQuestion(res.question);
        setSessionScore(res.score);
        setCombo(res.combo);
        setMaxCombo(res.maxCombo);
        setSessionRemaining(res.sessionRemainingSeconds);
        setIsPlaying(true);
        setResultModal(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể bắt đầu lượt đấu';
      setError(msg);
      void fetchOverview();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleAbandonSession = async () => {
    setConfirmAbandon(false);
    try {
      await bossApi.abandonSession();
      setIsPlaying(false);
      setCurrentQuestion(null);
      void fetchOverview();
    } catch {
      // Ignore
    }
  };

  const handleOpenHistory = async () => {
    setShowHistory(true);
    setLoadingHistory(true);
    try {
      const items = await bossApi.getTransactions(50);
      setTransactions(items);
    } catch {
      // Ignore
    } finally {
      setLoadingHistory(false);
    }
  };

  // Keyboard shortcut listener for options (1-4, A-D)
  useEffect(() => {
    if (!isPlaying || !currentQuestion || submitting || resultModal || wrongFeedback || confirmAbandon) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
      const opts = currentQuestion.options;
      const index = /^[1-9]$/.test(e.key)
        ? Number(e.key) - 1
        : opts.findIndex((o) => o.label.toLowerCase() === e.key.toLowerCase());
      if (index >= 0 && index < opts.length) {
        e.preventDefault();
        void handleSelectOption(opts[index].label);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPlaying, currentQuestion, submitting, resultModal, wrongFeedback, confirmAbandon, handleSelectOption]);

  const formatTimerMinSec = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="boss-page-container">
        <Loading label="Đang kết nối tới Đấu trường Săn Boss..." />
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="boss-page-container">
        <ErrorState
          title="Không thể mở Đấu trường Boss"
          message={error || 'Đã có lỗi xảy ra khi tải dữ liệu đấu trường.'}
          retry={() => void fetchOverview()}
        />
      </div>
    );
  }

  const { season, community, milestones, personal } = overview;
  const inCombat = Boolean(isPlaying && currentQuestion);
  const qTimerPercent = Math.max(0, Math.min(100, (questionRemaining / 10) * 100));
  const qTimerTier =
    questionRemaining <= 2 ? 'urgent' : questionRemaining <= 5 ? 'warning' : 'normal';

  return (
    <div className={`boss-page-container ${inCombat ? 'in-combat' : ''}`}>
      {/* Topbar */}
      <header className={`boss-topbar ${inCombat ? 'in-combat' : ''}`}>
        <div className="boss-brand">
          <Link href="/dashboard" className="button secondary" title="Về tổng quan" style={{ padding: '8px 12px' }}>
            <ArrowLeft size={16} weight="bold" />
          </Link>
          <div className="boss-brand-badge" aria-hidden="true">
            <Sword size={26} weight="fill" />
          </div>
          <div>
            <h1>{season.name}</h1>
            <p>Hoạt động Boss Tuần · Chung sức toàn Ban Công Nghệ</p>
          </div>
        </div>

        <div className="boss-top-chips">
          <span className="boss-chip">
            Kỷ lục tuần của bạn: <b>{personal.personalBest} ST</b>
          </span>
          <button
            type="button"
            className="boss-sound-btn"
            onClick={toggleSound}
            title={soundEnabled ? 'Tắt âm thanh đấu trường' : 'Bật âm thanh đấu trường'}
            aria-label={soundEnabled ? 'Tắt âm thanh' : 'Bật âm thanh'}
          >
            {soundEnabled ? <SpeakerHigh size={20} weight="bold" /> : <SpeakerSlash size={20} weight="bold" />}
          </button>
          {!inCombat && (
            <button
              type="button"
              className="button secondary boss-history-btn"
              onClick={() => void handleOpenHistory()}
              style={{ fontSize: 13, padding: '7px 14px' }}
            >
              <Receipt size={16} weight="bold" /> Lịch sử nhận thưởng
            </button>
          )}
        </div>
      </header>

      {/* Graphic Boss Arena Stage */}
      <section className={`boss-arena-stage ${inCombat ? 'in-combat' : ''}`} aria-label="Đấu trường Boss">
        {/* Boss floating header plate */}
        <div className={`boss-plate ${inCombat ? 'in-combat' : ''}`}>
          <div className="boss-title-group">
            <h2>{season.bossName}</h2>
            <p>Mục tiêu tuần: 1,500 ST · Mở khóa 5 Rương Coin cho cả Ban</p>
          </div>
          <span className="boss-lv-badge">BOSS TUẦN</span>
        </div>

        {/* Boss visual & animated reaction wrap */}
        <div className={`boss-wrap ${inCombat ? 'in-combat' : ''} ${isHit ? 'hit' : ''} ${isDodge ? 'dodge' : ''}`}>
          {showSlash && <div className="boss-slash" aria-hidden="true" />}
          {floatingDmg && (
            <div className={`boss-dmg-float ${floatingDmg.isMiss ? 'miss' : ''}`} aria-hidden="true">
              {floatingDmg.text}
            </div>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/boss-pixel.png"
            alt={season.bossName}
            className="boss-img"
          />
        </div>

        {/* Boss Community HP Bar */}
        <div className={`boss-hp-zone ${inCombat ? 'in-combat' : ''}`}>
          <div className="boss-hp-meta">
            <span className="boss-hp-label">MÁU BOSS CỘNG ĐỒNG</span>
            <span className="boss-hp-count">
              <b>{community.bossCurrentHp.toLocaleString('vi-VN')}</b> / {season.bossMaxHp.toLocaleString('vi-VN')} HP ({community.bossHpPercent}%)
            </span>
          </div>
          <div className="boss-hp-bar">
            <div
              className="boss-hp-fill"
              style={{ width: `${community.bossHpPercent}%` }}
            />
          </div>
        </div>
      </section>

      {/* 5 Milestone Reward Chests - shown only in lobby */}
      {!inCombat && (
        <section className="boss-milestones-card" aria-label="Tiến trình mốc thưởng tuần">
          <div className="milestones-header">
            <div className="milestones-title">
              <Trophy size={18} weight="fill" color="#ffc21f" />
              <span>Tiến trình 5 Rương Thưởng Tuần</span>
            </div>
            <span className="milestones-subtitle">
              Mỗi mốc mở khóa thưởng <b>5 Coin</b> vào 00:00 thứ Hai cho người có điểm cao nhất tuần từ <b>5 điểm</b> trở lên
            </span>
          </div>

          {/* Milestone Track Bar */}
          <div className="milestone-track-wrap">
            <div
              className="milestone-track-fill"
              style={{ width: `${Math.min(100, (community.communityScore / season.bossMaxHp) * 100)}%` }}
            />
          </div>

          {/* 5 Chest Boxes */}
          <div className="milestone-chests-row">
            {milestones.map((m) => (
              <div key={m.index} className={`milestone-chest-box ${m.unlocked ? 'is-unlocked' : ''}`}>
                <span className="chest-name">{m.name}</span>
                <span className="chest-at">{m.at.toLocaleString('vi-VN')} ST</span>
                <span className="chest-reward">
                  <Coins size={14} weight="fill" /> +{m.coin} Coin
                </span>
                <span className={`chest-status-pill ${m.unlocked ? 'unlocked' : 'locked'}`}>
                  {m.unlocked ? '✓ Đã mở' : 'Chưa đạt'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* HUD Bar (Session stats during combat or summary) */}
      <section className={`boss-hud-grid ${inCombat ? 'in-combat' : ''}`} aria-label="Thông số lượt đấu">
        <div className="boss-hud-cell">
          <span className="boss-hud-k">
            <HourglassHigh size={14} weight="fill" /> Thời gian lượt
          </span>
          <span className={`boss-hud-v ${sessionRemaining <= 30 && isPlaying ? 'danger' : ''}`}>
            {isPlaying ? formatTimerMinSec(sessionRemaining) : '5:00'}
          </span>
        </div>

        <div className="boss-hud-cell">
          <span className="boss-hud-k">
            <Sword size={14} weight="fill" /> Sát thương lượt
          </span>
          <span className="boss-hud-v gold">{sessionScore} ST</span>
        </div>

        <div className="boss-hud-cell">
          <span className="boss-hud-k">
            <Fire size={14} weight="fill" /> Chuỗi Combo
          </span>
          <span className="boss-hud-v hot">×{combo}</span>
        </div>

        <div className="boss-hud-cell">
          <span className="boss-hud-k">
            <Trophy size={14} weight="fill" /> Kỷ lục tuần
          </span>
          <span className="boss-hud-v">{personal.personalBest} ST</span>
        </div>
      </section>

      {/* Active Battle View vs Start View */}
      {isPlaying && currentQuestion ? (
        <section className={`boss-quiz-deck ${inCombat ? 'in-combat' : ''}`} aria-label="Câu hỏi Boss Battle">
          {/* Inline Combat Error Banner */}
          {combatError && (
            <div className="boss-combat-error" role="alert">
              <span>⚠️ {combatError}</span>
              <button
                type="button"
                className="boss-combat-error-dismiss"
                onClick={() => setCombatError(null)}
                title="Đóng thông báo lỗi"
                aria-label="Đóng thông báo lỗi"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
          )}

          {/* Question Header & 10s Timer */}
          <div className="boss-q-header">
            <span className="boss-q-number">Câu {currentQuestion.currentQuestionNumber}</span>
            {combo >= 2 && (
              <span className="boss-combo-badge">
                <Fire size={14} weight="fill" /> COMBO ×{combo}
              </span>
            )}
            <span className={`boss-q-timer-clock tier-${qTimerTier}`}>
              {questionRemaining.toFixed(1)}s
            </span>
          </div>

          {/* 10s Timer Progress Bar */}
          <div className="boss-q-timer-bar">
            <div
              className={`boss-q-timer-fill tier-${qTimerTier}`}
              style={{ width: `${qTimerPercent}%` }}
            />
          </div>

          <h2 id="boss-question-title" className="boss-question-title" style={{ overflowWrap: 'anywhere' }}>
            {currentQuestion.question}
          </h2>

          {currentQuestion.code && (
            <pre className="code-block" style={{ marginBottom: 16 }}>
              <code>{currentQuestion.code}</code>
            </pre>
          )}

          {currentQuestion.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentQuestion.imageUrl}
              alt="Minh họa cho câu hỏi"
              style={{
                width: '100%',
                maxHeight: 380,
                objectFit: 'contain',
                borderRadius: 12,
                marginBottom: 16,
              }}
            />
          )}

          {/* Options Grid */}
          <div
            className="boss-options-grid"
            role="radiogroup"
            aria-labelledby="boss-question-title"
          >
            {currentQuestion.options.map((opt) => {
              const isSelected = selectedOption === opt.label;
              const isWrongFeedbackActive = Boolean(wrongFeedback);
              const isCorrectInFeedback = wrongFeedback?.correctAnswer === opt.label;
              const isWrongChoice = isWrongFeedbackActive && isSelected && !isCorrectInFeedback;

              return (
                <button
                  key={opt.label}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={submitting || isWrongFeedbackActive}
                  onClick={() => void handleSelectOption(opt.label)}
                  className={`boss-option-btn ${isSelected ? 'selected' : ''} ${
                    isCorrectInFeedback ? 'correct' : ''
                  } ${isWrongChoice ? 'wrong' : ''}`}
                >
                  <span className="opt-badge">{opt.label}</span>
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    {opt.isCode ? (
                      <code className="tower-code-option">{opt.content}</code>
                    ) : (
                      opt.content
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Wrong Answer Feedback & 10s Wait Notice */}
          {wrongFeedback && (
            <div className="boss-wrong-feedback">
              <div className="boss-wrong-feedback-head">
                <span>✕ Đáp án chưa chính xác!</span>
                <span>Chuyển câu sau: {questionRemaining.toFixed(1)}s</span>
              </div>
              <p className="boss-wrong-feedback-text">
                Đáp án đúng là <b>{wrongFeedback.correctAnswer}</b>
                {wrongFeedback.content ? `: ${wrongFeedback.content}` : ''}
              </p>
              {wrongFeedback.explanation && (
                <p className="boss-wrong-feedback-text" style={{ color: '#cdb287' }}>
                  <b>Giải thích:</b> {wrongFeedback.explanation}
                </p>
              )}
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="button secondary"
                  style={{ fontSize: 13, padding: '6px 14px' }}
                  disabled={questionRemaining > 0 || submitting}
                  onClick={() => void handleAdvanceAfterWrong()}
                >
                  {questionRemaining > 0
                    ? `Đợi hết thời gian chờ (${questionRemaining.toFixed(1)}s)...`
                    : 'Sang câu tiếp theo'}{' '}
                  <ArrowRight size={14} weight="bold" />
                </button>
              </div>
            </div>
          )}

          {/* Play Footer */}
          <div className="boss-play-footer">
            <span style={{ fontSize: 12.5, color: 'var(--dim-arena, #b59a72)' }}>
              Mẹo: Bấm phím 1–4 hoặc A–D để chọn nhanh
            </span>
            <button
              type="button"
              className="button secondary"
              style={{ fontSize: 12.5, padding: '5px 12px', color: '#ff7a5c' }}
              onClick={() => setConfirmAbandon(true)}
            >
              Kết thúc lượt sớm
            </button>
          </div>
        </section>
      ) : (
        /* Lobby Start Card */
        <section className="boss-quiz-deck" style={{ textAlign: 'center', padding: '36px 20px' }}>
          <h2 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 10px', color: '#f8ecd2' }}>
            SẴN SÀNG CHIẾN ĐẤU VỚI {season.bossName.toUpperCase()}?
          </h2>
          <p style={{ maxWidth: 540, margin: '0 auto 24px', color: '#cdb287', lineHeight: 1.55 }}>
            Mỗi lượt chơi kéo dài tối đa <b>5 phút</b>. Mỗi câu có <b>10 giây</b> để trả lời.
            Bạn được chơi lại <b>không giới hạn</b> — hệ thống sẽ tự động lưu và lấy <b>điểm cao nhất trong tuần</b> của bạn để đóng góp vào tiến trình chung cả ban (mỗi người đóng góp tối đa <b>100 điểm</b>).
          </p>
          <p style={{ maxWidth: 540, margin: '-12px auto 24px', color: '#b59a72', fontSize: 13, lineHeight: 1.5 }}>
            XP chỉ được tính khi bạn <b>chơi hết 5 phút</b> và trả lời đúng ít nhất <b>5 câu</b>; tối đa <b>3 lượt có XP mỗi ngày</b>.
          </p>

          <button
            type="button"
            className="boss-btn-primary"
            onClick={() => void handleStartSession()}
          >
            <Sword size={20} weight="fill" />
            <span>VÀO TRẬN ĐÁNH BOSS (5 PHÚT)</span>
          </button>
        </section>
      )}

      {/* End-of-Session Results Modal */}
      {resultModal && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={() => setResultModal(null)}
        >
          <div
            className="dialog tower-result-dialog is-victory"
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#1c140c', borderColor: '#4c391f', color: '#f8ecd2' }}
          >
            <button
              type="button"
              className="dialog-close-btn"
              onClick={() => setResultModal(null)}
              title="Đóng"
            >
              <X size={16} weight="bold" />
            </button>

            <div className="tower-result-badge-halo is-victory" aria-hidden="true">
              <Trophy size={40} weight="fill" />
            </div>

            <h3 className="tower-result-heading is-victory" style={{ color: '#ffd98a' }}>
              HẾT GIỜ — TỔNG KẾT LƯỢT ĐẤU!
            </h3>

            <p style={{ margin: '0 0 16px', color: '#cdb287', fontSize: 14 }}>
              Bạn đã dốc toàn lực chiến đấu với {season.bossName}!
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 10,
                margin: '0 0 18px',
                textAlign: 'center',
              }}
            >
              <div style={{ background: '#241b12', border: '1px solid #4c391f', padding: '10px 8px', borderRadius: 12 }}>
                <div style={{ fontSize: 12, color: '#9a7f57' }}>Sát thương lượt này</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#ffc21f' }}>{resultModal.score ?? 0} ST</div>
              </div>
              <div style={{ background: '#241b12', border: '1px solid #4c391f', padding: '10px 8px', borderRadius: 12 }}>
                <div style={{ fontSize: 12, color: '#9a7f57' }}>Kỷ lục cá nhân tuần</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#f8ecd2' }}>{resultModal.personalBest ?? personal.personalBest} ST</div>
              </div>
              <div style={{ background: '#241b12', border: '1px solid #4c391f', padding: '10px 8px', borderRadius: 12 }}>
                <div style={{ fontSize: 12, color: '#9a7f57' }}>Combo cao nhất</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#ff9d1c' }}>×{resultModal.maxCombo ?? 0}</div>
              </div>
              <div style={{ background: '#241b12', border: '1px solid #4c391f', padding: '10px 8px', borderRadius: 12 }}>
                <div style={{ fontSize: 12, color: '#9a7f57' }}>Độ chính xác</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#46d17e' }}>{resultModal.accuracy ?? 0}%</div>
              </div>
            </div>

            {resultModal.isNewRecord && (
              <div
                style={{
                  background: 'rgba(255, 194, 31, 0.14)',
                  border: '1px solid rgba(255, 194, 31, 0.4)',
                  padding: '8px 14px',
                  borderRadius: 12,
                  color: '#ffc21f',
                  fontWeight: 800,
                  fontSize: 14,
                  marginBottom: 18,
                }}
              >
                🎉 KỶ LỤC MỚI CỦA BẠN! Điểm số đã được cộng thêm vào thành tích chung của cả ban.
              </div>
            )}

            <div className="dialog-action-buttons">
              <button
                type="button"
                className="boss-btn-primary"
                onClick={() => {
                  setResultModal(null);
                  void handleStartSession();
                }}
              >
                <Sword size={18} weight="fill" /> ĐÁNH TIẾP LƯỢT MỚI
              </button>
              <button
                type="button"
                className="boss-btn-secondary"
                onClick={() => setResultModal(null)}
              >
                Về sảnh Boss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm abandon modal */}
      {confirmAbandon && isPlaying && !resultModal && (
        <div className="dialog-backdrop" role="presentation" onClick={() => setConfirmAbandon(false)}>
          <div
            className="dialog boss-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="boss-confirm-title"
            aria-describedby="boss-confirm-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="boss-confirm-icon" aria-hidden="true">
              <Sword size={26} weight="fill" />
            </div>
            <strong id="boss-confirm-title">Kết thúc lượt đấu sớm?</strong>
            <p id="boss-confirm-desc">
              Lượt hiện tại sẽ dừng ngay, bạn không thể tiếp tục lượt này. Điểm của lượt vẫn được tính vào điểm
              cao nhất trong tuần, nhưng kết thúc sớm thì lượt này không nhận XP.
            </p>
            <div className="dialog-action-buttons">
              <button type="button" className="boss-btn-secondary" autoFocus onClick={() => setConfirmAbandon(false)}>
                Tiếp tục đánh
              </button>
              <button type="button" className="boss-btn-danger" onClick={() => void handleAbandonSession()}>
                Kết thúc lượt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reward Transactions History Modal */}
      {showHistory && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={() => setShowHistory(false)}
        >
          <div
            className="dialog tower-result-dialog is-victory"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#1c140c', borderColor: '#4c391f', color: '#f8ecd2', width: 'min(580px, 94vw)' }}
          >
            <button
              type="button"
              className="dialog-close-btn"
              onClick={() => setShowHistory(false)}
              title="Đóng"
            >
              <X size={16} weight="bold" />
            </button>

            <h3 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 8px', color: '#ffd98a' }}>
              Lịch sử nhận thưởng Boss Tuần
            </h3>
            <p style={{ margin: '0 0 16px', color: '#cdb287', fontSize: 13 }}>
              Danh sách Coin đã nhận từ các mốc rương tuần đã hoàn thành
            </p>

            {loadingHistory ? (
              <Loading label="Đang tải lịch sử..." />
            ) : transactions.length === 0 ? (
              <div style={{ padding: '30px 20px', color: '#9a7f57' }}>
                <p>Bạn chưa có giao dịch nhận thưởng Boss nào.</p>
                <small>Thưởng sẽ được tổng kết và phân phối vào 00:00 thứ Hai hằng tuần.</small>
              </div>
            ) : (
              <div style={{ maxHeight: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left', marginBottom: 16 }}>
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    style={{
                      background: '#241b12',
                      border: '1px solid #4c391f',
                      borderRadius: 12,
                      padding: '10px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 750, color: '#f8ecd2', fontSize: 14 }}>
                        Mốc {tx.milestoneAt} ST · Rương {tx.milestoneIndex}
                      </div>
                      <div style={{ fontSize: 12, color: '#9a7f57', marginTop: 2 }}>
                        {tx.season?.name || 'Boss Tuần'} · {new Date(tx.createdAt).toLocaleDateString('vi-VN')}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ color: '#ffc21f', fontWeight: 800, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Coins size={14} weight="fill" /> +{tx.rewardCoins} Coin
                      </span>
                      <div style={{ fontSize: 11, color: tx.status === 'SUCCESS' ? '#46d17e' : '#ffd98a', marginTop: 2 }}>
                        {tx.status === 'SUCCESS' ? 'Đã nhận' : tx.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              className="boss-btn-secondary"
              style={{ width: '100%' }}
              onClick={() => setShowHistory(false)}
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
