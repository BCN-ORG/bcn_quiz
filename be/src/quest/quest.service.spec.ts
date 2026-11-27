import { BadRequestException } from '@nestjs/common';
import { QuestService } from './quest.service';

describe('QuestService', () => {
  const makeSetup = (overrides?: {
    dailyQuiz?: number;
    dailyTower?: number;
    dailyBoss?: number;
    dailyBounty?: number;
    claims?: Array<{ periodKey: string; questCode: string }>;
  }) => {
    const prisma = {
      attemptSession: {
        count: jest.fn().mockResolvedValue(overrides?.dailyQuiz ?? 1),
      },
      towerFloorAttempt: {
        count: jest.fn().mockResolvedValue(overrides?.dailyTower ?? 2),
      },
      bossBattleSession: {
        count: jest.fn().mockResolvedValue(overrides?.dailyBoss ?? 1),
      },
      bountyAssignment: {
        count: jest.fn().mockResolvedValue(overrides?.dailyBounty ?? 0),
      },
      userQuestClaim: {
        findMany: jest.fn().mockResolvedValue(overrides?.claims ?? []),
        create: jest.fn().mockResolvedValue({ id: 'claim-1' }),
      },
    };
    const xpService = {
      award: jest.fn().mockResolvedValue({ awarded: true, amount: 25 }),
    };
    const mockWallet = {
      creditReward: jest.fn().mockResolvedValue({ credited: true }),
    };
    const service = new QuestService(
      prisma as never,
      xpService as never,
      mockWallet as never,
    );
    return { service, prisma, xpService, mockWallet };
  };

  it('computes daily and weekly quest progress accurately', async () => {
    const { service } = makeSetup({
      dailyQuiz: 1,
      dailyTower: 2,
      dailyBoss: 1,
    });
    const res = await service.getMyQuests(
      'u1',
      new Date('2026-11-27T04:00:00Z'),
    );
    expect(res.dailyKey).toBe('2026-11-27');
    const chest = res.daily.find((q) => q.code === 'daily_milestone_chest');
    expect(chest?.progress).toBe(3);
    expect(chest?.completed).toBe(true);
  });

  it('claims completed daily milestone chest and awards XP + Coin once', async () => {
    process.env.COIN_PROVIDER = 'mock';
    const { service, xpService, mockWallet } = makeSetup();
    const res = await service.claimQuest(
      'u1',
      'daily_milestone_chest',
      new Date('2026-11-27T04:00:00Z'),
    );
    expect(res.claimed).toBe(true);
    expect(res.rewardCoins).toBe(15);
    expect(xpService.award).toHaveBeenCalledTimes(1);
    expect(mockWallet.creditReward).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        amount: 15,
        idempotencyKey: 'quest:2026-11-27:u1:daily_milestone_chest',
      }),
    );
  });

  it('rejects claiming an incomplete quest', async () => {
    const { service } = makeSetup({
      dailyQuiz: 0,
      dailyTower: 0,
      dailyBoss: 0,
    });
    await expect(service.claimQuest('u1', 'daily_quiz_1')).rejects.toThrow(
      BadRequestException,
    );
  });
});
