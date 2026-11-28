import { BadRequestException } from '@nestjs/common';
import { SeasonPassService } from './season-pass.service';

describe('SeasonPassService', () => {
  it('upgrades to Premium once and allows claiming unlocked free/premium tiers', async () => {
    process.env.COIN_PROVIDER = 'mock';
    const season = {
      id: 's1',
      code: '2026-11',
      title: 'Mùa Giải Tháng 11/2026',
      startsAt: new Date('2026-11-01T00:00:00+07:00'),
      endsAt: new Date('2026-12-01T00:00:00+07:00'),
      premiumPriceCoins: 300,
    };
    const prisma = {
      seasonPass: {
        findFirst: jest.fn().mockResolvedValue(season),
        findUnique: jest.fn().mockResolvedValue(season),
      },
      userXpEvent: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 450 } }),
      },
      userSeasonProgress: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'u1',
          seasonId: 's1',
          isPremium: false,
          claimedFreeTiers: [],
          claimedPremiumTiers: [],
        }),
        upsert: jest.fn().mockResolvedValue({}),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    const mockWallet = {
      debitPurchase: jest
        .fn()
        .mockResolvedValue({ debited: true, balance: 500 }),
      creditReward: jest.fn().mockResolvedValue({ credited: true }),
    };

    const svc = new SeasonPassService(prisma as never, mockWallet as never);

    const up = await svc.upgradePremium('u1');
    expect(up.upgraded).toBe(true);
    expect(mockWallet.debitPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 300,
        idempotencyKey: 'season:premium:2026-11:u1',
      }),
    );

    // Tier 1 requires 200 XP (user has 450 XP -> Tier 2 unlocked)
    const claimFree = await svc.claimTier('u1', 1, 'free');
    expect(claimFree.claimed).toBe(true);
    // Regression guard: claiming a tier must NOT write total seasonXp back into bonusXp
    expect(prisma.userSeasonProgress.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        update: { claimedFreeTiers: [1] },
        create: expect.objectContaining({ seasonXp: 0 }),
      }),
    );

    // Tier 3 requires 600 XP -> rejected
    await expect(svc.claimTier('u1', 3, 'free')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('creates an active season via admin and deactivates previous active seasons', async () => {
    const prisma = {
      seasonPass: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({
          id: 's2',
          code: '2026-12',
          title: 'Mùa Đông 2026',
          isActive: true,
        }),
      },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    const svc = new SeasonPassService(prisma as never);
    const created = await svc.createAdminSeason({
      code: '2026-12',
      title: 'Mùa Đông 2026',
      startsAt: '2026-12-01T00:00:00Z',
      endsAt: '2027-01-01T00:00:00Z',
      premiumPriceCoins: 250,
      isActive: true,
    });
    expect(prisma.seasonPass.updateMany).toHaveBeenCalledWith({
      where: { isActive: true },
      data: { isActive: false },
    });
    expect(created.code).toBe('2026-12');
  });
});
