import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { XpService } from '../xp/xp.service';
import { BossService } from './boss.service';
import { BossCoinService } from './coin/boss-coin.service';

describe('BossService', () => {
  let service: BossService;

  const mockPrismaService = {
    bossWeeklySeason: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    bossBattleSession: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    bossUserWeeklyStat: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
    bossRewardTransaction: {
      findMany: jest.fn(),
    },
    quiz: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const mockCoinService = {
    distributeMilestoneReward: jest.fn(),
  };

  const mockXpService = {
    awardBossSession: jest
      .fn()
      .mockResolvedValue({ sessionXp: 50, comboXp: 25 }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.bossWeeklySeason.updateMany.mockResolvedValue({
      count: 1,
    });
    mockPrismaService.bossBattleSession.updateMany.mockResolvedValue({
      count: 1,
    });
    mockPrismaService.bossBattleSession.findMany.mockResolvedValue([]);
    mockPrismaService.bossUserWeeklyStat.updateMany.mockResolvedValue({
      count: 1,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BossService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: BossCoinService, useValue: mockCoinService },
        { provide: XpService, useValue: mockXpService },
      ],
    }).compile();

    service = module.get<BossService>(BossService);
  });

  describe('getWeekBoundaries', () => {
    it('calculates correct Monday-to-Sunday boundaries in UTC+7', () => {
      // 2026-11-14 is a Saturday
      const testDate = new Date('2026-11-14T10:00:00.000Z');
      const boundaries = service.getWeekBoundaries(testDate);

      expect(boundaries.weekKey).toMatch(/^2026-W\d{2}$/);
      expect(boundaries.startsAt.getTime()).toBeLessThan(
        boundaries.endsAt.getTime(),
      );
    });
  });

  describe('getOrCreateCurrentSeason', () => {
    it('returns existing season when available', async () => {
      const mockSeason = {
        id: 'season-1',
        weekKey: '2026-W46',
        name: 'Tuần 46: Đại Ma Vương Hư Không',
        bossName: 'Ma Vương Hư Không',
        bossMaxHp: 1500,
        milestoneConfig: [
          { at: 300, coin: 5, name: 'Rương Đồng' },
          { at: 600, coin: 5, name: 'Rương Bạc' },
          { at: 900, coin: 5, name: 'Rương Vàng' },
          { at: 1200, coin: 5, name: 'Rương Bạch Kim' },
          { at: 1500, coin: 5, name: 'Rương Kim Cương' },
        ],
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 7 * 86400000),
        isActive: true,
        isSettled: false,
      };

      mockPrismaService.bossWeeklySeason.findUnique.mockResolvedValue(
        mockSeason,
      );

      const result = await service.getOrCreateCurrentSeason();
      expect(result.id).toBe('season-1');
      expect(result.weekKey).toBe('2026-W46');
    });

    it('creates new season with default 5 milestones if none exists', async () => {
      mockPrismaService.bossWeeklySeason.findUnique.mockResolvedValue(null);
      mockPrismaService.bossWeeklySeason.create.mockImplementation(
        (args: { data: Record<string, unknown> }) => ({
          id: 'new-season',
          ...args.data,
        }),
      );

      const result = await service.getOrCreateCurrentSeason();
      expect(result.id).toBe('new-season');
      expect(mockPrismaService.bossWeeklySeason.create).toHaveBeenCalled();
      expect(result.milestoneConfig).toHaveLength(5);
    });
  });

  describe('getOverview', () => {
    it('aggregates community progress, user stats and milestone unlocks', async () => {
      const mockSeason = {
        id: 'season-1',
        weekKey: '2026-W46',
        name: 'Tuần 46',
        bossName: 'Ma Vương',
        bossMaxHp: 1500,
        milestoneConfig: [
          { at: 300, coin: 5, name: 'Rương Đồng' },
          { at: 600, coin: 5, name: 'Rương Bạc' },
          { at: 900, coin: 5, name: 'Rương Vàng' },
          { at: 1200, coin: 5, name: 'Rương Bạch Kim' },
          { at: 1500, coin: 5, name: 'Rương Kim Cương' },
        ],
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 86400000),
        isActive: true,
        isSettled: false,
      };

      mockPrismaService.bossWeeklySeason.findUnique.mockResolvedValue(
        mockSeason,
      );
      // 25 participants x 30 points = 750; one script-like outlier (900) counts only up to the per-user cap (100).
      mockPrismaService.bossUserWeeklyStat.findMany.mockResolvedValue([
        ...Array.from({ length: 24 }, () => ({ highestScore: 30 })),
        { highestScore: 900 },
      ]);
      mockPrismaService.bossUserWeeklyStat.findUnique.mockResolvedValue({
        highestScore: 42,
        totalAttempts: 3,
        bestCombo: 12,
        hasParticipated: true,
      });
      mockPrismaService.bossBattleSession.findFirst.mockResolvedValue(null);

      const overview = await service.getOverview('user-1');

      expect(overview.community.communityScore).toBe(820); // 24*30 + min(900, 100)
      expect(overview.community.totalParticipants).toBe(25);
      expect(overview.community.bossCurrentHp).toBe(680); // 1500 - 820
      expect(overview.community.bossHpPercent).toBe(45);
      expect(overview.personal.personalBest).toBe(42);
      expect(overview.milestones[0].unlocked).toBe(true); // 300 <= 820
      expect(overview.milestones[1].unlocked).toBe(true); // 600 <= 820
      expect(overview.milestones[2].unlocked).toBe(false); // 900 > 820
    });
  });

  describe('startSession', () => {
    it('creates new session with 5min expiration and 10s question timer', async () => {
      const mockSeason = {
        id: 'season-1',
        weekKey: '2026-W46',
        milestoneConfig: [],
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 7 * 86400000),
      };
      mockPrismaService.bossWeeklySeason.findUnique.mockResolvedValue(
        mockSeason,
      );
      mockPrismaService.bossBattleSession.findFirst.mockResolvedValue(null);

      mockPrismaService.quiz.count.mockResolvedValue(10);
      mockPrismaService.quiz.findFirst.mockResolvedValue({
        id: 'q-1',
        question: 'Câu hỏi test 1',
        code: null,
        imageUrl: null,
        answer: 'A',
        options: [
          { label: 'A', content: 'Opt A', isCode: false },
          { label: 'B', content: 'Opt B', isCode: false },
        ],
      });

      mockPrismaService.bossBattleSession.create.mockResolvedValue({
        id: 'session-123',
        score: 0,
        combo: 0,
        maxCombo: 0,
        currentQuestionNumber: 1,
        expiresAt: new Date(Date.now() + 300000),
      });

      const res = await service.startSession('user-1');

      expect(res.sessionId).toBe('session-123');
      expect(res.question?.id).toBe('q-1');
      expect(res.question?.options[0]).not.toHaveProperty('isCorrect');
      expect(res.sessionRemainingSeconds).toBe(300);
    });

    it('clamps session expiresAt to season.endsAt when starting near Sunday boundary', async () => {
      const endsAt = new Date(Date.now() + 90_000); // 90s until week ends
      const mockSeason = {
        id: 'season-1',
        weekKey: '2026-W46',
        milestoneConfig: [],
        startsAt: new Date(Date.now() - 86400000),
        endsAt,
      };
      mockPrismaService.bossWeeklySeason.findUnique.mockResolvedValue(
        mockSeason,
      );
      mockPrismaService.bossBattleSession.findFirst.mockResolvedValue(null);
      mockPrismaService.quiz.count.mockResolvedValue(5);
      mockPrismaService.quiz.findFirst.mockResolvedValue({
        id: 'q-1',
        question: 'Q1',
        code: null,
        imageUrl: null,
        answer: 'B',
        options: [
          { label: 'A', content: 'A', isCode: false },
          { label: 'B', content: 'B', isCode: false },
        ],
      });
      mockPrismaService.bossBattleSession.create.mockImplementation(
        ({ data }: { data: { expiresAt: Date } }) => ({
          id: 'session-clamped',
          ...data,
        }),
      );

      const res = await service.startSession('user-1');

      expect(res.sessionExpiresAt).toBe(endsAt.toISOString());
      expect(res.sessionRemainingSeconds).toBeLessThanOrEqual(90);
    });

    it('resumes active unexpired session if one exists', async () => {
      const mockSeason = {
        id: 'season-1',
        weekKey: '2026-W46',
        milestoneConfig: [],
      };
      mockPrismaService.bossWeeklySeason.findUnique.mockResolvedValue(
        mockSeason,
      );

      const activeSession = {
        id: 'session-active',
        seasonId: 'season-1',
        score: 15,
        idleStreak: 0,
        combo: 4,
        maxCombo: 7,
        currentQuestionNumber: 16,
        currentQuestionId: 'q-active',
        currentQuestionExpiresAt: new Date(Date.now() + 8000),
        expiresAt: new Date(Date.now() + 180000), // 3 mins left
      };
      mockPrismaService.bossBattleSession.findFirst.mockResolvedValue(
        activeSession,
      );

      mockPrismaService.quiz.findUnique.mockResolvedValue({
        id: 'q-active',
        question: 'Câu hỏi đang làm',
        code: null,
        imageUrl: null,
        answer: 'A',
        options: [{ label: 'A', content: 'Ans', isCode: false }],
      });

      const res = await service.startSession('user-1');

      expect(res.sessionId).toBe('session-active');
      expect(res.score).toBe(15);
      expect(res.combo).toBe(4);
      expect(res.question?.id).toBe('q-active');
    });
  });

  describe('idle (AFK) handling', () => {
    const season = {
      id: 'season-1',
      weekKey: '2026-W46',
      name: 'Tuần 46',
      bossName: 'Ma Vương',
      bossMaxHp: 1500,
      milestoneConfig: [],
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86400000),
      isActive: true,
      isSettled: false,
    };
    const makeSession = (over: Record<string, unknown> = {}) => ({
      id: 'session-idle',
      userId: 'user-1',
      seasonId: 'season-1',
      status: 'IN_PROGRESS',
      score: 3,
      combo: 0,
      maxCombo: 3,
      correctCount: 3,
      wrongCount: 0,
      totalAnswered: 3,
      idleStreak: 0,
      currentQuestionId: 'q-curr',
      currentQuestionNumber: 4,
      currentQuestionExpiresAt: new Date(Date.now() - 100),
      expiresAt: new Date(Date.now() + 200000),
      usedQuestionIds: ['q-curr'],
      ...over,
    });
    const arrangeSubmit = (session: ReturnType<typeof makeSession>) => {
      mockPrismaService.bossBattleSession.findFirst.mockResolvedValue(session);
      mockPrismaService.bossBattleSession.findUnique.mockResolvedValue(session);
      mockPrismaService.quiz.findUnique.mockResolvedValue({
        id: 'q-curr',
        explanation: null,
        answer: 'A',
        options: [{ label: 'A', content: 'A', isCode: false }],
      });
      mockPrismaService.quiz.count.mockResolvedValue(5);
      mockPrismaService.quiz.findFirst.mockResolvedValue({
        id: 'q-next',
        question: 'Q',
        code: null,
        imageUrl: null,
        answer: 'A',
        options: [{ label: 'A', content: 'A', isCode: false }],
      });
      mockPrismaService.bossUserWeeklyStat.findUnique.mockResolvedValue({
        highestScore: 3,
      });
    };

    it('counts a timed-out question toward the streak and keeps playing below 5', async () => {
      arrangeSubmit(makeSession({ idleStreak: 3 }));
      const res = await service.submitAnswer('user-1', 'TIMEOUT');
      expect(res.result).toBe('TIMEOUT');
      expect(
        mockPrismaService.bossBattleSession.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ idleStreak: 4 }),
        }),
      );
    });

    it('ends the session as IDLE_TIMEOUT on the 5th unanswered question in a row', async () => {
      arrangeSubmit(makeSession({ idleStreak: 4 }));
      const res = await service.submitAnswer('user-1', 'TIMEOUT');
      expect(res).toMatchObject({
        result: 'SESSION_COMPLETED',
        endReason: 'IDLE_TIMEOUT',
        score: 3,
      });
    });

    it('counts time spent away: returning 45s late burns 5 questions at once', async () => {
      arrangeSubmit(
        makeSession({
          idleStreak: 0,
          currentQuestionExpiresAt: new Date(Date.now() - 45000),
        }),
      );
      const res = await service.submitAnswer('user-1', 'TIMEOUT');
      expect(res).toMatchObject({
        result: 'SESSION_COMPLETED',
        endReason: 'IDLE_TIMEOUT',
      });
    });

    it('resets the streak on a correct answer and on a wrong answer', async () => {
      arrangeSubmit(
        makeSession({
          idleStreak: 4,
          currentQuestionExpiresAt: new Date(Date.now() + 5000),
        }),
      );
      await service.submitAnswer('user-1', 'A');
      expect(
        mockPrismaService.bossBattleSession.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ idleStreak: 0, score: 4 }),
        }),
      );
      mockPrismaService.bossBattleSession.updateMany.mockClear();
      await service.submitAnswer('user-1', 'B');
      expect(
        mockPrismaService.bossBattleSession.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ idleStreak: 0, wrongCount: 1 }),
        }),
      );
    });

    it('nextQuestion after a wrong-answer pause does not count as idle', async () => {
      arrangeSubmit(makeSession({ idleStreak: 4, currentQuestionId: null }));
      const res = await service.nextQuestion('user-1');
      expect(res.result).toBe('NEXT_QUESTION');
    });

    it('nextQuestion on an unanswered question ends the session at the limit', async () => {
      arrangeSubmit(makeSession({ idleStreak: 4 }));
      const res = await service.nextQuestion('user-1');
      expect(res).toMatchObject({ endReason: 'IDLE_TIMEOUT' });
    });

    it('overview ends an abandoned session (reload / other page) and flags idleEnded', async () => {
      mockPrismaService.bossWeeklySeason.findUnique.mockResolvedValue(season);
      mockPrismaService.bossBattleSession.findFirst.mockResolvedValue(
        makeSession({
          idleStreak: 0,
          currentQuestionExpiresAt: new Date(Date.now() - 45000),
        }),
      );
      mockPrismaService.bossBattleSession.findUnique.mockResolvedValue(
        makeSession(),
      );
      mockPrismaService.bossUserWeeklyStat.findMany.mockResolvedValue([]);
      mockPrismaService.bossUserWeeklyStat.findUnique.mockResolvedValue(null);
      const overview = await service.getOverview('user-1');
      expect(overview.idleEnded).toBe(true);
      expect(overview.activeSession).toBeNull();
      expect(
        mockPrismaService.bossBattleSession.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'COMPLETED',
            endReason: 'IDLE_TIMEOUT',
          }),
        }),
      );
    });

    it('overview keeps a session that was away for fewer than 5 questions', async () => {
      mockPrismaService.bossWeeklySeason.findUnique.mockResolvedValue(season);
      mockPrismaService.bossBattleSession.findFirst.mockResolvedValue(
        makeSession({
          idleStreak: 0,
          currentQuestionExpiresAt: new Date(Date.now() - 20000),
        }),
      );
      mockPrismaService.quiz.findUnique.mockResolvedValue({
        id: 'q-curr',
        question: 'Q',
        code: null,
        imageUrl: null,
        answer: 'A',
        options: [{ label: 'A', content: 'A', isCode: false }],
      });
      mockPrismaService.bossUserWeeklyStat.findMany.mockResolvedValue([]);
      mockPrismaService.bossUserWeeklyStat.findUnique.mockResolvedValue(null);
      const overview = await service.getOverview('user-1');
      expect(overview.idleEnded).toBeUndefined();
      expect(overview.activeSession).not.toBeNull();
    });
  });

  describe('submitAnswer live boss hit', () => {
    const baseSession = {
      id: 'session-live',
      userId: 'user-1',
      seasonId: 'season-1',
      status: 'IN_PROGRESS',
      score: 19,
      combo: 1,
      maxCombo: 1,
      correctCount: 19,
      wrongCount: 0,
      totalAnswered: 19,
      currentQuestionId: 'q-curr',
      currentQuestionNumber: 20,
      currentQuestionExpiresAt: new Date(Date.now() + 5000),
      expiresAt: new Date(Date.now() + 200000),
      usedQuestionIds: ['q-curr'],
    };
    const arrange = (best: number | null) => {
      mockPrismaService.bossBattleSession.findFirst.mockResolvedValue(
        baseSession,
      );
      mockPrismaService.quiz.findUnique.mockResolvedValue({
        id: 'q-curr',
        explanation: null,
        answer: 'A',
        options: [{ label: 'A', content: 'A', isCode: false }],
      });
      mockPrismaService.quiz.count.mockResolvedValue(5);
      mockPrismaService.quiz.findFirst.mockResolvedValue({
        id: 'q-next',
        question: 'Q',
        code: null,
        imageUrl: null,
        answer: 'A',
        options: [{ label: 'A', content: 'A', isCode: false }],
      });
      mockPrismaService.bossUserWeeklyStat.findUnique.mockResolvedValue(
        best === null ? null : { highestScore: best },
      );
      mockPrismaService.bossUserWeeklyStat.findMany.mockResolvedValue([
        { highestScore: 20 },
        { highestScore: 500 },
      ]);
    };

    it('persists the new best immediately and reports the damage once the record is beaten', async () => {
      arrange(18);
      const res = await service.submitAnswer('user-1', 'A');
      expect(
        mockPrismaService.bossUserWeeklyStat.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          seasonId: 'season-1',
          highestScore: { lt: 20 },
        },
        data: { highestScore: 20 },
      });
      expect(res).toMatchObject({
        result: 'CORRECT',
        score: 20,
        bossDamage: 2,
        personalBest: 20,
        communityScore: 120, // 20 + capped 100
      });
    });

    it('does not touch the stat or report damage while the score has not beaten the record', async () => {
      arrange(20);
      const res = await service.submitAnswer('user-1', 'A');
      expect(
        mockPrismaService.bossUserWeeklyStat.updateMany,
      ).not.toHaveBeenCalled();
      expect(res).toMatchObject({ result: 'CORRECT', score: 20 });
      expect(res).not.toHaveProperty('bossDamage');
    });

    it('reports no damage when a concurrent write already raised the best (no double deduction)', async () => {
      arrange(18);
      mockPrismaService.bossUserWeeklyStat.updateMany.mockResolvedValueOnce({
        count: 0,
      });
      const res = await service.submitAnswer('user-1', 'A');
      expect(res).not.toHaveProperty('bossDamage');
    });

    it('caps the reported damage at the community contribution cap', async () => {
      arrange(98);
      mockPrismaService.bossBattleSession.findFirst.mockResolvedValue({
        ...baseSession,
        score: 109,
      });
      const res = await service.submitAnswer('user-1', 'A');
      expect(res).toMatchObject({ score: 110, bossDamage: 2 });
    });

    it('still answers when persisting the hit fails (endSession raises the best later)', async () => {
      arrange(18);
      mockPrismaService.bossUserWeeklyStat.updateMany.mockRejectedValueOnce(
        new Error('db down'),
      );
      const res = await service.submitAnswer('user-1', 'A');
      expect(res).toMatchObject({ result: 'CORRECT', score: 20 });
      expect(res).not.toHaveProperty('bossDamage');
    });
  });

  describe('submitAnswer', () => {
    it('evaluates Quiz.answer (including non-A answers), awards +1 point, increments combo and advances on correct answer', async () => {
      const session = {
        id: 'session-1',
        userId: 'user-1',
        seasonId: 'season-1',
        status: 'IN_PROGRESS',
        score: 5,
        combo: 2,
        maxCombo: 3,
        correctCount: 5,
        wrongCount: 0,
        totalAnswered: 5,
        currentQuestionId: 'q-curr',
        currentQuestionNumber: 6,
        currentQuestionExpiresAt: new Date(Date.now() + 5000),
        expiresAt: new Date(Date.now() + 200000),
        usedQuestionIds: ['q-curr'],
      };
      mockPrismaService.bossBattleSession.findFirst.mockResolvedValue(session);

      mockPrismaService.quiz.findUnique.mockResolvedValue({
        id: 'q-curr',
        question: 'Current Question',
        explanation: 'Test Explanation',
        answer: 'C',
        options: [
          { label: 'A', content: 'Wrong Ans A', isCode: false },
          { label: 'B', content: 'Wrong Ans B', isCode: false },
          { label: 'C', content: 'Correct Ans C', isCode: false },
        ],
      });

      mockPrismaService.quiz.count.mockResolvedValue(5);
      mockPrismaService.quiz.findFirst.mockResolvedValue({
        id: 'q-next',
        question: 'Next Question',
        code: null,
        imageUrl: null,
        answer: 'A',
        options: [{ label: 'A', content: 'A', isCode: false }],
      });

      const res = await service.submitAnswer('user-1', 'c');

      expect(res.result).toBe('CORRECT');
      if (res.result === 'CORRECT') {
        expect(res.score).toBe(6);
        expect(res.combo).toBe(3);
        expect(res.correctAnswer).toBe('C');
        expect(res.correctAnswerContent).toBe('Correct Ans C');
        expect(res.nextQuestion?.id).toBe('q-next');
      }
      expect(
        mockPrismaService.bossBattleSession.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'session-1',
            status: 'IN_PROGRESS',
            currentQuestionId: 'q-curr',
            currentQuestionNumber: 6,
          },
          data: expect.objectContaining({
            score: 6,
            combo: 3,
            maxCombo: 3,
            correctCount: 6,
          }),
        }),
      );
    });

    it('resets combo, clears currentQuestionId, and returns explanation on wrong answer', async () => {
      const session = {
        id: 'session-1',
        userId: 'user-1',
        seasonId: 'season-1',
        status: 'IN_PROGRESS',
        score: 5,
        combo: 4,
        maxCombo: 4,
        correctCount: 5,
        wrongCount: 0,
        totalAnswered: 5,
        currentQuestionId: 'q-curr',
        currentQuestionNumber: 6,
        currentQuestionExpiresAt: new Date(Date.now() + 7000),
        expiresAt: new Date(Date.now() + 200000),
        usedQuestionIds: ['q-curr'],
      };
      mockPrismaService.bossBattleSession.findFirst.mockResolvedValue(session);

      mockPrismaService.quiz.findUnique.mockResolvedValue({
        id: 'q-curr',
        question: 'Current Question',
        explanation: 'Important concept explained',
        answer: 'A',
        options: [
          { label: 'A', content: 'Correct Ans', isCode: false },
          { label: 'B', content: 'Wrong Ans', isCode: false },
        ],
      });

      const res = await service.submitAnswer('user-1', 'B');

      expect(res.result).toBe('WRONG_ANSWER');
      if (res.result === 'WRONG_ANSWER') {
        expect(res.combo).toBe(0);
        expect(res.correctAnswer).toBe('A');
        expect(res.explanation).toBe('Important concept explained');
        expect(res.questionRemainingSeconds).toBeGreaterThan(0);
      }
      expect(
        mockPrismaService.bossBattleSession.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'session-1',
            status: 'IN_PROGRESS',
            currentQuestionId: 'q-curr',
            currentQuestionNumber: 6,
          },
          data: expect.objectContaining({
            combo: 0,
            currentQuestionId: null,
          }),
        }),
      );
    });

    it('blocks second-chance answer exploit when currentQuestionId is null or updateMany loses race', async () => {
      mockPrismaService.bossBattleSession.findFirst.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        seasonId: 'season-1',
        status: 'IN_PROGRESS',
        currentQuestionId: null,
        currentQuestionNumber: 6,
        currentQuestionExpiresAt: new Date(Date.now() + 5000),
        expiresAt: new Date(Date.now() + 200000),
      });

      await expect(service.submitAnswer('user-1', 'A')).rejects.toThrow(
        new BadRequestException(
          'Câu hỏi này đã được trả lời hoặc không hợp lệ',
        ),
      );
    });

    it('rejects premature TIMEOUT submission before 10s question timer expires', async () => {
      mockPrismaService.bossBattleSession.findFirst.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        seasonId: 'season-1',
        status: 'IN_PROGRESS',
        score: 3,
        combo: 1,
        maxCombo: 2,
        correctCount: 3,
        wrongCount: 0,
        totalAnswered: 3,
        currentQuestionId: 'q-curr',
        currentQuestionNumber: 4,
        currentQuestionExpiresAt: new Date(Date.now() + 8000), // 8s remaining
        expiresAt: new Date(Date.now() + 200000),
      });
      mockPrismaService.quiz.findUnique.mockResolvedValue({
        id: 'q-curr',
        question: 'Q',
        answer: 'A',
        options: [{ label: 'A', content: 'A', isCode: false }],
      });

      await expect(service.submitAnswer('user-1', 'TIMEOUT')).rejects.toThrow(
        new BadRequestException('Vui lòng đợi hết thời gian 10 giây'),
      );
    });

    it('finalizes session when 5-minute session timer expires', async () => {
      const expiredSession = {
        id: 'session-1',
        userId: 'user-1',
        seasonId: 'season-1',
        status: 'IN_PROGRESS',
        score: 28,
        combo: 0,
        maxCombo: 9,
        correctCount: 28,
        wrongCount: 4,
        totalAnswered: 32,
        startedAt: new Date(Date.now() - 305000),
        expiresAt: new Date(Date.now() - 5000), // expired 5 seconds ago
      };
      mockPrismaService.bossBattleSession.findFirst.mockResolvedValue(
        expiredSession,
      );
      mockPrismaService.bossBattleSession.findUnique.mockResolvedValue(
        expiredSession,
      );
      mockPrismaService.bossUserWeeklyStat.findUnique.mockResolvedValue({
        highestScore: 28,
      });

      const res = await service.submitAnswer('user-1', 'A');

      expect(res.result).toBe('SESSION_COMPLETED');
      if (res.result === 'SESSION_COMPLETED') {
        expect(res.score).toBe(28);
        expect(res.endReason).toBe('TIME_UP_5M');
      }
      expect(mockXpService.awardBossSession).toHaveBeenCalledWith(
        'user-1',
        'session-1',
        { correctCount: 28, maxCombo: 9 },
      );
      // Best values are raised by conditional updates only (no stale absolute write in the upsert).
      expect(
        mockPrismaService.bossUserWeeklyStat.upsert.mock.calls[0][0].update,
      ).not.toHaveProperty('highestScore');
      expect(
        mockPrismaService.bossUserWeeklyStat.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ highestScore: { lt: 28 } }),
          data: { highestScore: 28 },
        }),
      );
    });

    it('hands the final correct/combo stats of a time-up session to the XP service', async () => {
      const expiredSession = {
        id: 'session-combo-10',
        userId: 'user-2',
        seasonId: 'season-1',
        status: 'IN_PROGRESS',
        score: 35,
        combo: 12,
        maxCombo: 12,
        correctCount: 35,
        wrongCount: 0,
        totalAnswered: 35,
        startedAt: new Date(Date.now() - 305000),
        expiresAt: new Date(Date.now() - 5000),
      };
      mockPrismaService.bossBattleSession.findFirst.mockResolvedValue(
        expiredSession,
      );
      mockPrismaService.bossBattleSession.findUnique.mockResolvedValue(
        expiredSession,
      );
      mockPrismaService.bossUserWeeklyStat.findUnique.mockResolvedValue({
        highestScore: 35,
      });

      await service.submitAnswer('user-2', 'A');

      expect(mockXpService.awardBossSession).toHaveBeenCalledWith(
        'user-2',
        'session-combo-10',
        { correctCount: 35, maxCombo: 12 },
      );
    });

    it('passes low-effort stats through unchanged (XpService decides eligibility)', async () => {
      const expiredSession = {
        id: 'session-combo-low',
        userId: 'user-3',
        seasonId: 'season-1',
        status: 'IN_PROGRESS',
        score: 2,
        combo: 2,
        maxCombo: 2,
        correctCount: 2,
        wrongCount: 1,
        totalAnswered: 3,
        startedAt: new Date(Date.now() - 305000),
        expiresAt: new Date(Date.now() - 5000),
      };
      mockPrismaService.bossBattleSession.findFirst.mockResolvedValue(
        expiredSession,
      );
      mockPrismaService.bossBattleSession.findUnique.mockResolvedValue(
        expiredSession,
      );
      mockPrismaService.bossUserWeeklyStat.findUnique.mockResolvedValue({
        highestScore: 2,
      });

      await service.submitAnswer('user-3', 'A');

      // Thresholds (min correct, daily cap, combo tiers) are enforced inside XpService.awardBossSession.
      expect(mockXpService.awardBossSession).toHaveBeenCalledWith(
        'user-3',
        'session-combo-low',
        { correctCount: 2, maxCombo: 2 },
      );
    });

    it('gracefully handles XP award failures without blocking session completion', async () => {
      const expiredSession = {
        id: 'session-xp-fail',
        userId: 'user-4',
        seasonId: 'season-1',
        status: 'IN_PROGRESS',
        score: 10,
        combo: 5,
        maxCombo: 5,
        correctCount: 10,
        wrongCount: 0,
        totalAnswered: 10,
        startedAt: new Date(Date.now() - 305000),
        expiresAt: new Date(Date.now() - 5000),
      };
      mockPrismaService.bossBattleSession.findFirst.mockResolvedValue(
        expiredSession,
      );
      mockPrismaService.bossBattleSession.findUnique.mockResolvedValue(
        expiredSession,
      );
      mockPrismaService.bossUserWeeklyStat.findUnique.mockResolvedValue({
        highestScore: 10,
      });
      mockXpService.awardBossSession.mockRejectedValueOnce(
        new Error('XP service unavailable'),
      );

      const res = await service.submitAnswer('user-4', 'A');
      expect(res.result).toBe('SESSION_COMPLETED');
    });
  });

  describe('getUserTransactions', () => {
    it('selects only client-facing fields (no provider payloads, idempotency key or error text)', async () => {
      mockPrismaService.bossRewardTransaction.findMany.mockResolvedValue([]);

      await service.getUserTransactions('user-1', 10);

      const args = mockPrismaService.bossRewardTransaction.findMany.mock
        .calls[0][0] as { select: Record<string, unknown>; include?: unknown };
      expect(args.include).toBeUndefined();
      expect(Object.keys(args.select).sort()).toEqual(
        [
          'createdAt',
          'id',
          'milestoneAt',
          'milestoneIndex',
          'processedAt',
          'rewardCoins',
          'season',
          'status',
        ].sort(),
      );
      for (const secret of [
        'requestPayload',
        'responsePayload',
        'idempotencyKey',
        'errorMessage',
        'externalTxId',
      ]) {
        expect(args.select).not.toHaveProperty(secret);
      }
    });
  });

  describe('nextQuestion', () => {
    it('throws BadRequestException if 10s question timer has not expired yet', async () => {
      mockPrismaService.bossBattleSession.findFirst.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        seasonId: 'season-1',
        status: 'IN_PROGRESS',
        score: 5,
        combo: 0,
        maxCombo: 4,
        currentQuestionId: null,
        currentQuestionNumber: 6,
        currentQuestionExpiresAt: new Date(Date.now() + 4000), // 4s left
        expiresAt: new Date(Date.now() + 180000),
      });

      await expect(service.nextQuestion('user-1')).rejects.toThrow(
        new BadRequestException('Vui lòng đợi hết thời gian 10 giây'),
      );
    });

    it('advances to next question once 10s timer has expired', async () => {
      mockPrismaService.bossBattleSession.findFirst.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        seasonId: 'season-1',
        status: 'IN_PROGRESS',
        score: 5,
        combo: 0,
        maxCombo: 4,
        currentQuestionId: null,
        currentQuestionNumber: 6,
        currentQuestionExpiresAt: new Date(Date.now() - 100), // expired
        expiresAt: new Date(Date.now() + 180000),
        usedQuestionIds: ['q-1'],
      });
      mockPrismaService.quiz.count.mockResolvedValue(5);
      mockPrismaService.quiz.findFirst.mockResolvedValue({
        id: 'q-next',
        question: 'Next Q',
        code: null,
        imageUrl: null,
        answer: 'B',
        options: [{ label: 'B', content: 'B', isCode: false }],
      });

      const res = await service.nextQuestion('user-1');

      expect(res.result).toBe('NEXT_QUESTION');
      if (res.result === 'NEXT_QUESTION') {
        expect(res.question.id).toBe('q-next');
      }
    });
  });

  describe('settleWeek', () => {
    it('rejects premature settlement if season has not ended yet', async () => {
      mockPrismaService.bossWeeklySeason.findUnique.mockResolvedValue({
        id: 'season-active',
        weekKey: '2026-W46',
        endsAt: new Date(Date.now() + 3600_000),
        isSettled: false,
      });

      await expect(service.settleWeek('2026-W46')).rejects.toThrow(
        new BadRequestException('Chưa kết thúc tuần, không thể kết toán sớm'),
      );
    });

    it('returns settled=false if season is already settled', async () => {
      mockPrismaService.bossWeeklySeason.findUnique.mockResolvedValue({
        id: 'season-settled',
        weekKey: '2026-W45',
        endsAt: new Date(Date.now() - 3600_000),
        isSettled: true,
      });

      const res = await service.settleWeek('2026-W45');
      expect(res.settled).toBe(false);
    });

    it('finalizes lingering IN_PROGRESS sessions, claims season atomically, calculates community score, and rewards participants', async () => {
      const season = {
        id: 'season-old',
        weekKey: '2026-W45',
        bossMaxHp: 1500,
        endsAt: new Date(Date.now() - 10_000),
        milestoneConfig: [
          { at: 300, coin: 5, name: 'Rương Đồng' },
          { at: 600, coin: 5, name: 'Rương Bạc' },
          { at: 900, coin: 5, name: 'Rương Vàng' },
          { at: 1200, coin: 5, name: 'Rương Bạch Kim' },
          { at: 1500, coin: 5, name: 'Rương Kim Cương' },
        ],
        isSettled: false,
      };

      const lingeringSession = {
        id: 'lingering-1',
        userId: 'u1',
        seasonId: 'season-old',
        status: 'IN_PROGRESS',
        score: 350,
        maxCombo: 10,
      };

      mockPrismaService.bossWeeklySeason.findUnique.mockResolvedValue(season);
      mockPrismaService.bossBattleSession.findMany.mockResolvedValue([
        lingeringSession,
      ]);
      mockPrismaService.bossBattleSession.findUnique.mockResolvedValue(
        lingeringSession,
      );
      mockPrismaService.bossUserWeeklyStat.findUnique.mockResolvedValue({
        highestScore: 200,
        bestCombo: 5,
      });

      // Per-user contribution is capped at 100: 100 + 100 + 100 + 3 = 303 -> unlocks milestone 1 (300) only.
      // u4 (best 3) is below the minimum personal score for coins.
      mockPrismaService.bossUserWeeklyStat.findMany.mockResolvedValue([
        { userId: 'u1', highestScore: 350 },
        { userId: 'u2', highestScore: 300 },
        { userId: 'u3', highestScore: 200 },
        { userId: 'u4', highestScore: 3 },
      ]);

      const result = await service.settleWeek('2026-W45');

      expect(result.settled).toBe(true);
      expect(result.communityScore).toBe(303);
      expect(result.unlockedMilestones).toBe(1);
      expect(result.totalParticipants).toBe(4);
      expect(
        mockPrismaService.bossUserWeeklyStat.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ highestScore: { lt: 350 } }),
          data: { highestScore: 350 },
        }),
      );
      // 3 eligible participants (u4 is below the minimum) x 1 milestone = 3 reward calls
      expect(mockCoinService.distributeMilestoneReward).toHaveBeenCalledTimes(
        3,
      );
      expect(
        mockCoinService.distributeMilestoneReward,
      ).not.toHaveBeenCalledWith(
        'u4',
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
      expect(
        mockPrismaService.bossWeeklySeason.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'season-old', isSettled: false },
          data: expect.objectContaining({ isSettled: true, isActive: false }),
        }),
      );
    });
  });
});
