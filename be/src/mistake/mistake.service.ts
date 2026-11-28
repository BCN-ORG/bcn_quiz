import { Injectable, Optional } from '@nestjs/common';
import { CoinRewardSource, MistakeStatus, XpSourceType } from '@prisma/client';
import { getCoinProviderMode } from '../coin/coin-api.client';
import { CoinTrackingService } from '../coin/coin-tracking.service';
import { LiveCoinRewardAdapter } from '../coin/live-coin-reward.adapter';
import { businessDate } from '../leaderboard/leaderboard-rules';
import { PrismaService } from '../prisma/prisma.service';
import { MockCoinWalletService } from '../wallet/mock-coin-wallet.service';
import { XpService } from '../xp/xp.service';

@Injectable()
export class MistakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xpService: XpService,
    @Optional() private readonly mockWalletService?: MockCoinWalletService,
    @Optional() private readonly coinTrackingService?: CoinTrackingService,
    @Optional() private readonly liveRewardAdapter?: LiveCoinRewardAdapter,
  ) {}

  /**
   * Syncs recent wrong QuizAttempts into UserMistakeItem lazily so existing
   * history immediately populates the Mistake Bank without requiring backfill scripts.
   */
  async syncFromRecentAttempts(userId: string): Promise<void> {
    const recentWrong = await this.prisma.quizAttempt
      .findMany({
        where: { userId, isCorrect: false },
        orderBy: { submittedAt: 'desc' },
        take: 60,
        select: { quizId: true, topicId: true, submittedAt: true },
      })
      .catch(() => []);

    if (recentWrong.length === 0) return;

    const existing = await this.prisma.userMistakeItem
      .findMany({
        where: {
          userId,
          quizId: { in: Array.from(new Set(recentWrong.map((r) => r.quizId))) },
        },
        select: { quizId: true },
      })
      .catch(() => []);
    const existingSet = new Set(existing.map((e) => e.quizId));

    const seen = new Set<string>();
    const toCreate: Array<{
      userId: string;
      quizId: string;
      topicId: string;
      lastWrongAt: Date;
      nextReviewAt: Date;
    }> = [];

    for (const row of recentWrong) {
      if (existingSet.has(row.quizId) || seen.has(row.quizId)) continue;
      seen.add(row.quizId);
      toCreate.push({
        userId,
        quizId: row.quizId,
        topicId: row.topicId,
        lastWrongAt: row.submittedAt,
        nextReviewAt: row.submittedAt,
      });
    }

    if (toCreate.length > 0) {
      await this.prisma.userMistakeItem
        .createMany({ data: toCreate, skipDuplicates: true })
        .catch(() => undefined);
    }
  }

  async getSummary(userId: string) {
    await this.syncFromRecentAttempts(userId);
    const now = new Date();
    const [activeCount, dueCount, masteredCount] = await Promise.all([
      this.prisma.userMistakeItem.count({
        where: { userId, status: MistakeStatus.ACTIVE },
      }),
      this.prisma.userMistakeItem.count({
        where: {
          userId,
          status: MistakeStatus.ACTIVE,
          nextReviewAt: { lte: now },
        },
      }),
      this.prisma.userMistakeItem.count({
        where: { userId, status: MistakeStatus.MASTERED },
      }),
    ]);

    return { activeCount, dueCount, masteredCount };
  }

  async getPracticeQueue(userId: string, limit = 10, topicId?: string) {
    await this.syncFromRecentAttempts(userId);
    const safeLimit = Math.min(20, Math.max(1, Number(limit) || 10));
    const items = await this.prisma.userMistakeItem.findMany({
      where: {
        userId,
        status: MistakeStatus.ACTIVE,
        ...(topicId ? { topicId } : {}),
      },
      orderBy: [{ nextReviewAt: 'asc' }, { wrongCount: 'desc' }],
      take: safeLimit,
    });

    if (items.length === 0) return { items: [] };

    const quizzes = await this.prisma.quiz.findMany({
      where: { id: { in: items.map((i) => i.quizId) } },
      include: {
        options: { orderBy: { id: 'asc' } },
        topic: { select: { id: true, name: true } },
      },
    });
    const quizMap = new Map(quizzes.map((q) => [q.id, q]));

    return {
      items: items
        .map((item) => {
          const quiz = quizMap.get(item.quizId);
          if (!quiz) return null;
          return {
            mistakeId: item.id,
            quizId: quiz.id,
            topicId: quiz.topicId,
            topicName: quiz.topic?.name ?? 'Chủ đề',
            wrongCount: item.wrongCount,
            consecutiveCorrect: item.consecutiveCorrect,
            question: quiz.question,
            options: quiz.options.map((o) => ({
              id: o.id,
              label: o.label,
              text: o.content,
            })),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    };
  }

  async submitReview(
    userId: string,
    answers: Array<{ quizId: string; selectedAnswer: string }>,
  ) {
    if (!Array.isArray(answers) || answers.length === 0) {
      return {
        total: 0,
        correct: 0,
        masteredNow: 0,
        rewardXp: 0,
        rewardCoins: 0,
        results: [],
      };
    }

    const quizIds = Array.from(new Set(answers.map((a) => a.quizId)));
    const [quizzes, existingItems] = await Promise.all([
      this.prisma.quiz.findMany({
        where: { id: { in: quizIds } },
        select: {
          id: true,
          topicId: true,
          answer: true,
          explanation: true,
        },
      }),
      this.prisma.userMistakeItem.findMany({
        where: { userId, quizId: { in: quizIds } },
      }),
    ]);

    const quizMap = new Map(quizzes.map((q) => [q.id, q]));
    const itemMap = new Map(existingItems.map((i) => [i.quizId, i]));

    let correct = 0;
    let masteredNow = 0;
    const now = Date.now();
    const results: Array<{
      quizId: string;
      isCorrect: boolean;
      correctAnswer: string;
      explanation: string | null;
      status: MistakeStatus;
    }> = [];

    for (const ans of answers) {
      if (
        typeof ans?.quizId !== 'string' ||
        typeof ans?.selectedAnswer !== 'string'
      ) {
        continue;
      }
      const quiz = quizMap.get(ans.quizId);
      if (!quiz) continue;
      const isCorrect =
        ans.selectedAnswer.trim().toLowerCase() ===
        quiz.answer.trim().toLowerCase();
      if (isCorrect) correct += 1;

      const prev = itemMap.get(ans.quizId);
      const nextConsecutive = isCorrect
        ? (prev?.consecutiveCorrect ?? 0) + 1
        : 0;
      const nextStatus =
        nextConsecutive >= 2 ? MistakeStatus.MASTERED : MistakeStatus.ACTIVE;
      if (
        nextStatus === MistakeStatus.MASTERED &&
        prev?.status !== MistakeStatus.MASTERED
      ) {
        masteredNow += 1;
      }

      const nextReviewAt = isCorrect
        ? new Date(now + 24 * 3600_000)
        : new Date(now + 4 * 3600_000);

      await this.prisma.userMistakeItem.upsert({
        where: { userId_quizId: { userId, quizId: quiz.id } },
        update: {
          consecutiveCorrect: nextConsecutive,
          wrongCount: isCorrect ? undefined : { increment: 1 },
          status: nextStatus,
          lastWrongAt: isCorrect ? undefined : new Date(now),
          nextReviewAt,
        },
        create: {
          userId,
          quizId: quiz.id,
          topicId: quiz.topicId,
          wrongCount: isCorrect ? 0 : 1,
          consecutiveCorrect: nextConsecutive,
          status: nextStatus,
          nextReviewAt,
        },
      });

      results.push({
        quizId: quiz.id,
        isCorrect,
        correctAnswer: quiz.answer,
        explanation: quiz.explanation ?? null,
        status: nextStatus,
      });
    }

    let rewardXp = 0;
    let rewardCoins = 0;
    if (correct > 0) {
      const day = businessDate(new Date(now));
      const xpRes = await this.xpService.award(
        userId,
        XpSourceType.MISTAKE_REVIEW,
        `mistake:daily:${day}`,
        15,
      );
      if (xpRes.awarded) {
        rewardXp = xpRes.amount;
        rewardCoins = 5;
        await this.creditDailyMistakeCoins(userId, day, rewardCoins);
      }
    }

    return {
      total: results.length,
      correct,
      masteredNow,
      rewardXp,
      rewardCoins,
      results,
    };
  }

  private async creditDailyMistakeCoins(
    userId: string,
    day: string,
    amount: number,
  ): Promise<void> {
    const idempotencyKey = `mistake:daily:${userId}:${day}`;
    const reason = `Ôn tập câu sai hằng ngày (${day})`;
    if (getCoinProviderMode() === 'live') {
      if (!this.liveRewardAdapter || !this.coinTrackingService) return;
      const prep = await this.liveRewardAdapter.preparePayload({
        userId,
        amount,
        idempotencyKey,
        source: CoinRewardSource.DAILY_QUEST,
        description: reason,
        metadata: { kind: 'MISTAKE_REVIEW', day },
      });
      if (!prep.ok || !prep.payload) return;
      const tracked = await this.coinTrackingService.recordPending({
        userId,
        amount: prep.payload.amount,
        source: CoinRewardSource.DAILY_QUEST,
        reason,
        referenceId: day,
        idempotencyKey,
        requestPayload: prep.payload,
      });
      if (tracked.status === 'SUCCESS') return;
      const res = await this.liveRewardAdapter.dispatchPayload(prep.payload);
      if (res.status === 'SUCCESS') {
        await this.coinTrackingService.recordSuccess(
          idempotencyKey,
          res.externalTxId,
          res.responsePayload,
        );
      }
      return;
    }

    if (this.mockWalletService) {
      await this.mockWalletService.creditReward({
        userId,
        amount,
        idempotencyKey,
        source: 'DAILY_QUEST',
        description: reason,
      });
    }
  }

  // --------------------------------------------------------------------------
  // ADMIN ANALYTICS (TOP MOST-MISSED QUESTIONS)
  // --------------------------------------------------------------------------

  async getAdminAnalytics() {
    const [activeTotal, masteredTotal, grouped] = await Promise.all([
      this.prisma.userMistakeItem.count({
        where: { status: MistakeStatus.ACTIVE },
      }),
      this.prisma.userMistakeItem.count({
        where: { status: MistakeStatus.MASTERED },
      }),
      this.prisma.userMistakeItem.groupBy({
        by: ['quizId', 'topicId'],
        _count: { _all: true },
        _sum: { wrongCount: true },
        orderBy: { _sum: { wrongCount: 'desc' } },
        take: 20,
      }),
    ]);

    const quizIds = grouped.map((g) => g.quizId);
    const quizzes =
      quizIds.length > 0
        ? await this.prisma.quiz.findMany({
            where: { id: { in: quizIds } },
            include: { topic: { select: { name: true } } },
          })
        : [];
    const quizMap = new Map(quizzes.map((q) => [q.id, q]));

    return {
      totals: {
        activeTotal,
        masteredTotal,
        masteryRatePercent:
          activeTotal + masteredTotal > 0
            ? Math.round((masteredTotal / (activeTotal + masteredTotal)) * 100)
            : 0,
      },
      topMissedQuestions: grouped.map((g) => {
        const quiz = quizMap.get(g.quizId);
        return {
          quizId: g.quizId,
          topicId: g.topicId,
          topicName: quiz?.topic?.name ?? 'Chủ đề',
          question: quiz?.question ?? '(Câu hỏi đã bị xóa)',
          affectedUsers: g._count._all,
          totalWrongCount: g._sum.wrongCount ?? 0,
        };
      }),
    };
  }
}
