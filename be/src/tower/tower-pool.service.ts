import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TowerDistributionService } from './tower-distribution.service';

export type TowerDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export function computeContentHash(
  question: string,
  code?: string | null,
): string {
  const normQ = (question || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const normCode = (code || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return crypto
    .createHash('sha256')
    .update(`${normQ}:::${normCode}`)
    .digest('hex');
}

export function inferSubject(params: {
  courseName?: string | null;
  courseSlug?: string | null;
  topicName: string;
  topicSlug: string;
}): string {
  const combined =
    `${params.courseName || ''} ${params.courseSlug || ''} ${params.topicName} ${params.topicSlug}`.toLowerCase();

  if (
    /html|css|flexbox|grid|tailwind|frontend foundation|styling|layout/i.test(
      combined,
    )
  ) {
    return 'HTML/CSS';
  }
  if (
    /javascript|\bjs\b|typescript|\bts\b|node|react|ecmascript|es6/i.test(
      combined,
    )
  ) {
    return 'JavaScript';
  }
  if (/sql|postgres|mysql|database|csdl|query|relational/i.test(combined)) {
    return 'SQL';
  }
  if (
    /\bc\b|c programming|c-basic|pointer|embedded|struct|c language/i.test(
      combined,
    )
  ) {
    return 'C Programming';
  }
  if (/python|django|fastapi|pandas|numpy/i.test(combined)) {
    return 'Python';
  }
  if (/java|spring|jvm/i.test(combined)) {
    return 'Java';
  }
  if (/devops|docker|kubernetes|git|ci\/cd|linux/i.test(combined)) {
    return 'DevOps';
  }

  if (params.courseName && params.courseName.trim().length > 0) {
    return params.courseName.trim();
  }
  if (params.topicName && params.topicName.trim().length > 0) {
    return params.topicName.trim();
  }
  return 'General Knowledge';
}

export function classifyDifficulty(
  quiz: { question: string; code?: string | null },
  accuracyStats?: { total: number; correct: number } | null,
): TowerDifficulty {
  if (accuracyStats && accuracyStats.total >= 3) {
    const accuracy = accuracyStats.correct / accuracyStats.total;
    if (accuracy >= 0.7) return 'EASY';
    if (accuracy >= 0.4) return 'MEDIUM';
    return 'HARD';
  }

  // Heuristics
  const hasCode = !!(quiz.code && quiz.code.trim().length > 0);
  const codeLen = quiz.code ? quiz.code.trim().length : 0;
  const qLen = quiz.question.trim().length;

  if (hasCode) {
    if (codeLen > 150 || qLen > 200) {
      return 'HARD';
    }
    return 'MEDIUM';
  }

  if (qLen > 150) {
    return 'MEDIUM';
  }
  return 'EASY';
}

@Injectable()
export class TowerPoolService {
  private readonly logger = new Logger(TowerPoolService.name);
  private isSyncing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly distributionService: TowerDistributionService,
  ) {}

  /**
   * Daily 2:00 AM Cron collection job.
   */
  @Cron('0 2 * * *')
  async handleDailyCron() {
    this.logger.log(
      'Executing scheduled Tower Question Pool sync (0 2 * * *)...',
    );
    try {
      await this.syncPool();
    } catch (err: any) {
      this.logger.error(
        `Scheduled Tower Question Pool sync failed: ${err.message}`,
        err.stack,
      );
    }
  }

  /**
   * Scans all quizzes from existing Courses -> Topics -> Quizzes.
   * Normalizes content, computes content hash, classifies subject & difficulty,
   * flags duplicates and expired topics, and records job execution log.
   */
  async syncPool(): Promise<{
    logId: string;
    status: 'SUCCESS' | 'FAILED';
    totalCollected: number;
    totalEligible: number;
    totalDuplicates: number;
    errorMessage?: string;
  }> {
    if (this.isSyncing) {
      this.logger.warn(
        'Tower Question Pool sync is already running. Skipping duplicate trigger.',
      );
      const last = await this.prisma.towerCollectionJobLog.findFirst({
        orderBy: { startedAt: 'desc' },
      });
      return {
        logId: last?.id || 'in-progress',
        status: (last?.status as any) || 'RUNNING',
        totalCollected: last?.totalCollected || 0,
        totalEligible: last?.totalEligible || 0,
        totalDuplicates: last?.totalDuplicates || 0,
        errorMessage: 'A collection job is currently in progress',
      };
    }

    this.isSyncing = true;
    const jobLog = await this.prisma.towerCollectionJobLog.create({
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    try {
      // 1. Fetch all quiz attempts grouped by quizId and isCorrect to evaluate accuracy
      const attemptGroups = await this.prisma.quizAttempt.groupBy({
        by: ['quizId', 'isCorrect'],
        _count: { id: true },
      });

      const accuracyMap = new Map<string, { total: number; correct: number }>();
      for (const row of attemptGroups) {
        const stats = accuracyMap.get(row.quizId) || { total: 0, correct: 0 };
        stats.total += row._count.id;
        if (row.isCorrect) {
          stats.correct += row._count.id;
        }
        accuracyMap.set(row.quizId, stats);
      }

      // 2. Fetch all quizzes with their topic and linked course
      const quizzes = await this.prisma.quiz.findMany({
        include: {
          topic: {
            include: {
              courseLinks: {
                include: {
                  course: true,
                },
                orderBy: { sortOrder: 'asc' },
              },
            },
          },
        },
      });

      const now = Date.now();
      const seenHashes = new Set<string>();

      let totalCollected = 0;
      let totalEligible = 0;
      let totalDuplicates = 0;

      for (const quiz of quizzes) {
        totalCollected++;
        const topic = quiz.topic;
        const primaryCourseLink = topic?.courseLinks?.[0];
        const course = primaryCourseLink?.course;

        // Content Hash
        const contentHash = computeContentHash(quiz.question, quiz.code);

        // Subject classification
        const subject = inferSubject({
          courseName: course?.name,
          courseSlug: course?.slug,
          topicName: topic?.name || '',
          topicSlug: topic?.slug || '',
        });

        // Difficulty classification
        const stats = accuracyMap.get(quiz.id) || null;
        const difficulty = classifyDifficulty(
          { question: quiz.question, code: quiz.code },
          stats,
        );

        // Eligibility check
        let isEligible = true;
        let ineligibleReason: string | null = null;

        const isExpired =
          topic?.endsAt !== null &&
          topic?.endsAt !== undefined &&
          new Date(topic.endsAt).getTime() < now;

        if (isExpired) {
          isEligible = false;
          ineligibleReason = 'TOPIC_CALENDAR_EXPIRED';
        } else if (seenHashes.has(contentHash)) {
          isEligible = false;
          ineligibleReason = 'DUPLICATE_CONTENT';
          totalDuplicates++;
        } else {
          seenHashes.add(contentHash);
        }

        if (isEligible) {
          totalEligible++;
        }

        // Upsert question pool item
        await this.prisma.towerQuestionPoolItem.upsert({
          where: { quizId: quiz.id },
          create: {
            quizId: quiz.id,
            topicId: quiz.topicId,
            courseId: course?.id || null,
            subject,
            difficulty: difficulty as any,
            contentHash,
            isEligible,
            ineligibleReason,
          },
          update: {
            topicId: quiz.topicId,
            courseId: course?.id || null,
            subject,
            difficulty: difficulty as any,
            contentHash,
            isEligible,
            ineligibleReason,
          },
        });
      }

      // Update job log with success
      await this.prisma.towerCollectionJobLog.update({
        where: { id: jobLog.id },
        data: {
          status: 'SUCCESS',
          totalCollected,
          totalEligible,
          totalDuplicates,
          completedAt: new Date(),
        },
      });

      this.logger.log(
        `Tower Question Pool sync finished successfully: ${totalCollected} collected, ${totalEligible} eligible, ${totalDuplicates} duplicates.`,
      );

      return {
        logId: jobLog.id,
        status: 'SUCCESS',
        totalCollected,
        totalEligible,
        totalDuplicates,
      };
    } catch (err: any) {
      this.logger.error(
        `Tower Question Pool sync failed: ${err.message}`,
        err.stack,
      );
      await this.prisma.towerCollectionJobLog.update({
        where: { id: jobLog.id },
        data: {
          status: 'FAILED',
          errorMessage: err.message || 'Unknown collection error',
          completedAt: new Date(),
        },
      });

      return {
        logId: jobLog.id,
        status: 'FAILED',
        totalCollected: 0,
        totalEligible: 0,
        totalDuplicates: 0,
        errorMessage: err.message,
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Retrieves comprehensive pool stats, breakdowns, coverage, and last job status.
   */
  async getPoolStats(seasonKey?: string) {
    const [totalCollected, totalEligible, totalDuplicates] = await Promise.all([
      this.prisma.towerQuestionPoolItem.count(),
      this.prisma.towerQuestionPoolItem.count({ where: { isEligible: true } }),
      this.prisma.towerQuestionPoolItem.count({
        where: { ineligibleReason: 'DUPLICATE_CONTENT' },
      }),
    ]);

    const ineligibleCount = totalCollected - totalEligible;

    // Breakdown by subject
    const subjectGroups = await this.prisma.towerQuestionPoolItem.groupBy({
      by: ['subject'],
      _count: { id: true },
    });

    const eligibleSubjectGroups =
      await this.prisma.towerQuestionPoolItem.groupBy({
        by: ['subject'],
        where: { isEligible: true },
        _count: { id: true },
      });

    const eligibleSubjectMap = new Map(
      eligibleSubjectGroups.map((g) => [g.subject, g._count.id]),
    );

    const bySubject = subjectGroups.map((g) => ({
      subject: g.subject,
      count: g._count.id,
      eligibleCount: eligibleSubjectMap.get(g.subject) || 0,
    }));

    // Breakdown by difficulty
    const diffGroups = await this.prisma.towerQuestionPoolItem.groupBy({
      by: ['difficulty'],
      _count: { id: true },
    });

    const eligibleDiffGroups = await this.prisma.towerQuestionPoolItem.groupBy({
      by: ['difficulty'],
      where: { isEligible: true },
      _count: { id: true },
    });

    const eligibleDiffMap = new Map(
      eligibleDiffGroups.map((g) => [g.difficulty, g._count.id]),
    );

    const byDifficulty = diffGroups.map((g) => ({
      difficulty: g.difficulty,
      count: g._count.id,
      eligibleCount: eligibleDiffMap.get(g.difficulty) || 0,
    }));

    // Breakdown by course
    const courseGroups = await this.prisma.towerQuestionPoolItem.groupBy({
      by: ['courseId'],
      _count: { id: true },
    });

    const courseIds = courseGroups
      .map((g) => g.courseId)
      .filter((id): id is string => id !== null);

    const courses = await this.prisma.course.findMany({
      where: { id: { in: courseIds } },
      select: { id: true, name: true },
    });
    const courseNameMap = new Map(courses.map((c) => [c.id, c.name]));

    const byCourse = courseGroups.map((g) => ({
      courseId: g.courseId,
      courseName: g.courseId
        ? courseNameMap.get(g.courseId) || 'Khóa học khác'
        : 'Chưa gắn khóa',
      count: g._count.id,
    }));

    // Breakdown by topic
    const topicGroups = await this.prisma.towerQuestionPoolItem.groupBy({
      by: ['topicId'],
      _count: { id: true },
    });

    const topicIds = topicGroups.map((g) => g.topicId);
    const topics = await this.prisma.topic.findMany({
      where: { id: { in: topicIds } },
      select: { id: true, name: true },
    });
    const topicNameMap = new Map(topics.map((t) => [t.id, t.name]));

    const byTopic = topicGroups.map((g) => ({
      topicId: g.topicId,
      topicName: topicNameMap.get(g.topicId) || 'Chủ đề',
      count: g._count.id,
    }));

    // Anti-repeat & season stats
    // Find current active season or specified seasonKey
    let targetSeason = seasonKey
      ? await this.prisma.towerSeason.findUnique({ where: { seasonKey } })
      : await this.prisma.towerSeason.findFirst({
          where: { isActive: true },
          orderBy: { startsAt: 'desc' },
        });

    if (!targetSeason) {
      targetSeason = await this.prisma.towerSeason.findFirst({
        orderBy: { startsAt: 'desc' },
      });
    }

    let antiRepeatStats = {
      seasonKey: targetSeason?.seasonKey || 'N/A',
      totalUsedInSeason: 0,
      unusedInSeason: totalEligible,
      reusedInSeason: 0,
      totalUsesCount: 0,
    };

    if (targetSeason) {
      const usages = await this.prisma.towerQuestionUsage.findMany({
        where: { seasonId: targetSeason.id },
        select: { usageCount: true },
      });

      const totalUsedInSeason = usages.length;
      const reusedInSeason = usages.filter((u) => u.usageCount > 1).length;
      const totalUsesCount = usages.reduce((acc, u) => acc + u.usageCount, 0);
      const unusedInSeason = Math.max(0, totalEligible - totalUsedInSeason);

      antiRepeatStats = {
        seasonKey: targetSeason.seasonKey,
        totalUsedInSeason,
        unusedInSeason,
        reusedInSeason,
        totalUsesCount,
      };
    }

    // Floor range coverage
    const coverage = await this.distributionService.validateCoverage();

    // Last job log
    const lastJob = await this.prisma.towerCollectionJobLog.findFirst({
      orderBy: { startedAt: 'desc' },
    });

    return {
      kpis: {
        totalCollected,
        totalEligible,
        totalDuplicates,
        ineligibleCount,
      },
      breakdown: {
        bySubject,
        byDifficulty,
        byCourse,
        byTopic,
      },
      antiRepeatStats,
      coverage,
      lastJob: lastJob
        ? {
            id: lastJob.id,
            status: lastJob.status,
            startedAt: lastJob.startedAt,
            completedAt: lastJob.completedAt,
            totalCollected: lastJob.totalCollected,
            totalEligible: lastJob.totalEligible,
            totalDuplicates: lastJob.totalDuplicates,
            errorMessage: lastJob.errorMessage,
          }
        : null,
    };
  }
}
