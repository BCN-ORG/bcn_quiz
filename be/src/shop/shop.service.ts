import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { CoinRewardSource, ConsumableType } from '@prisma/client';
import { CoinApiClient, getCoinProviderMode } from '../coin/coin-api.client';
import { CoinTrackingService } from '../coin/coin-tracking.service';
import { LiveCoinRewardAdapter } from '../coin/live-coin-reward.adapter';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';
import { CoinWalletService } from '../wallet/coin-wallet.interface';
import { MockCoinWalletService } from '../wallet/mock-coin-wallet.service';
import {
  CONSUMABLE_CATALOG,
  MAX_STREAK_FREEZE_QTY,
  MYSTERY_CHEST_COST_COINS,
  MYSTERY_CHEST_DUPLICATE_REFUND_COINS,
  MYSTERY_CHEST_PITY_THRESHOLD,
  MYSTERY_CHEST_POOL,
  MysteryChestPoolItem,
} from './shop.constants';

@Injectable()
export class ShopService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly mockWalletService?: MockCoinWalletService,
    @Optional() private readonly coinWalletService?: CoinWalletService,
    @Optional() private readonly coinApiClient?: CoinApiClient,
    @Optional() private readonly coinTrackingService?: CoinTrackingService,
    @Optional() private readonly liveRewardAdapter?: LiveCoinRewardAdapter,
    @Optional() private readonly profilesService?: ProfilesService,
  ) {}

  async getInventory(userId: string) {
    const [items, lastRoll] = await Promise.all([
      this.prisma.userInventoryItem.findMany({ where: { userId } }).catch(
        () =>
          [] as Array<{
            itemType: ConsumableType;
            quantity: number;
            activeUntil: Date | null;
          }>,
      ),
      this.prisma.mysteryChestRoll
        .findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          select: { pityCountAfter: true },
        })
        .catch(() => null),
    ]);

    const freeze = items.find(
      (i) => i.itemType === ConsumableType.STREAK_FREEZE,
    );
    const boost = items.find((i) => i.itemType === ConsumableType.XP_BOOST_2X);
    const now = Date.now();
    const xpBoostActiveUntil =
      boost?.activeUntil && boost.activeUntil.getTime() > now
        ? boost.activeUntil.toISOString()
        : null;

    return {
      streakFreezeCount: freeze?.quantity ?? 0,
      maxStreakFreeze: MAX_STREAK_FREEZE_QTY,
      xpBoostActiveUntil,
      xpBoostActive: Boolean(xpBoostActiveUntil),
      mysteryChest: {
        costCoins: MYSTERY_CHEST_COST_COINS,
        duplicateRefundCoins: MYSTERY_CHEST_DUPLICATE_REFUND_COINS,
        pityCount: lastRoll?.pityCountAfter ?? 0,
        pityThreshold: MYSTERY_CHEST_PITY_THRESHOLD,
      },
      catalog: Object.values(CONSUMABLE_CATALOG),
    };
  }

  async purchaseConsumable(
    userId: string,
    itemType: ConsumableType,
    idempotencyKey?: string,
  ) {
    const item = CONSUMABLE_CATALOG[itemType];
    if (!item) {
      throw new BadRequestException('Vật phẩm không hợp lệ.');
    }

    const existing = await this.prisma.userInventoryItem
      .findUnique({
        where: { userId_itemType: { userId, itemType } },
      })
      .catch(() => null);

    if (
      itemType === ConsumableType.STREAK_FREEZE &&
      (existing?.quantity ?? 0) >= MAX_STREAK_FREEZE_QTY
    ) {
      throw new BadRequestException(
        `Bạn đã đạt giới hạn tối đa ${MAX_STREAK_FREEZE_QTY} Khiên Giữ Chuỗi.`,
      );
    }

    const key =
      idempotencyKey?.trim() ||
      `shop:consumable:${userId}:${itemType}:${Date.now()}`;
    const newBalance = await this.debitUserCoins(
      userId,
      item.priceCoins,
      key,
      `Mua vật phẩm: ${item.name}`,
    );

    if (itemType === ConsumableType.STREAK_FREEZE) {
      const updated = await this.prisma.userInventoryItem.upsert({
        where: { userId_itemType: { userId, itemType } },
        update: { quantity: { increment: 1 } },
        create: { userId, itemType, quantity: 1 },
      });
      return {
        purchased: true,
        itemType,
        quantity: updated.quantity,
        activeUntil: null,
        newBalance,
      };
    }

    const hours = item.durationHours ?? 24;
    const baseMs =
      existing?.activeUntil && existing.activeUntil.getTime() > Date.now()
        ? existing.activeUntil.getTime()
        : Date.now();
    const nextActiveUntil = new Date(baseMs + hours * 3600_000);

    const updated = await this.prisma.userInventoryItem.upsert({
      where: { userId_itemType: { userId, itemType } },
      update: { activeUntil: nextActiveUntil, quantity: { increment: 1 } },
      create: {
        userId,
        itemType,
        quantity: 1,
        activeUntil: nextActiveUntil,
      },
    });

    return {
      purchased: true,
      itemType,
      quantity: updated.quantity,
      activeUntil: updated.activeUntil?.toISOString() ?? null,
      newBalance,
    };
  }

  async openMysteryChest(userId: string, idempotencyKey?: string) {
    const key =
      idempotencyKey?.trim() || `shop:mystery:${userId}:${Date.now()}`;

    const existingRoll = await this.prisma.mysteryChestRoll
      .findUnique({ where: { idempotencyKey: key } })
      .catch(() => null);
    if (existingRoll) {
      return {
        alreadyProcessed: true,
        roll: existingRoll,
      };
    }

    const newBalance = await this.debitUserCoins(
      userId,
      MYSTERY_CHEST_COST_COINS,
      key,
      'Mở Rương Bí Ẩn BCN Arena',
    );

    const [pref, lastRoll] = await Promise.all([
      this.prisma.userCosmeticPreference
        .findUnique({
          where: { userId },
          select: { unlockedCosmetics: true },
        })
        .catch(() => null),
      this.prisma.mysteryChestRoll
        .findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          select: { pityCountAfter: true },
        })
        .catch(() => null),
    ]);

    const unlocked = pref?.unlockedCosmetics ?? [];
    const currentPity = lastRoll?.pityCountAfter ?? 0;
    const isPityTrigger = currentPity + 1 >= MYSTERY_CHEST_PITY_THRESHOLD;

    const picked = this.pickReward(unlocked, isPityTrigger);
    let isDuplicate = false;
    let refundCoins = 0;

    if (picked.rewardType === 'COSMETIC') {
      const baseId = picked.rewardId.replace(
        /^(char|banner|frame|nameplate):/,
        '',
      );
      if (unlocked.includes(picked.rewardId) || unlocked.includes(baseId)) {
        isDuplicate = true;
        refundCoins = MYSTERY_CHEST_DUPLICATE_REFUND_COINS;
        await this.creditRefundCoins(
          userId,
          refundCoins,
          `refund:${key}`,
          `Hoàn Coin trùng Rương Bí Ẩn (${picked.rewardLabel})`,
        );
      } else {
        const merged = Array.from(new Set([...unlocked, picked.rewardId]));
        await this.prisma.userCosmeticPreference.upsert({
          where: { userId },
          update: { unlockedCosmetics: merged },
          create: {
            userId,
            unlockedCosmetics: merged,
            pinnedBadges: [],
          },
        });
      }
    } else if (picked.rewardType === 'CONSUMABLE') {
      const itemType = picked.rewardId as ConsumableType;
      if (itemType === ConsumableType.XP_BOOST_2X) {
        const cur = await this.prisma.userInventoryItem
          .findUnique({
            where: { userId_itemType: { userId, itemType } },
          })
          .catch(() => null);
        const baseMs =
          cur?.activeUntil && cur.activeUntil.getTime() > Date.now()
            ? cur.activeUntil.getTime()
            : Date.now();
        await this.prisma.userInventoryItem.upsert({
          where: { userId_itemType: { userId, itemType } },
          update: {
            activeUntil: new Date(baseMs + 24 * 3600_000),
            quantity: { increment: 1 },
          },
          create: {
            userId,
            itemType,
            quantity: 1,
            activeUntil: new Date(baseMs + 24 * 3600_000),
          },
        });
      } else {
        await this.prisma.userInventoryItem.upsert({
          where: { userId_itemType: { userId, itemType } },
          update: { quantity: { increment: 1 } },
          create: { userId, itemType, quantity: 1 },
        });
      }
    } else if (picked.rewardType === 'COIN') {
      refundCoins = 120;
      await this.creditRefundCoins(
        userId,
        refundCoins,
        `jackpot:${key}`,
        'Thưởng Rương Bí Ẩn (Đã sở hữu toàn bộ vật phẩm hiếm)',
      );
    }

    const pityCountAfter =
      picked.rare && !isDuplicate
        ? 0
        : (currentPity + 1) % MYSTERY_CHEST_PITY_THRESHOLD;

    const roll = await this.prisma.mysteryChestRoll.create({
      data: {
        userId,
        idempotencyKey: key,
        costCoins: MYSTERY_CHEST_COST_COINS,
        rewardType: picked.rewardType,
        rewardId: picked.rewardId,
        rewardLabel: picked.rewardLabel,
        isDuplicate,
        refundCoins,
        pityCountAfter,
      },
    });

    return {
      alreadyProcessed: false,
      roll,
      newBalance,
    };
  }

  private pickReward(
    unlocked: string[],
    forceUnownedRare: boolean,
  ): MysteryChestPoolItem {
    if (forceUnownedRare) {
      const unownedRares = MYSTERY_CHEST_POOL.filter((item) => {
        if (item.rewardType !== 'COSMETIC') return false;
        const base = item.rewardId.replace(
          /^(char|banner|frame|nameplate):/,
          '',
        );
        return !unlocked.includes(item.rewardId) && !unlocked.includes(base);
      });
      if (unownedRares.length > 0) {
        return unownedRares[Math.floor(Math.random() * unownedRares.length)];
      }
      return {
        rewardType: 'COIN',
        rewardId: 'coin:120',
        rewardLabel: 'Kho Báu 120 Coin (Pity)',
        weight: 1,
        rare: true,
      };
    }

    const totalWeight = MYSTERY_CHEST_POOL.reduce((s, i) => s + i.weight, 0);
    let r = Math.random() * totalWeight;
    for (const item of MYSTERY_CHEST_POOL) {
      r -= item.weight;
      if (r <= 0) return item;
    }
    return MYSTERY_CHEST_POOL[0];
  }

  private async debitUserCoins(
    userId: string,
    amount: number,
    idempotencyKey: string,
    description: string,
  ): Promise<number | undefined> {
    if (getCoinProviderMode() === 'live') {
      if (!this.coinWalletService || !this.coinApiClient) {
        throw new BadRequestException('Ví Coin hiện chưa sẵn sàng.');
      }
      const treasuryDiscordId = this.coinApiClient.getTreasuryDiscordId();
      if (!treasuryDiscordId) {
        throw new BadRequestException(
          'Chưa cấu hình tài khoản Treasury nhận thanh toán.',
        );
      }
      const transfer = await this.coinWalletService.transferToDiscordId(
        userId,
        userId,
        treasuryDiscordId,
        amount,
        idempotencyKey,
        description,
      );
      return transfer.senderBalance;
    }

    if (!this.mockWalletService) {
      throw new BadRequestException('Ví Coin hiện chưa sẵn sàng.');
    }
    const debit = await this.mockWalletService.debitPurchase({
      userId,
      amount,
      idempotencyKey,
      description,
    });
    return debit.balance;
  }

  private async creditRefundCoins(
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
        source: CoinRewardSource.MYSTERY_CHEST_REFUND,
        description: reason,
        metadata: { kind: 'MYSTERY_CHEST_REFUND' },
      });
      if (!prep.ok || !prep.payload) return;
      await this.coinTrackingService.recordPending({
        userId,
        amount: prep.payload.amount,
        source: CoinRewardSource.MYSTERY_CHEST_REFUND,
        reason,
        referenceId: idempotencyKey,
        idempotencyKey,
        requestPayload: prep.payload,
      });
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
        source: 'MYSTERY_CHEST_REFUND',
        description: reason,
      });
    }
  }

  // --------------------------------------------------------------------------
  // ADMIN OVERVIEW & SUPPORT GRANT
  // --------------------------------------------------------------------------

  async getAdminOverview() {
    const [rollAgg, duplicateCount, recentRolls, activeBoostCount] =
      await Promise.all([
        this.prisma.mysteryChestRoll.aggregate({
          _count: { _all: true },
          _sum: { costCoins: true, refundCoins: true },
        }),
        this.prisma.mysteryChestRoll.count({ where: { isDuplicate: true } }),
        this.prisma.mysteryChestRoll.findMany({
          orderBy: { createdAt: 'desc' },
          take: 30,
        }),
        this.prisma.userInventoryItem.count({
          where: {
            itemType: ConsumableType.XP_BOOST_2X,
            activeUntil: { gt: new Date() },
          },
        }),
      ]);

    const userIds = Array.from(new Set(recentRolls.map((r) => r.userId)));
    const profiles =
      this.profilesService && userIds.length > 0
        ? await this.profilesService
            .resolveUsers(userIds)
            .catch(() => new Map())
        : new Map();

    const totalWeight = MYSTERY_CHEST_POOL.reduce((s, p) => s + p.weight, 0);

    return {
      stats: {
        totalRolls: rollAgg._count._all,
        duplicateRolls: duplicateCount,
        totalCoinsSpent: rollAgg._sum.costCoins ?? 0,
        totalCoinsRefunded: rollAgg._sum.refundCoins ?? 0,
        activeXpBoostUsers: activeBoostCount,
      },
      catalog: Object.values(CONSUMABLE_CATALOG),
      mysteryChest: {
        costCoins: MYSTERY_CHEST_COST_COINS,
        duplicateRefundCoins: MYSTERY_CHEST_DUPLICATE_REFUND_COINS,
        pityThreshold: MYSTERY_CHEST_PITY_THRESHOLD,
        pool: MYSTERY_CHEST_POOL.map((p) => ({
          ...p,
          chancePercent: Number(((p.weight / totalWeight) * 100).toFixed(1)),
        })),
      },
      recentRolls: recentRolls.map((r) => ({
        id: r.id,
        userId: r.userId,
        fullName: profiles.get(r.userId)?.fullName ?? r.userId,
        costCoins: r.costCoins,
        rewardType: r.rewardType,
        rewardLabel: r.rewardLabel,
        isDuplicate: r.isDuplicate,
        refundCoins: r.refundCoins,
        pityCountAfter: r.pityCountAfter,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async grantAdminConsumable(dto: {
    userId: string;
    itemType: ConsumableType;
    amount?: number;
  }) {
    const userId = typeof dto.userId === 'string' ? dto.userId.trim() : '';
    if (!userId) {
      throw new BadRequestException('Thiếu userId học viên.');
    }
    if (
      dto.itemType !== ConsumableType.STREAK_FREEZE &&
      dto.itemType !== ConsumableType.XP_BOOST_2X
    ) {
      throw new BadRequestException('Loại vật phẩm không hợp lệ.');
    }

    const rawAmount = dto.amount !== undefined ? Number(dto.amount) : 1;
    if (!Number.isFinite(rawAmount) || rawAmount < 1 || rawAmount > 72) {
      throw new BadRequestException('Số lượng hoặc số giờ phải từ 1 đến 72.');
    }
    const amount = Math.floor(rawAmount);

    if (dto.itemType === ConsumableType.STREAK_FREEZE) {
      const current = await this.prisma.userInventoryItem.findUnique({
        where: {
          userId_itemType: { userId, itemType: ConsumableType.STREAK_FREEZE },
        },
      });
      const nextQty = Math.min(
        MAX_STREAK_FREEZE_QTY,
        (current?.quantity ?? 0) + amount,
      );
      const saved = await this.prisma.userInventoryItem.upsert({
        where: {
          userId_itemType: { userId, itemType: ConsumableType.STREAK_FREEZE },
        },
        update: { quantity: nextQty },
        create: {
          userId,
          itemType: ConsumableType.STREAK_FREEZE,
          quantity: nextQty,
        },
      });
      return {
        granted: true,
        userId,
        itemType: saved.itemType,
        quantity: saved.quantity,
      };
    }

    const current = await this.prisma.userInventoryItem.findUnique({
      where: {
        userId_itemType: { userId, itemType: ConsumableType.XP_BOOST_2X },
      },
    });
    const now = new Date();
    const baseTime =
      current?.activeUntil && current.activeUntil > now
        ? current.activeUntil.getTime()
        : now.getTime();
    const activeUntil = new Date(baseTime + amount * 3600 * 1000);
    const saved = await this.prisma.userInventoryItem.upsert({
      where: {
        userId_itemType: { userId, itemType: ConsumableType.XP_BOOST_2X },
      },
      update: { activeUntil, quantity: { increment: 1 } },
      create: {
        userId,
        itemType: ConsumableType.XP_BOOST_2X,
        quantity: 1,
        activeUntil,
      },
    });
    return {
      granted: true,
      userId,
      itemType: saved.itemType,
      activeUntil: saved.activeUntil?.toISOString() ?? null,
    };
  }
}
