import { BadRequestException, ConflictException } from '@nestjs/common';
import { BossAdminService } from './boss-admin.service';
import { BossService } from './boss.service';

describe('BossAdminService', () => {
  const prisma = {
    bossWeeklySeason: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    bossUserWeeklyStat: { findMany: jest.fn() },
    bossRewardTransaction: { groupBy: jest.fn(), findMany: jest.fn() },
  };
  const profiles = {
    resolveUsersDetailed: jest
      .fn()
      .mockResolvedValue({ users: new Map(), failed: false }),
  };
  const bossService = new BossService(prisma as never, {} as never);
  let svc: BossAdminService;

  const nextWeekKey = () =>
    bossService.getWeekBoundaries(new Date(Date.now() + 7 * 86400000)).weekKey;
  const dto = (over: Record<string, unknown> = {}) => ({
    name: 'Tuần mới',
    bossName: 'Ma Vương',
    bossMaxHp: 2000,
    milestones: [
      { at: 500, coin: 5, name: 'Đồng' },
      { at: 1000, coin: 10, name: 'Bạc' },
    ],
    ...over,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new BossAdminService(prisma as never, bossService, profiles as never);
    prisma.bossWeeklySeason.updateMany.mockResolvedValue({ count: 0 });
    prisma.bossWeeklySeason.create.mockResolvedValue({});
    prisma.bossWeeklySeason.findUnique.mockImplementation(
      ({ where }: { where: { weekKey: string } }) => {
        const b = bossService.getWeekBoundaries(
          new Date(Date.now() + 7 * 86400000),
        );
        return Promise.resolve({
          id: 's-next',
          weekKey: where.weekKey,
          name: 'Tuần mới',
          bossName: 'Ma Vương',
          bossMaxHp: 2000,
          milestoneConfig: dto().milestones,
          startsAt: b.startsAt,
          endsAt: b.endsAt,
          isSettled: false,
          settledAt: null,
        });
      },
    );
    prisma.bossUserWeeklyStat.findMany.mockResolvedValue([]);
    prisma.bossRewardTransaction.groupBy.mockResolvedValue([]);
    prisma.bossRewardTransaction.findMany.mockResolvedValue([]);
  });

  it('creates a season for an upcoming week with boundaries derived from the week key', async () => {
    const weekKey = nextWeekKey();
    await svc.upsertUpcomingSeason(weekKey, dto());
    const created = prisma.bossWeeklySeason.create.mock.calls[0][0].data;
    const b = bossService.getWeekBoundaries(
      new Date(Date.now() + 7 * 86400000),
    );
    expect(created.weekKey).toBe(weekKey);
    expect(created.startsAt).toEqual(b.startsAt);
    expect(created.endsAt).toEqual(b.endsAt);
    expect(created.bossMaxHp).toBe(2000);
  });

  it('stores the boss image url, and null clears it back to the built-in image', async () => {
    await svc.upsertUpcomingSeason(
      nextWeekKey(),
      dto({ bossImageUrl: ' https://cdn.example.com/b.png ' }),
    );
    expect(
      prisma.bossWeeklySeason.create.mock.calls[0][0].data.bossImageUrl,
    ).toBe('https://cdn.example.com/b.png');
    prisma.bossWeeklySeason.create.mockClear();
    await svc.upsertUpcomingSeason(nextWeekKey(), dto({ bossImageUrl: null }));
    expect(
      prisma.bossWeeklySeason.create.mock.calls[0][0].data.bossImageUrl,
    ).toBeNull();
  });

  it('edits through a conditional update that requires the season to still be upcoming', async () => {
    prisma.bossWeeklySeason.updateMany.mockResolvedValue({ count: 1 });
    await svc.upsertUpcomingSeason(nextWeekKey(), dto());
    expect(prisma.bossWeeklySeason.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ startsAt: { gt: expect.any(Date) } }),
      }),
    );
    expect(prisma.bossWeeklySeason.create).not.toHaveBeenCalled();
  });

  it('refuses the running week (config is locked once a week starts)', async () => {
    const current = bossService.getWeekBoundaries().weekKey;
    await expect(
      svc.upsertUpcomingSeason(current, dto()),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.bossWeeklySeason.create).not.toHaveBeenCalled();
    expect(prisma.bossWeeklySeason.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a past week', async () => {
    const past = bossService.getWeekBoundaries(
      new Date(Date.now() - 14 * 86400000),
    ).weekKey;
    await expect(svc.upsertUpcomingSeason(past, dto())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it.each(['2026-W99', '2026-W00', 'abc', '2026-W5', '2025-W53'])(
    'rejects invalid or non-existent week key %s',
    async (key) => {
      await expect(svc.upsertUpcomingSeason(key, dto())).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it('rejects milestones above the boss HP and non-ascending milestones', async () => {
    await expect(
      svc.upsertUpcomingSeason(
        nextWeekKey(),
        dto({ milestones: [{ at: 2500, coin: 5, name: 'x' }] }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.upsertUpcomingSeason(
        nextWeekKey(),
        dto({
          milestones: [
            { at: 1000, coin: 5, name: 'a' },
            { at: 1000, coin: 5, name: 'b' },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('listSeasons reports phase, editable flag and capped community score', async () => {
    const b = bossService.getWeekBoundaries(
      new Date(Date.now() + 7 * 86400000),
    );
    prisma.bossWeeklySeason.findMany.mockResolvedValue([
      {
        id: 's-next',
        weekKey: b.weekKey,
        name: 'n',
        bossName: 'b',
        bossMaxHp: 1500,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        isSettled: false,
        settledAt: null,
        milestoneConfig: [{ at: 100, coin: 5, name: 'x' }],
      },
    ]);
    prisma.bossUserWeeklyStat.findMany.mockResolvedValue([
      { seasonId: 's-next', highestScore: 900 },
      { seasonId: 's-next', highestScore: 20 },
    ]);
    const res = await svc.listSeasons();
    expect(res.items[0]).toMatchObject({
      phase: 'UPCOMING',
      editable: true,
      communityScore: 120,
      participants: 2,
      milestonesUnlocked: 1,
    });
  });
});
