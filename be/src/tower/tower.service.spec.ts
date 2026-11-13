import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TowerService } from './tower.service';
import { TowerCoinService } from './coin/tower-coin.service';

describe('TowerService (Gameplay, Streak, Timer & Cooldown)', () => {
  let service: TowerService;

  const mockPrisma = {
    towerSeason: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    towerUserProgress: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    towerFloorAttempt: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    quiz: {
      findUnique: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn((promises) => Promise.all(promises)),
  };

  const mockCoinService = {
    rewardFloorCompletion: jest.fn(),
  };

  const sampleSeason = {
    id: 'season-2026-11',
    seasonKey: '2026-11',
    name: 'Mùa giải tháng 11/2026',
    startsAt: new Date('2026-11-01T00:00:00Z'),
    endsAt: new Date('2026-11-30T23:59:59Z'),
    isActive: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TowerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TowerCoinService, useValue: mockCoinService },
      ],
    }).compile();

    service = module.get<TowerService>(TowerService);
    mockPrisma.towerSeason.findUnique.mockResolvedValue(sampleSeason);
  });

  describe('startFloorAttempt & Cooldown (INV3)', () => {
    it('throws 403 Forbidden when player is in 4-hour cooldown', async () => {
      const futureCooldown = new Date(Date.now() + 2 * 3600 * 1000); // 2 hours remaining
      mockPrisma.towerUserProgress.findUnique.mockResolvedValue({
        id: 'prog-1',
        userId: 'u1',
        seasonId: sampleSeason.id,
        currentFloor: 2,
        highestCompletedFloor: 1,
        cooldownUntil: futureCooldown,
      });

      await expect(service.startFloorAttempt('u1')).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
        }),
      );
    });

    it('INV3 BLOCKER FIX: throws 403 Forbidden and enforces 4-hour cooldown when starting a floor with an expired attempt', async () => {
      mockPrisma.towerUserProgress.findUnique.mockResolvedValue({
        id: 'prog-1',
        userId: 'u1',
        seasonId: sampleSeason.id,
        currentFloor: 2,
        highestCompletedFloor: 1,
        cooldownUntil: null,
      });

      // Expired attempt exists from previous session
      const expiredTime = new Date(Date.now() - 20000); // 20s ago
      mockPrisma.towerFloorAttempt.findFirst.mockResolvedValue({
        id: 'att-expired',
        userId: 'u1',
        seasonId: sampleSeason.id,
        floor: 2,
        currentQuizId: 'q-old',
        currentQuestionExpiresAt: expiredTime,
        status: 'IN_PROGRESS',
      });

      mockPrisma.towerFloorAttempt.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.towerUserProgress.update.mockResolvedValue({});

      await expect(service.startFloorAttempt('u1')).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
        }),
      );

      // Verify old attempt marked as FAILED with TIMEOUT and cooldown set
      expect(mockPrisma.towerFloorAttempt.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'att-expired', status: 'IN_PROGRESS' },
          data: expect.objectContaining({
            status: 'FAILED',
            failedReason: 'TIMEOUT',
          }),
        }),
      );
      expect(mockPrisma.towerUserProgress.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cooldownUntil: expect.any(Date),
          }),
        }),
      );
    });

    it('blocks starting new attempts when player has conquered all 100 floors', async () => {
      mockPrisma.towerUserProgress.findUnique.mockResolvedValue({
        id: 'prog-1',
        userId: 'u1',
        seasonId: sampleSeason.id,
        currentFloor: 100,
        highestCompletedFloor: 100,
        cooldownUntil: null,
      });

      await expect(service.startFloorAttempt('u1')).rejects.toThrow(
        'Bạn đã chinh phục toàn bộ 100 tầng của Tháp trong mùa giải này!',
      );
    });

    it('creates a new attempt with requiredStreak = currentFloor when cooldown is clear', async () => {
      mockPrisma.towerUserProgress.findUnique.mockResolvedValue({
        id: 'prog-1',
        userId: 'u1',
        seasonId: sampleSeason.id,
        currentFloor: 3,
        highestCompletedFloor: 2,
        cooldownUntil: null,
      });

      mockPrisma.towerFloorAttempt.findFirst.mockResolvedValue(null);

      mockPrisma.quiz.count.mockResolvedValue(10);
      mockPrisma.quiz.findFirst.mockResolvedValue({
        id: 'q-101',
        question: 'HTML viết tắt của gì?',
        code: null,
        imageUrl: null,
        answer: 'A',
        options: [
          { label: 'A', content: 'HyperText Markup Language', isCode: false },
          { label: 'B', content: 'HighText Machine Language', isCode: false },
        ],
      });

      mockPrisma.towerFloorAttempt.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'attempt-1',
          ...data,
        }),
      );

      const result = await service.startFloorAttempt('u1');

      expect(result.floor).toBe(3);
      expect(result.requiredStreak).toBe(3);
      expect(result.question.id).toBe('q-101');
      expect(result.question.timeLimitSeconds).toBe(10);
      // Answer must NOT be leaked
      expect((result.question as unknown as { answer?: string }).answer).toBeUndefined();
    });
  });

  describe('answerFloorQuestion (INV3 & INV4: Timer & Streak)', () => {
    beforeEach(() => {
      mockPrisma.towerFloorAttempt.updateMany.mockResolvedValue({ count: 1 });
    });

    it('INV4: fails attempt with TIMEOUT and applies 4-hour cooldown if response is late', async () => {
      mockPrisma.towerUserProgress.findUnique.mockResolvedValue({
        id: 'prog-1',
        userId: 'u1',
        seasonId: sampleSeason.id,
        currentFloor: 1,
      });

      // Question expired 5 seconds ago
      const expiredTime = new Date(Date.now() - 5000);
      mockPrisma.towerFloorAttempt.findFirst.mockResolvedValue({
        id: 'att-1',
        userId: 'u1',
        seasonId: sampleSeason.id,
        floor: 1,
        currentQuizId: 'q-1',
        currentQuestionExpiresAt: expiredTime,
        status: 'IN_PROGRESS',
      });

      const response = await service.answerFloorQuestion('u1', 'A');

      expect(response.result).toBe('FAILED');
      expect(response.reason).toBe('TIMEOUT');
      expect(response.cooldownRemainingSeconds).toBeGreaterThan(0);
      expect(mockPrisma.towerFloorAttempt.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
            failedReason: 'TIMEOUT',
          }),
        }),
      );
      expect(mockPrisma.towerUserProgress.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cooldownUntil: expect.any(Date),
          }),
        }),
      );
    });

    it('INV3: fails attempt with WRONG_ANSWER and applies 4-hour cooldown on incorrect answer', async () => {
      mockPrisma.towerUserProgress.findUnique.mockResolvedValue({
        id: 'prog-1',
        userId: 'u1',
        seasonId: sampleSeason.id,
        currentFloor: 1,
      });

      // Valid deadline
      const expiresAt = new Date(Date.now() + 8000);
      mockPrisma.towerFloorAttempt.findFirst.mockResolvedValue({
        id: 'att-1',
        userId: 'u1',
        seasonId: sampleSeason.id,
        floor: 1,
        currentQuizId: 'q-1',
        currentQuestionExpiresAt: expiresAt,
        status: 'IN_PROGRESS',
      });

      mockPrisma.quiz.findUnique.mockResolvedValue({
        id: 'q-1',
        answer: 'B',
        explanation: 'Đáp án đúng là B',
      });

      const response = await service.answerFloorQuestion('u1', 'A'); // Selected A, correct is B

      expect(response.result).toBe('FAILED');
      expect(response.reason).toBe('WRONG_ANSWER');
      expect(response.correctAnswer).toBe('B');
      expect(response.cooldownRemainingSeconds).toBeGreaterThan(0);
    });

    it('advances streak and returns next question when answer is correct but streak incomplete', async () => {
      mockPrisma.towerUserProgress.findUnique.mockResolvedValue({
        id: 'prog-1',
        userId: 'u1',
        seasonId: sampleSeason.id,
        currentFloor: 2, // Needs 2 questions
      });

      const expiresAt = new Date(Date.now() + 8000);
      mockPrisma.towerFloorAttempt.findFirst.mockResolvedValue({
        id: 'att-1',
        userId: 'u1',
        seasonId: sampleSeason.id,
        floor: 2,
        requiredStreak: 2,
        currentStreak: 0,
        currentQuestionNumber: 1,
        currentQuizId: 'q-1',
        usedQuizIds: ['q-1'],
        currentQuestionExpiresAt: expiresAt,
        status: 'IN_PROGRESS',
      });

      mockPrisma.quiz.findUnique.mockResolvedValue({
        id: 'q-1',
        answer: 'C',
        explanation: 'Good job',
      });

      mockPrisma.quiz.count.mockResolvedValue(5);
      mockPrisma.quiz.findFirst.mockResolvedValue({
        id: 'q-2',
        question: 'Next question',
        code: null,
        imageUrl: null,
        answer: 'A',
        options: [
          { label: 'B', content: 'Opt B', isCode: false },
          { label: 'A', content: 'Opt A', isCode: false },
        ],
      });

      const response = await service.answerFloorQuestion('u1', 'C');

      expect(response.result).toBe('CORRECT');
      expect(response.currentStreak).toBe(1);
      expect(response.requiredStreak).toBe(2);
      expect(response.nextQuestion?.id).toBe('q-2');
      // Verify options are sorted deterministically
      expect(response.nextQuestion?.options[0].label).toBe('A');
      expect(response.nextQuestion?.options[1].label).toBe('B');
    });

    it('completes floor and awards 1 coin when streak is satisfied', async () => {
      mockPrisma.towerUserProgress.findUnique.mockResolvedValue({
        id: 'prog-1',
        userId: 'u1',
        seasonId: sampleSeason.id,
        currentFloor: 1,
        highestCompletedFloor: 0,
      });

      const expiresAt = new Date(Date.now() + 8000);
      mockPrisma.towerFloorAttempt.findFirst.mockResolvedValue({
        id: 'att-1',
        userId: 'u1',
        seasonId: sampleSeason.id,
        floor: 1,
        requiredStreak: 1,
        currentStreak: 0,
        currentQuestionNumber: 1,
        currentQuizId: 'q-1',
        usedQuizIds: ['q-1'],
        currentQuestionExpiresAt: expiresAt,
        status: 'IN_PROGRESS',
      });

      mockPrisma.quiz.findUnique.mockResolvedValue({
        id: 'q-1',
        answer: 'D',
        explanation: 'Floor 1 done!',
      });

      mockPrisma.towerUserProgress.update.mockResolvedValue({});
      mockCoinService.rewardFloorCompletion.mockResolvedValue({
        status: 'SUCCESS',
        rewardCoins: 1,
      });

      const response = await service.answerFloorQuestion('u1', 'D');

      expect(response.result).toBe('FLOOR_COMPLETED');
      expect(response.completedFloor).toBe(1);
      expect(response.nextFloor).toBe(2);
      expect(response.rewardCoins).toBe(1);
      expect(mockCoinService.rewardFloorCompletion).toHaveBeenCalledWith(
        'u1',
        sampleSeason.id,
        sampleSeason.seasonKey,
        1,
        'att-1',
      );
    });

    it('does NOT set 4-hour cooldown when a concurrent wrong answer loses the race (updateMany count === 0)', async () => {
      mockPrisma.towerUserProgress.findUnique.mockResolvedValue({
        id: 'prog-1',
        userId: 'u1',
        seasonId: sampleSeason.id,
        currentFloor: 1,
      });

      const expiresAt = new Date(Date.now() + 8000);
      mockPrisma.towerFloorAttempt.findFirst.mockResolvedValue({
        id: 'att-1',
        userId: 'u1',
        seasonId: sampleSeason.id,
        floor: 1,
        currentQuizId: 'q-1',
        currentQuestionExpiresAt: expiresAt,
        status: 'IN_PROGRESS',
      });

      mockPrisma.quiz.findUnique.mockResolvedValue({
        id: 'q-1',
        answer: 'A',
        explanation: 'A is right',
      });

      // Another request already completed the attempt -> updateMany returns 0
      mockPrisma.towerFloorAttempt.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.answerFloorQuestion('u1', 'B')).rejects.toThrow(
        'Câu hỏi này đã được trả lời',
      );
      expect(mockPrisma.towerUserProgress.update).not.toHaveBeenCalled();
    });

    it('computes monthly season strictly in Asia/Ho_Chi_Minh (UTC+7) even at UTC month boundary', async () => {
      mockPrisma.towerSeason.findUnique.mockResolvedValue(null);
      mockPrisma.towerSeason.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 's-dec', ...data }),
      );

      // 2026-11-30T17:30:00Z is 2026-12-01 00:30:00 in Vietnam (UTC+7)
      const season = await service.getOrCreateCurrentSeason(
        new Date('2026-11-30T17:30:00Z'),
      );
      expect(season.seasonKey).toBe('2026-12');
      expect(season.startsAt.toISOString()).toBe('2026-11-30T17:00:00.000Z');
    });
  });
});
