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

    // Tier 3 requires 600 XP -> rejected
    await expect(svc.claimTier('u1', 3, 'free')).rejects.toThrow(
      BadRequestException,
    );
  });
});
