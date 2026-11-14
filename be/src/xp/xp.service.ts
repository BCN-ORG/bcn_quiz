import { Injectable } from '@nestjs/common';
import { Prisma, XpSourceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { businessDate } from '../leaderboard/leaderboard-rules';
import {
  BOSS_COMMUNITY_CONTRIB_CAP,
  BOSS_XP_MAX_SESSIONS_PER_DAY,
  BOSS_XP_MIN_CORRECT,
  XP_AMOUNTS,
  XP_PER_LEVEL,
  XP_RANKS,
} from './xp.constants';
import { XpSummaryDto } from './dto/xp.dto';

export function rankForLevel(level: number): {
  rankTitle: string;
  nextRankTitle: string | null;
} {
  let idx = 0;
  XP_RANKS.forEach((r, i) => {
    if (level >= r.minLevel) idx = i;
  });
  return {
    rankTitle: XP_RANKS[idx].title,
    nextRankTitle: XP_RANKS[idx + 1]?.title ?? null,
  };
}

export function levelFromXp(totalXp: number) {
  const xp = Math.max(0, Math.floor(totalXp));
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const xpInLevel = xp % XP_PER_LEVEL;
  return {
    level,
    xpInLevel,
    xpRequired: XP_PER_LEVEL,
    xpPercent: Math.round((xpInLevel / XP_PER_LEVEL) * 100),
    ...rankForLevel(level),
  };
}

export function computeBossComboXp(maxCombo: number): number {
  if (maxCombo >= 10) return 50;
  if (maxCombo >= 5) return 25;
  if (maxCombo >= 3) return 10;
  return 0;
}

/** Topic XP needs real answers: at least one correct and at least half of the questions answered. */
export function isTopicXpEligible(
  totalQuestions: number,
  answeredCount: number,
  correctCount: number,
): boolean {
  return (
    totalQuestions > 0 &&
    correctCount >= 1 &&
    answeredCount >= Math.ceil(totalQuestions / 2)
  );
}

/** Community boss HP contribution of one user: personal best, capped per user. */
export function cappedBossContribution(highestScore: number): number {
  return Math.min(Math.max(0, highestScore), BOSS_COMMUNITY_CONTRIB_CAP);
}

@Injectable()
export class XpService {
  constructor(private readonly prisma: PrismaService) {}

  computeBossComboXp(maxCombo: number): number {
    return computeBossComboXp(maxCombo);
  }

  async award(
    userId: string,
    sourceType: XpSourceType,
    sourceKey: string,
    txOrOverride?: Prisma.TransactionClient | number,
    overrideAmount?: number,
  ): Promise<{ awarded: boolean; amount: number }> {
    let client: Prisma.TransactionClient | PrismaService = this.prisma;
    let amount = XP_AMOUNTS[sourceType];

    if (typeof txOrOverride === 'number') {
      amount = txOrOverride;
    } else if (txOrOverride) {
      client = txOrOverride;
      if (overrideAmount !== undefined) {
        amount = overrideAmount;
      }
    } else if (overrideAmount !== undefined) {
      amount = overrideAmount;
    }

    // createMany + skipDuplicates = INSERT .. ON CONFLICT DO NOTHING: no error
    // (and so no aborted Postgres transaction) on duplicates.
    const res = await client.userXpEvent.createMany({
      data: [{ userId, sourceType, sourceKey, amount }],
      skipDuplicates: true,
    });
    return res.count > 0
      ? { awarded: true, amount }
      : { awarded: false, amount: 0 };
  }

  /**
   * Boss session XP for a COMPLETED session. Needs BOSS_XP_MIN_CORRECT correct answers and is capped at
   * BOSS_XP_MAX_SESSIONS_PER_DAY sessions per Vietnam business day. Count + insert run under one advisory lock so
   * parallel session ends cannot exceed the cap. Combo XP is granted only together with the session XP, and a retry
   * of an already-awarded session stays idempotent.
   */
  async awardBossSession(
    userId: string,
    sessionId: string,
    stats: { correctCount: number; maxCombo: number },
    now: Date = new Date(),
  ): Promise<{
    sessionXp: number;
    comboXp: number;
    skipped?: 'below_min' | 'daily_cap';
  }> {
    if (stats.correctCount < BOSS_XP_MIN_CORRECT) {
      return { sessionXp: 0, comboXp: 0, skipped: 'below_min' };
    }
    const day = businessDate(now);
    const dayStart = new Date(`${day}T00:00:00.000+07:00`);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`xp:boss:${userId}:${day}`}))`;

      const already = await tx.userXpEvent.findUnique({
        where: {
          userId_sourceType_sourceKey: {
            userId,
            sourceType: XpSourceType.BOSS_SESSION_COMPLETED,
            sourceKey: sessionId,
          },
        },
        select: { id: true },
      });
      if (!already) {
        const usedToday = await tx.userXpEvent.count({
          where: {
            userId,
            sourceType: XpSourceType.BOSS_SESSION_COMPLETED,
            createdAt: { gte: dayStart },
          },
        });
        if (usedToday >= BOSS_XP_MAX_SESSIONS_PER_DAY) {
          return { sessionXp: 0, comboXp: 0, skipped: 'daily_cap' as const };
        }
      }

      const session = await this.award(
        userId,
        XpSourceType.BOSS_SESSION_COMPLETED,
        sessionId,
        tx,
      );
      const comboAmount = computeBossComboXp(stats.maxCombo);
      const combo =
        comboAmount > 0
          ? await this.award(
              userId,
              XpSourceType.BOSS_COMBO_STREAK,
              sessionId,
              tx,
              comboAmount,
            )
          : { awarded: false, amount: 0 };
      return { sessionXp: session.amount, comboXp: combo.amount };
    });
  }

  async getSummary(userId: string): Promise<XpSummaryDto> {
    const [groups, recent] = await Promise.all([
      this.prisma.userXpEvent.groupBy({
        by: ['sourceType'],
        where: { userId },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.userXpEvent.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 10,
        select: {
          id: true,
          sourceType: true,
          sourceKey: true,
          amount: true,
          createdAt: true,
        },
      }),
    ]);

    const breakdown = {
      TOPIC_FIRST_SUBMIT: { count: 0, xp: 0 },
      TOWER_FLOOR: { count: 0, xp: 0 },
      COURSE_COMPLETED: { count: 0, xp: 0 },
      CERTIFICATE_ISSUED: { count: 0, xp: 0 },
      BOSS_SESSION_COMPLETED: { count: 0, xp: 0 },
      BOSS_COMBO_STREAK: { count: 0, xp: 0 },
    } as Record<XpSourceType, { count: number; xp: number }>;
    let totalXp = 0;
    for (const g of groups) {
      const xp = g._sum.amount ?? 0;
      breakdown[g.sourceType] = { count: g._count._all, xp };
      totalXp += xp;
    }

    return { totalXp, ...levelFromXp(totalXp), breakdown, recent };
  }
}
