import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { Prisma, XpSourceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { businessDate } from '../leaderboard/leaderboard-rules';
import { MockCoinWalletService } from '../wallet/mock-coin-wallet.service';
import {
  BOSS_COMMUNITY_CONTRIB_CAP,
  BOSS_XP_MAX_SESSIONS_PER_DAY,
  BOSS_XP_MIN_CORRECT,
  DAILY_CHEST_REWARD_COINS,
  LEVEL_MILESTONE_COIN_REWARDS,
  MAX_PINNED_BADGES,
  SHOP_COSMETIC_PRICES,
  TIER_MIN_LEVELS,
  totalXpForLevel,
  VALID_BADGE_IDS,
  XP_AMOUNTS,
  XP_RANKS,
  xpRequiredForLevel,
} from './xp.constants';
import { PlayerProfileDto, XpSummaryDto } from './dto/xp.dto';

export function rankForLevel(level: number): {
  rankTitle: string;
  nextRankTitle: string | null;
} {
  let idx = 0;
  XP_RANKS.forEach((r, i) => {
    if (level >= r.minLevel) idx = i;
  });
  return {
    rankTitle: XP_RANKS[idx].title,
    nextRankTitle: XP_RANKS[idx + 1]?.title ?? null,
  };
}

export function levelFromXp(totalXp: number) {
  let remaining = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (level < 999) {
    const req = xpRequiredForLevel(level);
    if (remaining < req) {
      return {
        level,
        xpInLevel: remaining,
        xpRequired: req,
        xpPercent: Math.round((remaining / req) * 100),
        ...rankForLevel(level),
      };
    }
    remaining -= req;
    level += 1;
  }
  const maxReq = xpRequiredForLevel(level);
  return {
    level,
    xpInLevel: remaining,
    xpRequired: maxReq,
    xpPercent: 100,
    ...rankForLevel(level),
  };
}

export function computeBossComboXp(maxCombo: number): number {
  if (maxCombo >= 10) return 50;
  if (maxCombo >= 5) return 25;
  if (maxCombo >= 3) return 10;
  return 0;
}

/** Topic XP needs real answers: at least one correct and at least half of the questions answered. */
export function isTopicXpEligible(
  totalQuestions: number,
  answeredCount: number,
  correctCount: number,
): boolean {
  return (
    totalQuestions > 0 &&
    correctCount >= 1 &&
    answeredCount >= Math.ceil(totalQuestions / 2)
  );
}

/** Community boss HP contribution of one user: personal best, capped per user. */
export function cappedBossContribution(highestScore: number): number {
  return Math.min(Math.max(0, highestScore), BOSS_COMMUNITY_CONTRIB_CAP);
}

@Injectable()
export class XpService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly mockWalletService?: MockCoinWalletService,
  ) {}

  computeBossComboXp(maxCombo: number): number {
    return computeBossComboXp(maxCombo);
  }

  async award(
    userId: string,
    sourceType: XpSourceType,
    sourceKey: string,
    txOrOverride?: Prisma.TransactionClient | number,
    overrideAmount?: number,
  ): Promise<{ awarded: boolean; amount: number }> {
    let client: Prisma.TransactionClient | PrismaService = this.prisma;
    let amount = XP_AMOUNTS[sourceType];

    if (typeof txOrOverride === 'number') {
      amount = txOrOverride;
    } else if (txOrOverride) {
      client = txOrOverride;
      if (overrideAmount !== undefined) {
        amount = overrideAmount;
      }
    } else if (overrideAmount !== undefined) {
      amount = overrideAmount;
    }

    // createMany + skipDuplicates = INSERT .. ON CONFLICT DO NOTHING: no error
    // (and so no aborted Postgres transaction) on duplicates.
    const res = await client.userXpEvent.createMany({
      data: [{ userId, sourceType, sourceKey, amount }],
      skipDuplicates: true,
    });
    return res.count > 0
      ? { awarded: true, amount }
      : { awarded: false, amount: 0 };
  }

  /**
   * Boss session XP for a COMPLETED session. Needs BOSS_XP_MIN_CORRECT correct answers and is capped at
   * BOSS_XP_MAX_SESSIONS_PER_DAY sessions per Vietnam business day. Count + insert run under one advisory lock so
   * parallel session ends cannot exceed the cap. Combo XP is granted only together with the session XP, and a retry
   * of an already-awarded session stays idempotent.
   */
  async awardBossSession(
    userId: string,
    sessionId: string,
    stats: { correctCount: number; maxCombo: number },
    now: Date = new Date(),
  ): Promise<{
    sessionXp: number;
    comboXp: number;
    skipped?: 'below_min' | 'daily_cap';
  }> {
    if (stats.correctCount < BOSS_XP_MIN_CORRECT) {
      return { sessionXp: 0, comboXp: 0, skipped: 'below_min' };
    }
    const day = businessDate(now);
    const dayStart = new Date(`${day}T00:00:00.000+07:00`);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`xp:boss:${userId}:${day}`}))`;

      const already = await tx.userXpEvent.findUnique({
        where: {
          userId_sourceType_sourceKey: {
            userId,
            sourceType: XpSourceType.BOSS_SESSION_COMPLETED,
            sourceKey: sessionId,
          },
        },
        select: { id: true },
      });
      if (!already) {
        const usedToday = await tx.userXpEvent.count({
          where: {
            userId,
            sourceType: XpSourceType.BOSS_SESSION_COMPLETED,
            createdAt: { gte: dayStart },
          },
        });
        if (usedToday >= BOSS_XP_MAX_SESSIONS_PER_DAY) {
          return { sessionXp: 0, comboXp: 0, skipped: 'daily_cap' as const };
        }
      }

      const session = await this.award(
        userId,
        XpSourceType.BOSS_SESSION_COMPLETED,
        sessionId,
        tx,
      );
      const comboAmount = computeBossComboXp(stats.maxCombo);
      const combo =
        comboAmount > 0
          ? await this.award(
              userId,
              XpSourceType.BOSS_COMBO_STREAK,
              sessionId,
              tx,
              comboAmount,
            )
          : { awarded: false, amount: 0 };
      return { sessionXp: session.amount, comboXp: combo.amount };
    });
  }

  async getSummary(userId: string, email?: string): Promise<XpSummaryDto> {
    if (email?.trim().toLowerCase() === 'tuanhungvip12@gmail.com') {
      await this.ensureTestAdminLevel40(userId);
    }

    const [groups, recent] = await Promise.all([
      this.prisma.userXpEvent.groupBy({
        by: ['sourceType'],
        where: { userId },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.userXpEvent.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 10,
        select: {
          id: true,
          sourceType: true,
          sourceKey: true,
          amount: true,
          createdAt: true,
        },
      }),
    ]);

    const breakdown = {
      TOPIC_FIRST_SUBMIT: { count: 0, xp: 0 },
      TOWER_FLOOR: { count: 0, xp: 0 },
      COURSE_COMPLETED: { count: 0, xp: 0 },
      CERTIFICATE_ISSUED: { count: 0, xp: 0 },
      BOSS_SESSION_COMPLETED: { count: 0, xp: 0 },
      BOSS_COMBO_STREAK: { count: 0, xp: 0 },
    } as Record<XpSourceType, { count: number; xp: number }>;
    let totalXp = 0;
    for (const g of groups) {
      const xp = g._sum.amount ?? 0;
      breakdown[g.sourceType] = { count: g._count._all, xp };
      totalXp += xp;
    }

    const levelInfo = levelFromXp(totalXp);
    await this.syncLevelMilestoneCoins(userId, levelInfo.level);

    const todayKey = businessDate(new Date());
    const [cosmeticPref, chestTx, statsAndBadges] = await Promise.all([
      typeof this.prisma.userCosmeticPreference?.findUnique === 'function'
        ? this.prisma.userCosmeticPreference
            .findUnique({
              where: { userId },
              select: {
                equippedTierId: true,
                pinnedBadges: true,
                unlockedCosmetics: true,
              },
            })
            .catch(() => null)
        : Promise.resolve(null),
      typeof this.prisma.mockWalletTransaction?.findUnique === 'function'
        ? this.prisma.mockWalletTransaction
            .findUnique({
              where: { idempotencyKey: `daily:chest:${userId}:${todayKey}` },
              select: { id: true },
            })
            .catch(() => null)
        : Promise.resolve(null),
      this.computePlayerStatsAndBadges(userId, levelInfo.level),
    ]);

    const unlockedCosmetics = cosmeticPref?.unlockedCosmetics ?? [];
    const rawEquipped = cosmeticPref?.equippedTierId ?? null;
    const minReq = rawEquipped ? TIER_MIN_LEVELS[rawEquipped] : undefined;
    const isUnlockedShop =
      Boolean(rawEquipped) && unlockedCosmetics.includes(rawEquipped!);
    const equippedTierId =
      rawEquipped &&
      ((minReq !== undefined && levelInfo.level >= minReq) || isUnlockedShop)
        ? rawEquipped
        : null;
    const pinnedBadges = (cosmeticPref?.pinnedBadges ?? []).slice(
      0,
      MAX_PINNED_BADGES,
    );

    return {
      totalXp,
      ...levelInfo,
      equippedTierId,
      pinnedBadges,
      unlockedCosmetics,
      earnedBadges: statsAndBadges.earnedBadges,
      dailyChestClaimed: Boolean(chestTx),
      breakdown,
      recent,
    };
  }

  private async computePlayerStatsAndBadges(userId: string, level: number) {
    const [towerAgg, bossAgg, totalQuizAttempts, certificatesCount] =
      await Promise.all([
        typeof this.prisma.towerUserProgress?.aggregate === 'function'
          ? this.prisma.towerUserProgress
              .aggregate({
                where: { userId },
                _max: { highestCompletedFloor: true },
              })
              .catch(() => ({ _max: { highestCompletedFloor: 0 } }))
          : Promise.resolve({ _max: { highestCompletedFloor: 0 } }),
        typeof this.prisma.bossUserWeeklyStat?.aggregate === 'function'
          ? this.prisma.bossUserWeeklyStat
              .aggregate({
                where: { userId },
                _max: { highestScore: true, bestCombo: true },
              })
              .catch(() => ({ _max: { highestScore: 0, bestCombo: 0 } }))
          : Promise.resolve({ _max: { highestScore: 0, bestCombo: 0 } }),
        typeof this.prisma.quizAttempt?.count === 'function'
          ? this.prisma.quizAttempt
              .count({ where: { userId } })
              .catch(() => 0)
          : Promise.resolve(0),
        typeof this.prisma.certificate?.count === 'function'
          ? this.prisma.certificate
              .count({ where: { userId } })
              .catch(() => 0)
          : Promise.resolve(0),
      ]);

    const highestTowerFloor = towerAgg._max?.highestCompletedFloor ?? 0;
    const bestBossDamage = bossAgg._max?.highestScore ?? 0;
    const bestBossCombo = bossAgg._max?.bestCombo ?? 0;

    const earnedBadges: string[] = [];
    if (level >= 3) earnedBadges.push('arena-veteran');
    if (highestTowerFloor >= 10) earnedBadges.push('tower-conqueror');
    if (bestBossDamage >= 5) earnedBadges.push('boss-slayer');
    if (bestBossCombo >= 5 || level >= 6) earnedBadges.push('streak-7');
    if (totalQuizAttempts >= 10 || certificatesCount >= 1)
      earnedBadges.push('quiz-master');
    if (level >= 10 || certificatesCount >= 1) earnedBadges.push('top-weekly');

    return {
      stats: {
        highestTowerFloor,
        bestBossDamage,
        totalQuizAttempts,
        certificatesCount,
      },
      earnedBadges,
    };
  }

  async updateCosmetics(
    userId: string,
    payload: { equippedTierId?: string | null; pinnedBadges?: string[] },
  ): Promise<{
    equippedTierId: string | null;
    pinnedBadges: string[];
    unlockedCosmetics: string[];
  }> {
    const existing = await this.prisma.userCosmeticPreference
      .findUnique({ where: { userId } })
      .catch(() => null);
    const unlockedCosmetics = existing?.unlockedCosmetics ?? [];

    let nextEquippedTierId = existing?.equippedTierId ?? null;
    if (payload.equippedTierId !== undefined) {
      const requested = payload.equippedTierId;
      if (requested === null) {
        nextEquippedTierId = null;
      } else if (TIER_MIN_LEVELS[requested] !== undefined) {
        const minReq = TIER_MIN_LEVELS[requested];
        const agg = await this.prisma.userXpEvent.aggregate({
          where: { userId },
          _sum: { amount: true },
        });
        const currentLevel = levelFromXp(agg._sum.amount ?? 0).level;
        if (currentLevel < minReq) {
          throw new BadRequestException(
            `Cần đạt Cấp ${minReq} để trang bị ngoại hình này.`,
          );
        }
        nextEquippedTierId = requested;
      } else if (SHOP_COSMETIC_PRICES[requested] !== undefined) {
        if (!unlockedCosmetics.includes(requested)) {
          throw new BadRequestException(
            'Bạn chưa mở khóa trang bị cửa hàng này.',
          );
        }
        nextEquippedTierId = requested;
      } else {
        throw new BadRequestException('Giai đoạn ngoại hình không hợp lệ.');
      }
    }

    let nextPinnedBadges = existing?.pinnedBadges ?? [];
    if (payload.pinnedBadges !== undefined) {
      if (!Array.isArray(payload.pinnedBadges)) {
        throw new BadRequestException('Danh sách huy hiệu không hợp lệ.');
      }
      const unique = Array.from(
        new Set(
          payload.pinnedBadges.filter(
            (b): b is string =>
              typeof b === 'string' &&
              (VALID_BADGE_IDS as readonly string[]).includes(b),
          ),
        ),
      );
      if (unique.length > MAX_PINNED_BADGES) {
        throw new BadRequestException(
          `Chỉ được ghim tối đa ${MAX_PINNED_BADGES} huy hiệu.`,
        );
      }
      nextPinnedBadges = unique;
    }

    await this.prisma.userCosmeticPreference.upsert({
      where: { userId },
      update: {
        equippedTierId: nextEquippedTierId,
        pinnedBadges: nextPinnedBadges,
      },
      create: {
        userId,
        equippedTierId: nextEquippedTierId,
        pinnedBadges: nextPinnedBadges,
        unlockedCosmetics,
      },
    });
    return {
      equippedTierId: nextEquippedTierId,
      pinnedBadges: nextPinnedBadges,
      unlockedCosmetics,
    };
  }

  async purchaseCosmetic(
    userId: string,
    cosmeticId: string,
  ): Promise<{
    purchased: boolean;
    alreadyOwned: boolean;
    cosmeticId: string;
    equippedTierId: string | null;
    unlockedCosmetics: string[];
    newBalance?: number;
  }> {
    const price = SHOP_COSMETIC_PRICES[cosmeticId];
    if (price === undefined) {
      throw new BadRequestException('Gói trang bị không tồn tại.');
    }

    const existing = await this.prisma.userCosmeticPreference
      .findUnique({ where: { userId } })
      .catch(() => null);
    const currentUnlocked = existing?.unlockedCosmetics ?? [];

    if (currentUnlocked.includes(cosmeticId)) {
      return {
        purchased: false,
        alreadyOwned: true,
        cosmeticId,
        equippedTierId: existing?.equippedTierId ?? null,
        unlockedCosmetics: currentUnlocked,
      };
    }

    if (!this.mockWalletService) {
      throw new BadRequestException('Ví Coin hiện chưa sẵn sàng.');
    }

    const debit = await this.mockWalletService.debitPurchase({
      userId,
      amount: price,
      idempotencyKey: `shop:cosmetic:${userId}:${cosmeticId}`,
      description: `Mua trang bị BCN Arena (${cosmeticId})`,
    });

    const nextUnlocked = Array.from(new Set([...currentUnlocked, cosmeticId]));
    await this.prisma.userCosmeticPreference.upsert({
      where: { userId },
      update: {
        unlockedCosmetics: nextUnlocked,
        equippedTierId: cosmeticId,
      },
      create: {
        userId,
        unlockedCosmetics: nextUnlocked,
        equippedTierId: cosmeticId,
        pinnedBadges: [],
      },
    });

    return {
      purchased: debit.debited,
      alreadyOwned: false,
      cosmeticId,
      equippedTierId: cosmeticId,
      unlockedCosmetics: nextUnlocked,
      newBalance: debit.balance,
    };
  }

  async getPlayerProfile(targetUserId: string): Promise<PlayerProfileDto> {
    const cleanId = targetUserId?.trim();
    if (!cleanId) {
      throw new BadRequestException('Thiếu userId người chơi.');
    }

    const [agg, cosmeticPref] = await Promise.all([
      this.prisma.userXpEvent.aggregate({
        where: { userId: cleanId },
        _sum: { amount: true },
      }),
      this.prisma.userCosmeticPreference
        .findUnique({
          where: { userId: cleanId },
          select: {
            equippedTierId: true,
            pinnedBadges: true,
            unlockedCosmetics: true,
          },
        })
        .catch(() => null),
    ]);

    const totalXp = Math.max(0, agg._sum.amount ?? 0);
    const levelInfo = levelFromXp(totalXp);
    const { stats, earnedBadges } = await this.computePlayerStatsAndBadges(
      cleanId,
      levelInfo.level,
    );

    const unlockedCosmetics = cosmeticPref?.unlockedCosmetics ?? [];
    const rawEquipped = cosmeticPref?.equippedTierId ?? null;
    const minReq = rawEquipped ? TIER_MIN_LEVELS[rawEquipped] : undefined;
    const isUnlockedShop =
      Boolean(rawEquipped) && unlockedCosmetics.includes(rawEquipped!);
    const equippedTierId =
      rawEquipped &&
      ((minReq !== undefined && levelInfo.level >= minReq) || isUnlockedShop)
        ? rawEquipped
        : null;

    return {
      userId: cleanId,
      totalXp,
      level: levelInfo.level,
      rankTitle: levelInfo.rankTitle,
      equippedTierId,
      pinnedBadges: (cosmeticPref?.pinnedBadges ?? []).slice(
        0,
        MAX_PINNED_BADGES,
      ),
      earnedBadges,
      stats,
    };
  }

  async claimDailyChest(userId: string): Promise<{
    claimed: boolean;
    alreadyClaimed: boolean;
    rewardCoins: number;
  }> {
    if (!this.mockWalletService) {
      return {
        claimed: false,
        alreadyClaimed: false,
        rewardCoins: DAILY_CHEST_REWARD_COINS,
      };
    }
    const day = businessDate(new Date());
    const res = await this.mockWalletService.creditReward({
      userId,
      amount: DAILY_CHEST_REWARD_COINS,
      idempotencyKey: `daily:chest:${userId}:${day}`,
      source: 'DAILY_QUEST',
      description: `Rương Nhiệm vụ ngày (${day})`,
    });
    return {
      claimed: res.credited,
      alreadyClaimed: !res.credited,
      rewardCoins: DAILY_CHEST_REWARD_COINS,
    };
  }

  private async syncLevelMilestoneCoins(
    userId: string,
    currentLevel: number,
  ): Promise<void> {
    if (!this.mockWalletService) return;
    const reached = LEVEL_MILESTONE_COIN_REWARDS.filter(
      (m) => currentLevel >= m.level,
    );
    for (const m of reached) {
      await this.mockWalletService
        .creditReward({
          userId,
          amount: m.coins,
          idempotencyKey: `level:milestone:${userId}:lv:${m.level}`,
          source: 'LEVEL_UP',
          description: `Thưởng đạt cột mốc Cấp ${m.level} (${m.title})`,
        })
        .catch(() => undefined);
    }
  }

  /**
   * Idempotently promotes the configured test admin account to Level 40 (7,800 XP)
   * on first /xp/me call so Tier 6 character & banner can be verified in production.
   */
  private async ensureTestAdminLevel40(userId: string): Promise<void> {
    const sourceKey = 'migration:test-lv40-v2:tuanhungvip12@gmail.com';
    const existing = await this.prisma.userXpEvent.findUnique({
      where: {
        userId_sourceType_sourceKey: {
          userId,
          sourceType: XpSourceType.BOUNTY_COMPLETED,
          sourceKey,
        },
      },
      select: { id: true },
    });
    if (existing) return;

    const targetXp = totalXpForLevel(40); // 12,250 XP -> Level 40 under Tiered RPG Curve
    const agg = await this.prisma.userXpEvent.aggregate({
      where: { userId },
      _sum: { amount: true },
    });
    const currentXp = agg._sum.amount ?? 0;
    if (currentXp >= targetXp) return;

    try {
      await this.prisma.userXpEvent.create({
        data: {
          userId,
          sourceType: XpSourceType.BOUNTY_COMPLETED,
          sourceKey,
          amount: targetXp - currentXp,
        },
      });
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return;
      }
      throw err;
    }
  }
}
