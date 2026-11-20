import { XpSourceType } from '@prisma/client';

export const XP_AMOUNTS: Record<XpSourceType, number> = {
  TOPIC_FIRST_SUBMIT: 50,
  TOWER_FLOOR: 30,
  COURSE_COMPLETED: 200,
  CERTIFICATE_ISSUED: 300,
  BOSS_SESSION_COMPLETED: 50,
  BOSS_COMBO_STREAK: 25,
  BOUNTY_COMPLETED: 100,
};

export const XP_PER_LEVEL = 200;

export function xpRequiredForLevel(level: number): number {
  const safe = Math.max(1, Math.floor(level));
  if (safe <= 5) return 150;
  if (safe <= 19) return 250;
  if (safe <= 39) return 400;
  if (safe <= 69) return 600;
  return 900;
}

export function totalXpForLevel(targetLevel: number): number {
  const safeTarget = Math.max(1, Math.floor(targetLevel));
  let total = 0;
  for (let lv = 1; lv < safeTarget; lv += 1) {
    total += xpRequiredForLevel(lv);
  }
  return total;
}

/** Ascending by minLevel. */
export const XP_RANKS = [
  { minLevel: 1, title: 'Tân Binh BCN' },
  { minLevel: 3, title: 'Chiến Binh Code' },
  { minLevel: 6, title: 'Hiệp Sĩ Tri Thức' },
  { minLevel: 10, title: 'Bậc Thầy Tháp Học Thuật' },
];

/**
 * Anti-farming limits (unlimited retries + instant advance on a correct answer made idle/scripted sessions pay).
 * Boss session XP needs real answers and is capped per Vietnam business day; topic XP needs real answers.
 */
export const BOSS_XP_MIN_CORRECT = 5;
export const BOSS_XP_MAX_SESSIONS_PER_DAY = 3;
/** Minimum personal best (correct answers in one session) to receive weekly milestone coins. */
export const BOSS_REWARD_MIN_PERSONAL_SCORE = 5;
/** Max points one user adds to the community boss HP per week (stops one account clearing the boss alone). */
export const BOSS_COMMUNITY_CONTRIB_CAP = 100;

export const LEVEL_MILESTONE_COIN_REWARDS: ReadonlyArray<{
  level: number;
  coins: number;
  title: string;
}> = [
  { level: 3, coins: 5, title: 'Chiến Binh Code' },
  { level: 6, coins: 10, title: 'Hiệp Sĩ Tinh Anh' },
  { level: 10, coins: 15, title: 'Đại Sư Huyền Thoại' },
  { level: 20, coins: 25, title: 'Thống Soái Tinh Vân' },
  { level: 40, coins: 40, title: 'Hiền Triết Hư Không' },
  { level: 70, coins: 70, title: 'Thần Sứ Thiên Giới' },
  { level: 100, coins: 100, title: 'Đỉnh Cao Lv.100' },
];

export const TIER_MIN_LEVELS: Readonly<Record<string, number>> = {
  'tier-1-beginner': 1,
  'tier-2-skilled': 3,
  'tier-3-elite': 6,
  'tier-4-legendary': 10,
  'tier-5-astral': 20,
  'tier-6-void': 40,
  'tier-7-seraph': 70,
};

export const DAILY_CHEST_REWARD_COINS = 15;

export const SHOP_COSMETIC_PRICES: Readonly<Record<string, number>> = {
  'shop-blood-moon': 150,
  'shop-cyber-neon': 300,
  'shop-frost-ice': 500,
  'shop-royal-gold': 1000,
};

export const VALID_BADGE_IDS = [
  'tower-conqueror',
  'boss-slayer',
  'streak-7',
  'top-weekly',
  'quiz-master',
  'arena-veteran',
] as const;

export type PinBadgeId = (typeof VALID_BADGE_IDS)[number];

export const MAX_PINNED_BADGES = 3;
