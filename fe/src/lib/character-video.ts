/**
 * AI Character Video Architecture and State Resolver for BCN Arena
 *
 * Provides dynamic video asset resolution, state priority orchestration,
 * and tier-specific visual assets for interactive AI avatars in BCN Arena.
 */

export type CharacterVideoState =
  | 'connecting'
  | 'waking'
  | 'idle'
  | 'working'
  | 'making_something'
  | 'waiting_for_subagents'
  | 'milestone_level_up';

export interface CharacterVideoAsset {
  state: CharacterVideoState;
  videoUrl: string;
  posterUrl: string;
  loop: boolean;
  title: string;
  description: string;
  durationMs?: number;
}

export interface CharacterTierVideoSet {
  levelMin: number;
  levelMax: number;
  tierKey: string;
  tierName: string;
  bannerBgUrl: string;
  posterUrl: string;
  videos: Record<CharacterVideoState, CharacterVideoAsset>;
}

export type ResolvedCharacterVideo = CharacterVideoAsset & {
  bannerBgUrl: string;
};

/**
 * All valid Character Video States
 */
export const CHARACTER_VIDEO_STATES: readonly CharacterVideoState[] = [
  'connecting',
  'waking',
  'idle',
  'working',
  'making_something',
  'waiting_for_subagents',
  'milestone_level_up',
] as const;

/**
 * Default fallback state when none is provided or state is unresolvable
 */
export const DEFAULT_CHARACTER_VIDEO_STATE: CharacterVideoState = 'idle';

/**
 * Priority Hierarchy (highest to lowest):
 * milestone_level_up > connecting > waking > making_something > working > waiting_for_subagents > idle
 */
export const STATE_PRIORITY_ORDER: readonly CharacterVideoState[] = [
  'milestone_level_up',
  'connecting',
  'waking',
  'making_something',
  'working',
  'waiting_for_subagents',
  'idle',
] as const;

export const STATE_PRIORITY_WEIGHTS: Readonly<Record<CharacterVideoState, number>> = {
  milestone_level_up: 700,
  connecting: 600,
  waking: 500,
  making_something: 400,
  working: 300,
  waiting_for_subagents: 200,
  idle: 100,
};

interface StateMetaConfig {
  loop: boolean;
  title: string;
  description: string;
  durationMs?: number;
}

const STATE_META: Record<CharacterVideoState, StateMetaConfig> = {
  milestone_level_up: {
    loop: false,
    title: 'Milestone Breakthrough',
    description: 'Celebrating level ascension and triumphant arena milestone.',
    durationMs: 4000,
  },
  connecting: {
    loop: true,
    title: 'Neural Link Connecting',
    description: 'Establishing high-speed synchronization with the Arena neural network.',
  },
  waking: {
    loop: false,
    title: 'Avatar Awakening',
    description: 'Powering up core runtime and calibrating interactive AI avatar sensors.',
    durationMs: 3000,
  },
  making_something: {
    loop: true,
    title: 'Synthesizing Solutions',
    description: 'Forging new code snippets, generating tests, and compiling magic artifacts.',
  },
  working: {
    loop: true,
    title: 'Processing Challenge',
    description: 'Deep analytical reasoning, problem solving, and evaluating test algorithms.',
  },
  waiting_for_subagents: {
    loop: true,
    title: 'Swarm Synchronization',
    description: 'Coordinating background subagents and awaiting distributed telemetry.',
  },
  idle: {
    loop: true,
    title: 'Observant Readiness',
    description: 'Standing by calmly, observing code submissions and awaiting commands.',
  },
};

function buildTierVideoRecord(
  basePath: string,
  fallbackPosterUrl: string,
): Record<CharacterVideoState, CharacterVideoAsset> {
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const result = {} as Record<CharacterVideoState, CharacterVideoAsset>;

  for (const state of CHARACTER_VIDEO_STATES) {
    const meta = STATE_META[state];
    result[state] = {
      state,
      videoUrl: `${normalizedBase}${state}.mp4`,
      posterUrl: fallbackPosterUrl,
      loop: meta.loop,
      title: meta.title,
      description: meta.description,
      ...(meta.durationMs !== undefined ? { durationMs: meta.durationMs } : {}),
    };
  }

  return result;
}

/**
 * Complete Level Tier Video Registry
 * - Tier 1 (Lv 1-2): Beginner Adventurer ('/videos/characters/level-1/')
 * - Tier 2 (Lv 3-5): Code Warrior ('/videos/characters/level-3/')
 * - Tier 3 (Lv 6-9): Elite Knight Mage ('/videos/characters/level-6/')
 * - Tier 4 (Lv 10+): Legendary Grandmaster ('/videos/characters/level-10/')
 */
export const CHARACTER_TIER_VIDEO_SETS: readonly CharacterTierVideoSet[] = [
  {
    levelMin: 1,
    levelMax: 2,
    tierKey: 'tier-1-beginner',
    tierName: 'Beginner Adventurer',
    bannerBgUrl: '/images/dashboard/hero-bg.jpg',
    posterUrl: '/images/characters/character-level-1.png',
    videos: buildTierVideoRecord(
      '/videos/characters/level-1/',
      '/images/characters/character-level-1.png',
    ),
  },
  {
    levelMin: 3,
    levelMax: 5,
    tierKey: 'tier-2-warrior',
    tierName: 'Code Warrior',
    bannerBgUrl: '/images/dashboard/hero-banner-tier-2.jpg',
    posterUrl: '/images/characters/character-level-3.png',
    videos: buildTierVideoRecord(
      '/videos/characters/level-3/',
      '/images/characters/character-level-3.png',
    ),
  },
  {
    levelMin: 6,
    levelMax: 9,
    tierKey: 'tier-3-knight-mage',
    tierName: 'Elite Knight Mage',
    bannerBgUrl: '/images/dashboard/hero-banner-tier-3.jpg',
    posterUrl: '/images/characters/character-level-6.png',
    videos: buildTierVideoRecord(
      '/videos/characters/level-6/',
      '/images/characters/character-level-6.png',
    ),
  },
  {
    levelMin: 10,
    levelMax: 19,
    tierKey: 'tier-4-grandmaster',
    tierName: 'Legendary Grandmaster',
    bannerBgUrl: '/images/dashboard/hero-banner-tier-4.jpg',
    posterUrl: '/images/characters/character-level-10.png',
    videos: buildTierVideoRecord(
      '/videos/characters/level-10/',
      '/images/characters/character-level-10.png',
    ),
  },
  {
    levelMin: 20,
    levelMax: 39,
    tierKey: 'tier-5-astral',
    tierName: 'Astral Sovereign',
    bannerBgUrl: '/images/dashboard/hero-banner-tier-5.jpg',
    posterUrl: '/images/characters/character-level-20.png',
    videos: buildTierVideoRecord(
      '/videos/characters/level-20/',
      '/images/characters/character-level-20.png',
    ),
  },
  {
    levelMin: 40,
    levelMax: 69,
    tierKey: 'tier-6-void',
    tierName: 'Void Archon',
    bannerBgUrl: '/images/dashboard/hero-banner-tier-6.jpg',
    posterUrl: '/images/characters/character-level-40.png',
    videos: buildTierVideoRecord(
      '/videos/characters/level-40/',
      '/images/characters/character-level-40.png',
    ),
  },
  {
    levelMin: 70,
    levelMax: 999,
    tierKey: 'tier-7-seraph',
    tierName: 'Celestial Seraph',
    bannerBgUrl: '/images/dashboard/hero-banner-tier-7.jpg',
    posterUrl: '/images/characters/character-level-65.png',
    videos: buildTierVideoRecord(
      '/videos/characters/level-65/',
      '/images/characters/character-level-65.png',
    ),
  },
] as const;

/**
 * Type guard for CharacterVideoState
 */
export function isValidCharacterVideoState(value: unknown): value is CharacterVideoState {
  return typeof value === 'string' && CHARACTER_VIDEO_STATES.includes(value as CharacterVideoState);
}

/**
 * Retrieves numeric priority weight for a state (higher = higher precedence)
 */
export function getStatePriority(state: CharacterVideoState): number {
  return STATE_PRIORITY_WEIGHTS[state] ?? 0;
}

/**
 * Determines if a given state is configured to loop continuously
 */
export function isLoopingState(state: CharacterVideoState): boolean {
  return STATE_META[state]?.loop ?? true;
}

/**
 * Resolves the highest priority state from an array or iterable of candidate states
 * according to the hierarchy:
 * milestone_level_up > connecting > waking > making_something > working > waiting_for_subagents > idle
 */
export function resolveHighestPriorityState(
  candidateStates: Iterable<CharacterVideoState | null | undefined | string>,
): CharacterVideoState {
  let highestState: CharacterVideoState = DEFAULT_CHARACTER_VIDEO_STATE;
  let highestWeight = -1;

  for (const raw of candidateStates) {
    if (isValidCharacterVideoState(raw)) {
      const weight = getStatePriority(raw);
      if (weight > highestWeight) {
        highestWeight = weight;
        highestState = raw;
      }
    }
  }

  return highestState;
}

/**
 * Retrieves the tier video configuration set based on the user's level
 */
export function getCharacterTierVideoSet(level: number): CharacterTierVideoSet {
  const safeLevel = Number.isFinite(Number(level)) ? Math.max(1, Math.floor(Number(level))) : 1;

  const found = CHARACTER_TIER_VIDEO_SETS.find(
    (tier) => safeLevel >= tier.levelMin && safeLevel <= tier.levelMax,
  );

  return found || CHARACTER_TIER_VIDEO_SETS[CHARACTER_TIER_VIDEO_SETS.length - 1];
}

/**
 * Resolves the character video asset and banner URL for a given level and state.
 *
 * @param level - User or avatar level (e.g. 1, 3, 7, 10)
 * @param state - CharacterVideoState ('connecting' | 'waking' | 'idle' | 'working' | 'making_something' | 'waiting_for_subagents' | 'milestone_level_up')
 * @returns Combined CharacterVideoAsset and bannerBgUrl
 */
export function resolveCharacterVideo(
  level: number,
  state: CharacterVideoState = DEFAULT_CHARACTER_VIDEO_STATE,
): ResolvedCharacterVideo {
  const tier = getCharacterTierVideoSet(level);
  const safeState = isValidCharacterVideoState(state) ? state : DEFAULT_CHARACTER_VIDEO_STATE;
  const videoAsset = tier.videos[safeState];

  return {
    ...videoAsset,
    bannerBgUrl: tier.bannerBgUrl,
  };
}

/**
 * Returns localized label and badge metadata for a video state
 */
export function getCharacterStateLabel(
  state: CharacterVideoState,
  locale: 'vi' | 'en' = 'vi',
): { label: string; badge: string } {
  const viLabels: Record<CharacterVideoState, { label: string; badge: string }> = {
    milestone_level_up: { label: 'Đột Phá Thăng Cấp', badge: 'Milestone' },
    connecting: { label: 'Đang Kết Nối', badge: 'Syncing' },
    waking: { label: 'Thức Tỉnh', badge: 'Awakening' },
    making_something: { label: 'Đang Chế Tác', badge: 'Synthesizing' },
    working: { label: 'Đang Xử Lý', badge: 'Computing' },
    waiting_for_subagents: { label: 'Đợi Phân Thân Swarm', badge: 'Awaiting' },
    idle: { label: 'Sẵn Sàng Quan Sát', badge: 'Standby' },
  };

  const enLabels: Record<CharacterVideoState, { label: string; badge: string }> = {
    milestone_level_up: { label: 'Milestone Level Up', badge: 'Milestone' },
    connecting: { label: 'Connecting', badge: 'Syncing' },
    waking: { label: 'Waking Up', badge: 'Awakening' },
    making_something: { label: 'Crafting / Synthesizing', badge: 'Synthesizing' },
    working: { label: 'Working / Solving', badge: 'Computing' },
    waiting_for_subagents: { label: 'Waiting for Subagents', badge: 'Awaiting' },
    idle: { label: 'Idle / Ready', badge: 'Standby' },
  };

  const dict = locale === 'vi' ? viLabels : enLabels;
  return dict[state] || dict.idle;
}
