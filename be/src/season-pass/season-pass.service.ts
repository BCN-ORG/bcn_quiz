import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { CoinRewardSource, ConsumableType } from '@prisma/client';
import { CoinApiClient, getCoinProviderMode } from '../coin/coin-api.client';
import { CoinTrackingService } from '../coin/coin-tracking.service';
import { LiveCoinRewardAdapter } from '../coin/live-coin-reward.adapter';
import { businessDate } from '../leaderboard/leaderboard-rules';
import { PrismaService } from '../prisma/prisma.service';
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
  ) {}

  async ensureCurrentSeason(now: Date = new Date()) {
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

    const seasonXp = Math.max(0, xpAgg._sum.amount ?? 0);
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
            ? { claimedFreeTiers: nextClaimed, seasonXp: state.seasonXp }
            : { claimedPremiumTiers: nextClaimed, seasonXp: state.seasonXp },
        create: {
          userId,
          seasonId: state.season.id,
          seasonXp: state.seasonXp,
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
}
