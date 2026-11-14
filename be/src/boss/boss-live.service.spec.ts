import { BossLiveService } from './boss-live.service';

describe('BossLiveService', () => {
  const season = {
    id: 'season-1',
    bossMaxHp: 1500,
    milestoneConfig: [{ at: 300, coin: 5, name: 'Rương Đồng' }],
  };
  const community = {
    community: {
      communityScore: 120,
      bossCurrentHp: 1380,
      bossHpPercent: 92,
      totalParticipants: 4,
    },
    milestones: [
      { index: 1, at: 300, coin: 5, name: 'Rương Đồng', unlocked: false },
    ],
  };

  const make = () => {
    const prisma = {
      bossBattleSession: {
        count: jest.fn().mockResolvedValue(3),
        findMany: jest.fn(),
      },
    };
    const profiles = {
      resolveUsersDetailed: jest.fn().mockResolvedValue({
        users: new Map([
          [
            'u1',
            {
              id: 'u1',
              fullName: ' An ',
              email: 'an@secret.mail',
              avatarUrl: 'https://img/an.png',
            },
          ],
        ]),
        failed: false,
      }),
    };
    const bossService = {
      getWeekBoundaries: jest.fn().mockReturnValue({ weekKey: '2026-W46' }),
      findCurrentSeason: jest.fn().mockResolvedValue(season),
      getCommunityStatus: jest.fn().mockResolvedValue(community),
    };
    // First findMany = fighters, second = recent hits.
    prisma.bossBattleSession.findMany
      .mockResolvedValueOnce([
        { id: 's-live-1', userId: 'u1', score: 7, combo: 3 },
        { id: 's-live-2', userId: 'u2', score: 2, combo: 0 },
      ])
      .mockResolvedValueOnce([
        {
          id: 's-done-1',
          userId: 'u2',
          score: 11,
          maxCombo: 5,
          endedAt: new Date('2026-11-14T10:00:00.000Z'),
        },
      ]);
    const service = new BossLiveService(
      prisma as never,
      profiles as never,
      bossService as never,
    );
    return { service, prisma, profiles, bossService };
  };

  it('returns community state, fighters and recent hits without user ids or emails', async () => {
    const { service } = make();
    const live = await service.getLive('u1');

    expect(live.community.communityScore).toBe(120);
    expect(live.milestones).toHaveLength(1);
    expect(live.fightingNow).toBe(3);
    expect(live.fighters).toEqual([
      {
        sessionId: 's-live-1',
        name: 'An',
        avatarUrl: 'https://img/an.png',
        score: 7,
        combo: 3,
        isYou: true,
      },
      {
        sessionId: 's-live-2',
        name: 'Người dùng',
        avatarUrl: null,
        score: 2,
        combo: 0,
        isYou: false,
      },
    ]);
    expect(live.recentHits[0]).toMatchObject({
      sessionId: 's-done-1',
      name: 'Người dùng',
      score: 11,
      maxCombo: 5,
      endedAt: '2026-11-14T10:00:00.000Z',
      isYou: false,
    });

    const text = JSON.stringify(live);
    expect(text).not.toContain('userId');
    expect(text).not.toContain('"u1"');
    expect(text).not.toContain('"u2"');
    expect(text).not.toContain('secret.mail');
    expect(text).not.toContain('email');
  });

  it('counts only unexpired IN_PROGRESS sessions of the current season and recent finished sessions with score', async () => {
    const { service, prisma } = make();
    await service.getLive('u1');

    const now = Date.now();
    const countWhere = prisma.bossBattleSession.count.mock.calls[0][0].where;
    expect(countWhere).toMatchObject({
      seasonId: 'season-1',
      status: 'IN_PROGRESS',
    });
    expect(countWhere.expiresAt.gt.getTime()).toBeLessThanOrEqual(now);
    const [fightersArgs, hitsArgs] = prisma.bossBattleSession.findMany.mock
      .calls as Array<[{ where: Record<string, unknown>; take: number }]>;
    expect(fightersArgs[0].where).toMatchObject({
      seasonId: 'season-1',
      status: 'IN_PROGRESS',
    });
    expect(fightersArgs[0].take).toBe(12);
    expect(hitsArgs[0].where).toMatchObject({
      seasonId: 'season-1',
      score: { gt: 0 },
    });
    expect(hitsArgs[0].take).toBe(8);
  });

  it('falls back to the generic name when Profiles fails and still returns the feed', async () => {
    const { service, profiles } = make();
    profiles.resolveUsersDetailed.mockRejectedValue(new Error('profiles down'));
    const live = await service.getLive('u1');
    expect(live.fighters.map((f) => f.name)).toEqual([
      'Người dùng',
      'Người dùng',
    ]);
    expect(live.fighters[0].isYou).toBe(true);
  });

  it('builds one snapshot for concurrent viewers and reuses it within the TTL', async () => {
    const { service, prisma, profiles, bossService } = make();
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => service.getLive(`viewer-${i}`)),
    );
    expect(results).toHaveLength(10);
    expect(bossService.findCurrentSeason).toHaveBeenCalledTimes(1);
    expect(prisma.bossBattleSession.count).toHaveBeenCalledTimes(1);
    expect(profiles.resolveUsersDetailed).toHaveBeenCalledTimes(1);

    await service.getLive('later-viewer');
    expect(prisma.bossBattleSession.count).toHaveBeenCalledTimes(1);
  });

  it('rebuilds after the TTL and when the week changes', async () => {
    const { service, prisma, bossService } = make();
    prisma.bossBattleSession.findMany.mockResolvedValue([]);
    const realNow = Date.now;
    try {
      await service.getLive('u1');
      Date.now = () => realNow() + 11_000;
      await service.getLive('u1');
      expect(prisma.bossBattleSession.count).toHaveBeenCalledTimes(2);

      bossService.getWeekBoundaries.mockReturnValue({ weekKey: '2026-W47' });
      await service.getLive('u1');
      expect(prisma.bossBattleSession.count).toHaveBeenCalledTimes(3);
    } finally {
      Date.now = realNow;
    }
  });

  it('shows an empty boss and does no session queries when the season does not exist yet (and never creates it)', async () => {
    const { service, prisma, bossService } = make();
    bossService.findCurrentSeason.mockResolvedValue(null);
    const live = await service.getLive('u1');
    expect(live.fightingNow).toBe(0);
    expect(live.fighters).toEqual([]);
    expect(live.recentHits).toEqual([]);
    expect(live.community).toEqual({
      communityScore: 0,
      bossCurrentHp: 1500,
      bossHpPercent: 100,
      totalParticipants: 0,
    });
    expect(live.milestones).toHaveLength(5);
    expect(live.milestones.every((m) => !m.unlocked)).toBe(true);
    expect(prisma.bossBattleSession.count).not.toHaveBeenCalled();
    expect(bossService).not.toHaveProperty('getOrCreateCurrentSeason');
  });

  it('does not cache a failed build', async () => {
    const { service, bossService } = make();
    bossService.findCurrentSeason.mockRejectedValueOnce(new Error('db down'));
    await expect(service.getLive('u1')).rejects.toThrow('db down');
    bossService.findCurrentSeason.mockResolvedValue(season);
    await expect(service.getLive('u1')).resolves.toBeDefined();
  });
});
