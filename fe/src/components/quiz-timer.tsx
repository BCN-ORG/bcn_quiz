'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  SpeakerHigh,
  SpeakerSlash,
  WarningCircle,
  Heartbeat,
} from '@phosphor-icons/react';
import { serverNow } from '@/lib/api';

/** Storage key for sound toggle preference */
export const SOUND_STORAGE_KEY = 'bcn_quiz_timer_sound';
const SOUND_EVENT_NAME = 'bcn_quiz_timer_sound_change';

export type TimerTier = 'normal' | 'warning' | 'urgent' | 'timeout';

export interface QuizTimerSoundControls {
  soundEnabled: boolean;
  isMuted: boolean;
  toggleSound: () => void;
  setSound: (enabled: boolean) => void;
}

// ---------------------------------------------------------------------------
// 1. Audio System (Web Audio API Synthesizer)
// ---------------------------------------------------------------------------

let globalAudioCtx: AudioContext | null = null;

/** Lazily get or initialize the AudioContext within browser autoplay constraints */
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioCtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxClass) return null;
    if (!globalAudioCtx) {
      globalAudioCtx = new AudioCtxClass();
    }
    if (globalAudioCtx.state === 'suspended') {
      void globalAudioCtx.resume();
    }
    return globalAudioCtx;
  } catch {
    return null;
  }
}

/** Synthesize subtle, crisp audio ticks/beeps on 3..2..1s and timeout */
export function playTimerSound(tier: 'tick-warning' | 'tick-urgent' | 'timeout'): void {
  if (typeof window === 'undefined') return;
  try {
    const stored = window.localStorage.getItem(SOUND_STORAGE_KEY);
    // Default to enabled if not explicitly disabled
    if (stored === 'false') return;

    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (tier === 'tick-warning') {
      // 3s, 2s: Subtle crisp warning pip (sine @ 880Hz, A5)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.085);
    } else if (tier === 'tick-urgent') {
      // 1s: Critical urgency pip (triangle @ 1175Hz, D6)
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1175, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.25, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.125);
    } else if (tier === 'timeout') {
      // 0s: Timeout descending tone (sawtooth 440Hz -> 220Hz)
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.2);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.23);
    }
  } catch {
    // Autoplay restrictions or audio device issues silently handled
  }
}

/** Hook to observe and control timer sound state with localStorage sync */
export function useQuizTimerSound(): QuizTimerSoundControls {
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SOUND_STORAGE_KEY);
      if (stored !== null) {
        setSoundEnabled(stored !== 'false');
      }
    } catch {
      // Ignore storage errors in restricted contexts
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === SOUND_STORAGE_KEY && e.newValue !== null) {
        setSoundEnabled(e.newValue !== 'false');
      }
    };

    const onCustomEvent = (e: Event) => {
      const customEvent = e as CustomEvent<boolean>;
      if (typeof customEvent.detail === 'boolean') {
        setSoundEnabled(customEvent.detail);
      }
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener(SOUND_EVENT_NAME, onCustomEvent);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SOUND_EVENT_NAME, onCustomEvent);
    };
  }, []);

  const setSound = useCallback((enabled: boolean) => {
    setSoundEnabled(enabled);
    try {
      window.localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));
      window.dispatchEvent(new CustomEvent(SOUND_EVENT_NAME, { detail: enabled }));
    } catch {
      // Ignore storage errors
    }
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SOUND_STORAGE_KEY, String(next));
        window.dispatchEvent(new CustomEvent(SOUND_EVENT_NAME, { detail: next }));
      } catch {
        // Ignore
      }
      if (next) {
        const ctx = getAudioContext();
        if (ctx && ctx.state === 'suspended') {
          void ctx.resume();
        }
        playTimerSound('tick-warning');
      }
      return next;
    });
  }, []);

  return { soundEnabled, isMuted: !soundEnabled, toggleSound, setSound };
}

/** Standalone Sound Toggle Button component */
export function QuizTimerSoundToggle({
  className = '',
  size = 16,
}: {
  className?: string;
  size?: number;
}) {
  const { soundEnabled, toggleSound } = useQuizTimerSound();

  return (
    <button
      type="button"
      className={`quiz-timer-sound-btn ${soundEnabled ? 'is-active' : 'is-muted'} ${className}`.trim()}
      onClick={toggleSound}
      title={soundEnabled ? 'Tắt âm thanh đếm ngược' : 'Bật âm thanh đếm ngược'}
      aria-label={soundEnabled ? 'Tắt âm thanh đếm ngược' : 'Bật âm thanh đếm ngược'}
      aria-pressed={soundEnabled}
    >
      {soundEnabled ? (
        <SpeakerHigh size={size} weight="bold" aria-hidden="true" />
      ) : (
        <SpeakerSlash size={size} weight="bold" aria-hidden="true" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// 2. Timer Tier & State Helpers
// ---------------------------------------------------------------------------

export function getTimerTier(
  remainingSeconds: number,
  warningThreshold = 5,
  urgentThreshold = 2
): TimerTier {
  if (remainingSeconds <= 0) return 'timeout';
  if (remainingSeconds <= urgentThreshold) return 'urgent';
  if (remainingSeconds <= warningThreshold) return 'warning';
  return 'normal';
}

// Date-header resolution (1 s) plus round trip; anything larger is a real server limit, not skew.
const MAX_CLOCK_SKEW_MS = 1500;

const TIER_COLORS: Record<TimerTier, string> = {
  normal: 'var(--accent, #087f65)',
  warning: '#f59e0b',
  urgent: '#ef4444',
  timeout: '#ef4444',
};

// ---------------------------------------------------------------------------
// 3. useQuizCountdown Hook (Unified High-Precision Synchronization)
// ---------------------------------------------------------------------------

export interface UseQuizCountdownOptions {
  /** Expiration timestamp (ISO string, Date object, or epoch ms) */
  expiresAt?: string | Date | number | null;
  /** Total duration in seconds (defaults to 10 if not inferable from expiresAt) */
  durationSeconds?: number;
  /** Start timestamp to determine total duration when durationSeconds is omitted */
  startTime?: string | Date | number | null;
  /** Callback fired once when countdown reaches 0 */
  onTimeout?: () => void;
  /** Optional callback fired on each second change with remaining seconds */
  onTick?: (remainingSeconds: number) => void;
  /** Callback fired whenever the visual tier changes */
  onTierChange?: (tier: TimerTier) => void;
  /** Threshold in seconds for warning tier (amber). Default: 5 */
  warningThreshold?: number;
  /** Threshold in seconds for urgent tier (crimson). Default: 2 */
  urgentThreshold?: number;
  /** Pause timer (freezes countdown and audio) */
  isPaused?: boolean;
  /** Whether this instance should trigger sound synthesizer beeps (default: true) */
  enableSound?: boolean;
}

export function useQuizCountdown({
  expiresAt,
  durationSeconds,
  startTime,
  onTimeout,
  onTick,
  onTierChange,
  warningThreshold = 5,
  urgentThreshold = 2,
  isPaused = false,
  enableSound = true,
}: UseQuizCountdownOptions) {
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  const onTierChangeRef = useRef(onTierChange);
  onTierChangeRef.current = onTierChange;

  // Resolve target expiration timestamp in server epoch ms
  const [targetMs, setTargetMs] = useState<number>(() => {
    if (expiresAt) {
      const parsed = typeof expiresAt === 'number' ? expiresAt : new Date(expiresAt).getTime();
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    const dur = durationSeconds ?? 10;
    return serverNow() + dur * 1000;
  });

  // Resolve total duration in milliseconds
  const [totalMs, setTotalMs] = useState<number>(() => {
    if (durationSeconds && durationSeconds > 0) {
      return durationSeconds * 1000;
    }
    if (startTime && expiresAt) {
      const s = typeof startTime === 'number' ? startTime : new Date(startTime).getTime();
      const e = typeof expiresAt === 'number' ? expiresAt : new Date(expiresAt).getTime();
      if (!Number.isNaN(s) && !Number.isNaN(e) && e > s) {
        return e - s;
      }
    }
    return 10_000; // Default 10s
  });

  // Synchronize target and total whenever inputs change
  useEffect(() => {
    if (expiresAt) {
      const parsed = typeof expiresAt === 'number' ? expiresAt : new Date(expiresAt).getTime();
      const validTarget = Number.isNaN(parsed) ? 0 : parsed;
      setTargetMs(validTarget);

      if (durationSeconds && durationSeconds > 0) {
        setTotalMs(durationSeconds * 1000);
      } else if (startTime) {
        const s = typeof startTime === 'number' ? startTime : new Date(startTime).getTime();
        if (!Number.isNaN(s) && validTarget > s) {
          setTotalMs(validTarget - s);
        } else {
          setTotalMs(10_000);
        }
      } else {
        const remainingInitial = Math.max(1000, validTarget - serverNow());
        setTotalMs(Math.max(10_000, remainingInitial));
      }
    } else if (durationSeconds && durationSeconds > 0) {
      const durMs = durationSeconds * 1000;
      setTotalMs(durMs);
      setTargetMs(serverNow() + durMs);
    }
  }, [expiresAt, durationSeconds, startTime]);

  // Current remaining values
  const [diffMs, setDiffMs] = useState<number>(() => Math.max(0, targetMs - serverNow()));
  const [remainingSeconds, setRemainingSeconds] = useState<number>(() =>
    Math.max(0, Math.ceil((targetMs - serverNow()) / 1000))
  );

  const hasTimedOutRef = useRef<boolean>(false);
  const lastBeepSecondRef = useRef<number | null>(null);
  const lastTierRef = useRef<TimerTier>('normal');
  // The server clock offset comes from a 1 s-resolution Date header, so the first reading can exceed the full
  // duration (e.g. show 11 s on a 10 s timer). Remember that excess once per target and subtract it.
  const clockSkewMsRef = useRef<number | null>(null);

  // Reset timeout trigger and audio state when target expiration changes
  useEffect(() => {
    hasTimedOutRef.current = false;
    lastBeepSecondRef.current = null;
    clockSkewMsRef.current = null;
  }, [targetMs]);

  // High-frequency drift-free synchronization loop (100ms interval)
  useEffect(() => {
    if (isPaused || targetMs === 0) return;

    const syncTick = () => {
      const now = serverNow();
      if (clockSkewMsRef.current === null) {
        clockSkewMsRef.current = totalMs > 0 ? Math.min(MAX_CLOCK_SKEW_MS, Math.max(0, targetMs - now - totalMs)) : 0;
      }
      const delta = Math.max(0, targetMs - now - clockSkewMsRef.current);
      const secs = Math.max(0, Math.ceil(delta / 1000));

      setDiffMs(delta);
      setRemainingSeconds((prevSecs) => {
        if (prevSecs !== secs) {
          onTickRef.current?.(secs);
        }
        return secs;
      });

      const currentTier = getTimerTier(secs, warningThreshold, urgentThreshold);
      if (lastTierRef.current !== currentTier) {
        lastTierRef.current = currentTier;
        onTierChangeRef.current?.(currentTier);
      }

      // Sound synthesizer trigger on 3..2..1s
      if (enableSound && secs <= 3 && secs >= 1 && lastBeepSecondRef.current !== secs) {
        lastBeepSecondRef.current = secs;
        if (secs === 1) {
          playTimerSound('tick-urgent');
        } else {
          playTimerSound('tick-warning');
        }
      }

      // 0s: Timeout reached
      if (delta <= 0 || secs <= 0) {
        if (!hasTimedOutRef.current) {
          hasTimedOutRef.current = true;
          if (enableSound && lastBeepSecondRef.current !== 0) {
            lastBeepSecondRef.current = 0;
            playTimerSound('timeout');
          }
          onTimeoutRef.current?.();
        }
      }
    };

    syncTick();
    const timerId = window.setInterval(syncTick, 100);
    return () => window.clearInterval(timerId);
  }, [targetMs, totalMs, isPaused, warningThreshold, urgentThreshold, enableSound]);

  const tier = getTimerTier(remainingSeconds, warningThreshold, urgentThreshold);
  const tierColor = TIER_COLORS[tier];
  const tierClass =
    tier === 'normal'
      ? 'timer-tier-normal'
      : tier === 'warning'
        ? 'timer-tier-warning'
        : 'timer-tier-urgent';
  const progressRatio = totalMs > 0 ? Math.max(0, Math.min(1, diffMs / totalMs)) : 0;

  return {
    diffMs,
    remainingSeconds,
    totalMs,
    progressRatio,
    tier,
    tierColor,
    tierClass,
  };
}

// ---------------------------------------------------------------------------
// 4. QuizTimer Component (Badge & Dial)
// ---------------------------------------------------------------------------

export interface QuizTimerProps {
  /** Expiration timestamp (ISO string, Date object, or epoch ms) */
  expiresAt?: string | Date | number | null;
  /** Total duration in seconds (defaults to 10 if not inferable from expiresAt) */
  durationSeconds?: number;
  /** Start timestamp to determine total duration when durationSeconds is omitted */
  startTime?: string | Date | number | null;
  /** Callback fired once when countdown reaches 0 */
  onTimeout?: () => void;
  /** Optional callback fired on each second change with remaining seconds */
  onTick?: (remainingSeconds: number) => void;
  /** Callback fired on tier changes */
  onTierChange?: (tier: TimerTier) => void;
  /** Threshold in seconds for warning tier (amber). Default: 5 */
  warningThreshold?: number;
  /** Threshold in seconds for urgent tier (crimson). Default: 2 */
  urgentThreshold?: number;
  /** Display size: 'sm' (32px), 'md' (38px standard design token), 'lg' (60px) or custom px number */
  size?: 'sm' | 'md' | 'lg' | number;
  /** Whether to show the audio mute/unmute toggle button. Default: true */
  showSoundToggle?: boolean;
  /** Show warning/urgent status badge icon/text. Default: false */
  showBadge?: boolean;
  /** Extra class names */
  className?: string;
  /** Pause timer (freezes countdown and audio) */
  isPaused?: boolean;
  /** Custom label after digits e.g. 's' or 'giây' (default: 's') */
  label?: string;
}

export function QuizTimer({
  expiresAt,
  durationSeconds,
  startTime,
  onTimeout,
  onTick,
  onTierChange,
  warningThreshold = 5,
  urgentThreshold = 2,
  size = 'md',
  showSoundToggle = true,
  showBadge = false,
  className = '',
  isPaused = false,
  label = 's',
}: QuizTimerProps) {
  const {
    remainingSeconds,
    progressRatio,
    tier,
    tierColor,
    tierClass,
  } = useQuizCountdown({
    expiresAt,
    durationSeconds,
    startTime,
    onTimeout,
    onTick,
    onTierChange,
    warningThreshold,
    urgentThreshold,
    isPaused,
    enableSound: true,
  });

  // Dimension calculations matching Design System tokens
  const dimensionPx =
    typeof size === 'number'
      ? size
      : size === 'sm'
        ? 32
        : size === 'lg'
          ? 56
          : 38;

  const radius = 40;
  const circumference = 2 * Math.PI * radius; // ~251.327
  const strokeDashoffset = circumference * (1 - progressRatio);

  // Screen-reader announcement (polite, avoids announcing every single second)
  const srAnnouncement =
    remainingSeconds === 0
      ? 'Hết giờ!'
      : remainingSeconds === urgentThreshold
        ? `Khẩn cấp, còn ${remainingSeconds} giây!`
        : remainingSeconds === warningThreshold
          ? `Cảnh báo, còn ${remainingSeconds} giây.`
          : '';

  return (
    <div
      className={`quiz-timer-container ${tierClass} ${className}`.trim()}
      role="timer"
      aria-label={`Thời gian còn lại: ${remainingSeconds} giây`}
      aria-live="off"
      style={
        {
          '--tier-color': tierColor,
        } as React.CSSProperties
      }
    >
      {/* SVG Progress Ring */}
      <div
        className="quiz-timer-ring"
        style={{
          width: dimensionPx,
          height: dimensionPx,
        }}
      >
        <svg
          viewBox="0 0 100 100"
          aria-hidden="true"
        >
          {/* Background track circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            strokeWidth={10}
            className="quiz-timer-ring-track"
          />

          {/* Active progress stroke circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            strokeWidth={10}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="quiz-timer-ring-progress"
            style={{
              transition: 'stroke-dashoffset 0.15s linear, stroke 0.25s ease',
            }}
          />
        </svg>

        {/* When size is large (e.g. >= 56px), center digits inside the ring */}
        {dimensionPx >= 56 && (
          <span className="quiz-timer-digits" aria-hidden="true">
            {remainingSeconds}
          </span>
        )}
      </div>

      {/* Prominent Tabular Digits display */}
      <span className="quiz-timer-digits" aria-hidden="true">
        {dimensionPx < 56 ? (
          <>
            Còn {remainingSeconds}{label}
          </>
        ) : (
          label && <small style={{ fontSize: '0.8em', opacity: 0.8 }}>{label}</small>
        )}
      </span>

      {/* Optional Alert Badge */}
      {showBadge && tier === 'warning' && (
        <span className="quiz-timer-badge timer-badge-warning" title="Sắp hết giờ" aria-hidden="true">
          <WarningCircle weight="bold" size={14} />
        </span>
      )}
      {showBadge && tier === 'urgent' && (
        <span className="quiz-timer-badge timer-badge-urgent" title="Khẩn cấp" aria-hidden="true">
          <Heartbeat weight="fill" size={15} className="card-heartbeat-icon" />
        </span>
      )}

      {/* Embedded Sound Toggle button */}
      {showSoundToggle && (
        <QuizTimerSoundToggle className="quiz-timer-sound-btn" size={16} />
      )}

      {/* Polite Screen-Reader Status Region */}
      <span className="sr-only" role="status" aria-live="polite">
        {srAnnouncement}
      </span>
    </div>
  );
}

export default QuizTimer;
