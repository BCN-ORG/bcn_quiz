import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { CoinRewardSource, ConsumableType, Prisma } from '@prisma/client';
import { CoinApiClient, getCoinProviderMode } from '../coin/coin-api.client';
import { CoinTrackingService } from '../coin/coin-tracking.service';
import { LiveCoinRewardAdapter } from '../coin/live-coin-reward.adapter';
import { businessDate } from '../leaderboard/leaderboard-rules';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';
import { CoinWalletService } from '../wallet/coin-wallet.interface';
import { MockCoinWalletService } from '../wallet/mock-coin-wallet.service';
import {
  SEASON_PASS_MAX_TIERS,
  SEASON_PASS_PREMIUM_PRICE_COINS,
  SEASON_PASS_TIER_XP,
  SEASON_PASS_TIERS,
  SeasonTierReward,
} from './season-pass.constants';

@Injectable()
export class SeasonPassService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly mockWalletService?: MockCoinWalletService,
    @Optional() private readonly coinWalletService?: CoinWalletService,
    @Optional() private readonly coinApiClient?: CoinApiClient,
    @Optional() private readonly coinTrackingService?: CoinTrackingService,
    @Optional() private readonly liveRewardAdapter?: LiveCoinRewardAdapter,
    @Optional() private readonly profilesService?: ProfilesService,
  ) {}

  async ensureCurrentSeason(now: Date = new Date()) {
    const active = await this.prisma.seasonPass.findFirst({
      where: { isActive: true, endsAt: { gt: now } },
      orderBy: { startsAt: 'desc' },
    });
    if (active) return active;

    const vnDay = businessDate(now); // YYYY-MM-DD
    const [y, m] = vnDay.split('-').map(Number);
    const code = `${y}-${String(m).padStart(2, '0')}`;
    const startsAt = new Date(
      `${y}-${String(m).padStart(2, '0')}-01T00:00:00.000+07:00`,
    );
    const nextMonthY = m === 12 ? y + 1 : y;
    const nextMonthM = m === 12 ? 1 : m + 1;
    const endsAt = new Date(
      `${nextMonthY}-${String(nextMonthM).padStart(2, '0')}-01T00:00:00.000+07:00`,
    );

    const existing = await this.prisma.seasonPass.findUnique({
      where: { code },
    });
    if (existing) return existing;

    return this.prisma.seasonPass.create({
      data: {
        code,
        title: `Mùa Giải Tháng ${m}/${y}`,
        startsAt,
        endsAt,
        premiumPriceCoins: SEASON_PASS_PREMIUM_PRICE_COINS,
        isActive: true,
      },
    });
  }

  async getCurrentProgress(userId: string, now: Date = new Date()) {
    const season = await this.ensureCurrentSeason(now);
    const [xpAgg, progress] = await Promise.all([
      this.prisma.userXpEvent.aggregate({
        where: {
          userId,
          createdAt: { gte: season.startsAt, lt: season.endsAt },
        },
        _sum: { amount: true },
      }),
      this.prisma.userSeasonProgress.findUnique({
        where: { userId_seasonId: { userId, seasonId: season.id } },
      }),
    ]);

    const seasonXp = Math.max(
      0,
      (xpAgg._sum.amount ?? 0) + (progress?.seasonXp ?? 0),
    );
    const currentTier = Math.min(
      SEASON_PASS_MAX_TIERS,
      Math.floor(seasonXp / SEASON_PASS_TIER_XP),
    );

    return {
      season: {
        id: season.id,
        code: season.code,
        title: season.title,
        startsAt: season.startsAt.toISOString(),
        endsAt: season.endsAt.toISOString(),
        premiumPriceCoins: season.premiumPriceCoins,
      },
      seasonXp,
      tierXpStep: SEASON_PASS_TIER_XP,
      currentTier,
      maxTiers: SEASON_PASS_MAX_TIERS,
      isPremium: progress?.isPremium ?? false,
      claimedFreeTiers: progress?.claimedFreeTiers ?? [],
      claimedPremiumTiers: progress?.claimedPremiumTiers ?? [],
      tiers: SEASON_PASS_TIERS,
    };
  }

  async upgradePremium(userId: string) {
    const season = await this.ensureCurrentSeason();
    const existing = await this.prisma.userSeasonProgress.findUnique({
      where: { userId_seasonId: { userId, seasonId: season.id } },
    });
    if (existing?.isPremium) {
      return { upgraded: false, alreadyPremium: true, seasonCode: season.code };
    }

    const idempotencyKey = `season:premium:${season.code}:${userId}`;
    const newBalance = await this.debitCoins(
      userId,
      season.premiumPriceCoins,
      idempotencyKey,
      `Nâng cấp Season Pass Premium (${season.title})`,
    );

    await this.prisma.userSeasonProgress.upsert({
      where: { userId_seasonId: { userId, seasonId: season.id } },
      update: { isPremium: true },
      create: {
        userId,
        seasonId: season.id,
        isPremium: true,
        claimedFreeTiers: [],
        claimedPremiumTiers: [],
      },
    });

    return {
      upgraded: true,
      alreadyPremium: false,
      seasonCode: season.code,
      newBalance,
    };
  }

  async claimTier(userId: string, tier: number, track: 'free' | 'premium') {
    const cfg = SEASON_PASS_TIERS.find((t) => t.tier === tier);
    if (!cfg) {
      throw new BadRequestException('Bậc Season Pass không hợp lệ.');
    }

    const state = await this.getCurrentProgress(userId);
    if (state.currentTier < tier) {
      throw new BadRequestException(
        `Cần đạt bậc ${tier} (${cfg.requiredXp} XP mùa) để nhận thưởng.`,
      );
    }
    if (track === 'premium' && !state.isPremium) {
      throw new BadRequestException(
        'Cần mở khóa Premium Season Pass để nhận phần thưởng nhánh Cao cấp.',
      );
    }

    const reward = track === 'free' ? cfg.free : cfg.premium;
    const lockKey = `season:claim:${state.season.id}:${userId}:${tier}:${track}`;

    const acquired = await this.prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === 'function') {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      }
      const fresh = await tx.userSeasonProgress.findUnique({
        where: { userId_seasonId: { userId, seasonId: state.season.id } },
      });
      const currentClaimed =
        track === 'free'
          ? (fresh?.claimedFreeTiers ?? [])
          : (fresh?.claimedPremiumTiers ?? []);
      if (currentClaimed.includes(tier)) {
        return false;
      }
      const nextClaimed = Array.from(new Set([...currentClaimed, tier])).sort(
        (a, b) => a - b,
      );
      await tx.userSeasonProgress.upsert({
        where: { userId_seasonId: { userId, seasonId: state.season.id } },
        update:
          track === 'free'
            ? { claimedFreeTiers: nextClaimed }
            : { claimedPremiumTiers: nextClaimed },
        create: {
          userId,
          seasonId: state.season.id,
          seasonXp: 0,
          isPremium: fresh?.isPremium ?? state.isPremium,
          claimedFreeTiers: track === 'free' ? nextClaimed : [],
          claimedPremiumTiers: track === 'premium' ? nextClaimed : [],
        },
      });
      return true;
    });

    if (!acquired) {
      return { claimed: false, alreadyClaimed: true, tier, track };
    }

    await this.grantReward(
      userId,
      reward,
      `season:${state.season.code}:${userId}:t${tier}:${track}`,
      `${state.season.title} - Bậc ${tier} (${track === 'premium' ? 'Premium' : 'Free'})`,
    );

    return {
      claimed: true,
      alreadyClaimed: false,
      tier,
      track,
      reward,
    };
  }

  private async grantReward(
    userId: string,
    reward: SeasonTierReward,
    idempotencyKey: string,
    reason: string,
  ): Promise<void> {
    if (reward.type === 'COIN' && reward.amount && reward.amount > 0) {
      await this.creditCoins(userId, reward.amount, idempotencyKey, reason);
      return;
    }
    if (reward.type === 'CONSUMABLE' && reward.itemType) {
      if (reward.itemType === ConsumableType.XP_BOOST_2X) {
        const cur = await this.prisma.userInventoryItem
          .findUnique({
            where: { userId_itemType: { userId, itemType: reward.itemType } },
          })
          .catch(() => null);
        const baseMs =
          cur?.activeUntil && cur.activeUntil.getTime() > Date.now()
            ? cur.activeUntil.getTime()
            : Date.now();
        await this.prisma.userInventoryItem.upsert({
          where: { userId_itemType: { userId, itemType: reward.itemType } },
          update: {
            activeUntil: new Date(baseMs + 24 * 3600_000),
            quantity: { increment: 1 },
          },
          create: {
            userId,
            itemType: reward.itemType,
            quantity: 1,
            activeUntil: new Date(baseMs + 24 * 3600_000),
          },
        });
      } else {
        await this.prisma.userInventoryItem.upsert({
          where: { userId_itemType: { userId, itemType: reward.itemType } },
          update: { quantity: { increment: 1 } },
          create: { userId, itemType: reward.itemType, quantity: 1 },
        });
      }
      return;
    }
    if (reward.type === 'COSMETIC' && reward.cosmeticId) {
      const pref = await this.prisma.userCosmeticPreference
        .findUnique({ where: { userId }, select: { unlockedCosmetics: true } })
        .catch(() => null);
      const isBundle = !reward.cosmeticId.includes(':');
      const pieces = isBundle
        ? [
            `char:${reward.cosmeticId}`,
            `banner:${reward.cosmeticId}`,
            `frame:${reward.cosmeticId}`,
            `nameplate:${reward.cosmeticId}`,
          ]
        : [];
      const merged = Array.from(
        new Set([
          ...(pref?.unlockedCosmetics ?? []),
          reward.cosmeticId,
          ...pieces,
        ]),
      );
      await this.prisma.userCosmeticPreference.upsert({
        where: { userId },
        update: { unlockedCosmetics: merged },
        create: { userId, unlockedCosmetics: merged, pinnedBadges: [] },
      });
    }
  }

  private async debitCoins(
    userId: string,
    amount: number,
    idempotencyKey: string,
    description: string,
  ): Promise<number | undefined> {
    if (getCoinProviderMode() === 'live') {
      if (!this.coinWalletService || !this.coinApiClient) {
        throw new BadRequestException('Ví Coin hiện chưa sẵn sàng.');
      }
      const treasury = this.coinApiClient.getTreasuryDiscordId();
      if (!treasury) {
        throw new BadRequestException(
          'Chưa cấu hình tài khoản Treasury nhận thanh toán.',
        );
      }
      const res = await this.coinWalletService.transferToDiscordId(
        userId,
        userId,
        treasury,
        amount,
        idempotencyKey,
        description,
      );
      return res.senderBalance;
    }
    if (!this.mockWalletService) {
      throw new BadRequestException('Ví Coin hiện chưa sẵn sàng.');
    }
    const res = await this.mockWalletService.debitPurchase({
      userId,
      amount,
      idempotencyKey,
      description,
    });
    return res.balance;
  }

  private async creditCoins(
    userId: string,
    amount: number,
    idempotencyKey: string,
    reason: string,
  ): Promise<void> {
    if (getCoinProviderMode() === 'live') {
      if (!this.liveRewardAdapter || !this.coinTrackingService) return;
      const prep = await this.liveRewardAdapter.preparePayload({
        userId,
        amount,
        idempotencyKey,
        source: CoinRewardSource.SEASON_PASS,
        description: reason,
        metadata: { kind: 'SEASON_PASS' },
      });
      if (!prep.ok || !prep.payload) return;
      const tracked = await this.coinTrackingService.recordPending({
        userId,
        amount: prep.payload.amount,
        source: CoinRewardSource.SEASON_PASS,
        reason,
        referenceId: idempotencyKey,
        idempotencyKey,
        requestPayload: prep.payload,
      });
      if (tracked.status === 'SUCCESS') return;
      const res = await this.liveRewardAdapter.dispatchPayload(prep.payload);
      if (res.status === 'SUCCESS') {
        await this.coinTrackingService.recordSuccess(
          idempotencyKey,
          res.externalTxId,
          res.responsePayload,
        );
      }
      return;
    }
    if (this.mockWalletService) {
      await this.mockWalletService.creditReward({
        userId,
        amount,
        idempotencyKey,
        source: 'SEASON_PASS',
        description: reason,
      });
    }
  }

  // --------------------------------------------------------------------------
  // ADMIN MANAGEMENT
  // --------------------------------------------------------------------------

  async listAdminSeasons() {
    await this.ensureCurrentSeason();
    const seasons = await this.prisma.seasonPass.findMany({
      include: {
        _count: { select: { progresses: true } },
        progresses: {
          where: { isPremium: true },
          select: { id: true },
        },
      },
      orderBy: [{ isActive: 'desc' }, { startsAt: 'desc' }],
    });

    return seasons.map((s) => ({
      id: s.id,
      code: s.code,
      title: s.title,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      premiumPriceCoins: s.premiumPriceCoins,
      isActive: s.isActive,
      participantCount: s._count.progresses,
      premiumCount: s.progresses.length,
    }));
  }

  async createAdminSeason(dto: {
    code: string;
    title: string;
    startsAt: string;
    endsAt: string;
    premiumPriceCoins?: number;
    isActive?: boolean;
  }) {
    const code = typeof dto.code === 'string' ? dto.code.trim() : '';
    const title = typeof dto.title === 'string' ? dto.title.trim() : '';
    if (code.length < 2 || code.length > 32) {
      throw new BadRequestException('Mã mùa phải từ 2 đến 32 ký tự.');
    }
    if (title.length < 3 || title.length > 80) {
      throw new BadRequestException('Tên mùa phải từ 3 đến 80 ký tự.');
    }
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt <= startsAt
    ) {
      throw new BadRequestException(
        'Thời gian kết thúc phải lớn hơn thời gian bắt đầu.',
      );
    }
    const rawPrice =
      dto.premiumPriceCoins !== undefined
        ? Number(dto.premiumPriceCoins)
        : SEASON_PASS_PREMIUM_PRICE_COINS;
    if (!Number.isFinite(rawPrice) || rawPrice < 0 || rawPrice > 100000) {
      throw new BadRequestException(
        'Giá gói Premium phải là số không âm (tối đa 100.000 Coin).',
      );
    }
    const price = Math.floor(rawPrice);
    const isActive = Boolean(dto.isActive);

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (isActive) {
          await tx.seasonPass.updateMany({
            where: { isActive: true },
            data: { isActive: false },
          });
        }
        return tx.seasonPass.create({
          data: {
            code,
            title,
            startsAt,
            endsAt,
            premiumPriceCoins: price,
            isActive,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('Mã mùa Season Pass đã tồn tại.');
      }
      throw error;
    }
  }

  async updateAdminSeason(
    id: string,
    dto: {
      title?: string;
      startsAt?: string;
      endsAt?: string;
      premiumPriceCoins?: number;
      isActive?: boolean;
    },
  ) {
    const existing = await this.prisma.seasonPass.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy mùa Season Pass.');
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : existing.endsAt;
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt <= startsAt
    ) {
      throw new BadRequestException(
        'Thời gian kết thúc phải lớn hơn thời gian bắt đầu.',
      );
    }

    const title =
      dto.title !== undefined
        ? typeof dto.title === 'string'
          ? dto.title.trim()
          : ''
        : existing.title;
    if (title.length < 3 || title.length > 80) {
      throw new BadRequestException('Tên mùa phải từ 3 đến 80 ký tự.');
    }
    let premiumPriceCoins = existing.premiumPriceCoins;
    if (dto.premiumPriceCoins !== undefined) {
      const rawPrice = Number(dto.premiumPriceCoins);
      if (!Number.isFinite(rawPrice) || rawPrice < 0 || rawPrice > 100000) {
        throw new BadRequestException(
          'Giá gói Premium phải là số không âm (tối đa 100.000 Coin).',
        );
      }
      premiumPriceCoins = Math.floor(rawPrice);
    }
    const isActive =
      dto.isActive !== undefined ? Boolean(dto.isActive) : existing.isActive;

    return this.prisma.$transaction(async (tx) => {
      if (isActive) {
        await tx.seasonPass.updateMany({
          where: { isActive: true, id: { not: id } },
          data: { isActive: false },
        });
      }
      return tx.seasonPass.update({
        where: { id },
        data: { title, startsAt, endsAt, premiumPriceCoins, isActive },
      });
    });
  }

  async listAdminParticipants(seasonId: string, page = 1, limit = 20) {
    const season = await this.prisma.seasonPass.findUnique({
      where: { id: seasonId },
    });
    if (!season) {
      throw new NotFoundException('Không tìm thấy mùa Season Pass.');
    }
    const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
    const safeLimit = Number.isFinite(limit)
      ? Math.min(50, Math.max(1, Math.floor(limit)))
      : 20;
    const [total, rows] = await Promise.all([
      this.prisma.userSeasonProgress.count({ where: { seasonId } }),
      this.prisma.userSeasonProgress.findMany({
        where: { seasonId },
        orderBy: [{ isPremium: 'desc' }, { updatedAt: 'desc' }],
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
    ]);

    const userIds = rows.map((r) => r.userId);
    const profiles =
      this.profilesService && userIds.length > 0
        ? await this.profilesService
            .resolveUsers(userIds)
            .catch(() => new Map())
        : new Map();

    const xpEvents =
      userIds.length > 0
        ? await this.prisma.userXpEvent.groupBy({
            by: ['userId'],
            where: {
              userId: { in: userIds },
              createdAt: { gte: season.startsAt, lt: season.endsAt },
            },
            _sum: { amount: true },
          })
        : [];
    const xpMap = new Map(xpEvents.map((e) => [e.userId, e._sum.amount ?? 0]));

    return {
      season: { id: season.id, code: season.code, title: season.title },
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
      items: rows.map((r) => {
        const prof = profiles.get(r.userId);
        const totalXp = Math.max(0, (xpMap.get(r.userId) ?? 0) + r.seasonXp);
        return {
          userId: r.userId,
          fullName: prof?.fullName ?? null,
          email: prof?.email ?? null,
          isPremium: r.isPremium,
          bonusXp: r.seasonXp,
          totalXp,
          currentTier: Math.min(
            SEASON_PASS_MAX_TIERS,
            Math.floor(totalXp / SEASON_PASS_TIER_XP),
          ),
          claimedFreeCount: r.claimedFreeTiers.length,
          claimedPremiumCount: r.claimedPremiumTiers.length,
          updatedAt: r.updatedAt.toISOString(),
        };
      }),
    };
  }

  async grantAdminBenefit(
    seasonId: string,
    dto: { userId: string; isPremium?: boolean; bonusXpDelta?: number },
  ) {
    const season = await this.prisma.seasonPass.findUnique({
      where: { id: seasonId },
    });
    if (!season) {
      throw new NotFoundException('Không tìm thấy mùa Season Pass.');
    }
    const userId = typeof dto.userId === 'string' ? dto.userId.trim() : '';
    if (!userId) {
      throw new BadRequestException('Thiếu userId học viên.');
    }
    const rawDelta =
      dto.bonusXpDelta !== undefined ? Number(dto.bonusXpDelta) : 0;
    if (!Number.isFinite(rawDelta) || rawDelta < -100000 || rawDelta > 100000) {
      throw new BadRequestException('Season XP cộng/trừ không hợp lệ.');
    }
    const delta = Math.floor(rawDelta);

    const existing = await this.prisma.userSeasonProgress.findUnique({
      where: { userId_seasonId: { userId, seasonId } },
    });

    const nextPremium =
      dto.isPremium !== undefined
        ? Boolean(dto.isPremium)
        : (existing?.isPremium ?? false);
    const nextBonusXp = Math.max(0, (existing?.seasonXp ?? 0) + delta);

    return this.prisma.userSeasonProgress.upsert({
      where: { userId_seasonId: { userId, seasonId } },
      update: { isPremium: nextPremium, seasonXp: nextBonusXp },
      create: {
        userId,
        seasonId,
        isPremium: nextPremium,
        seasonXp: nextBonusXp,
        claimedFreeTiers: [],
        claimedPremiumTiers: [],
      },
    });
  }
}
