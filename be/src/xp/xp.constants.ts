import { XpSourceType } from '@prisma/client';

export const XP_AMOUNTS: Record<XpSourceType, number> = {
  TOPIC_FIRST_SUBMIT: 50,
  TOWER_FLOOR: 30,
  COURSE_COMPLETED: 200,
  CERTIFICATE_ISSUED: 300,
  BOSS_SESSION_COMPLETED: 50,
  BOSS_COMBO_STREAK: 25,
};

export const XP_PER_LEVEL = 200;

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
