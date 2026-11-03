import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LeaderboardService } from './leaderboard.service';
import { QuizService } from '../quiz/quiz.service';
import { AttemptService } from '../attempt/attempt.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationRealtimeService } from '../notification/notification-realtime.service';

/**
 * Real PostgreSQL checks (migrations applied). Skipped unless
 * INTEGRATION_DATABASE_URL points at a disposable database, e.g.
 *   INTEGRATION_DATABASE_URL=postgresql://.../bcn_quiz_verify?schema=public npx jest src/leaderboard/leaderboard.integration.spec.ts
 */
const integrationUrl = process.env.INTEGRATION_DATABASE_URL;
const maybeDescribe = integrationUrl ? describe : describe.skip;

maybeDescribe('Leaderboard on real PostgreSQL', () => {
  let prisma: PrismaService;
  let service: LeaderboardService;
  const topicIds: string[] = [];

  const profiles = {
    resolveUsers: jest.fn().mockResolvedValue(new Map()),
    searchUserIds: jest.fn().mockResolvedValue([]),
  };
  const req = { user: { id: 'viewer' } } as never;

  const newTopic = async () => {
    const topic = await prisma.topic.create({
      data: { name: 'it', slug: `it-${randomUUID()}` },
    });
    topicIds.push(topic.id);
    return topic.id;
  };

  const newSession = (userId: string, topicId: string) =>
    prisma.attemptSession.create({
      data: {
        userId,
        topicId,
        answers: {},
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

  const insertResult = async (
    topicId: string,
    userId: string,
    businessDate: string,
    score: number,
    durationMs: number,
    submittedAt: string,
  ) => {
    const session = await newSession(userId, topicId);
    return prisma.topicLeaderboardResult.create({
      data: {
        userId,
        topicId,
        sessionId: session.id,
        businessDate,
        score,
        correctCount: score / 100,
        totalQuestions: 10,
        durationMs,
        submittedAt: new Date(submittedAt),
      },
    });
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = integrationUrl;
    prisma = new PrismaService();
    await prisma.$connect();
    service = new LeaderboardService(prisma, profiles as never);
  });

  afterAll(async () => {
    await prisma.topic.deleteMany({ where: { id: { in: topicIds } } });
    await prisma.onModuleDestroy();
  });

  it('keeps exactly one official result under concurrent first submits', async () => {
    const topicId = await newTopic();
    const sessions = await Promise.all(
      Array.from({ length: 8 }, () => newSession('racer', topicId)),
    );

    const inserts = await Promise.all(
      sessions.map((session, index) =>
        prisma.topicLeaderboardResult.createMany({
          data: [
            {
              userId: 'racer',
              topicId,
              sessionId: session.id,
              businessDate: '2026-10-14',
              score: 100 * (index + 1),
              correctCount: index + 1,
              totalQuestions: 10,
              durationMs: 1000,
              submittedAt: new Date(),
            },
          ],
          skipDuplicates: true,
        }),
      ),
    );

    const rows = await prisma.topicLeaderboardResult.findMany({
      where: { topicId, userId: 'racer' },
    });
    expect(rows).toHaveLength(1);
    expect(inserts.reduce((sum, r) => sum + r.count, 0)).toBe(1);
  });

  it('orders daily ranks by score, duration, submittedAt, then userId', async () => {
    const topicId = await newTopic();
    const date = '2026-10-14';
    await insertResult(topicId, 'u-c', date, 800, 5000, '2026-10-14T03:00:00Z');
    await insertResult(topicId, 'u-a', date, 800, 5000, '2026-10-14T03:00:00Z');
    await insertResult(topicId, 'u-b', date, 800, 4000, '2026-10-14T05:00:00Z');
    await insertResult(topicId, 'u-d', date, 900, 9000, '2026-10-14T06:00:00Z');
    await insertResult(topicId, 'u-e', date, 800, 5000, '2026-10-14T02:00:00Z');

    const board = await service.list(topicId, 'daily', { date }, req);

    expect(board.items.map((item) => item?.user.id)).toEqual([
      'u-d',
      'u-b',
      'u-e',
      'u-a',
      'u-c',
    ]);
    expect(board.items.map((item) => item?.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it('sums weekly scores Monday-Sunday and excludes the next Monday', async () => {
    const topicId = await newTopic();
    await insertResult(
      topicId,
      'u-x',
      '2026-10-12',
      500,
      1000,
      '2026-10-12T03:00:00Z',
    );
    await insertResult(
      topicId,
      'u-x',
      '2026-10-18',
      500,
      1000,
      '2026-10-18T03:00:00Z',
    );
    await insertResult(
      topicId,
      'u-y',
      '2026-10-14',
      1000,
      1000,
      '2026-10-14T03:00:00Z',
    );
    // Next business week: must not count towards u-y this week.
    await insertResult(
      topicId,
      'u-y',
      '2026-10-19',
      1000,
      1000,
      '2026-10-19T03:00:00Z',
    );

    const board = await service.list(
      topicId,
      'weekly',
      { weekStart: '2026-10-14' },
      req,
    );

    expect(board.weekStart).toBe('2026-10-12');
    expect(board.weekEnd).toBe('2026-10-18');
    const items = board.items as Array<{
      user: { id: string };
      weeklyScore: number;
      completedDays: number;
    }>;
    // Equal weekly score (1000): more completed days ranks higher.
    expect(items.map((item) => item.user.id)).toEqual(['u-x', 'u-y']);
    expect(items.map((item) => item.weeklyScore)).toEqual([1000, 1000]);
    expect(items.map((item) => item.completedDays)).toEqual([2, 1]);
  });

  it('rejects a second official row for the same user, topic and day', async () => {
    const topicId = await newTopic();
    await insertResult(
      topicId,
      'dup',
      '2026-10-14',
      500,
      1000,
      '2026-10-14T03:00:00Z',
    );

    await expect(
      insertResult(
        topicId,
        'dup',
        '2026-10-14',
        900,
        500,
        '2026-10-14T04:00:00Z',
      ),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('public quiz list returns options but never answer or explanation', async () => {
    const topicId = await newTopic();
    const quizCode = `Q-${randomUUID()}`;
    const quiz = await prisma.quiz.create({
      data: {
        quizCode,
        question: 'What is 1+1?',
        answer: 'B',
        explanation: 'secret explanation',
        topicId,
        options: {
          create: [
            { label: 'A', content: '1' },
            { label: 'B', content: '2' },
          ],
        },
      },
    });
    const quizzes = new QuizService(prisma, {} as never, {} as never);

    const list = await quizzes.getAllQuizzes({ page: 1, limit: 100 } as never);
    const item = list.items.find((entry) => entry.id === quiz.id);

    expect(item).toBeDefined();
    expect(item).not.toHaveProperty('answer');
    expect(item).not.toHaveProperty('explanation');
    expect(
      new Set(
        item?.options.map((option) => `${option.label}:${option.content}`),
      ),
    ).toEqual(new Set(['A:1', 'B:2']));
    expect(JSON.stringify(item)).not.toContain('secret explanation');
  });

  describe('submitSession under concurrency (real transaction and locks)', () => {
    let attempts: AttemptService;

    const seedTopic = async () => {
      const topicId = await newTopic();
      for (const code of ['Q1', 'Q2', 'Q3', 'Q4']) {
        await prisma.quiz.create({
          data: {
            quizCode: code,
            question: code,
            answer: 'A',
            topicId,
            options: {
              create: [
                { label: 'A', content: 'right' },
                { label: 'B', content: 'wrong' },
              ],
            },
          },
        });
      }
      return topicId;
    };

    const answeredSession = async (userId: string, topicId: string) => {
      const quizzes = await prisma.quiz.findMany({ where: { topicId } });
      return prisma.attemptSession.create({
        data: {
          userId,
          topicId,
          answers: Object.fromEntries(quizzes.map((quiz) => [quiz.id, 'A'])),
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });
    };

    const asUser = (id: string) => ({ user: { id } }) as never;

    beforeAll(() => {
      const leaderboard = new LeaderboardService(prisma, profiles as never);
      attempts = new AttemptService(
        prisma,
        {
          evaluateCoursesByTopic: jest.fn(),
          syncUserTopicCoverage: jest.fn().mockResolvedValue(false),
          evaluateCourseProgress: jest.fn(),
        } as never,
        { createTimelineEvent: jest.fn() } as never,
        leaderboard,
        new NotificationService(prisma, new NotificationRealtimeService()),
      );
    });

    it('creates one official result and one result notification for concurrent sessions of one user', async () => {
      const topicId = await seedTopic();
      const sessions = await Promise.all(
        Array.from({ length: 5 }, () => answeredSession('racer-2', topicId)),
      );

      const settled = await Promise.allSettled(
        sessions.map((session) =>
          attempts.submitSession(session.id, asUser('racer-2')),
        ),
      );

      expect(settled.every((r) => r.status === 'fulfilled')).toBe(true);
      const official = settled.filter(
        (r) =>
          r.status === 'fulfilled' &&
          (r.value.leaderboard as { isOfficial: boolean }).isOfficial,
      );
      expect(official).toHaveLength(1);
      expect(
        await prisma.topicLeaderboardResult.count({
          where: { topicId, userId: 'racer-2' },
        }),
      ).toBe(1);
      expect(
        await prisma.attemptSession.count({
          where: { topicId, status: 'SUBMITTED' },
        }),
      ).toBe(5);
      expect(await prisma.quizAttempt.count({ where: { topicId } })).toBe(20);
      expect(
        await prisma.notification.count({
          where: { topicId, userId: 'racer-2' },
        }),
      ).toBe(1);
      const result = await prisma.topicLeaderboardResult.findFirstOrThrow({
        where: { topicId },
      });
      expect(result).toMatchObject({
        score: 1000,
        correctCount: 4,
        totalQuestions: 4,
      });
    });

    it('lets only one of two simultaneous submits of the same session win', async () => {
      const topicId = await seedTopic();
      const session = await answeredSession('racer-3', topicId);

      const settled = await Promise.allSettled([
        attempts.submitSession(session.id, asUser('racer-3')),
        attempts.submitSession(session.id, asUser('racer-3')),
      ]);

      expect(settled.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(settled.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(await prisma.quizAttempt.count({ where: { topicId } })).toBe(4);
      expect(
        await prisma.topicLeaderboardResult.count({ where: { topicId } }),
      ).toBe(1);
    });

    it('keeps independent official results for two topics on the same day', async () => {
      const topicA = await seedTopic();
      const topicB = await seedTopic();
      const [a, b] = await Promise.all([
        answeredSession('racer-4', topicA),
        answeredSession('racer-4', topicB),
      ]);

      await Promise.all([
        attempts.submitSession(a.id, asUser('racer-4')),
        attempts.submitSession(b.id, asUser('racer-4')),
      ]);

      expect(
        await prisma.topicLeaderboardResult.count({
          where: { topicId: { in: [topicA, topicB] }, userId: 'racer-4' },
        }),
      ).toBe(2);
    });
  });
});
