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
  it('computes level and progress', () => {
    expect(levelFromXp(0)).toMatchObject({
      level: 1,
      xpInLevel: 0,
      xpPercent: 0,
      rankTitle: 'Tân Binh BCN',
      nextRankTitle: 'Chiến Binh Code',
    });
    expect(levelFromXp(250)).toMatchObject({
      level: 2,
      xpInLevel: 50,
      xpPercent: 25,
      rankTitle: 'Tân Binh BCN',
    });
  });
  it('maps rank boundaries', () => {
    expect(levelFromXp(400).rankTitle).toBe('Chiến Binh Code');
    expect(levelFromXp(1000).rankTitle).toBe('Hiệp Sĩ Tri Thức');
    const top = levelFromXp(1800);
    expect(top.level).toBe(10);
    expect(top.rankTitle).toBe('Bậc Thầy Tháp Học Thuật');
    expect(top.nextRankTitle).toBeNull();
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
    expect(s.level).toBe(2);
    expect(s.xpInLevel).toBe(150);
    expect(s.xpPercent).toBe(75);
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
