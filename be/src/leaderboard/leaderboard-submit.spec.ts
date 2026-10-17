import { AttemptSessionStatus } from '@prisma/client';
import { AttemptService } from '../attempt/attempt.service';

describe('official topic leaderboard submit', () => {
  it('keeps the first serialized submission, allows the next day and separates topics', async () => {
    const dates = [
      new Date('2026-10-11T02:00:00.010Z'),
      new Date('2026-10-11T02:00:00.020Z'),
      new Date('2026-10-11T17:00:00.000Z'),
      new Date('2026-10-11T03:00:00.000Z'),
    ];
    const sessions = new Map(
      ['a', 'b', 'c', 'd'].map((id) => [
        id,
        {
          id,
          userId: 'user-1',
          topicId: id === 'd' ? 'topic-2' : 'topic-1',
          status: AttemptSessionStatus.IN_PROGRESS,
          answers: Object.fromEntries(
            Array.from({ length: id === 'a' ? 4 : 5 }, (_, i) => [
              `q${i}`,
              'A',
            ]),
          ),
          startedAt: new Date('2026-10-11T01:00:00.000Z'),
          expiresAt: new Date('2027-01-01T00:00:00.000Z'),
        },
      ]),
    );
    const official = new Map<
      string,
      {
        sessionId: string;
        score: number;
        businessDate: string;
        submittedAt: Date;
        totalQuestions: number;
      }
    >();
    const quizzes = Array.from({ length: 5 }, (_, i) => ({
      id: `q${i}`,
      quizCode: `Q${i}`,
      question: `Question ${i}`,
      code: null,
      explanation: null,
      imageUrl: null,
      answer: 'A',
      options: [{ label: 'A', content: 'yes', isCode: false }],
    }));
    let tail = Promise.resolve();
    const prisma = {
      attemptSession: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
          sessions.get(where.id),
        ),
      },
      topic: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({
          id: where.id,
          name: where.id,
          slug: where.id,
          startsAt: null,
          endsAt: null,
        })),
      },
      quiz: { findMany: jest.fn().mockResolvedValue(quizzes) },
      $transaction: jest.fn(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          const before = tail;
          let unlock!: () => void;
          tail = new Promise<void>((resolve) => {
            unlock = resolve;
          });
          let calls = 0;
          let acquired = false;
          const tx = {
            $executeRaw: jest.fn(async () => {
              await before;
              acquired = true;
              return 1;
            }),
            $queryRaw: jest.fn(async () => {
              calls += 1;
              if (calls === 1)
                return [{ epochMs: BigInt(dates.shift()!.getTime()) }];
              return [{ count: 5 }];
            }),
            attemptSession: {
              updateMany: jest.fn(
                async ({ where }: { where: { id: string } }) => {
                  const session = sessions.get(where.id);
                  if (
                    !session ||
                    session.status === AttemptSessionStatus.SUBMITTED
                  )
                    return { count: 0 };
                  session.status = AttemptSessionStatus.SUBMITTED;
                  return { count: 1 };
                },
              ),
            },
            quizAttempt: { createMany: jest.fn() },
            quiz: { count: jest.fn().mockResolvedValue(5) },
            topicProgress: {
              findUnique: jest.fn().mockResolvedValue(null),
              create: jest.fn(),
            },
            topicLeaderboardResult: {
              findUniqueOrThrow: jest.fn(async ({ where }) => {
                const key = `${where.userId_topicId_businessDate.userId}:${where.userId_topicId_businessDate.topicId}:${where.userId_topicId_businessDate.businessDate}`;
                return {
                  id: key,
                  userId: where.userId_topicId_businessDate.userId,
                  topicId: where.userId_topicId_businessDate.topicId,
                  businessDate: where.userId_topicId_businessDate.businessDate,
                  ...official.get(key),
                };
              }),
              createMany: jest.fn(
                async ({
                  data,
                }: {
                  data: Array<{
                    userId: string;
                    topicId: string;
                    businessDate: string;
                    sessionId: string;
                    score: number;
                    submittedAt: Date;
                    totalQuestions: number;
                  }>;
                }) => {
                  const row = data[0];
                  const key = `${row.userId}:${row.topicId}:${row.businessDate}`;
                  if (official.has(key)) return { count: 0 };
                  official.set(key, row);
                  return { count: 1 };
                },
              ),
            },
          };
          try {
            return await callback(tx);
          } finally {
            if (acquired) unlock();
          }
        },
      ),
    };
    const leaderboard = {
      resultForSubmit: jest.fn(
        async (
          userId: string,
          topicId: string,
          date: string,
          sessionId: string,
        ) => {
          const result = official.get(`${userId}:${topicId}:${date}`)!;
          return {
            isOfficial: result.sessionId === sessionId,
            score: result.score,
            rank: 1,
            businessDate: date,
            maxScore: 1000,
          };
        },
      ),
    };
    const service = new AttemptService(
      prisma as never,
      { evaluateCoursesByTopic: jest.fn() } as never,
      { createTimelineEvent: jest.fn() } as never,
      leaderboard as never,
      {
        captureBoundary: jest.fn().mockResolvedValue([]),
        recordOfficial: jest.fn().mockResolvedValue([]),
        publishCreated: jest.fn().mockResolvedValue(undefined),
      } as never,
    );
    const req = { user: { id: 'user-1' } } as never;

    const [first, retry] = await Promise.all([
      service.submitSession('a', req),
      service.submitSession('b', req),
    ]);
    expect(official.size).toBe(1);
    expect(first.leaderboard).toMatchObject({
      isOfficial: true,
      score: 800,
      attemptScore: 800,
    });
    expect(retry.leaderboard).toMatchObject({
      isOfficial: false,
      score: 800,
      attemptScore: 1000,
    });
    expect(official.get('user-1:topic-1:2026-10-11')).toMatchObject({
      sessionId: 'a',
      totalQuestions: 5,
    });

    await service.submitSession('c', req);
    await service.submitSession('d', req);
    expect(official.get('user-1:topic-1:2026-10-12')).toMatchObject({
      sessionId: 'c',
      score: 1000,
    });
    expect(official.get('user-1:topic-2:2026-10-11')).toMatchObject({
      sessionId: 'd',
      score: 1000,
    });
    expect(official.get('user-1:topic-1:2026-10-11')).toMatchObject({
      score: 800,
      totalQuestions: 5,
    });
    quizzes.push({
      id: 'q5',
      quizCode: 'Q5',
      question: 'New question',
      code: null,
      explanation: null,
      imageUrl: null,
      answer: 'A',
      options: [{ label: 'A', content: 'yes', isCode: false }],
    });
    expect(official.get('user-1:topic-1:2026-10-11')).toMatchObject({
      score: 800,
      correctCount: 4,
      totalQuestions: 5,
    });
  });
});
