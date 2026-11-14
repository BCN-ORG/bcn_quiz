import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { BossLiveService } from './boss-live.service';
import { BossService } from './boss.service';

/** Real PostgreSQL check of the live feed queries. Skipped unless INTEGRATION_DATABASE_URL is set. */
const integrationUrl = process.env.INTEGRATION_DATABASE_URL;
const maybeDescribe = integrationUrl ? describe : describe.skip;

maybeDescribe('BossLiveService on real PostgreSQL', () => {
  let prisma: PrismaService;
  let boss: BossService;
  let live: BossLiveService;
  let seasonId = '';
  const created: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = integrationUrl;
    prisma = new PrismaService();
    await prisma.$connect();
    boss = new BossService(prisma, {} as never);
    const profiles = {
      resolveUsersDetailed: jest.fn().mockResolvedValue({
        users: new Map([
          [
            'live-me',
            {
              id: 'live-me',
              fullName: 'Tôi',
              email: 'me@x.io',
              avatarUrl: null,
            },
          ],
        ]),
        failed: false,
      }),
    };
    live = new BossLiveService(prisma, profiles as never, boss);
    seasonId = (await boss.getOrCreateCurrentSeason()).id;
  });

  afterAll(async () => {
    await prisma.bossBattleSession.deleteMany({
      where: { id: { in: created } },
    });
    await prisma.$disconnect();
  });

  const session = async (data: {
    userId: string;
    status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
    score: number;
    expiresInMs: number;
    endedAt?: Date;
    seasonId?: string;
  }) => {
    const row = await prisma.bossBattleSession.create({
      data: {
        id: randomUUID(),
        userId: data.userId,
        seasonId: data.seasonId ?? seasonId,
        status: data.status,
        score: data.score,
        maxCombo: 2,
        expiresAt: new Date(Date.now() + data.expiresInMs),
        endedAt: data.endedAt ?? null,
      },
    });
    created.push(row.id);
    return row;
  };

  it('counts only unexpired IN_PROGRESS sessions of this season and lists finished scoring runs', async () => {
    const before = await live.getLive('live-me');
    const base = before.fightingNow;

    await session({
      userId: 'live-me',
      status: 'IN_PROGRESS',
      score: 4,
      expiresInMs: 120_000,
    });
    await session({
      userId: 'live-x1',
      status: 'IN_PROGRESS',
      score: 9,
      expiresInMs: -60_000,
    }); // stale, never finalized
    const done = await session({
      userId: 'live-x2',
      status: 'COMPLETED',
      score: 15,
      expiresInMs: -1_000,
      endedAt: new Date(),
    });
    await session({
      userId: 'live-x3',
      status: 'COMPLETED',
      score: 0,
      expiresInMs: -1_000,
      endedAt: new Date(),
    }); // no score
    // Fresh service instance = empty cache (the TTL cache is covered by the unit spec).
    const fresh = new BossLiveService(
      prisma,
      {
        resolveUsersDetailed: jest
          .fn()
          .mockResolvedValue({ users: new Map(), failed: false }),
      } as never,
      boss,
    );
    const snapshot = await fresh.getLive('live-me');

    expect(snapshot.fightingNow).toBe(base + 1);
    expect(snapshot.fighters.some((f) => f.score === 4 && f.isYou)).toBe(true);
    expect(snapshot.fighters.some((f) => f.score === 9)).toBe(false);
    expect(
      snapshot.recentHits.some(
        (h) => h.sessionId === done.id && h.score === 15,
      ),
    ).toBe(true);
    expect(snapshot.recentHits.every((h) => h.score > 0)).toBe(true);
    expect(JSON.stringify(snapshot)).not.toMatch(/live-x2|live-me|@/);
  });
});
