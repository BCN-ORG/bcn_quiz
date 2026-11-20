'use client';

const SFX_MUTED_KEY = 'bcn_arena_sfx_muted';
export const SFX_EVENT = 'bcn-sfx-toggle';

export function isSfxMuted(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(SFX_MUTED_KEY) === '1';
}

export function setSfxMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SFX_MUTED_KEY, muted ? '1' : '0');
  window.dispatchEvent(new Event(SFX_EVENT));
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined' || isSfxMuted()) return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return null;
  try {
    return new Ctx();
  } catch {
    return null;
  }
}

function playNotes(
  notes: Array<{ freq: number; start: number; duration: number; type?: OscillatorType; gain?: number }>,
) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = n.type ?? 'triangle';
    osc.frequency.setValueAtTime(n.freq, now + n.start);
    const peak = n.gain ?? 0.08;
    gainNode.gain.setValueAtTime(0.0001, now + n.start);
    gainNode.gain.exponentialRampToValueAtTime(peak, now + n.start + 0.015);
    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      now + n.start + n.duration,
    );
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(now + n.start);
    osc.stop(now + n.start + n.duration + 0.02);
  }
  window.setTimeout(() => {
    void ctx.close().catch(() => {});
  }, 1400);
}

export function playEquipSfx(): void {
  playNotes([
    { freq: 523.25, start: 0, duration: 0.09, type: 'sine', gain: 0.07 },
    { freq: 783.99, start: 0.07, duration: 0.16, type: 'triangle', gain: 0.08 },
  ]);
}

export function playChestSfx(): void {
  playNotes([
    { freq: 523.25, start: 0, duration: 0.1, type: 'triangle', gain: 0.08 },
    { freq: 659.25, start: 0.08, duration: 0.1, type: 'triangle', gain: 0.08 },
    { freq: 783.99, start: 0.16, duration: 0.12, type: 'triangle', gain: 0.09 },
    { freq: 1046.5, start: 0.25, duration: 0.28, type: 'sine', gain: 0.1 },
  ]);
}

export function playLevelUpSfx(): void {
  playNotes([
    { freq: 440, start: 0, duration: 0.11, type: 'triangle', gain: 0.08 },
    { freq: 554.37, start: 0.1, duration: 0.11, type: 'triangle', gain: 0.08 },
    { freq: 659.25, start: 0.2, duration: 0.12, type: 'triangle', gain: 0.09 },
    { freq: 880, start: 0.31, duration: 0.34, type: 'sine', gain: 0.11 },
  ]);
}

export function playComboSfx(streak = 3): void {
  const base = Math.min(880, 480 + streak * 40);
  playNotes([
    { freq: base, start: 0, duration: 0.07, type: 'sine', gain: 0.06 },
    { freq: base * 1.25, start: 0.06, duration: 0.12, type: 'sine', gain: 0.07 },
  ]);
}

/** Lightweight DOM particle burst for equip / chest / level-up celebration. */
export function triggerCelebrationBurst(originX?: number, originY?: number): void {
  if (typeof document === 'undefined') return;
  const cx = originX ?? window.innerWidth / 2;
  const cy = originY ?? window.innerHeight / 2;
  const colors = ['#facc15', '#38bdf8', '#c084fc', '#34d399', '#fb7185'];
  const container = document.createElement('div');
  container.className = 'rpg-confetti-burst';
  container.style.left = `${cx}px`;
  container.style.top = `${cy}px`;

  for (let i = 0; i < 18; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'rpg-confetti-dot';
    const angle = (Math.PI * 2 * i) / 18 + (Math.random() - 0.5) * 0.25;
    const dist = 42 + Math.random() * 64;
    dot.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    dot.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
    dot.style.backgroundColor = colors[i % colors.length];
    container.appendChild(dot);
  }

  document.body.appendChild(container);
  window.setTimeout(() => {
    container.remove();
  }, 750);
}
