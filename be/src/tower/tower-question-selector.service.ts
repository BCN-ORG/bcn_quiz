import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_TOWER_DISTRIBUTION_RULES,
  FloorDistributionRule,
  TowerDistributionService,
} from './tower-distribution.service';

function pickWeighted<T extends string>(weights?: Record<T, number>): T | null {
  if (!weights) return null;
  const entries = Object.entries(weights).filter(
    ([, w]) => typeof w === 'number' && w > 0,
  ) as [T, number][];
  if (entries.length === 0) return null;
  const total = entries.reduce((acc, [, w]) => acc + w, 0);
  let rand = Math.random() * total;
  for (const [key, w] of entries) {
    rand -= w;
    if (rand <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

function resolveSubjectFilter(
  subject: string | null,
): Prisma.StringFilter | string | undefined {
  if (!subject) return undefined;
  const lower = subject.toLowerCase();
  if (lower === 'html/css' || lower === 'css') {
    return { in: ['HTML/CSS', 'CSS'] };
  }
  if (lower === 'css/advanced') {
    return { in: ['HTML/CSS', 'CSS', 'JavaScript'] };
  }
  return subject;
}

@Injectable()
export class TowerQuestionSelector {
  private readonly logger = new Logger(TowerQuestionSelector.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly distributionService: TowerDistributionService,
  ) {}

  /**
   * Selects a question for a given tower floor enforcing:
   * 1. Knowledge distribution weights (subject & difficulty) from active config.
   * 2. Monthly Anti-Repeat Strategy:
   *    - Priority 1: Never used in ANY season.
   *    - Priority 2: Not used in CURRENT season.
   *    - Priority 3: Least recently used / fewest uses in current season.
   *    - Priority 4: Re-use questions not in current attempt if pool exhausted.
   * 3. Concurrency-safe atomic usage recording via TowerQuestionUsage upsert.
   */
  async selectQuestionForFloor(
    seasonId: string,
    floor: number,
    excludeQuizIds: string[] = [],
  ) {
    // 1. Get active distribution configuration and find matching rule
    const activeConfig = await this.distributionService.getActiveConfig();
    const rules: FloorDistributionRule[] =
      (activeConfig?.rules as unknown as FloorDistributionRule[]) ||
      DEFAULT_TOWER_DISTRIBUTION_RULES;

    const matchingRule =
      rules.find((r) => r.minFloor <= floor && floor <= r.maxFloor) || rules[0];

    const targetSubject = pickWeighted(matchingRule?.subjectWeights);
    const targetDifficulty = pickWeighted(matchingRule?.difficultyWeights);

    // 2. Multi-tier anti-repeat query strategy
    let selectedQuiz = await this.queryWithAntiRepeat(
      seasonId,
      targetSubject,
      targetDifficulty,
      excludeQuizIds,
    );

    // Fallback 1: Relax difficulty tier (keep subject)
    if (!selectedQuiz && targetSubject) {
      selectedQuiz = await this.queryWithAntiRepeat(
        seasonId,
        targetSubject,
        null,
        excludeQuizIds,
      );
    }

    // Fallback 2: Relax subject (keep difficulty)
    if (!selectedQuiz && targetDifficulty) {
      selectedQuiz = await this.queryWithAntiRepeat(
        seasonId,
        null,
        targetDifficulty,
        excludeQuizIds,
      );
    }

    // Fallback 3: Relax both (any eligible question in pool)
    if (!selectedQuiz) {
      selectedQuiz = await this.queryWithAntiRepeat(
        seasonId,
        null,
        null,
        excludeQuizIds,
      );
    }

    // Fallback 4: Pool exhausted within attempt (excludeIds >= total eligible pool)
    // Relax excludeQuizIds: exclude only the immediately preceding quiz to avoid back-to-back duplicate
    if (!selectedQuiz && excludeQuizIds.length > 0) {
      const lastQuizId = excludeQuizIds[excludeQuizIds.length - 1];
      selectedQuiz = await this.queryWithAntiRepeat(
        seasonId,
        null,
        null,
        lastQuizId ? [lastQuizId] : [],
      );
    }

    // Fallback 5: Legacy Quiz table direct fallback (if pool items are empty)
    if (!selectedQuiz) {
      selectedQuiz = await this.legacyQuizFallback(excludeQuizIds, floor);
    }

    // 3. Concurrency-safe atomic usage recording
    if (selectedQuiz && seasonId) {
      await this.recordUsage(selectedQuiz.id, seasonId, floor);
    }

    return selectedQuiz;
  }

  /**
   * Queries the pool applying monthly anti-repeat prioritization.
   */
  private async queryWithAntiRepeat(
    seasonId: string,
    subject: string | null,
    difficulty: string | null,
    excludeQuizIds: string[],
  ) {
    const baseWhere: Prisma.TowerQuestionPoolItemWhereInput = {
      isEligible: true,
      ...(excludeQuizIds.length > 0
        ? { quizId: { notIn: excludeQuizIds } }
        : {}),
      ...(subject ? { subject: resolveSubjectFilter(subject) } : {}),
      ...(difficulty ? { difficulty: difficulty as any } : {}),
    };

    // Priority 1: Never used in ANY season
    try {
      const priority1Where: Prisma.TowerQuestionPoolItemWhereInput = {
        ...baseWhere,
        quiz: {
          towerUsages: { none: {} },
        },
      };

      const p1Count = await this.prisma.towerQuestionPoolItem.count({
        where: priority1Where,
      });

      if (p1Count > 0) {
        const skip = Math.floor(Math.random() * p1Count);
        const item = await this.prisma.towerQuestionPoolItem.findFirst({
          where: priority1Where,
          skip,
          include: {
            quiz: {
              include: { options: true },
            },
          },
        });
        if (item?.quiz) return item.quiz;
      }
    } catch (e: any) {
      this.logger.debug(`Anti-repeat Priority 1 query skipped: ${e.message}`);
    }

    // Priority 2: Never used in CURRENT season
    try {
      const priority2Where: Prisma.TowerQuestionPoolItemWhereInput = {
        ...baseWhere,
        quiz: {
          towerUsages: { none: { seasonId } },
        },
      };

      const p2Count = await this.prisma.towerQuestionPoolItem.count({
        where: priority2Where,
      });

      if (p2Count > 0) {
        const skip = Math.floor(Math.random() * p2Count);
        const item = await this.prisma.towerQuestionPoolItem.findFirst({
          where: priority2Where,
          skip,
          include: {
            quiz: {
              include: { options: true },
            },
          },
        });
        if (item?.quiz) return item.quiz;
      }
    } catch (e: any) {
      this.logger.debug(`Anti-repeat Priority 2 query skipped: ${e.message}`);
    }

    // Priority 3: Used in current season, ordered by least uses (usageCount asc, usedAt asc)
    try {
      const usageWhere: Prisma.TowerQuestionUsageWhereInput = {
        seasonId,
        ...(excludeQuizIds.length > 0
          ? { quizId: { notIn: excludeQuizIds } }
          : {}),
        quiz: {
          towerPoolItem: {
            isEligible: true,
            ...(subject ? { subject: resolveSubjectFilter(subject) } : {}),
            ...(difficulty ? { difficulty: difficulty as any } : {}),
          },
        },
      };

      const usages = await this.prisma.towerQuestionUsage.findMany({
        where: usageWhere,
        orderBy: [{ usageCount: 'asc' }, { usedAt: 'asc' }],
        take: 5,
        include: {
          quiz: {
            include: { options: true },
          },
        },
      });

      if (usages.length > 0) {
        // Pick randomly among top 5 least used to avoid deterministic stampede
        const pickedUsage = usages[Math.floor(Math.random() * usages.length)];
        if (pickedUsage?.quiz) return pickedUsage.quiz;
      }
    } catch (e: any) {
      this.logger.debug(`Anti-repeat Priority 3 query skipped: ${e.message}`);
    }

    return null;
  }

  /**
   * Fallback for empty question pool or legacy unit tests.
   */
  private async legacyQuizFallback(excludeQuizIds: string[], floor = 1) {
    const baseWhere: Prisma.QuizWhereInput =
      excludeQuizIds.length > 0 ? { id: { notIn: excludeQuizIds } } : {};

    const codeProbability = floor <= 30 ? 0.2 : floor <= 70 ? 0.5 : 0.8;
    const preferCode = Math.random() < codeProbability;
    const tierWhere: Prisma.QuizWhereInput = {
      ...baseWhere,
      code: preferCode ? { not: null } : null,
    };

    try {
      const tierCount = await this.prisma.quiz.count({ where: tierWhere });
      if (tierCount > 0) {
        const skip = Math.floor(Math.random() * tierCount);
        const picked = await this.prisma.quiz.findFirst({
          where: tierWhere,
          skip,
          include: { options: true },
        });
        if (picked) return picked;
      }

      const count = await this.prisma.quiz.count({ where: baseWhere });
      if (count > 0) {
        const skip = Math.floor(Math.random() * count);
        return await this.prisma.quiz.findFirst({
          where: baseWhere,
          skip,
          include: { options: true },
        });
      }

      if (excludeQuizIds.length > 0) {
        const lastAskedId = excludeQuizIds[excludeQuizIds.length - 1];
        const lastCount = await this.prisma.quiz.count({
          where: { id: { not: lastAskedId } },
        });
        if (lastCount > 0) {
          const skip = Math.floor(Math.random() * lastCount);
          return await this.prisma.quiz.findFirst({
            where: { id: { not: lastAskedId } },
            skip,
            include: { options: true },
          });
        }
      }
    } catch (err: any) {
      this.logger.warn(`Legacy fallback query error: ${err.message}`);
    }

    return null;
  }

  /**
   * Concurrency-safe atomic usage tracking.
   */
  private async recordUsage(quizId: string, seasonId: string, floor: number) {
    try {
      await this.prisma.towerQuestionUsage.upsert({
        where: {
          quizId_seasonId: { quizId, seasonId },
        },
        create: {
          quizId,
          seasonId,
          floor,
          usedAt: new Date(),
          usageCount: 1,
        },
        update: {
          floor,
          usedAt: new Date(),
          usageCount: { increment: 1 },
        },
      });
    } catch (err: any) {
      this.logger.warn(
        `Failed to record question usage for quizId=${quizId}, seasonId=${seasonId}: ${err.message}`,
      );
    }
  }
}
