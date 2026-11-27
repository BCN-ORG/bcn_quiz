import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import {
  CoinRewardSource,
  ConsumableType,
  Prisma,
  XpSourceType,
} from '@prisma/client';
import { CoinApiClient, getCoinProviderMode } from '../coin/coin-api.client';
import { CoinConfigService } from '../coin/coin-config.service';
import { CoinTrackingService } from '../coin/coin-tracking.service';
import { LiveCoinRewardAdapter } from '../coin/live-coin-reward.adapter';
import { PrismaService } from '../prisma/prisma.service';
import { businessDate } from '../leaderboard/leaderboard-rules';
import { CoinWalletService } from '../wallet/coin-wallet.interface';
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
    @Optional()
    private readonly coinWalletService?: CoinWalletService,
    @Optional()
    private readonly coinTrackingService?: CoinTrackingService,
    @Optional()
    private readonly coinConfigService?: CoinConfigService,
    @Optional()
    private readonly liveRewardAdapter?: LiveCoinRewardAdapter,
    @Optional()
    private readonly coinApiClient?: CoinApiClient,
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

    // Apply active 2x XP Boost consumable if present
    if (
      amount > 0 &&
      typeof this.prisma.userInventoryItem?.findUnique === 'function'
    ) {
      const boost = await this.prisma.userInventoryItem
        .findUnique({
          where: {
            userId_itemType: {
              userId,
              itemType: ConsumableType.XP_BOOST_2X,
            },
          },
          select: { activeUntil: true },
        })
        .catch(() => null);
      if (boost?.activeUntil && boost.activeUntil.getTime() > Date.now()) {
        amount = Math.min(amount * 2, 1000);
      }
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

  private isTestAdminEmail(email?: string): boolean {
    return email?.trim().toLowerCase() === 'tuanhungvip12@gmail.com';
  }

  async getSummary(userId: string, email?: string): Promise<XpSummaryDto> {
    const isTestAdmin = this.isTestAdminEmail(email);
    if (isTestAdmin) {
      await this.ensureTestAdminUnlocked(userId);
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
      BOUNTY_COMPLETED: { count: 0, xp: 0 },
      QUEST_COMPLETED: { count: 0, xp: 0 },
      MISTAKE_REVIEW: { count: 0, xp: 0 },
      SEASON_PASS: { count: 0, xp: 0 },
      PVP_MATCH: { count: 0, xp: 0 },
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
                equippedCharacterId: true,
                equippedBannerId: true,
                equippedFrameId: true,
                equippedNameplateId: true,
                pinnedBadges: true,
                unlockedCosmetics: true,
              },
            })
            .catch(() => null)
        : Promise.resolve(null),
      getCoinProviderMode() === 'live'
        ? typeof this.prisma.coinTransaction?.findUnique === 'function'
          ? this.prisma.coinTransaction
              .findUnique({
                where: { idempotencyKey: `daily:chest:${userId}:${todayKey}` },
                select: { id: true, status: true },
              })
              .then((tx) => (tx && tx.status === 'SUCCESS' ? tx : null))
              .catch(() => null)
          : Promise.resolve(null)
        : typeof this.prisma.mockWalletTransaction?.findUnique === 'function'
          ? this.prisma.mockWalletTransaction
              .findUnique({
                where: { idempotencyKey: `daily:chest:${userId}:${todayKey}` },
                select: { id: true },
              })
              .catch(() => null)
          : Promise.resolve(null),
      this.computePlayerStatsAndBadges(userId, levelInfo.level),
    ]);

    const unlockedCosmetics = isTestAdmin
      ? Array.from(
          new Set([
            ...(cosmeticPref?.unlockedCosmetics ?? []),
            ...Object.keys(SHOP_COSMETIC_PRICES),
          ]),
        )
      : (cosmeticPref?.unlockedCosmetics ?? []);
    const earnedBadges = isTestAdmin
      ? Array.from(
          new Set([...statsAndBadges.earnedBadges, ...VALID_BADGE_IDS]),
        )
      : statsAndBadges.earnedBadges;
    const equippedTierId = this.resolveValidCosmeticId(
      cosmeticPref?.equippedTierId ?? null,
      levelInfo.level,
      unlockedCosmetics,
    );
    const equippedCharacterId = this.resolveValidCosmeticId(
      cosmeticPref?.equippedCharacterId ?? equippedTierId,
      levelInfo.level,
      unlockedCosmetics,
    );
    const equippedBannerId = this.resolveValidCosmeticId(
      cosmeticPref?.equippedBannerId ?? equippedTierId,
      levelInfo.level,
      unlockedCosmetics,
    );
    const equippedFrameId = this.resolveValidCosmeticId(
      cosmeticPref?.equippedFrameId ?? equippedTierId,
      levelInfo.level,
      unlockedCosmetics,
    );
    const equippedNameplateId = this.resolveValidCosmeticId(
      cosmeticPref?.equippedNameplateId ?? equippedTierId,
      levelInfo.level,
      unlockedCosmetics,
    );
    const pinnedBadges = (cosmeticPref?.pinnedBadges ?? []).slice(
      0,
      MAX_PINNED_BADGES,
    );

    return {
      totalXp,
      ...levelInfo,
      equippedTierId,
      equippedCharacterId,
      equippedBannerId,
      equippedFrameId,
      equippedNameplateId,
      pinnedBadges,
      unlockedCosmetics,
      earnedBadges,
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
          ? this.prisma.quizAttempt.count({ where: { userId } }).catch(() => 0)
          : Promise.resolve(0),
        typeof this.prisma.certificate?.count === 'function'
          ? this.prisma.certificate.count({ where: { userId } }).catch(() => 0)
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

  private isCosmeticUnlocked(
    unlockedCosmetics: string[],
    itemId: string,
  ): boolean {
    if (unlockedCosmetics.includes(itemId)) return true;
    const colonIdx = itemId.indexOf(':');
    if (colonIdx > 0) {
      const baseId = itemId.slice(colonIdx + 1);
      if (unlockedCosmetics.includes(baseId)) return true;
    }
    return false;
  }

  private resolveValidCosmeticId(
    rawId: string | null | undefined,
    level: number,
    unlockedCosmetics: string[],
  ): string | null {
    if (!rawId) return null;
    const minReq = TIER_MIN_LEVELS[rawId];
    if (minReq !== undefined) {
      return level >= minReq ? rawId : null;
    }
    if (
      SHOP_COSMETIC_PRICES[rawId] !== undefined &&
      this.isCosmeticUnlocked(unlockedCosmetics, rawId)
    ) {
      return rawId;
    }
    return null;
  }

  private validateSlotSelection(
    requested: string | null,
    currentLevel: number,
    unlockedCosmetics: string[],
  ): string | null {
    if (requested === null) return null;
    if (TIER_MIN_LEVELS[requested] !== undefined) {
      const minReq = TIER_MIN_LEVELS[requested];
      if (currentLevel < minReq) {
        throw new BadRequestException(
          `Cần đạt Cấp ${minReq} để trang bị ngoại hình này.`,
        );
      }
      return requested;
    }
    if (SHOP_COSMETIC_PRICES[requested] !== undefined) {
      if (!this.isCosmeticUnlocked(unlockedCosmetics, requested)) {
        throw new BadRequestException(
          'Bạn chưa mở khóa trang bị cửa hàng này.',
        );
      }
      return requested;
    }
    throw new BadRequestException('Giai đoạn ngoại hình không hợp lệ.');
  }

  async updateCosmetics(
    userId: string,
    payload: {
      equippedTierId?: string | null;
      equippedCharacterId?: string | null;
      equippedBannerId?: string | null;
      equippedFrameId?: string | null;
      equippedNameplateId?: string | null;
      pinnedBadges?: string[];
    },
    email?: string,
  ): Promise<{
    equippedTierId: string | null;
    equippedCharacterId: string | null;
    equippedBannerId: string | null;
    equippedFrameId: string | null;
    equippedNameplateId: string | null;
    pinnedBadges: string[];
    unlockedCosmetics: string[];
  }> {
    const existing = await this.prisma.userCosmeticPreference
      .findUnique({ where: { userId } })
      .catch(() => null);
    const unlockedCosmetics = this.isTestAdminEmail(email)
      ? Array.from(
          new Set([
            ...(existing?.unlockedCosmetics ?? []),
            ...Object.keys(SHOP_COSMETIC_PRICES),
          ]),
        )
      : (existing?.unlockedCosmetics ?? []);

    let currentLevel = this.isTestAdminEmail(email) ? 100 : 1;
    const needsLevelCheck =
      !this.isTestAdminEmail(email) &&
      (payload.equippedTierId !== undefined ||
        payload.equippedCharacterId !== undefined ||
        payload.equippedBannerId !== undefined ||
        payload.equippedFrameId !== undefined ||
        payload.equippedNameplateId !== undefined);
    if (needsLevelCheck) {
      const agg = await this.prisma.userXpEvent.aggregate({
        where: { userId },
        _sum: { amount: true },
      });
      currentLevel = levelFromXp(agg._sum.amount ?? 0).level;
    }

    let nextEquippedTierId = existing?.equippedTierId ?? null;
    let nextCharacterId = existing?.equippedCharacterId ?? nextEquippedTierId;
    let nextBannerId = existing?.equippedBannerId ?? nextEquippedTierId;
    let nextFrameId = existing?.equippedFrameId ?? nextEquippedTierId;
    let nextNameplateId = existing?.equippedNameplateId ?? nextEquippedTierId;

    if (payload.equippedTierId !== undefined) {
      nextEquippedTierId = this.validateSlotSelection(
        payload.equippedTierId,
        currentLevel,
        unlockedCosmetics,
      );
      if (payload.equippedCharacterId === undefined) {
        nextCharacterId = nextEquippedTierId;
      }
      if (payload.equippedBannerId === undefined) {
        nextBannerId = nextEquippedTierId;
      }
      if (payload.equippedFrameId === undefined) {
        nextFrameId = nextEquippedTierId;
      }
      if (payload.equippedNameplateId === undefined) {
        nextNameplateId = nextEquippedTierId;
      }
    }
    if (payload.equippedCharacterId !== undefined) {
      nextCharacterId = this.validateSlotSelection(
        payload.equippedCharacterId,
        currentLevel,
        unlockedCosmetics,
      );
    }
    if (payload.equippedBannerId !== undefined) {
      nextBannerId = this.validateSlotSelection(
        payload.equippedBannerId,
        currentLevel,
        unlockedCosmetics,
      );
    }
    if (payload.equippedFrameId !== undefined) {
      nextFrameId = this.validateSlotSelection(
        payload.equippedFrameId,
        currentLevel,
        unlockedCosmetics,
      );
    }
    if (payload.equippedNameplateId !== undefined) {
      nextNameplateId = this.validateSlotSelection(
        payload.equippedNameplateId,
        currentLevel,
        unlockedCosmetics,
      );
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
        equippedCharacterId: nextCharacterId,
        equippedBannerId: nextBannerId,
        equippedFrameId: nextFrameId,
        equippedNameplateId: nextNameplateId,
        pinnedBadges: nextPinnedBadges,
      },
      create: {
        userId,
        equippedTierId: nextEquippedTierId,
        equippedCharacterId: nextCharacterId,
        equippedBannerId: nextBannerId,
        equippedFrameId: nextFrameId,
        equippedNameplateId: nextNameplateId,
        pinnedBadges: nextPinnedBadges,
        unlockedCosmetics,
      },
    });
    return {
      equippedTierId: nextEquippedTierId,
      equippedCharacterId: nextCharacterId,
      equippedBannerId: nextBannerId,
      equippedFrameId: nextFrameId,
      equippedNameplateId: nextNameplateId,
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
    equippedCharacterId: string | null;
    equippedBannerId: string | null;
    equippedFrameId: string | null;
    equippedNameplateId: string | null;
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

    if (this.isCosmeticUnlocked(currentUnlocked, cosmeticId)) {
      return {
        purchased: false,
        alreadyOwned: true,
        cosmeticId,
        equippedTierId: existing?.equippedTierId ?? null,
        equippedCharacterId:
          existing?.equippedCharacterId ?? existing?.equippedTierId ?? null,
        equippedBannerId:
          existing?.equippedBannerId ?? existing?.equippedTierId ?? null,
        equippedFrameId:
          existing?.equippedFrameId ?? existing?.equippedTierId ?? null,
        equippedNameplateId:
          existing?.equippedNameplateId ?? existing?.equippedTierId ?? null,
        unlockedCosmetics: currentUnlocked,
      };
    }

    const idempotencyKey = `shop:cosmetic:${userId}:${cosmeticId}`;
    let debited = false;
    let newBalance: number | undefined;

    if (getCoinProviderMode() === 'live') {
      if (!this.coinWalletService || !this.coinApiClient) {
        throw new BadRequestException('Ví Coin hiện chưa sẵn sàng.');
      }
      const treasuryDiscordId = this.coinApiClient.getTreasuryDiscordId();
      if (!treasuryDiscordId) {
        throw new BadRequestException(
          'Chưa cấu hình tài khoản Treasury nhận thanh toán Cosmetic.',
        );
      }
      const transfer = await this.coinWalletService.transferToDiscordId(
        userId,
        userId,
        treasuryDiscordId,
        price,
        idempotencyKey,
        `Mua trang bị BCN Arena (${cosmeticId})`,
      );
      debited = true;
      newBalance = transfer.senderBalance;
    } else {
      if (!this.mockWalletService) {
        throw new BadRequestException('Ví Coin hiện chưa sẵn sàng.');
      }
      const debit = await this.mockWalletService.debitPurchase({
        userId,
        amount: price,
        idempotencyKey,
        description: `Mua trang bị BCN Arena (${cosmeticId})`,
      });
      debited = debit.debited;
      newBalance = debit.balance;
    }

    const isBundle = !cosmeticId.includes(':');
    const bundlePieces = isBundle
      ? [
          `char:${cosmeticId}`,
          `banner:${cosmeticId}`,
          `frame:${cosmeticId}`,
          `nameplate:${cosmeticId}`,
        ]
      : [];
    const nextUnlocked = Array.from(
      new Set([...currentUnlocked, cosmeticId, ...bundlePieces]),
    );

    const nextEquippedTierId = isBundle
      ? cosmeticId
      : (existing?.equippedTierId ?? null);
    const nextCharacterId =
      isBundle || cosmeticId.startsWith('char:')
        ? cosmeticId
        : (existing?.equippedCharacterId ?? existing?.equippedTierId ?? null);
    const nextBannerId =
      isBundle || cosmeticId.startsWith('banner:')
        ? cosmeticId
        : (existing?.equippedBannerId ?? existing?.equippedTierId ?? null);
    const nextFrameId =
      isBundle || cosmeticId.startsWith('frame:')
        ? cosmeticId
        : (existing?.equippedFrameId ?? existing?.equippedTierId ?? null);
    const nextNameplateId =
      isBundle || cosmeticId.startsWith('nameplate:')
        ? cosmeticId
        : (existing?.equippedNameplateId ?? existing?.equippedTierId ?? null);

    await this.prisma.userCosmeticPreference.upsert({
      where: { userId },
      update: {
        unlockedCosmetics: nextUnlocked,
        equippedTierId: nextEquippedTierId,
        equippedCharacterId: nextCharacterId,
        equippedBannerId: nextBannerId,
        equippedFrameId: nextFrameId,
        equippedNameplateId: nextNameplateId,
      },
      create: {
        userId,
        unlockedCosmetics: nextUnlocked,
        equippedTierId: nextEquippedTierId,
        equippedCharacterId: nextCharacterId,
        equippedBannerId: nextBannerId,
        equippedFrameId: nextFrameId,
        equippedNameplateId: nextNameplateId,
        pinnedBadges: [],
      },
    });

    return {
      purchased: debited,
      alreadyOwned: false,
      cosmeticId,
      equippedTierId: nextEquippedTierId,
      equippedCharacterId: nextCharacterId,
      equippedBannerId: nextBannerId,
      equippedFrameId: nextFrameId,
      equippedNameplateId: nextNameplateId,
      unlockedCosmetics: nextUnlocked,
      newBalance,
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
            equippedCharacterId: true,
            equippedBannerId: true,
            equippedFrameId: true,
            equippedNameplateId: true,
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
    const equippedTierId = this.resolveValidCosmeticId(
      cosmeticPref?.equippedTierId ?? null,
      levelInfo.level,
      unlockedCosmetics,
    );

    return {
      userId: cleanId,
      totalXp,
      level: levelInfo.level,
      rankTitle: levelInfo.rankTitle,
      equippedTierId,
      equippedCharacterId: this.resolveValidCosmeticId(
        cosmeticPref?.equippedCharacterId ?? equippedTierId,
        levelInfo.level,
        unlockedCosmetics,
      ),
      equippedBannerId: this.resolveValidCosmeticId(
        cosmeticPref?.equippedBannerId ?? equippedTierId,
        levelInfo.level,
        unlockedCosmetics,
      ),
      equippedFrameId: this.resolveValidCosmeticId(
        cosmeticPref?.equippedFrameId ?? equippedTierId,
        levelInfo.level,
        unlockedCosmetics,
      ),
      equippedNameplateId: this.resolveValidCosmeticId(
        cosmeticPref?.equippedNameplateId ?? equippedTierId,
        levelInfo.level,
        unlockedCosmetics,
      ),
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
    const config = this.coinConfigService
      ? await this.coinConfigService.getConfig().catch(() => null)
      : null;
    const rewardCoins = config
      ? Math.min(config.dailyChestCoins, config.maxRewardCap)
      : DAILY_CHEST_REWARD_COINS;
    const day = businessDate(new Date());
    const idempotencyKey = `daily:chest:${userId}:${day}`;

    if (getCoinProviderMode() === 'live') {
      if (!this.coinTrackingService || !this.liveRewardAdapter) {
        return { claimed: false, alreadyClaimed: false, rewardCoins };
      }
      const res = await this.dispatchLiveXpReward({
        userId,
        amount: rewardCoins,
        idempotencyKey,
        source: CoinRewardSource.DAILY_QUEST,
        reason: `Rương Nhiệm vụ ngày (${day})`,
        referenceId: day,
        metadata: { kind: 'DAILY_CHEST', day },
      });
      return {
        claimed: res.credited,
        alreadyClaimed: res.alreadyProcessed,
        rewardCoins,
      };
    }

    if (!this.mockWalletService) {
      return {
        claimed: false,
        alreadyClaimed: false,
        rewardCoins,
      };
    }
    const res = await this.mockWalletService.creditReward({
      userId,
      amount: rewardCoins,
      idempotencyKey,
      source: 'DAILY_QUEST',
      description: `Rương Nhiệm vụ ngày (${day})`,
    });
    return {
      claimed: res.credited,
      alreadyClaimed: !res.credited,
      rewardCoins,
    };
  }

  private async syncLevelMilestoneCoins(
    userId: string,
    currentLevel: number,
  ): Promise<void> {
    const config = this.coinConfigService
      ? await this.coinConfigService.getConfig().catch(() => null)
      : null;
    const reached = LEVEL_MILESTONE_COIN_REWARDS.filter(
      (m) => currentLevel >= m.level,
    );

    for (const m of reached) {
      const configuredCoins = config?.levelMilestoneCoins?.[String(m.level)];
      const rawCoins =
        typeof configuredCoins === 'number' ? configuredCoins : m.coins;
      const amount = config
        ? Math.min(Math.max(1, rawCoins), config.maxRewardCap)
        : m.coins;
      const idempotencyKey = `level:milestone:${userId}:lv:${m.level}`;
      const description = `Thưởng đạt cột mốc Cấp ${m.level} (${m.title})`;

      if (getCoinProviderMode() === 'live') {
        await this.dispatchLiveXpReward({
          userId,
          amount,
          idempotencyKey,
          source: CoinRewardSource.LEVEL_UP,
          reason: description,
          referenceId: String(m.level),
          metadata: { level: m.level, title: m.title },
        }).catch(() => undefined);
      } else if (this.mockWalletService) {
        await this.mockWalletService
          .creditReward({
            userId,
            amount,
            idempotencyKey,
            source: 'LEVEL_UP',
            description,
          })
          .catch(() => undefined);
      }
    }
  }

  private async dispatchLiveXpReward(params: {
    userId: string;
    amount: number;
    idempotencyKey: string;
    source: CoinRewardSource;
    reason: string;
    referenceId: string;
    metadata: Record<string, unknown>;
  }): Promise<{ credited: boolean; alreadyProcessed: boolean }> {
    if (!this.coinTrackingService || !this.liveRewardAdapter) {
      return { credited: false, alreadyProcessed: false };
    }

    const prep = await this.liveRewardAdapter.preparePayload({
      userId: params.userId,
      amount: params.amount,
      idempotencyKey: params.idempotencyKey,
      source: params.source,
      description: params.reason,
      metadata: params.metadata,
    });

    if (!prep.ok || !prep.payload) {
      if (prep.errorCode === 'DISCORD_NOT_LINKED') {
        throw new BadRequestException({
          errorCode: prep.errorCode,
          message: prep.errorMessage,
        });
      }
      return { credited: false, alreadyProcessed: false };
    }

    const tracked = await this.coinTrackingService.recordPending({
      userId: params.userId,
      amount: prep.payload.amount,
      source: params.source,
      reason: params.reason,
      referenceId: params.referenceId,
      idempotencyKey: params.idempotencyKey,
      requestPayload: prep.payload,
    });

    if (tracked.status === 'SUCCESS') {
      return { credited: false, alreadyProcessed: true };
    }

    const res = await this.liveRewardAdapter.dispatchPayload(prep.payload);
    if (res.status === 'SUCCESS') {
      await this.coinTrackingService.recordSuccess(
        params.idempotencyKey,
        res.externalTxId,
        res.responsePayload,
      );
      return { credited: true, alreadyProcessed: false };
    }

    if (res.status === 'UNKNOWN' || res.status === 'PENDING') {
      await this.coinTrackingService.recordUnknown(
        params.idempotencyKey,
        res.errorMessage,
        res.responsePayload,
        res.errorCode,
      );
    } else {
      await this.coinTrackingService.recordFailed(
        params.idempotencyKey,
        res.errorMessage,
        res.responsePayload,
        res.errorCode,
      );
    }
    return { credited: false, alreadyProcessed: false };
  }

  /**
   * Idempotently promotes the configured test admin account to Level 70+
   * and unlocks all shop cosmetics so every tier, skin, banner, frame,
   * nameplate and badge can be equipped & verified in production.
   */
  private async ensureTestAdminUnlocked(userId: string): Promise<void> {
    const sourceKey = 'migration:test-lv70:tuanhungvip12@gmail.com';
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
    if (!existing) {
      const targetXp = totalXpForLevel(70);
      const agg = await this.prisma.userXpEvent.aggregate({
        where: { userId },
        _sum: { amount: true },
      });
      const currentXp = agg._sum.amount ?? 0;
      if (currentXp < targetXp) {
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
          if (!(
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002'
          )) {
            throw err;
          }
        }
      }
    }

    const allShopIds = Object.keys(SHOP_COSMETIC_PRICES);
    const pref = await this.prisma.userCosmeticPreference
      .findUnique({
        where: { userId },
        select: { unlockedCosmetics: true },
      })
      .catch(() => null);
    const currentUnlocked = pref?.unlockedCosmetics ?? [];
    const hasAll = allShopIds.every((id) => currentUnlocked.includes(id));
    if (!hasAll) {
      const merged = Array.from(new Set([...currentUnlocked, ...allShopIds]));
      await this.prisma.userCosmeticPreference
        .upsert({
          where: { userId },
          update: { unlockedCosmetics: merged },
          create: {
            userId,
            unlockedCosmetics: merged,
            pinnedBadges: [],
          },
        })
        .catch(() => undefined);
    }
  }
}
