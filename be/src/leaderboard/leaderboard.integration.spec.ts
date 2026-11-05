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
    resolveUsersDetailed: jest
      .fn()
      .mockResolvedValue({ users: new Map(), failed: false }),
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
    counted: boolean | null = true,
  ) => {
    const session = await newSession(userId, topicId);
    return prisma.topicLeaderboardResult.create({
      data: {
        userId,
        topicId,
        sessionId: session.id,
        businessDate,
        isCounted: counted,
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

  it('overall weekly board sums official results across topics, Monday-Sunday, and counts topics', async () => {
    // A far-away week so rows from other tests (the board is global) cannot leak in.
    const [a, b, c] = [await newTopic(), await newTopic(), await newTopic()];
    // u-x: two topics counted (Mon + Sun); a third row is practice history (NULL) and must not add up.
    await insertResult(
      a,
      'u-x',
      '2031-01-06',
      500,
      1000,
      '2031-01-06T03:00:00Z',
    );
    await insertResult(
      b,
      'u-x',
      '2031-01-12',
      500,
      1000,
      '2031-01-12T03:00:00Z',
    );
    await insertResult(
      c,
      'u-x',
      '2031-01-07',
      900,
      1000,
      '2031-01-07T03:00:00Z',
      null,
    );
    // u-y: one topic with the same total; fewer topics ranks below u-x.
    await insertResult(
      a,
      'u-y',
      '2031-01-08',
      1000,
      1000,
      '2031-01-08T03:00:00Z',
    );
    // u-z: counted, but on the next Monday: not part of this week.
    await insertResult(
      a,
      'u-z',
      '2031-01-13',
      1000,
      1000,
      '2031-01-13T03:00:00Z',
    );

    const board = await service.listWeekly(
      { weekStart: '2031-01-08' },
      asUser('u-x'),
    );

    expect(board.weekStart).toBe('2031-01-06');
    expect(board.weekEnd).toBe('2031-01-12');
    const items = board.items as Array<{
      user: { id: string };
      weeklyScore: number;
      topicsCompleted: number;
    }>;
    expect(items.map((item) => item.user.id)).toEqual(['u-x', 'u-y']);
    expect(items.map((item) => item.weeklyScore)).toEqual([1000, 1000]);
    expect(items.map((item) => item.topicsCompleted)).toEqual([2, 1]);
    expect(board.currentUserRank).toBe(1);
    expect(board.pagination.total).toBe(2);
    // Overall progress is all-time: u-x has official results in 2 topics.
    expect(board.progress.topicsDone).toBe(2);
  });

  it('progress: topicsTotal counts only topics that have questions, topicsDone is all time', async () => {
    const before = (
      await service.listWeekly({ weekStart: '2031-04-07' }, asUser('prog-1'))
    ).progress;
    expect(before.topicsDone).toBe(0);
    const topicId = await newTopic();
    await prisma.quiz.create({
      data: {
        quizCode: `P-${randomUUID()}`,
        question: 'q',
        answer: 'A',
        topicId,
      },
    });
    await newTopic(); // a topic without questions must not count
    await insertResult(
      topicId,
      'prog-1',
      '2031-01-06',
      700,
      1000,
      '2031-01-06T03:00:00Z',
    );
    const after = (
      await service.listWeekly({ weekStart: '2031-04-07' }, asUser('prog-1'))
    ).progress;
    // The result is from January, the requested week is in April: still counted as done.
    expect(after.topicsDone).toBe(1);
    expect(after.topicsTotal).toBe(before.topicsTotal + 1);
  });

  it('rejects a second counted result for the same user and topic on another day, but keeps uncounted history', async () => {
    const topicId = await newTopic();
    await insertResult(
      topicId,
      'once',
      '2026-10-12',
      500,
      1000,
      '2026-10-12T03:00:00Z',
    );
    await expect(
      insertResult(
        topicId,
        'once',
        '2026-10-13',
        900,
        500,
        '2026-10-13T03:00:00Z',
      ),
    ).rejects.toMatchObject({ code: 'P2002' });
    // Any number of NULL (practice/history) rows is fine, and they never reach the daily board.
    await insertResult(
      topicId,
      'once',
      '2026-10-13',
      900,
      500,
      '2026-10-13T03:00:00Z',
      null,
    );
    await insertResult(
      topicId,
      'once',
      '2026-10-14',
      900,
      500,
      '2026-10-14T03:00:00Z',
      null,
    );
    const day2 = await service.list(
      topicId,
      'daily',
      { date: '2026-10-13' },
      req,
    );
    expect(day2.pagination.total).toBe(0);
    const day1 = await service.list(
      topicId,
      'daily',
      { date: '2026-10-12' },
      req,
    );
    expect(day1.items.map((i) => i?.user.id)).toEqual(['once']);
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

  const asUser = (id: string) => ({ user: { id } }) as never;

  it('keeps a score of 0 on the board, after every positive score, ordered by duration', async () => {
    const topicId = await newTopic();
    const date = '2026-10-14';
    await insertResult(
      topicId,
      'zero-slow',
      date,
      0,
      9000,
      '2026-10-14T03:00:00Z',
    );
    await insertResult(topicId, 'top', date, 100, 9000, '2026-10-14T03:00:00Z');
    await insertResult(
      topicId,
      'zero-fast',
      date,
      0,
      1000,
      '2026-10-14T04:00:00Z',
    );

    const board = await service.list(
      topicId,
      'daily',
      { date },
      asUser('zero-slow'),
    );

    expect(board.items.map((item) => item?.user.id)).toEqual([
      'top',
      'zero-fast',
      'zero-slow',
    ]);
    expect(board.currentUserRank).toBe(3);
    expect(board.currentUserResult).toMatchObject({ rank: 3, score: 0 });
    expect(board.top10Cutoff).toBeNull(); // fewer than 10 results
  });

  it('gives a viewer without a result no rank and no result, while the board still lists everyone', async () => {
    const topicId = await newTopic();
    const date = '2026-10-14';
    await insertResult(topicId, 'a', date, 700, 1000, '2026-10-14T03:00:00Z');
    await insertResult(topicId, 'b', date, 600, 1000, '2026-10-14T03:00:00Z');

    const board = await service.list(
      topicId,
      'daily',
      { date },
      asUser('never-played'),
    );

    expect(board.currentUserRank).toBeNull();
    expect(board.currentUserResult).toBeNull();
    expect(board.aroundMe).toEqual([]);
    expect(board.items.map((item) => item?.rank)).toEqual([1, 2]);
    expect(board.pagination.total).toBe(2);
  });

  it('empty day: no items, total 0, no rank', async () => {
    const topicId = await newTopic();
    const board = await service.list(
      topicId,
      'daily',
      { date: '2026-10-14' },
      asUser('x'),
    );
    expect(board.items).toEqual([]);
    expect(board.pagination).toMatchObject({ total: 0, totalPages: 1 });
    expect(board.currentUserRank).toBeNull();
    expect(board.top3).toEqual([]);
  });

  it('pages are contiguous and the viewer is on page ceil(rank/limit); aroundMe is clipped at the top', async () => {
    const topicId = await newTopic();
    const date = '2026-10-14';
    for (let i = 1; i <= 45; i += 1) {
      await insertResult(
        topicId,
        `p${String(i).padStart(2, '0')}`,
        date,
        1000 - i * 10,
        60_000 + i,
        '2026-10-14T03:00:00Z',
      );
    }
    const limit = 20;
    const page = (n: number, user: string) =>
      service.list(topicId, 'daily', { date, page: n, limit }, asUser(user));

    const p1 = await page(1, 'p37');
    const p2 = await page(2, 'p37');
    const p3 = await page(3, 'p37');
    expect(p1.items.map((i) => i?.rank)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    expect(p2.items.map((i) => i?.rank)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 21),
    );
    expect(p3.items.map((i) => i?.rank)).toEqual([41, 42, 43, 44, 45]);
    expect(p1.pagination).toMatchObject({ total: 45, totalPages: 3 });
    expect(p1.currentUserRank).toBe(37);
    expect(p1.top3.map((i) => i?.rank)).toEqual([1, 2, 3]);
    expect(p1.top10Cutoff).toBe(900); // score of rank 10 (1000 - 10 * 10)
    expect(p2.items.some((i) => i?.user.id === 'p37')).toBe(true); // ceil(37 / 20) = 2
    expect(p1.items.some((i) => i?.user.id === 'p37')).toBe(false);
    expect(p1.aroundMe.map((i) => i?.rank)).toEqual([35, 36, 37, 38, 39]);

    const first = await page(1, 'p01');
    expect(first.aroundMe.map((i) => i?.rank)).toEqual([1, 2, 3]);
    const last = await page(3, 'p45');
    expect(last.aroundMe.map((i) => i?.rank)).toEqual([43, 44, 45]);
  });

  it('weekly ties: weekly score, topics done, total duration, last submission, then userId', async () => {
    const [a, b] = [await newTopic(), await newTopic()];
    // Week 2031-02-03 .. 2031-02-09; each user has at most one official result per topic.
    await insertResult(
      a,
      'w-a',
      '2031-02-03',
      600,
      9000,
      '2031-02-03T05:00:00Z',
    ); // 600, 1 topic
    await insertResult(
      a,
      'w-b',
      '2031-02-03',
      300,
      5000,
      '2031-02-03T03:00:00Z',
    );
    await insertResult(
      b,
      'w-b',
      '2031-02-04',
      300,
      5000,
      '2031-02-04T03:00:00Z',
    ); // 600, 2 topics: beats w-a
    await insertResult(
      a,
      'w-c',
      '2031-02-03',
      300,
      4000,
      '2031-02-03T03:00:00Z',
    ); // 300
    await insertResult(
      b,
      'w-d',
      '2031-02-03',
      300,
      4000,
      '2031-02-03T02:00:00Z',
    ); // same but earlier last submit
    await insertResult(
      a,
      'w-f',
      '2031-02-05',
      100,
      1000,
      '2031-02-05T03:00:00Z',
    ); // full tie with w-g: userId
    await insertResult(
      b,
      'w-g',
      '2031-02-05',
      100,
      1000,
      '2031-02-05T03:00:00Z',
    );
    await insertResult(a, 'w-e', '2031-02-03', 0, 1000, '2031-02-03T03:00:00Z'); // 0 points still ranked
    await insertResult(
      b,
      'w-e',
      '2031-02-04',
      1000,
      1,
      '2031-02-04T03:00:00Z',
      null,
    ); // history: ignored

    const board = await service.listWeekly(
      { weekStart: '2031-02-05' },
      asUser('w-e'),
    );

    expect(board.items.map((i) => i?.user.id)).toEqual([
      'w-b',
      'w-a',
      'w-d',
      'w-c',
      'w-f',
      'w-g',
      'w-e',
    ]);
    expect(board.currentUserRank).toBe(7);
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

    it('treats a later submit (another day) as practice: no new row, no notification, no rank, same official result', async () => {
      const topicId = await seedTopic();
      // The user's first-ever submit of this topic happened on an earlier business day.
      const first = await insertResult(
        topicId,
        'again-1',
        '2026-10-01',
        500,
        9000,
        '2026-10-01T03:00:00Z',
      );
      const later = await answeredSession('again-1', topicId);

      const result = await attempts.submitSession(later.id, asUser('again-1'));

      expect(result.leaderboard).toMatchObject({
        isOfficial: false,
        score: 500,
        attemptScore: 1000,
        businessDate: '2026-10-01',
      });
      const rows = await prisma.topicLeaderboardResult.findMany({
        where: { topicId, userId: 'again-1' },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: first.id, isCounted: true });
      expect(
        await prisma.notification.count({
          where: { topicId, userId: 'again-1' },
        }),
      ).toBe(0);
      // The practice run is still stored as a normal attempt, and progress still updates.
      expect(
        await prisma.attemptSession.count({
          where: { id: later.id, status: 'SUBMITTED' },
        }),
      ).toBe(1);
      expect(
        await prisma.quizAttempt.count({ where: { sessionId: later.id } }),
      ).toBe(4);
      // Today's board does not list the user.
      const today = await new LeaderboardService(
        prisma,
        profiles as never,
      ).list(topicId, 'daily', {}, asUser('again-1'));
      expect(today.pagination.total).toBe(0);
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
  // 5,000 official results for one topic/day. Gated twice: only on a disposable DB AND with INTEGRATION_PERF=1.
  const maybePerf = process.env.INTEGRATION_PERF === '1' ? it : it.skip;
  maybePerf(
    'serves daily and weekly pages quickly with 5,000 results',
    async () => {
      const topicId = await newTopic();
      const date = '2026-10-14';
      const total = 5000;
      await prisma.attemptSession.createMany({
        data: Array.from({ length: total }, (_, i) => ({
          id: randomUUID(),
          userId: `perf-${i}`,
          topicId,
          answers: {},
          expiresAt: new Date(Date.now() + 3_600_000),
        })),
      });
      const sessions = await prisma.attemptSession.findMany({
        where: { topicId },
        select: { id: true, userId: true },
      });
      await prisma.topicLeaderboardResult.createMany({
        data: sessions.map((session, i) => ({
          userId: session.userId,
          topicId,
          sessionId: session.id,
          businessDate: date,
          score: (i * 7) % 1001,
          correctCount: i % 11,
          totalQuestions: 10,
          durationMs: 10_000 + ((i * 13) % 50_000),
          submittedAt: new Date(Date.UTC(2026, 9, 14, 3, 0, 0) + i * 1000),
        })),
      });
      const timings: Record<string, number> = {};
      const time = async (
        label: string,
        run: () => Promise<{ pagination: { total: number } }>,
      ) => {
        const start = performance.now();
        const board = await run();
        timings[label] = Math.round(performance.now() - start);
        expect(board.pagination.total).toBe(total);
      };
      const viewer = asUser('perf-2500');
      await time('daily page 1', () =>
        service.list(topicId, 'daily', { date, page: 1, limit: 20 }, viewer),
      );
      await time('daily page 125 (middle)', () =>
        service.list(topicId, 'daily', { date, page: 125, limit: 20 }, viewer),
      );
      await time('daily last page', () =>
        service.list(topicId, 'daily', { date, page: 250, limit: 20 }, viewer),
      );
      await time('daily viewer without result', () =>
        service.list(
          topicId,
          'daily',
          { date, page: 1, limit: 20 },
          asUser('nobody'),
        ),
      );
      await time('weekly page 1', () =>
        service.listWeekly({ weekStart: date, page: 1, limit: 20 }, viewer),
      );
      await time('weekly page 125 (middle)', () =>
        service.listWeekly({ weekStart: date, page: 125, limit: 20 }, viewer),
      );
      console.log(`PERF 5000 results (ms): ${JSON.stringify(timings)}`);
      for (const [label, ms] of Object.entries(timings))
        expect({ label, ms: ms < 2000 }).toEqual({ label, ms: true });
    },
    120_000,
  );
});
