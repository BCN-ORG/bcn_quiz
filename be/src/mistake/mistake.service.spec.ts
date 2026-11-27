import { MistakeStatus } from '@prisma/client';
import { MistakeService } from './mistake.service';

describe('MistakeService', () => {
  it('promotes a mistake to MASTERED after 2 consecutive correct answers and awards daily review reward', async () => {
    process.env.COIN_PROVIDER = 'mock';
    const prisma = {
      quiz: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'q1',
            topicId: 't1',
            answer: 'A',
            explanation: 'Because A',
          },
        ]),
      },
      userMistakeItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'm1',
            quizId: 'q1',
            consecutiveCorrect: 1,
            status: MistakeStatus.ACTIVE,
          },
        ]),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const xpService = {
      award: jest.fn().mockResolvedValue({ awarded: true, amount: 15 }),
    };
    const mockWallet = {
      creditReward: jest.fn().mockResolvedValue({ credited: true }),
    };
    const svc = new MistakeService(
      prisma as never,
      xpService as never,
      mockWallet as never,
    );

    const res = await svc.submitReview('u1', [
      { quizId: 'q1', selectedAnswer: 'A' },
    ]);
    expect(res.correct).toBe(1);
    expect(res.masteredNow).toBe(1);
    expect(res.results[0].status).toBe(MistakeStatus.MASTERED);
    expect(res.rewardXp).toBe(15);
    expect(res.rewardCoins).toBe(5);
    expect(mockWallet.creditReward).toHaveBeenCalledTimes(1);
  });
});
