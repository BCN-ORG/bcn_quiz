import { XpSourceType } from '@prisma/client';

export const XP_AMOUNTS: Record<XpSourceType, number> = {
  TOPIC_FIRST_SUBMIT: 50,
  TOWER_FLOOR: 30,
  COURSE_COMPLETED: 200,
  CERTIFICATE_ISSUED: 300,
  BOSS_SESSION_COMPLETED: 50,
  BOSS_COMBO_STREAK: 25,
  BOUNTY_COMPLETED: 100,
  QUEST_COMPLETED: 25,
  MISTAKE_REVIEW: 15,
  SEASON_PASS: 50,
  PVP_MATCH: 30,
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
  { level: 3, coins: 3, title: 'Chiến Binh Code' },
  { level: 6, coins: 5, title: 'Hiệp Sĩ Tinh Anh' },
  { level: 10, coins: 6, title: 'Đại Sư Huyền Thoại' },
  { level: 20, coins: 7, title: 'Thống Soái Tinh Vân' },
  { level: 40, coins: 8, title: 'Hiền Triết Hư Không' },
  { level: 70, coins: 9, title: 'Thần Sứ Thiên Giới' },
  { level: 100, coins: 9, title: 'Đỉnh Cao Lv.100' },
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

export const DAILY_CHEST_REWARD_COINS = 5;

export const SHOP_COSMETIC_PRICES: Readonly<Record<string, number>> = {
  // Full 4-piece bundles (~10% bundle discount)
  'shop-blood-moon': 150,
  'shop-obsidian-reaper': 200,
  'shop-crimson-dragon': 250,
  'shop-sakura-ronin': 250,
  'shop-cyber-neon': 300,
  'shop-storm-valkyrie': 350,
  'shop-astral-spirit': 400,
  'shop-abyssal-leviathan': 450,
  'shop-frost-ice': 500,
  'shop-phoenix-sovereign': 550,
  'shop-phantom-samurai': 600,
  'shop-shadow-assassin': 650,
  'shop-celestial-archon': 750,
  'shop-mecha-titan': 800,
  'shop-infernal-warlord': 850,
  'shop-quantum-hacker': 950,
  'shop-royal-gold': 1000,
  'shop-eternal-emperor': 1200,

  // Individual Character skins (~40% of bundle)
  'char:shop-blood-moon': 60,
  'char:shop-obsidian-reaper': 80,
  'char:shop-crimson-dragon': 100,
  'char:shop-sakura-ronin': 100,
  'char:shop-cyber-neon': 120,
  'char:shop-storm-valkyrie': 140,
  'char:shop-astral-spirit': 160,
  'char:shop-abyssal-leviathan': 180,
  'char:shop-frost-ice': 200,
  'char:shop-phoenix-sovereign': 220,
  'char:shop-phantom-samurai': 240,
  'char:shop-shadow-assassin': 260,
  'char:shop-celestial-archon': 300,
  'char:shop-mecha-titan': 320,
  'char:shop-infernal-warlord': 340,
  'char:shop-quantum-hacker': 380,
  'char:shop-royal-gold': 400,
  'char:shop-eternal-emperor': 480,

  // Individual Hero Banners (~30% of bundle)
  'banner:shop-blood-moon': 45,
  'banner:shop-obsidian-reaper': 60,
  'banner:shop-crimson-dragon': 75,
  'banner:shop-sakura-ronin': 75,
  'banner:shop-cyber-neon': 90,
  'banner:shop-storm-valkyrie': 105,
  'banner:shop-astral-spirit': 120,
  'banner:shop-abyssal-leviathan': 135,
  'banner:shop-frost-ice': 150,
  'banner:shop-phoenix-sovereign': 165,
  'banner:shop-phantom-samurai': 180,
  'banner:shop-shadow-assassin': 195,
  'banner:shop-celestial-archon': 225,
  'banner:shop-mecha-titan': 240,
  'banner:shop-infernal-warlord': 255,
  'banner:shop-quantum-hacker': 285,
  'banner:shop-royal-gold': 300,
  'banner:shop-eternal-emperor': 360,

  // Individual Avatar Frames (~20% of bundle)
  'frame:shop-blood-moon': 30,
  'frame:shop-obsidian-reaper': 40,
  'frame:shop-crimson-dragon': 50,
  'frame:shop-sakura-ronin': 50,
  'frame:shop-cyber-neon': 60,
  'frame:shop-storm-valkyrie': 70,
  'frame:shop-astral-spirit': 80,
  'frame:shop-abyssal-leviathan': 90,
  'frame:shop-frost-ice': 100,
  'frame:shop-phoenix-sovereign': 110,
  'frame:shop-phantom-samurai': 120,
  'frame:shop-shadow-assassin': 130,
  'frame:shop-celestial-archon': 150,
  'frame:shop-mecha-titan': 160,
  'frame:shop-infernal-warlord': 170,
  'frame:shop-quantum-hacker': 190,
  'frame:shop-royal-gold': 200,
  'frame:shop-eternal-emperor': 240,

  // Individual Nameplates (~20% of bundle)
  'nameplate:shop-blood-moon': 30,
  'nameplate:shop-obsidian-reaper': 40,
  'nameplate:shop-crimson-dragon': 50,
  'nameplate:shop-sakura-ronin': 50,
  'nameplate:shop-cyber-neon': 60,
  'nameplate:shop-storm-valkyrie': 70,
  'nameplate:shop-astral-spirit': 80,
  'nameplate:shop-abyssal-leviathan': 90,
  'nameplate:shop-frost-ice': 100,
  'nameplate:shop-phoenix-sovereign': 110,
  'nameplate:shop-phantom-samurai': 120,
  'nameplate:shop-shadow-assassin': 130,
  'nameplate:shop-celestial-archon': 150,
  'nameplate:shop-mecha-titan': 160,
  'nameplate:shop-infernal-warlord': 170,
  'nameplate:shop-quantum-hacker': 190,
  'nameplate:shop-royal-gold': 200,
  'nameplate:shop-eternal-emperor': 240,

  // Standalone Avatar Frames (buyable individually without full set)
  'frame:neon-pulse': 50,
  'frame:sakura-petal': 75,
  'frame:emerald-circuit': 90,
  'frame:eclipse-ring': 120,
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
