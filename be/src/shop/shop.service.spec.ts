import { BadRequestException } from '@nestjs/common';
import { ConsumableType } from '@prisma/client';
import { ShopService } from './shop.service';

describe('ShopService', () => {
  const prevProvider = process.env.COIN_PROVIDER;

  afterEach(() => {
    process.env.COIN_PROVIDER = prevProvider;
    jest.clearAllMocks();
  });

  const makeSetup = (opts?: {
    freezeQty?: number;
    unlocked?: string[];
    pity?: number;
  }) => {
    const prisma = {
      userInventoryItem: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest
          .fn()
          .mockResolvedValue(
            opts?.freezeQty !== undefined
              ? { quantity: opts.freezeQty, activeUntil: null }
              : null,
          ),
        upsert: jest.fn().mockResolvedValue({
          quantity: (opts?.freezeQty ?? 0) + 1,
          activeUntil: new Date(Date.now() + 24 * 3600_000),
        }),
      },
      userCosmeticPreference: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ unlockedCosmetics: opts?.unlocked ?? [] }),
        upsert: jest.fn().mockResolvedValue({}),
      },
      mysteryChestRoll: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest
          .fn()
          .mockResolvedValue({ pityCountAfter: opts?.pity ?? 0 }),
        create: jest
          .fn()
          .mockImplementation(
            ({ data }: { data: Record<string, unknown> }) => ({
              id: 'roll-1',
              ...data,
            }),
          ),
      },
    };
    const mockWallet = {
      debitPurchase: jest
        .fn()
        .mockResolvedValue({ debited: true, balance: 200 }),
      creditReward: jest.fn().mockResolvedValue({ credited: true }),
    };
    const service = new ShopService(prisma as never, mockWallet as never);
    return { service, prisma, mockWallet };
  };

  it('purchases STREAK_FREEZE and rejects when cap (5) is reached', async () => {
    process.env.COIN_PROVIDER = 'mock';
    const { service, mockWallet } = makeSetup({ freezeQty: 2 });
    const res = await service.purchaseConsumable(
      'u1',
      ConsumableType.STREAK_FREEZE,
      'idem-freeze-1',
    );
    expect(res.purchased).toBe(true);
    expect(mockWallet.debitPurchase).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 40, idempotencyKey: 'idem-freeze-1' }),
    );

    const capped = makeSetup({ freezeQty: 5 });
    await expect(
      capped.service.purchaseConsumable('u1', ConsumableType.STREAK_FREEZE),
    ).rejects.toThrow(BadRequestException);
    expect(capped.mockWallet.debitPurchase).not.toHaveBeenCalled();
  });

  it('guarantees an unowned cosmetic at pity 5 (4 -> 5) and resets pity to 0', async () => {
    process.env.COIN_PROVIDER = 'mock';
    const { service, prisma } = makeSetup({ pity: 4, unlocked: [] });
    const res = await service.openMysteryChest('u1', 'idem-roll-5');
    expect(res.alreadyProcessed).toBe(false);
    expect(res.roll.rewardType).toBe('COSMETIC');
    expect(res.roll.isDuplicate).toBe(false);
    expect(res.roll.pityCountAfter).toBe(0);
    expect(prisma.userCosmeticPreference.upsert).toHaveBeenCalledTimes(1);
  });
});
