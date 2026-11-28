import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import {
  CoinRewardSource,
  Prisma,
  QuestPeriod,
  TowerAttemptStatus,
  XpSourceType,
} from '@prisma/client';
import { getCoinProviderMode } from '../coin/coin-api.client';
import { CoinTrackingService } from '../coin/coin-tracking.service';
import { LiveCoinRewardAdapter } from '../coin/live-coin-reward.adapter';
import { businessDate } from '../leaderboard/leaderboard-rules';
import { PrismaService } from '../prisma/prisma.service';
import { MockCoinWalletService } from '../wallet/mock-coin-wallet.service';
import { XpService } from '../xp/xp.service';
import { QUEST_DEFINITIONS, QuestDefinition } from './quest.constants';

export interface QuestProgressItem {
  code: string;
  period: QuestPeriod;
  periodKey: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  completed: boolean;
  claimed: boolean;
  rewardXp: number;
  rewardCoins: number;
}

export function vietnamWeekKey(now: Date = new Date()): {
  weekKey: string;
  weekStart: Date;
} {
  const vnStr = businessDate(now); // YYYY-MM-DD in UTC+7
  const [y, m, d] = vnStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = utcDate.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(utcDate);
  monday.setUTCDate(utcDate.getUTCDate() + diffToMonday);
  const my = monday.getUTCFullYear();
  const mm = String(monday.getUTCMonth() + 1).padStart(2, '0');
  const md = String(monday.getUTCDate()).padStart(2, '0');
  const weekKey = `${my}-W${mm}${md}`;
  const weekStart = new Date(`${my}-${mm}-${md}T00:00:00.000+07:00`);
  return { weekKey, weekStart };
}

@Injectable()
export class QuestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xpService: XpService,
    @Optional() private readonly mockWalletService?: MockCoinWalletService,
    @Optional() private readonly coinTrackingService?: CoinTrackingService,
    @Optional() private readonly liveRewardAdapter?: LiveCoinRewardAdapter,
  ) {}

  async getMyQuests(
    userId: string,
    now: Date = new Date(),
  ): Promise<{
    dailyKey: string;
    weeklyKey: string;
    daily: QuestProgressItem[];
    weekly: QuestProgressItem[];
  }> {
    const dailyKey = businessDate(now);
    const dayStart = new Date(`${dailyKey}T00:00:00.000+07:00`);
    const { weekKey, weekStart } = vietnamWeekKey(now);

    const [
      dailyQuizCount,
      dailyTowerCount,
      dailyBossCount,
      dailyBountyCount,
      weeklyQuizCount,
      weeklyBossCount,
      weeklyTowerCount,
      claims,
    ] = await Promise.all([
      this.prisma.attemptSession
        .count({
          where: { userId, submittedAt: { gte: dayStart } },
        })
        .catch(() => 0),
      this.prisma.towerFloorAttempt
        .count({
          where: {
            userId,
            status: TowerAttemptStatus.COMPLETED,
            completedAt: { gte: dayStart },
          },
        })
        .catch(() => 0),
      this.prisma.bossBattleSession
        .count({
          where: { userId, endedAt: { gte: dayStart } },
        })
        .catch(() => 0),
      this.prisma.bountyAssignment
        .count({
          where: { userId, submittedAt: { gte: dayStart } },
        })
        .catch(() => 0),
      this.prisma.attemptSession
        .count({
          where: { userId, submittedAt: { gte: weekStart } },
        })
        .catch(() => 0),
      this.prisma.bossBattleSession
        .count({
          where: { userId, endedAt: { gte: weekStart } },
        })
        .catch(() => 0),
      this.prisma.towerFloorAttempt
        .count({
          where: {
            userId,
            status: TowerAttemptStatus.COMPLETED,
            completedAt: { gte: weekStart },
          },
        })
        .catch(() => 0),
      this.prisma.userQuestClaim
        .findMany({
          where: {
            userId,
            periodKey: { in: [dailyKey, weekKey] },
          },
          select: { periodKey: true, questCode: true },
        })
        .catch(() => []),
    ]);

    const claimedSet = new Set(
      claims.map((c) => `${c.periodKey}:${c.questCode}`),
    );

    const dailyBaseDefs = QUEST_DEFINITIONS.filter(
      (q) => q.period === QuestPeriod.DAILY && q.metric !== 'DAILY_ALL_3',
    );
    const progressOf = (def: QuestDefinition): number => {
      switch (def.metric) {
        case 'QUIZ_SUBMIT':
          return dailyQuizCount;
        case 'TOWER_FLOOR':
          return dailyTowerCount;
        case 'BOSS_OR_BOUNTY':
          return dailyBossCount + dailyBountyCount;
        case 'WEEKLY_QUIZ_5':
          return weeklyQuizCount;
        case 'WEEKLY_BOSS_3':
          return weeklyBossCount;
        case 'WEEKLY_TOWER_10':
          return weeklyTowerCount;
        default:
          return 0;
      }
    };

    const dailyBaseCompleted = dailyBaseDefs.filter(
      (d) => progressOf(d) >= d.target,
    ).length;

    const mapDef = (def: QuestDefinition): QuestProgressItem => {
      const periodKey = def.period === QuestPeriod.DAILY ? dailyKey : weekKey;
      const rawProgress =
        def.metric === 'DAILY_ALL_3' ? dailyBaseCompleted : progressOf(def);
      const progress = Math.min(rawProgress, def.target);
      return {
        code: def.code,
        period: def.period,
        periodKey,
        title: def.title,
        description: def.description,
        progress,
        target: def.target,
        completed: progress >= def.target,
        claimed: claimedSet.has(`${periodKey}:${def.code}`),
        rewardXp: def.rewardXp,
        rewardCoins: def.rewardCoins,
      };
    };

    return {
      dailyKey,
      weeklyKey: weekKey,
      daily: QUEST_DEFINITIONS.filter(
        (q) => q.period === QuestPeriod.DAILY,
      ).map(mapDef),
      weekly: QUEST_DEFINITIONS.filter(
        (q) => q.period === QuestPeriod.WEEKLY,
      ).map(mapDef),
    };
  }

  async claimQuest(
    userId: string,
    questCode: string,
    now: Date = new Date(),
  ): Promise<{
    claimed: boolean;
    alreadyClaimed: boolean;
    questCode: string;
    rewardXp: number;
    rewardCoins: number;
  }> {
    const def = QUEST_DEFINITIONS.find((q) => q.code === questCode);
    if (!def) {
      throw new BadRequestException('Nhiệm vụ không tồn tại.');
    }

    const summary = await this.getMyQuests(userId, now);
    const list =
      def.period === QuestPeriod.DAILY ? summary.daily : summary.weekly;
    const item = list.find((q) => q.code === questCode);
    if (!item || !item.completed) {
      throw new BadRequestException(
        'Bạn chưa hoàn thành mục tiêu nhiệm vụ này.',
      );
    }
    if (item.claimed) {
      return {
        claimed: false,
        alreadyClaimed: true,
        questCode,
        rewardXp: item.rewardXp,
        rewardCoins: item.rewardCoins,
      };
    }

    try {
      await this.prisma.userQuestClaim.create({
        data: {
          userId,
          period: def.period,
          periodKey: item.periodKey,
          questCode,
          rewardXp: def.rewardXp,
          rewardCoins: def.rewardCoins,
        },
      });
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return {
          claimed: false,
          alreadyClaimed: true,
          questCode,
          rewardXp: def.rewardXp,
          rewardCoins: def.rewardCoins,
        };
      }
      throw err;
    }

    if (def.rewardXp > 0) {
      await this.xpService.award(
        userId,
        XpSourceType.QUEST_COMPLETED,
        `quest:${item.periodKey}:${questCode}`,
        def.rewardXp,
      );
    }

    if (def.rewardCoins > 0) {
      const idempotencyKey = `quest:${item.periodKey}:${userId}:${questCode}`;
      const source =
        def.period === QuestPeriod.DAILY
          ? CoinRewardSource.DAILY_QUEST
          : CoinRewardSource.WEEKLY_QUEST;
      await this.creditQuestCoins({
        userId,
        amount: def.rewardCoins,
        idempotencyKey,
        source,
        reason: `Thưởng nhiệm vụ: ${def.title} (${item.periodKey})`,
        referenceId: `${item.periodKey}:${questCode}`,
      });
    }

    return {
      claimed: true,
      alreadyClaimed: false,
      questCode,
      rewardXp: def.rewardXp,
      rewardCoins: def.rewardCoins,
    };
  }

  private async creditQuestCoins(params: {
    userId: string;
    amount: number;
    idempotencyKey: string;
    source: CoinRewardSource;
    reason: string;
    referenceId: string;
  }): Promise<void> {
    if (getCoinProviderMode() === 'live') {
      if (!this.liveRewardAdapter || !this.coinTrackingService) return;
      const prep = await this.liveRewardAdapter.preparePayload({
        userId: params.userId,
        amount: params.amount,
        idempotencyKey: params.idempotencyKey,
        source: params.source,
        description: params.reason,
        metadata: { kind: 'QUEST', referenceId: params.referenceId },
      });
      if (!prep.ok || !prep.payload) return;
      const tracked = await this.coinTrackingService.recordPending({
        userId: params.userId,
        amount: prep.payload.amount,
        source: params.source,
        reason: params.reason,
        referenceId: params.referenceId,
        idempotencyKey: params.idempotencyKey,
        requestPayload: prep.payload,
      });
      if (tracked.status === 'SUCCESS') return;
      const res = await this.liveRewardAdapter.dispatchPayload(prep.payload);
      if (res.status === 'SUCCESS') {
        await this.coinTrackingService.recordSuccess(
          params.idempotencyKey,
          res.externalTxId,
          res.responsePayload,
        );
      } else if (res.status === 'FAILED') {
        await this.coinTrackingService.recordFailed(
          params.idempotencyKey,
          res.errorMessage,
          res.responsePayload,
          res.errorCode,
        );
      }
      return;
    }

    if (this.mockWalletService) {
      await this.mockWalletService.creditReward({
        userId: params.userId,
        amount: params.amount,
        idempotencyKey: params.idempotencyKey,
        source: params.source,
        description: params.reason,
      });
    }
  }

  // --------------------------------------------------------------------------
  // ADMIN STATS
  // --------------------------------------------------------------------------

  async getAdminStats(now: Date = new Date()) {
    const todayKey = businessDate(now);
    const { weekKey } = vietnamWeekKey(now);

    const [todayClaims, weekClaims, totals] = await Promise.all([
      this.prisma.userQuestClaim.groupBy({
        by: ['questCode'],
        where: { period: QuestPeriod.DAILY, periodKey: todayKey },
        _count: { _all: true },
        _sum: { rewardXp: true, rewardCoins: true },
      }),
      this.prisma.userQuestClaim.groupBy({
        by: ['questCode'],
        where: { period: QuestPeriod.WEEKLY, periodKey: weekKey },
        _count: { _all: true },
        _sum: { rewardXp: true, rewardCoins: true },
      }),
      this.prisma.userQuestClaim.aggregate({
        _count: { _all: true },
        _sum: { rewardXp: true, rewardCoins: true },
      }),
    ]);

    const claimMap = new Map<
      string,
      { count: number; xp: number; coins: number }
    >();
    for (const row of [...todayClaims, ...weekClaims]) {
      claimMap.set(row.questCode, {
        count: row._count._all,
        xp: row._sum.rewardXp ?? 0,
        coins: row._sum.rewardCoins ?? 0,
      });
    }

    return {
      todayKey,
      weekKey,
      totals: {
        totalClaims: totals._count._all,
        totalXpGranted: totals._sum.rewardXp ?? 0,
        totalCoinsGranted: totals._sum.rewardCoins ?? 0,
      },
      quests: QUEST_DEFINITIONS.map((q) => {
        const stat = claimMap.get(q.code);
        return {
          code: q.code,
          period: q.period,
          title: q.title,
          description: q.description,
          target: q.target,
          rewardXp: q.rewardXp,
          rewardCoins: q.rewardCoins,
          currentPeriodClaims: stat?.count ?? 0,
          currentPeriodXp: stat?.xp ?? 0,
          currentPeriodCoins: stat?.coins ?? 0,
        };
      }),
    };
  }
}
