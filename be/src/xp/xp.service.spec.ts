import { BadRequestException } from '@nestjs/common';
import {
  XpService,
  cappedBossContribution,
  computeBossComboXp,
  isTopicXpEligible,
  levelFromXp,
} from './xp.service';

describe('computeBossComboXp', () => {
  it('returns bonus based on combo thresholds', () => {
    expect(computeBossComboXp(0)).toBe(0);
    expect(computeBossComboXp(2)).toBe(0);
    expect(computeBossComboXp(3)).toBe(10);
    expect(computeBossComboXp(4)).toBe(10);
    expect(computeBossComboXp(5)).toBe(25);
    expect(computeBossComboXp(9)).toBe(25);
    expect(computeBossComboXp(10)).toBe(50);
    expect(computeBossComboXp(20)).toBe(50);
  });
});

describe('levelFromXp', () => {
  it('computes level and progress under tiered RPG curve', () => {
    expect(levelFromXp(0)).toMatchObject({
      level: 1,
      xpInLevel: 0,
      xpRequired: 150,
      xpPercent: 0,
      rankTitle: 'Tân Binh BCN',
      nextRankTitle: 'Chiến Binh Code',
    });
    expect(levelFromXp(250)).toMatchObject({
      level: 2,
      xpInLevel: 100,
      xpRequired: 150,
      xpPercent: 67,
      rankTitle: 'Tân Binh BCN',
    });
  });
  it('maps rank boundaries and higher tier curves accurately', () => {
    expect(levelFromXp(300)).toMatchObject({
      level: 3,
      rankTitle: 'Chiến Binh Code',
    });
    expect(levelFromXp(750)).toMatchObject({
      level: 6,
      xpRequired: 250,
      rankTitle: 'Hiệp Sĩ Tri Thức',
    });
    const lv10 = levelFromXp(1750);
    expect(lv10.level).toBe(10);
    expect(lv10.rankTitle).toBe('Bậc Thầy Tháp Học Thuật');
    expect(lv10.nextRankTitle).toBeNull();

    expect(levelFromXp(12250)).toMatchObject({
      level: 40,
      xpInLevel: 0,
      xpRequired: 600,
    });
    expect(levelFromXp(57250)).toMatchObject({
      level: 100,
      xpInLevel: 0,
      xpRequired: 900,
    });
  });
});

describe('XpService', () => {
  const makePrisma = () => ({
    userXpEvent: {
      createMany: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
  });

  it('award inserts once and reports duplicates as not awarded', async () => {
    const prisma = makePrisma();
    prisma.userXpEvent.createMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const svc = new XpService(prisma as never);
    await expect(svc.award('u', 'TOPIC_FIRST_SUBMIT', 't1')).resolves.toEqual({
      awarded: true,
      amount: 50,
    });
    await expect(svc.award('u', 'TOPIC_FIRST_SUBMIT', 't1')).resolves.toEqual({
      awarded: false,
      amount: 0,
    });
  });

  it('award uses the provided tx client', async () => {
    const prisma = makePrisma();
    const tx = makePrisma();
    tx.userXpEvent.createMany.mockResolvedValue({ count: 1 });
    const svc = new XpService(prisma as never);
    await svc.award('u', 'CERTIFICATE_ISSUED', 'c1', tx as never);
    expect(tx.userXpEvent.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.userXpEvent.createMany).not.toHaveBeenCalled();
  });

  it('award supports overrideAmount with or without tx', async () => {
    const prisma = makePrisma();
    prisma.userXpEvent.createMany.mockResolvedValue({ count: 1 });
    const svc = new XpService(prisma as never);

    await svc.award('u', 'BOSS_COMBO_STREAK', 's1', 50);
    expect(prisma.userXpEvent.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'u',
          sourceType: 'BOSS_COMBO_STREAK',
          sourceKey: 's1',
          amount: 50,
        },
      ],
      skipDuplicates: true,
    });

    const tx = makePrisma();
    tx.userXpEvent.createMany.mockResolvedValue({ count: 1 });
    await svc.award('u', 'BOSS_COMBO_STREAK', 's2', tx as never, 25);
    expect(tx.userXpEvent.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'u',
          sourceType: 'BOSS_COMBO_STREAK',
          sourceKey: 's2',
          amount: 25,
        },
      ],
      skipDuplicates: true,
    });
  });

  it('getSummary aggregates breakdown and level', async () => {
    const prisma = makePrisma();
    prisma.userXpEvent.groupBy.mockResolvedValue([
      {
        sourceType: 'TOPIC_FIRST_SUBMIT',
        _count: { _all: 3 },
        _sum: { amount: 150 },
      },
      {
        sourceType: 'COURSE_COMPLETED',
        _count: { _all: 1 },
        _sum: { amount: 200 },
      },
    ]);
    prisma.userXpEvent.findMany.mockResolvedValue([]);
    const s = await new XpService(prisma as never).getSummary('u');
    expect(s.totalXp).toBe(350);
    expect(s.level).toBe(3);
    expect(s.xpInLevel).toBe(50);
    expect(s.xpPercent).toBe(33);
    expect(s.breakdown.TOWER_FLOOR).toEqual({ count: 0, xp: 0 });
    expect(s.breakdown.TOPIC_FIRST_SUBMIT).toEqual({ count: 3, xp: 150 });
  });
});

describe('isTopicXpEligible', () => {
  it('needs at least one correct answer and half of the questions answered', () => {
    expect(isTopicXpEligible(10, 0, 0)).toBe(false);
    expect(isTopicXpEligible(10, 10, 0)).toBe(false); // all wrong
    expect(isTopicXpEligible(10, 4, 4)).toBe(false); // under half answered
    expect(isTopicXpEligible(10, 5, 1)).toBe(true);
    expect(isTopicXpEligible(3, 2, 1)).toBe(true); // ceil(3/2) = 2
    expect(isTopicXpEligible(0, 0, 0)).toBe(false);
  });
});

describe('cappedBossContribution', () => {
  it('caps one user at 100 and ignores negatives', () => {
    expect(cappedBossContribution(30)).toBe(30);
    expect(cappedBossContribution(100)).toBe(100);
    expect(cappedBossContribution(5000)).toBe(100);
    expect(cappedBossContribution(-4)).toBe(0);
  });
});

describe('XpService.awardBossSession', () => {
  const makeTx = (opts: { existing?: boolean; usedToday?: number }) => ({
    $executeRaw: jest.fn().mockResolvedValue(1),
    userXpEvent: {
      findUnique: jest
        .fn()
        .mockResolvedValue(opts.existing ? { id: 'e1' } : null),
      count: jest.fn().mockResolvedValue(opts.usedToday ?? 0),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  });
  const makeSvc = (tx: ReturnType<typeof makeTx>) => {
    const prisma = {
      $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
    };
    return { svc: new XpService(prisma as never), prisma };
  };

  it('grants nothing below the minimum correct answers and does not even open a transaction', async () => {
    const tx = makeTx({});
    const { svc, prisma } = makeSvc(tx);
    await expect(
      svc.awardBossSession('u', 's1', { correctCount: 4, maxCombo: 4 }),
    ).resolves.toEqual({ sessionXp: 0, comboXp: 0, skipped: 'below_min' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('grants session XP plus combo XP under a per-user per-day advisory lock', async () => {
    const tx = makeTx({ usedToday: 0 });
    const { svc } = makeSvc(tx);
    await expect(
      svc.awardBossSession('u', 's1', { correctCount: 12, maxCombo: 6 }),
    ).resolves.toEqual({ sessionXp: 50, comboXp: 25 });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.userXpEvent.createMany).toHaveBeenCalledTimes(2);
  });

  it('refuses a new session once 3 sessions already earned XP today, and awards no combo either', async () => {
    const tx = makeTx({ usedToday: 3 });
    const { svc } = makeSvc(tx);
    await expect(
      svc.awardBossSession('u', 's4', { correctCount: 30, maxCombo: 12 }),
    ).resolves.toEqual({ sessionXp: 0, comboXp: 0, skipped: 'daily_cap' });
    expect(tx.userXpEvent.createMany).not.toHaveBeenCalled();
  });

  it('stays idempotent for a retry of a session that already earned XP, even at the cap', async () => {
    const tx = makeTx({ existing: true, usedToday: 3 });
    tx.userXpEvent.createMany.mockResolvedValue({ count: 0 });
    const { svc } = makeSvc(tx);
    await expect(
      svc.awardBossSession('u', 's1', { correctCount: 30, maxCombo: 12 }),
    ).resolves.toEqual({ sessionXp: 0, comboXp: 0 });
    expect(tx.userXpEvent.count).not.toHaveBeenCalled();
  });

  it('grants no combo XP below combo 3', async () => {
    const tx = makeTx({});
    const { svc } = makeSvc(tx);
    await expect(
      svc.awardBossSession('u', 's1', { correctCount: 6, maxCombo: 2 }),
    ).resolves.toEqual({ sessionXp: 50, comboXp: 0 });
    expect(tx.userXpEvent.createMany).toHaveBeenCalledTimes(1);
  });
});

describe('XpService.purchaseCosmetic (Coin invariants)', () => {
  const prevProvider = process.env.COIN_PROVIDER;

  afterEach(() => {
    process.env.COIN_PROVIDER = prevProvider;
    jest.clearAllMocks();
  });

  const makeShopSetup = (
    unlocked: string[] = [],
    existingPrefs: Record<string, unknown> = {},
  ) => {
    const prisma = {
      userCosmeticPreference: {
        findUnique: jest.fn().mockResolvedValue(
          unlocked.length > 0 || Object.keys(existingPrefs).length > 0
            ? {
                userId: 'u1',
                unlockedCosmetics: unlocked,
                equippedTierId: null,
                equippedCharacterId: null,
                equippedBannerId: null,
                equippedFrameId: null,
                equippedNameplateId: null,
                ...existingPrefs,
              }
            : null,
        ),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const mockWallet = {
      debitPurchase: jest
        .fn()
        .mockResolvedValue({ debited: true, balance: 850 }),
      creditReward: jest.fn().mockResolvedValue({ credited: true }),
    };
    const coinWallet = {
      transferToDiscordId: jest.fn().mockResolvedValue({ senderBalance: 850 }),
    };
    const coinApiClient = {
      getTreasuryDiscordId: jest.fn().mockReturnValue('treasury-discord-1'),
    };
    const svc = new XpService(
      prisma as never,
      mockWallet as never,
      coinWallet as never,
      undefined,
      undefined,
      undefined,
      coinApiClient as never,
    );
    return { svc, prisma, mockWallet, coinWallet, coinApiClient };
  };

  it('rejects unknown cosmeticId and never debits Coin', async () => {
    process.env.COIN_PROVIDER = 'mock';
    const { svc, mockWallet, coinWallet } = makeShopSetup();
    await expect(
      svc.purchaseCosmetic('u1', 'shop-non-existent'),
    ).rejects.toThrow(BadRequestException);
    expect(mockWallet.debitPurchase).not.toHaveBeenCalled();
    expect(coinWallet.transferToDiscordId).not.toHaveBeenCalled();
  });

  it('treats piece of an already-owned bundle as alreadyOwned without double-charging', async () => {
    process.env.COIN_PROVIDER = 'live';
    const { svc, mockWallet, coinWallet, prisma } = makeShopSetup([
      'shop-blood-moon',
    ]);
    const res = await svc.purchaseCosmetic('u1', 'char:shop-blood-moon');
    expect(res.alreadyOwned).toBe(true);
    expect(res.purchased).toBe(false);
    expect(coinWallet.transferToDiscordId).not.toHaveBeenCalled();
    expect(mockWallet.debitPurchase).not.toHaveBeenCalled();
    expect(prisma.userCosmeticPreference.upsert).not.toHaveBeenCalled();
  });

  it('purchases a bundle in live mode via Treasury transfer, unlocks 4 pieces, and equips all 4 slots', async () => {
    process.env.COIN_PROVIDER = 'live';
    const { svc, coinWallet, prisma } = makeShopSetup();
    const res = await svc.purchaseCosmetic('u1', 'shop-blood-moon');
    expect(coinWallet.transferToDiscordId).toHaveBeenCalledWith(
      'u1',
      'u1',
      'treasury-discord-1',
      150,
      'shop:cosmetic:u1:shop-blood-moon',
      'Mua trang bị BCN Arena (shop-blood-moon)',
    );
    expect(res.purchased).toBe(true);
    expect(res.newBalance).toBe(850);
    expect(res.unlockedCosmetics).toEqual(
      expect.arrayContaining([
        'shop-blood-moon',
        'char:shop-blood-moon',
        'banner:shop-blood-moon',
        'frame:shop-blood-moon',
        'nameplate:shop-blood-moon',
      ]),
    );
    expect(res.equippedCharacterId).toBe('shop-blood-moon');
    expect(res.equippedBannerId).toBe('shop-blood-moon');
    expect(res.equippedFrameId).toBe('shop-blood-moon');
    expect(res.equippedNameplateId).toBe('shop-blood-moon');
    expect(prisma.userCosmeticPreference.upsert).toHaveBeenCalledTimes(1);
  });

  it('purchases an individual frame without overwriting other equipped slots', async () => {
    process.env.COIN_PROVIDER = 'mock';
    const { svc, mockWallet } = makeShopSetup(['shop-blood-moon'], {
      equippedTierId: 'shop-blood-moon',
      equippedCharacterId: 'shop-blood-moon',
      equippedBannerId: 'shop-blood-moon',
      equippedFrameId: 'shop-blood-moon',
      equippedNameplateId: 'shop-blood-moon',
    });
    const res = await svc.purchaseCosmetic('u1', 'frame:neon-pulse');
    expect(mockWallet.debitPurchase).toHaveBeenCalledWith({
      userId: 'u1',
      amount: 50,
      idempotencyKey: 'shop:cosmetic:u1:frame:neon-pulse',
      description: 'Mua trang bị BCN Arena (frame:neon-pulse)',
    });
    expect(res.equippedFrameId).toBe('frame:neon-pulse');
    expect(res.equippedCharacterId).toBe('shop-blood-moon');
    expect(res.equippedBannerId).toBe('shop-blood-moon');
    expect(res.equippedNameplateId).toBe('shop-blood-moon');
  });
});
