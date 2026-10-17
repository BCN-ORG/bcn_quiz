import { NotificationType } from '@prisma/client';
import { NotificationService } from './notification.service';
import { NotificationRealtimeService } from './notification-realtime.service';

describe('NotificationService', () => {
  const result = {
    id: 'result-1',
    userId: 'user-new',
    topicId: 'topic-1',
    businessDate: '2026-10-11',
    score: 1000,
  };
  const make = (
    rank: number,
    before: Array<{ rank: number; userId: string }> = [],
  ) => {
    const created: Array<Record<string, unknown>> = [];
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([
          { rank, userId: result.userId },
          ...before.map((row) => ({ rank: row.rank + 1, userId: row.userId })),
        ]),
      notification: {
        createManyAndReturn: jest.fn(
          async ({ data }: { data: Array<Record<string, unknown>> }) => {
            created.push(...data);
            return data;
          },
        ),
      },
    };
    return {
      service: new NotificationService({} as never, {} as never),
      tx,
      created,
    };
  };

  it.each([
    [2, NotificationType.LEADERBOARD_TOP3],
    [8, NotificationType.LEADERBOARD_TOP10],
    [14, NotificationType.LEADERBOARD_RESULT],
  ])(
    'creates only the priority notification at rank %i',
    async (rank, type) => {
      const { service, tx, created } = make(rank);
      await service.recordOfficial(tx as never, result as never, 'Topic', []);
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        type,
        dedupKey: 'result:user-new:topic-1:2026-10-11',
      });
    },
  );

  it('notifies only users crossing rank 3 or 10, with one key per threshold', async () => {
    const before = [
      { rank: 3, userId: 'third' },
      { rank: 10, userId: 'tenth' },
    ];
    const { service, tx, created } = make(1, before);
    await service.recordOfficial(tx as never, result as never, 'Topic', before);
    expect(created.map((row) => row.type)).toEqual([
      NotificationType.LEADERBOARD_TOP3,
      NotificationType.LEADERBOARD_RANK_DROPPED,
      NotificationType.LEADERBOARD_RANK_DROPPED,
    ]);
    expect(created.map((row) => row.dedupKey)).toEqual([
      'result:user-new:topic-1:2026-10-11',
      'drop-top3:third:topic-1:2026-10-11',
      'drop-top10:tenth:topic-1:2026-10-11',
    ]);
  });

  it('isolates realtime failure after persistence', async () => {
    const realtime = {
      publish: jest.fn().mockImplementation(() => {
        throw new Error('socket gone');
      }),
    };
    const prisma = {
      notification: {
        groupBy: jest
          .fn()
          .mockResolvedValue([{ userId: 'a', _count: { _all: 1 } }]),
      },
    };
    const service = new NotificationService(prisma as never, realtime as never);
    await expect(
      service.publishCreated([{ id: 'n', userId: 'a' }] as never),
    ).resolves.toBeUndefined();
    expect(realtime.publish).toHaveBeenCalledTimes(1);
  });

  it('enforces ownership for mark read', async () => {
    const prisma = {
      notification: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new NotificationService(prisma as never, {} as never);
    await expect(service.markRead('user-a', 'notification-b')).rejects.toThrow(
      'Notification not found',
    );
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'notification-b', userId: 'user-a', isRead: false },
      }),
    );
  });
});

describe('NotificationRealtimeService', () => {
  it('fans out to all tabs of one user and cleans disconnected tabs', () => {
    const service = new NotificationRealtimeService();
    const a1 = jest.fn();
    const a2 = jest.fn();
    const b = jest.fn();
    const s1 = service.subscribe('a').subscribe(a1);
    const s2 = service.subscribe('a').subscribe(a2);
    const s3 = service.subscribe('b').subscribe(b);
    service.publish('a', { notification: { id: 'n' }, unreadCount: 1 });
    expect(a1).toHaveBeenCalledTimes(1);
    expect(a2).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    s1.unsubscribe();
    s2.unsubscribe();
    s3.unsubscribe();
    expect(service.activeCount('a')).toBe(0);
    expect(service.activeCount('b')).toBe(0);
  });

  it('sends heartbeat every 25 seconds while connected', () => {
    jest.useFakeTimers();
    try {
      const service = new NotificationRealtimeService();
      const received = jest.fn();
      const connection = service.subscribe('a').subscribe(received);
      jest.advanceTimersByTime(25_000);
      expect(received).toHaveBeenCalledWith({ type: 'ping', data: {} });
      connection.unsubscribe();
      jest.advanceTimersByTime(25_000);
      expect(received).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
