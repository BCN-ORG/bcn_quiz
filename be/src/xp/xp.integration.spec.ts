import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { XpService } from './xp.service';

/**
 * Real PostgreSQL adversarial checks for the boss XP daily cap (count + insert under an advisory lock).
 * Skipped unless INTEGRATION_DATABASE_URL points at a disposable database.
 */
const integrationUrl = process.env.INTEGRATION_DATABASE_URL;
const maybeDescribe = integrationUrl ? describe : describe.skip;

maybeDescribe('XpService.awardBossSession on real PostgreSQL', () => {
  let prisma: PrismaService;
  let service: XpService;
  const users: string[] = [];
  const newUser = () => {
    const id = `xp-it-${randomUUID()}`;
    users.push(id);
    return id;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = integrationUrl;
    prisma = new PrismaService();
    await prisma.$connect();
    service = new XpService(prisma);
  });

  afterAll(async () => {
    await prisma.userXpEvent.deleteMany({ where: { userId: { in: users } } });
    await prisma.$disconnect();
  });

  const sessionEvents = (userId: string) =>
    prisma.userXpEvent.count({
      where: { userId, sourceType: 'BOSS_SESSION_COMPLETED' },
    });

  it('never exceeds 3 XP sessions per day when 12 sessions end at the same instant', async () => {
    const userId = newUser();
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        service.awardBossSession(userId, `s-${i}`, {
          correctCount: 20,
          maxCombo: 10,
        }),
      ),
    );

    expect(await sessionEvents(userId)).toBe(3);
    expect(results.filter((r) => r.sessionXp > 0)).toHaveLength(3);
    expect(results.filter((r) => r.skipped === 'daily_cap')).toHaveLength(9);
    // Combo XP only exists for the sessions that earned session XP.
    const combo = await prisma.userXpEvent.count({
      where: { userId, sourceType: 'BOSS_COMBO_STREAK' },
    });
    expect(combo).toBe(3);
  });

  it('awards one session at most once when the same end is processed in parallel', async () => {
    const userId = newUser();
    await Promise.all(
      Array.from({ length: 8 }, () =>
        service.awardBossSession(userId, 'same-session', {
          correctCount: 9,
          maxCombo: 3,
        }),
      ),
    );
    expect(await sessionEvents(userId)).toBe(1);
  });

  it('keeps a user cap independent of other users', async () => {
    const a = newUser();
    const b = newUser();
    await Promise.all([
      ...Array.from({ length: 5 }, (_, i) =>
        service.awardBossSession(a, `a-${i}`, { correctCount: 6, maxCombo: 0 }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        service.awardBossSession(b, `b-${i}`, { correctCount: 6, maxCombo: 0 }),
      ),
    ]);
    expect(await sessionEvents(a)).toBe(3);
    expect(await sessionEvents(b)).toBe(3);
  });

  it('grants nothing below the minimum correct answers', async () => {
    const userId = newUser();
    await service.awardBossSession(userId, 'low', {
      correctCount: 4,
      maxCombo: 4,
    });
    expect(await sessionEvents(userId)).toBe(0);
  });
});
