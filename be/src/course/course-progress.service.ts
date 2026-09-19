import { Injectable, Logger } from '@nestjs/common';
import {
  CourseProgressStatus,
  ProjectSubmissionStatus,
  type UserCourseProgress,
} from '@prisma/client';
import type { Request as ExpressRequest } from 'express';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';

type CourseForProgressEval = {
  id: string;
  name: string;
  slug: string;
  hasProject: boolean;
  topicWeight: number;
  projectWeight: number;
  topics: Array<{ topicId: string }>;
  projectRequirement: { id: string; isRequired: boolean } | null;
};

@Injectable()
export class CourseProgressService {
  private readonly logger = new Logger(CourseProgressService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly profilesService: ProfilesService,
  ) {}

  /**
   * After quizzes are removed (or curriculum shrinks), recompute coverage-based
   * topic completion for every learner with a progress row, then refresh courses.
   */
  async reevaluateTopicCoverageForAllUsers(topicId: string): Promise<number> {
    const [totalQuizzes, progresses, courseLinks] = await Promise.all([
      this.prisma.quiz.count({ where: { topicId } }),
      this.prisma.topicProgress.findMany({
        where: { topicId },
        select: { userId: true, isCompleted: true, completedAt: true },
      }),
      this.prisma.courseTopic.findMany({
        where: { topicId },
        select: { courseId: true },
      }),
    ]);

    let updated = 0;
    const now = new Date();

    for (const progress of progresses) {
      const coverageComplete =
        totalQuizzes > 0
          ? await this.isUserTopicCoverageComplete(
              progress.userId,
              topicId,
              totalQuizzes,
            )
          : false;

      if (coverageComplete === progress.isCompleted) {
        continue;
      }

      await this.prisma.topicProgress.update({
        where: {
          userId_topicId: {
            userId: progress.userId,
            topicId,
          },
        },
        data: {
          isCompleted: coverageComplete,
          completedAt: coverageComplete ? (progress.completedAt ?? now) : null,
        },
      });
      updated += 1;
    }

    const courseIds = [...new Set(courseLinks.map((link) => link.courseId))];
    for (const courseId of courseIds) {
      await this.reevaluateAllUsersForCourse(courseId);
    }

    this.logger.log(
      `[reevaluateTopicCoverageForAllUsers] topicId=${topicId} progresses=${progresses.length} updated=${updated} courses=${courseIds.length}`,
    );

    return updated;
  }

  /**
   * Sync one user's sticky topic completion flag with live quiz coverage.
   * Used on progress reads so summary and progress.isCompleted stay aligned.
   */
  async syncUserTopicCoverage(
    userId: string,
    topicId: string,
  ): Promise<boolean> {
    const [totalQuizzes, progress] = await Promise.all([
      this.prisma.quiz.count({ where: { topicId } }),
      this.prisma.topicProgress.findUnique({
        where: { userId_topicId: { userId, topicId } },
        select: { isCompleted: true, completedAt: true },
      }),
    ]);

    if (!progress) {
      return false;
    }

    const coverageComplete =
      totalQuizzes > 0
        ? await this.isUserTopicCoverageComplete(userId, topicId, totalQuizzes)
        : false;

    if (coverageComplete !== progress.isCompleted) {
      await this.prisma.topicProgress.update({
        where: { userId_topicId: { userId, topicId } },
        data: {
          isCompleted: coverageComplete,
          completedAt: coverageComplete
            ? (progress.completedAt ?? new Date())
            : null,
        },
      });
    }

    return coverageComplete;
  }

  private async isUserTopicCoverageComplete(
    userId: string,
    topicId: string,
    totalQuizzes: number,
  ): Promise<boolean> {
    if (totalQuizzes <= 0) {
      return false;
    }

    const correctUnique = await this.prisma.$queryRaw<
      Array<{ count: bigint | number }>
    >`
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT DISTINCT ON (qa."quizId") qa."isCorrect"
        FROM quiz_attempts qa
        INNER JOIN quizzes q ON q.id = qa."quizId"
        WHERE qa."userId" = ${userId}
          AND q."topicId" = ${topicId}
        ORDER BY qa."quizId", qa."submittedAt" DESC
      ) latest
      WHERE latest."isCorrect" = true
    `;

    const correctCount = Number(correctUnique[0]?.count ?? 0);
    return correctCount / totalQuizzes >= 0.8;
  }

  async evaluateCoursesByTopic(
    userId: string,
    topicId: string,
    req?: ExpressRequest,
  ): Promise<void> {
    const links = await this.prisma.courseTopic.findMany({
      where: { topicId },
      select: { courseId: true },
    });

    const courseIds = [...new Set(links.map((item) => item.courseId))];

    for (const courseId of courseIds) {
      await this.evaluateCourseProgress(userId, courseId, req);
    }
  }

  /**
   * Option B: when course curriculum changes (topics / hasProject),
   * recompute progress for every learner who already has a progress row.
   * COMPLETED users may be demoted; certificates are kept (not deleted).
   */
  async reevaluateAllUsersForCourse(courseId: string): Promise<number> {
    const rows = await this.prisma.userCourseProgress.findMany({
      where: { courseId },
      select: { userId: true },
    });

    const userIds = rows.map((row) => row.userId);
    const concurrency = 10;

    for (let i = 0; i < userIds.length; i += concurrency) {
      const batch = userIds.slice(i, i + concurrency);
      await Promise.all(
        batch.map((userId) => this.evaluateCourseProgress(userId, courseId)),
      );
    }

    this.logger.log(
      `[reevaluateAllUsersForCourse] courseId=${courseId} users=${userIds.length}`,
    );

    return userIds.length;
  }

  /**
   * New quizzes invalidate sticky topic completion only.
   * Full course % is recomputed lazily on the next progress read via
   * healStaleTopicCompletions + evaluateCourseProgress — sync fan-out after
   * bulk import was timing out against remote Postgres.
   */
  async reopenTopicProgressAndCourses(topicId: string): Promise<number> {
    const cleared = await this.prisma.topicProgress.updateMany({
      where: {
        topicId,
        isCompleted: true,
      },
      data: {
        isCompleted: false,
        completedAt: null,
      },
    });

    this.logger.log(
      `[reopenTopicProgressAndCourses] topicId=${topicId} clearedTopicProgress=${cleared.count} deferredCourseReeval=true`,
    );

    return cleared.count;
  }

  async evaluateCourseProgress(
    userId: string,
    courseId: string,
    req?: ExpressRequest,
  ): Promise<UserCourseProgress | null> {
    const [course, existing] = await Promise.all([
      this.prisma.course.findUnique({
        where: { id: courseId },
        include: {
          topics: {
            select: {
              topicId: true,
            },
          },
          projectRequirement: {
            select: {
              id: true,
              isRequired: true,
            },
          },
        },
      }),
      this.prisma.userCourseProgress.findUnique({
        where: {
          userId_courseId: {
            userId,
            courseId,
          },
        },
      }),
    ]);

    if (!course) {
      return null;
    }

    const topicIds = course.topics.map((item) => item.topicId);

    // Self-heal on read: quizzes added after topic completion must reopen that topic
    // even if the admin create-path fan-out was missed / not deployed yet.
    await this.healStaleTopicCompletions(userId, topicIds);

    const progress = await this.computeAndUpsertCourseProgress(
      userId,
      course,
      existing,
    );

    await this.maybeIssueCertificateAndSyncProfiles(
      userId,
      course,
      existing,
      progress,
      req,
    );

    this.logger.debug(
      `[evaluateCourseProgress] userId=${userId} courseId=${courseId} status=${progress.status} progress=${progress.progressPercent}`,
    );

    return progress;
  }

  /**
   * Batch heal + recompute for a page of courses.
   * Shared topic-heal / reads — no Profiles HTTP (GET path).
   */
  async evaluateCourseProgressBatch(
    userId: string,
    courseIds: string[],
  ): Promise<void> {
    const uniqueCourseIds = [...new Set(courseIds.filter(Boolean))];
    if (uniqueCourseIds.length === 0) {
      return;
    }

    const [courses, existingRows] = await Promise.all([
      this.prisma.course.findMany({
        where: { id: { in: uniqueCourseIds } },
        include: {
          topics: {
            select: { topicId: true },
          },
          projectRequirement: {
            select: {
              id: true,
              isRequired: true,
            },
          },
        },
      }),
      this.prisma.userCourseProgress.findMany({
        where: {
          userId,
          courseId: { in: uniqueCourseIds },
        },
      }),
    ]);

    const allTopicIds = [
      ...new Set(
        courses.flatMap((course) => course.topics.map((t) => t.topicId)),
      ),
    ];

    await this.healStaleTopicCompletions(userId, allTopicIds);

    const projectCourseIds = courses
      .filter((course) => course.hasProject)
      .map((course) => course.id);

    const [topicProgresses, approvedProjects] = await Promise.all([
      allTopicIds.length
        ? this.prisma.topicProgress.findMany({
            where: {
              userId,
              topicId: { in: allTopicIds },
            },
            select: {
              topicId: true,
              isCompleted: true,
            },
          })
        : Promise.resolve(
            [] as Array<{ topicId: string; isCompleted: boolean }>,
          ),
      projectCourseIds.length
        ? this.prisma.projectSubmission.findMany({
            where: {
              userId,
              courseId: { in: projectCourseIds },
              status: ProjectSubmissionStatus.APPROVED,
            },
            orderBy: {
              reviewedAt: 'desc',
            },
            select: {
              courseId: true,
              reviewedAt: true,
            },
          })
        : Promise.resolve(
            [] as Array<{ courseId: string; reviewedAt: Date | null }>,
          ),
    ]);

    const completedTopicIds = new Set(
      topicProgresses
        .filter((row) => row.isCompleted)
        .map((row) => row.topicId),
    );

    const approvedByCourseId = new Map<string, Date | null>();
    for (const row of approvedProjects) {
      if (!approvedByCourseId.has(row.courseId)) {
        approvedByCourseId.set(row.courseId, row.reviewedAt);
      }
    }

    const existingByCourseId = new Map(
      existingRows.map((row) => [row.courseId, row]),
    );

    await Promise.all(
      courses.map((course) => {
        const topicIds = course.topics.map((item) => item.topicId);
        const completedTopicCount = topicIds.filter((topicId) =>
          completedTopicIds.has(topicId),
        ).length;
        const approvedReviewedAt = approvedByCourseId.get(course.id);

        return this.upsertComputedCourseProgress(
          userId,
          course,
          existingByCourseId.get(course.id) ?? null,
          {
            totalTopics: topicIds.length,
            completedTopicCount,
            approvedReviewedAt:
              approvedReviewedAt === undefined ? null : approvedReviewedAt,
            hasApprovedProject: approvedByCourseId.has(course.id),
          },
        );
      }),
    );
  }

  private async computeAndUpsertCourseProgress(
    userId: string,
    course: CourseForProgressEval,
    existing: UserCourseProgress | null,
  ): Promise<UserCourseProgress> {
    const topicIds = course.topics.map((item) => item.topicId);
    const totalTopics = topicIds.length;

    const topicProgresses = totalTopics
      ? await this.prisma.topicProgress.findMany({
          where: {
            userId,
            topicId: {
              in: topicIds,
            },
          },
          select: {
            topicId: true,
            isCompleted: true,
          },
        })
      : [];

    const completedTopicCount = topicProgresses.filter(
      (item) => item.isCompleted,
    ).length;

    const requiresProjectApproval = course.hasProject;
    const approvedProject = requiresProjectApproval
      ? await this.prisma.projectSubmission.findFirst({
          where: {
            userId,
            courseId: course.id,
            status: ProjectSubmissionStatus.APPROVED,
          },
          orderBy: {
            reviewedAt: 'desc',
          },
          select: {
            reviewedAt: true,
          },
        })
      : null;

    return this.upsertComputedCourseProgress(userId, course, existing, {
      totalTopics,
      completedTopicCount,
      approvedReviewedAt: approvedProject?.reviewedAt ?? null,
      hasApprovedProject: Boolean(approvedProject),
    });
  }

  private async upsertComputedCourseProgress(
    userId: string,
    course: CourseForProgressEval,
    existing: UserCourseProgress | null,
    stats: {
      totalTopics: number;
      completedTopicCount: number;
      approvedReviewedAt: Date | null;
      hasApprovedProject: boolean;
    },
  ): Promise<UserCourseProgress> {
    const {
      totalTopics,
      completedTopicCount,
      approvedReviewedAt,
      hasApprovedProject,
    } = stats;

    // If course has no topics, topic milestone is considered satisfied automatically
    const topicMilestoneCompleted =
      totalTopics === 0 || completedTopicCount === totalTopics;

    const requiresProjectApproval = course.hasProject;
    // Course weights (default 50/50). Without project, topics are 100%.
    const topicWeight = requiresProjectApproval
      ? Math.max(0, Math.min(100, course.topicWeight ?? 50))
      : 100;
    const projectWeight = requiresProjectApproval
      ? Math.max(0, Math.min(100, course.projectWeight ?? 50))
      : 0;

    const topicProgressPercent =
      totalTopics > 0
        ? Math.round((completedTopicCount / totalTopics) * topicWeight)
        : topicWeight; // No topics → topic milestone auto-satisfied, full weight earned
    const projectProgressPercent = hasApprovedProject ? projectWeight : 0;

    let progressPercent = Math.min(
      100,
      topicProgressPercent + projectProgressPercent,
    );

    let status: CourseProgressStatus = CourseProgressStatus.IN_PROGRESS;

    if (
      topicMilestoneCompleted &&
      requiresProjectApproval &&
      !hasApprovedProject
    ) {
      // Topics done, waiting for project approval → only topic weight counts
      status = CourseProgressStatus.PROJECT_PENDING_APPROVAL;
      progressPercent = topicProgressPercent;
    }

    if (topicMilestoneCompleted && !requiresProjectApproval) {
      status = CourseProgressStatus.COMPLETED;
      progressPercent = 100;
    }

    if (
      topicMilestoneCompleted &&
      requiresProjectApproval &&
      hasApprovedProject
    ) {
      status = CourseProgressStatus.COMPLETED;
      progressPercent = 100;
    }

    const now = new Date();

    const progress = await this.prisma.userCourseProgress.upsert({
      where: {
        userId_courseId: {
          userId,
          courseId: course.id,
        },
      },
      update: {
        topicProgressPercent,
        projectProgressPercent,
        progressPercent,
        status,
        topicsCompletedAt: topicMilestoneCompleted
          ? (existing?.topicsCompletedAt ?? now)
          : null,
        projectApprovedAt:
          status === CourseProgressStatus.COMPLETED && hasApprovedProject
            ? (approvedReviewedAt ?? now)
            : (existing?.projectApprovedAt ?? null),
        completedAt:
          status === CourseProgressStatus.COMPLETED
            ? (existing?.completedAt ?? now)
            : null,
      },
      create: {
        userId,
        courseId: course.id,
        topicProgressPercent,
        projectProgressPercent,
        progressPercent,
        status,
        topicsCompletedAt: topicMilestoneCompleted ? now : null,
        projectApprovedAt: hasApprovedProject
          ? (approvedReviewedAt ?? now)
          : null,
        completedAt: status === CourseProgressStatus.COMPLETED ? now : null,
      },
    });

    if (
      existing?.status === CourseProgressStatus.COMPLETED &&
      status !== CourseProgressStatus.COMPLETED
    ) {
      this.logger.log(
        `[evaluateCourseProgress] reopen demote userId=${userId} courseId=${course.id} ${existing.status} -> ${status} progress=${progressPercent}`,
      );
    }

    return progress;
  }

  private async maybeIssueCertificateAndSyncProfiles(
    userId: string,
    course: CourseForProgressEval,
    existing: UserCourseProgress | null,
    progress: UserCourseProgress,
    req?: ExpressRequest,
  ): Promise<void> {
    const now = progress.updatedAt ?? new Date();

    if (
      progress.status === CourseProgressStatus.COMPLETED &&
      existing?.status !== CourseProgressStatus.COMPLETED
    ) {
      await this.prisma.certificate.upsert({
        where: {
          userId_courseId: {
            userId,
            courseId: course.id,
          },
        },
        update: {
          issuedAt: now,
          metadata: {
            topicProgressPercent: progress.topicProgressPercent,
            projectProgressPercent: progress.projectProgressPercent,
            refreshed: true,
          },
        },
        create: {
          userId,
          courseId: course.id,
          certificateCode: `CRT-${randomUUID()}`,
          issuedAt: now,
          metadata: {
            topicProgressPercent: progress.topicProgressPercent,
            projectProgressPercent: progress.projectProgressPercent,
          },
        },
      });
    }

    // Retry safely on later evaluations; Profiles deduplicates this stable key.
    if (
      progress.status === CourseProgressStatus.COMPLETED &&
      req &&
      this.extractUserId(req) === userId
    ) {
      await this.profilesService.createTimelineEvent(req, {
        eventType: 'COURSE_COMPLETE',
        title: `Hoàn thành khóa học ${course.name}`,
        idempotencyKey: `quiz:course:${course.id}:${userId}`,
        metadata: {
          courseId: course.id,
          courseSlug: course.slug,
          score: progress.progressPercent,
        },
      });
    }
  }

  /**
   * If a topic was marked completed before newer quizzes were added,
   * clear sticky completion so course % can drop without waiting for a new attempt.
   */
  private async healStaleTopicCompletions(
    userId: string,
    topicIds: string[],
  ): Promise<void> {
    if (topicIds.length === 0) {
      return;
    }

    const completedProgresses = await this.prisma.topicProgress.findMany({
      where: {
        userId,
        topicId: { in: topicIds },
        isCompleted: true,
      },
      select: {
        topicId: true,
        completedAt: true,
        updatedAt: true,
      },
    });

    if (completedProgresses.length === 0) {
      return;
    }

    const latestQuizByTopic = await this.prisma.quiz.groupBy({
      by: ['topicId'],
      where: {
        topicId: { in: completedProgresses.map((item) => item.topicId) },
      },
      _max: {
        createdAt: true,
      },
    });

    const latestQuizCreatedAt = new Map(
      latestQuizByTopic.map((item) => [item.topicId, item._max.createdAt]),
    );

    const topicIdsToClear = completedProgresses
      .filter((progress) => {
        const latestQuizAt = latestQuizCreatedAt.get(progress.topicId);
        if (!latestQuizAt) {
          return false;
        }

        const completedAt = progress.completedAt ?? progress.updatedAt;
        return latestQuizAt.getTime() > completedAt.getTime();
      })
      .map((progress) => progress.topicId);

    if (topicIdsToClear.length === 0) {
      return;
    }

    await this.prisma.topicProgress.updateMany({
      where: {
        userId,
        topicId: { in: topicIdsToClear },
        isCompleted: true,
      },
      data: {
        isCompleted: false,
        completedAt: null,
      },
    });

    this.logger.log(
      `[healStaleTopicCompletions] userId=${userId} clearedTopics=${topicIdsToClear.length}`,
    );
  }

  private extractUserId(req: ExpressRequest): string | null {
    const user = (
      req as ExpressRequest & {
        user?: {
          id?: unknown;
          sub?: unknown;
          user?: { id?: unknown };
          data?: { id?: unknown; user?: { id?: unknown } };
        };
      }
    ).user;

    const candidates = [
      user?.id,
      user?.sub,
      user?.user?.id,
      user?.data?.id,
      user?.data?.user?.id,
    ];

    return (
      candidates.find(
        (value): value is string =>
          typeof value === 'string' && value.trim().length > 0,
      ) ?? null
    );
  }
}
