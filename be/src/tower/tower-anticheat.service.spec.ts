import { TowerAntiCheatService } from './tower-anticheat.service';

describe('TowerAntiCheatService', () => {
  it('flags superhuman speed (< 450ms) and auto-blocks when suspicionScore reaches 100', async () => {
    const prisma = {
      towerAntiCheatEvent: {
        create: jest.fn().mockResolvedValue({}),
      },
      towerUserProgress: {
        update: jest
          .fn()
          .mockResolvedValueOnce({ suspicionScore: 175 })
          .mockResolvedValueOnce({ isBlocked: true }),
      },
      towerFloorAttempt: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const discord = {
      sendAnnouncement: jest.fn().mockResolvedValue(undefined),
    };
    const service = new TowerAntiCheatService(
      prisma as never,
      undefined,
      discord as never,
    );

    const res = await service.evaluateAnswer({
      userId: 'u-bot',
      seasonId: 's1',
      progressId: 'p1',
      currentSuspicionScore: 75,
      attemptId: 'a1',
      floor: 42,
      serverResponseMs: 180,
      previousTimingsMs: [200, 190, 210, 185],
      isExplicitTimeout: false,
      meta: { isTrusted: false, webdriver: true, ip: '1.2.3.4' },
    });

    expect(res.rejectedAsSuperhuman).toBe(true);
    expect(res.autoBlocked).toBe(true);
    expect(prisma.towerUserProgress.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: expect.objectContaining({ isBlocked: true }),
      }),
    );
    expect(discord.sendAnnouncement).toHaveBeenCalledTimes(1);
  });

  it('detects robotic fixed-sleep cadence (stddev < 70ms over 8 answers)', async () => {
    const prisma = {
      towerAntiCheatEvent: {
        create: jest.fn().mockResolvedValue({}),
      },
      towerUserProgress: {
        update: jest
          .fn()
          .mockResolvedValueOnce({ suspicionScore: 175 })
          .mockResolvedValueOnce({ isBlocked: true }),
      },
      towerFloorAttempt: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new TowerAntiCheatService(prisma as never);

    const res = await service.evaluateAnswer({
      userId: 'u-sleep-bot',
      seasonId: 's1',
      progressId: 'p2',
      currentSuspicionScore: 0,
      attemptId: 'a2',
      floor: 20,
      serverResponseMs: 1502,
      previousTimingsMs: [1500, 1510, 1495, 1505, 1498, 1501, 1504],
      isExplicitTimeout: false,
    });

    expect(res.rejectedAsSuperhuman).toBe(false);
    expect(res.addedSuspicion).toBe(35);
    expect(prisma.towerAntiCheatEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ruleCode: 'ROBOTIC_CADENCE' }),
      }),
    );
  });

  it('allows normal human response times without flagging', async () => {
    const prisma = {
      towerAntiCheatEvent: { create: jest.fn() },
      towerUserProgress: { update: jest.fn() },
    };
    const service = new TowerAntiCheatService(prisma as never);

    const res = await service.evaluateAnswer({
      userId: 'u-human',
      seasonId: 's1',
      progressId: 'p3',
      currentSuspicionScore: 0,
      attemptId: 'a3',
      floor: 5,
      serverResponseMs: 3200,
      previousTimingsMs: [2100, 4800, 3100, 5200, 2600, 3900, 4100],
      isExplicitTimeout: false,
      meta: { isTrusted: true, webdriver: false },
    });

    expect(res.rejectedAsSuperhuman).toBe(false);
    expect(res.autoBlocked).toBe(false);
    expect(res.addedSuspicion).toBe(0);
    expect(prisma.towerAntiCheatEvent.create).not.toHaveBeenCalled();
  });
});
