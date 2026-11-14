'use client';

import { useEffect, useRef, useState } from 'react';
import { bossApi, type BossLive } from '@/lib/boss';

/** How often the boss page re-reads the shared "fighting together" snapshot (ms). */
export const BOSS_LIVE_REFRESH_MS = 20_000;
const MAX_CHIPS_PER_POLL = 4;
/** New events are spread over the next poll window so it reads as continuous fighting, not a burst. */
const CHIP_SPACING_MS = 4_500;
const CHIP_VISIBLE_MS = 3_500;
const MAX_VISIBLE_CHIPS = 3;

export interface BossLiveChip {
  key: string;
  name: string;
  avatarUrl: string | null;
  gain: number;
}

/**
 * Turns two consecutive snapshots into "someone else just scored N" events (display only):
 * - a fighter whose score went up since the last poll,
 * - a session that finished since the last poll (gain = final score minus what we last saw).
 * The first snapshot only seeds state, so nothing animates on arrival. Own activity is skipped (it has its own feedback).
 */
export function deriveBossLiveEvents(
  live: BossLive,
  previousFighters: Map<string, number>,
  seenHits: Set<string>,
  seeded: boolean,
): BossLiveChip[] {
  const events: BossLiveChip[] = [];
  // The server lists at most 12 fighters. When more are fighting, a session can rotate into that list with an old
  // score, which would look like a fresh gain: only sessions we already tracked can produce events then.
  const truncated = live.fightingNow > live.fighters.length;
  if (seeded) {
    for (const fighter of live.fighters) {
      if (fighter.isYou) continue;
      if (truncated && !previousFighters.has(fighter.sessionId)) continue;
      const gain = fighter.score - (previousFighters.get(fighter.sessionId) ?? 0);
      if (gain > 0) {
        events.push({ key: `${fighter.sessionId}:${fighter.score}`, name: fighter.name, avatarUrl: fighter.avatarUrl, gain });
      }
    }
    for (const hit of live.recentHits) {
      if (hit.isYou || seenHits.has(hit.sessionId)) continue;
      if (truncated && !previousFighters.has(hit.sessionId)) continue;
      const gain = hit.score - (previousFighters.get(hit.sessionId) ?? 0);
      if (gain > 0) {
        events.push({ key: `${hit.sessionId}:end`, name: hit.name, avatarUrl: hit.avatarUrl, gain });
      }
    }
  }
  return events.sort((a, b) => b.gain - a.gain).slice(0, MAX_CHIPS_PER_POLL);
}

export function useBossLive(enabled: boolean, onUpdate: (live: BossLive) => void) {
  const [live, setLive] = useState<BossLive | null>(null);
  const [chips, setChips] = useState<BossLiveChip[]>([]);
  /** Bumped when someone else's chip appears; drives a faint shimmer on the HP bar. */
  const [pulse, setPulse] = useState(0);

  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let inFlight = false;
    let lastRunAt = 0;
    let seeded = false;
    let previousFighters = new Map<string, number>();
    const seenHits = new Set<string>();
    const timers: number[] = [];

    const schedule = (events: BossLiveChip[]) => {
      events.forEach((chip, index) => {
        timers.push(
          window.setTimeout(() => {
            if (cancelled) return;
            setChips((current) => [...current.slice(-(MAX_VISIBLE_CHIPS - 1)), chip]);
            setPulse((value) => value + 1);
            timers.push(
              window.setTimeout(() => {
                if (!cancelled) setChips((current) => current.filter((item) => item.key !== chip.key));
              }, CHIP_VISIBLE_MS),
            );
          }, index * CHIP_SPACING_MS),
        );
      });
    };

    const refresh = async () => {
      if (inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      lastRunAt = Date.now();
      try {
        const data = await bossApi.getLive();
        if (cancelled) return;
        const events = deriveBossLiveEvents(data, previousFighters, seenHits, seeded);
        previousFighters = new Map(data.fighters.map((fighter) => [fighter.sessionId, fighter.score]));
        for (const hit of data.recentHits) seenHits.add(hit.sessionId);
        seeded = true;
        setLive(data);
        onUpdateRef.current(data);
        if (events.length) schedule(events);
      } catch {
        // Keep the last known snapshot; the next tick retries.
      } finally {
        inFlight = false;
      }
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), BOSS_LIVE_REFRESH_MS);
    const onVisible = () => {
      if (Date.now() - lastRunAt >= BOSS_LIVE_REFRESH_MS) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [enabled]);

  return { live, chips, pulse };
}
