import { NotificationSchedulerService } from './notification-scheduler.service';

describe('NotificationSchedulerService', () => {
  it('caps daily reminders, excludes closed/completed topics, and remains idempotent', async () => {
    const stored = new Map<
      string,
      { userId: string; topicId: string; dedupKey: string }
    >();
    const topics = ['one', 'two', 'three'].map((id) => ({
      id,
      name: id,
      startsAt: null,
      endsAt: null,
      _count: { quizzes: 1 },
    }));
    topics.push({
      id: 'closed',
      name: 'closed',
      startsAt: null,
      endsAt: new Date('2026-10-10T00:00:00Z'),
      _count: { quizzes: 1 },
    });
    const prisma = {
      topic: { findMany: jest.fn().mockResolvedValue(topics) },
      topicLeaderboardResult: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ userId: 'a', topicId: 'one' }]),
      },
      topicProgress: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ userId: 'a', topicId: 'two' }]),
      },
      notification: {
        findMany: jest.fn(async () => [...stored.values()]),
        createManyAndReturn: jest.fn(
          async ({
            data,
          }: {
            data: Array<{ userId: string; topicId: string; dedupKey: string }>;
          }) => {
            const created = data.filter((row) => !stored.has(row.dedupKey));
            created.forEach((row) => stored.set(row.dedupKey, row));
            return created;
          },
        ),
      },
    };
    const service = new NotificationSchedulerService(
      prisma as never,
      {
        eligibleUserIds: jest
          .fn()
          .mockResolvedValue({ userIds: ['a', 'b'], total: 2 }),
      } as never,
      {} as never,
      { publishCreated: jest.fn() } as never,
    );
    const date = new Date('2026-10-11T12:00:00Z');
    await service.runDailyReminders(date);
    await service.runDailyReminders(date);
    expect(
      [...stored.values()].map((row) => `${row.userId}:${row.topicId}`),
    ).toEqual(['a:three', 'b:one', 'b:two']);
  });

  it('uses weekly ranks for progress and closed-week summary once per user/topic/week', async () => {
    const keys = new Set<string>();
    const prisma = {
      topicLeaderboardResult: {
        groupBy: jest.fn().mockResolvedValue([{ topicId: 'topic' }]),
      },
      topic: {
        findMany: jest.fn().mockResolvedValue([{ id: 'topic', name: 'Topic' }]),
      },
      notification: {
        createManyAndReturn: jest.fn(
          async ({ data }: { data: Array<{ dedupKey: string }> }) => {
            const created = data.filter((row) => !keys.has(row.dedupKey));
            created.forEach((row) => keys.add(row.dedupKey));
            return created;
          },
        ),
      },
    };
    const leaderboard = {
      weeklyRows: jest
        .fn()
        .mockResolvedValue([
          { userId: 'a', rank: 2, score: 1700, completedDays: 2 },
        ]),
    };
    const notifications = { publishCreated: jest.fn() };
    const service = new NotificationSchedulerService(
      prisma as never,
      {} as never,
      leaderboard as never,
      notifications as never,
    );
    await service.runWeekly('progress', new Date('2026-10-15T11:00:00Z'));
    await service.runWeekly('progress', new Date('2026-10-15T11:00:00Z'));
    await service.runWeekly('summary', new Date('2026-10-19T01:00:00Z'));
    await service.runWeekly('summary', new Date('2026-10-19T01:00:00Z'));
    expect([...keys]).toEqual([
      'weekly-progress:a:topic:2026-10-12',
      'weekly-summary:a:topic:2026-10-12',
    ]);
    expect(prisma.notification.createManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            message: expect.stringContaining('1,700'),
          }),
        ],
      }),
    );
  });
});
