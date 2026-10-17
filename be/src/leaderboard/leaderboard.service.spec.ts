import ExcelJS from 'exceljs';
import { LeaderboardService } from './leaderboard.service';

describe('LeaderboardService', () => {
  const topic = { id: 'topic-1', name: 'Topic 1', slug: 'topic-1' };
  const row = (rank: number) => ({
    rank,
    userId: `user-${rank}`,
    score: 1000 - rank,
    correctCount: 1,
    totalQuestions: 1,
    durationMs: 1000,
    submittedAt: new Date('2026-10-11T02:00:00.000Z'),
  });

  it('uses the required deterministic daily and weekly ordering and weekly aggregation', () => {
    const service = new LeaderboardService({} as never, {} as never);
    const query = service as unknown as {
      rankedQuery(
        topicId: string,
        mode: 'daily' | 'weekly',
        start: string,
        end: string,
      ): { sql: string };
    };
    const daily = query.rankedQuery(
      'topic-1',
      'daily',
      '2026-10-11',
      '2026-10-11',
    ).sql;
    const weekly = query.rankedQuery(
      'topic-1',
      'weekly',
      '2026-10-05',
      '2026-10-11',
    ).sql;
    expect(daily).toContain(
      'ORDER BY score DESC, "durationMs" ASC, "submittedAt" ASC, "userId" ASC',
    );
    expect(weekly).toContain(
      'SUM(score)::int AS score, COUNT(*)::int AS "completedDays"',
    );
    expect(weekly).toContain(
      'ORDER BY score DESC, "completedDays" DESC, "totalDurationMs" ASC, "lastSubmittedAt" ASC, "userId" ASC',
    );
  });

  it('resolves more than 100 distinct users in bounded batches', async () => {
    const page = Array.from({ length: 100 }, (_, i) => row(i + 101));
    const top = Array.from({ length: 10 }, (_, i) => row(i + 1));
    const prisma = {
      topic: { findUnique: jest.fn().mockResolvedValue(topic) },
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce(page)
        .mockResolvedValueOnce([{ total: 220 }])
        .mockResolvedValueOnce(top),
    };
    const profiles = { resolveUsers: jest.fn(async () => new Map()) };
    const service = new LeaderboardService(prisma as never, profiles as never);
    const result = await service.list(
      'topic-1',
      'daily',
      { date: '2026-10-11', page: 2, limit: 100 },
      {} as never,
    );

    expect(result.items).toHaveLength(100);
    expect(result.items[0]?.rank).toBe(101);
    expect(result.top3).toHaveLength(3);
    expect(profiles.resolveUsers).toHaveBeenCalledTimes(2);
    expect(profiles.resolveUsers.mock.calls.map(([ids]) => ids.length)).toEqual(
      [100, 10],
    );
    expect(result.items[0]?.user).toEqual({
      id: 'user-101',
      fullName: 'User',
      avatarUrl: null,
    });
    expect(result.items[0]).not.toHaveProperty('email');
  });

  it('filters admin name matches after global ranking and restores all rows when cleared', async () => {
    const prisma = {
      topic: { findUnique: jest.fn().mockResolvedValue(topic) },
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([row(3)])
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([row(1), row(2), row(3)])
        .mockResolvedValueOnce([row(1), row(2), row(3)])
        .mockResolvedValueOnce([{ total: 3 }])
        .mockResolvedValueOnce([row(1), row(2), row(3)]),
    };
    const profiles = {
      searchUserIds: jest.fn().mockResolvedValue(['user-3']),
      resolveUsers: jest.fn().mockResolvedValue(new Map()),
    };
    const service = new LeaderboardService(prisma as never, profiles as never);
    const filtered = await service.list(
      'topic-1',
      'daily',
      {
        date: '2026-10-11',
        search: '  MINH  ',
      },
      {} as never,
      true,
    );
    expect(profiles.searchUserIds).toHaveBeenCalledWith('MINH');
    expect(filtered.items.map((item) => item?.rank)).toEqual([3]);
    expect(prisma.$queryRaw.mock.calls[0][2].sql).toContain(
      'WHERE "userId" IN (',
    );
    expect(prisma.$queryRaw.mock.calls[0][2].sql).not.toContain('ILIKE');
    const all = await service.list(
      'topic-1',
      'daily',
      {
        date: '2026-10-11',
        search: '',
      },
      {} as never,
      true,
    );
    expect(all.items.map((item) => item?.rank)).toEqual([1, 2, 3]);
    expect(profiles.searchUserIds).toHaveBeenCalledTimes(1);
  });

  it('returns no rows when a name does not match, even if the query is a user ID', async () => {
    const prisma = {
      topic: { findUnique: jest.fn().mockResolvedValue(topic) },
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([row(1), row(2), row(3)]),
    };
    const profiles = {
      searchUserIds: jest.fn().mockResolvedValue([]),
      resolveUsers: jest.fn().mockResolvedValue(new Map()),
    };
    const service = new LeaderboardService(prisma as never, profiles as never);
    const result = await service.list(
      'topic-1',
      'daily',
      { date: '2026-10-11', search: 'user-3' },
      {} as never,
      true,
    );
    expect(result.items).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(prisma.$queryRaw.mock.calls[0][2].sql).toContain('WHERE FALSE');
  });

  it('exports every daily row with global rank, beyond one page', async () => {
    const rows = Array.from({ length: 120 }, (_, i) => row(i + 1));
    const prisma = {
      topic: { findUnique: jest.fn().mockResolvedValue(topic) },
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce(rows)
        .mockResolvedValueOnce([]),
    };
    const profiles = {
      resolveUsers: jest.fn(
        async (ids: string[]) =>
          new Map(
            ids.map((id) => [
              id,
              { id, fullName: id, email: `${id}@example.com`, avatarUrl: null },
            ]),
          ),
      ),
    };
    const service = new LeaderboardService(prisma as never, profiles as never);
    const result = await service.export('topic-1', 'daily', '2026-10-11');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);
    const sheet = workbook.worksheets[0];

    expect(sheet.rowCount).toBe(121);
    expect(sheet.getRow(121).getCell(1).value).toBe(120);
    expect(sheet.getRow(121).getCell(4).value).toBe('user-120@example.com');
    expect(result.filename).toBe('daily-leaderboard-topic-1-2026-10-11.xlsx');
    expect(profiles.resolveUsers.mock.calls.map(([ids]) => ids.length)).toEqual(
      [100, 20],
    );
  });

  it('exports all weekly rows with aggregated fields', async () => {
    const prisma = {
      topic: { findUnique: jest.fn().mockResolvedValue(topic) },
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          {
            rank: 1,
            userId: 'user-1',
            score: 2700,
            completedDays: 3,
            totalDurationMs: 930000n,
            lastSubmittedAt: new Date('2026-10-07T02:00:00.000Z'),
          },
        ])
        .mockResolvedValueOnce([]),
    };
    const service = new LeaderboardService(
      prisma as never,
      { resolveUsers: jest.fn().mockResolvedValue(new Map()) } as never,
    );
    const result = await service.export('topic-1', 'weekly', '2026-10-07');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);
    const sheet = workbook.worksheets[0];

    expect((sheet.getRow(2).values as unknown[]).slice(1)).toEqual([
      1,
      'user-1',
      'Unknown',
      '',
      'Topic 1',
      '2026-10-05',
      '2026-10-11',
      2700,
      3,
      930000,
      '2026-10-07T02:00:00.000Z',
    ]);
  });
});
