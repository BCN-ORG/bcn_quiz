import { CourseProgressService } from './course-progress.service';

describe('CourseProgressService.reopenTopicProgressAndCourses', () => {
  const prisma = {
    topicProgress: { updateMany: jest.fn() },
    courseTopic: { findMany: jest.fn() },
    userCourseProgress: { findMany: jest.fn() },
    $executeRaw: jest.fn(),
  };

  const profilesService = {
    createTimelineEvent: jest.fn(),
    createTimelineEventForUser: jest.fn(),
  };

  let service: CourseProgressService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.topicProgress.updateMany.mockResolvedValue({ count: 3 });
    service = new CourseProgressService(
      prisma as never,
      profilesService as never,
    );
  });

  it('clears sticky topic completion without sync course reevaluate', async () => {
    const cleared = await service.reopenTopicProgressAndCourses('topic-1');

    expect(cleared).toBe(3);
    expect(prisma.topicProgress.updateMany).toHaveBeenCalledWith({
      where: { topicId: 'topic-1', isCompleted: true },
      data: { isCompleted: false, completedAt: null },
    });
    // The course is not re-evaluated synchronously (that stays lazy).
    expect(prisma.userCourseProgress.findMany).not.toHaveBeenCalled();
  });

  it('puts pending certificate requests of the learners who lose the topic on hold, in ONE statement before clearing', async () => {
    const order: string[] = [];
    prisma.$executeRaw.mockImplementation(() => {
      order.push('hold');
      return Promise.resolve(2);
    });
    prisma.topicProgress.updateMany.mockImplementation(() => {
      order.push('clear');
      return Promise.resolve({ count: 3 });
    });

    await service.reopenTopicProgressAndCourses('topic-1');

    expect(order).toEqual(['hold', 'clear']);
    const [strings, ...values] = prisma.$executeRaw.mock.calls[0] as [
      string[],
      ...unknown[],
    ];
    const sql = strings.join('?');
    expect(sql).toContain('UPDATE certificate_requests');
    expect(sql).toContain("r.status = 'PENDING'");
    expect(sql).toContain("SET status = 'ON_HOLD'");
    // no per-learner id list: only the topic id is bound
    expect(values).toEqual(['topic-1', 'topic-1']);
  });

  it('syncs a newly completed course to Profiles when approval runs as a reviewer, without issuing a certificate', async () => {
    const completion = service as unknown as {
      syncCompletionToProfiles: (
        userId: string,
        course: unknown,
        existing: unknown,
        progress: unknown,
      ) => Promise<void>;
    };

    await completion.syncCompletionToProfiles(
      'learner-1',
      { id: 'course-1', name: 'Course', slug: 'course' },
      { status: 'IN_PROGRESS' },
      {
        status: 'COMPLETED',
        topicProgressPercent: 50,
        projectProgressPercent: 50,
        progressPercent: 100,
        updatedAt: new Date(),
      },
    );

    expect(profilesService.createTimelineEventForUser).toHaveBeenCalledWith(
      'learner-1',
      expect.objectContaining({
        eventType: 'COURSE_COMPLETE',
        idempotencyKey: 'quiz:course:course-1:learner-1',
      }),
    );
  });
});

describe('CourseProgressService progress rules', () => {
  const prisma = {
    quiz: { count: jest.fn() },
    topicProgress: { findUnique: jest.fn(), update: jest.fn() },
    userCourseProgress: { upsert: jest.fn() },
    certificate: { findFirst: jest.fn() },
    certificateRequest: { createMany: jest.fn(), updateMany: jest.fn() },
    $queryRaw: jest.fn(),
  };
  const profilesService = {
    createTimelineEvent: jest.fn(),
    createTimelineEventForUser: jest.fn(),
  };
  let service: CourseProgressService;

  type Stats = {
    totalTopics: number;
    completedTopicCount: number;
    approvedReviewedAt: Date | null;
    hasApprovedProject: boolean;
  };
  const baseCourse = {
    id: 'course-1',
    name: 'Course',
    slug: 'course',
    hasProject: false,
    topicWeight: 50,
    projectWeight: 50,
    topics: [],
    projectRequirement: null,
  };

  const upsert = (
    course: Partial<typeof baseCourse>,
    stats: Stats,
    existing: unknown = null,
  ) =>
    (
      service as unknown as {
        upsertComputedCourseProgress: (
          userId: string,
          course: unknown,
          existing: unknown,
          stats: Stats,
        ) => Promise<unknown>;
      }
    ).upsertComputedCourseProgress(
      'learner-1',
      { ...baseCourse, ...course },
      existing,
      stats,
    );

  const written = () =>
    (
      prisma.userCourseProgress.upsert.mock.calls as Array<
        [{ update: Record<string, unknown>; create: Record<string, unknown> }]
      >
    )[0][0];

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.userCourseProgress.upsert.mockResolvedValue({});
    prisma.certificate.findFirst.mockResolvedValue(null);
    service = new CourseProgressService(
      prisma as never,
      profilesService as never,
    );
  });

  describe('certificate request sync (a certificate is never issued here)', () => {
    const done = {
      totalTopics: 2,
      completedTopicCount: 2,
      approvedReviewedAt: null,
      hasApprovedProject: false,
    };

    it('a completed course creates the request (idempotently) and releases an on-hold one', async () => {
      await upsert({}, done);
      expect(prisma.certificateRequest.createMany).toHaveBeenCalledWith({
        data: [{ userId: 'learner-1', courseId: 'course-1' }],
        skipDuplicates: true,
      });
      expect(prisma.certificateRequest.updateMany).toHaveBeenCalledWith({
        where: { userId: 'learner-1', courseId: 'course-1', status: 'ON_HOLD' },
        data: { status: 'PENDING' },
      });
    });

    it('a learner who already holds a live certificate gets it recorded as an APPROVED request, never a PENDING one', async () => {
      const issuedAt = new Date('2026-11-06T04:31:58Z');
      prisma.certificate.findFirst.mockResolvedValue({
        id: 'cert-1',
        issuedAt,
      });
      await upsert({}, done);
      expect(prisma.certificate.findFirst).toHaveBeenCalledWith({
        where: { userId: 'learner-1', courseId: 'course-1', revokedAt: null },
        select: { id: true, issuedAt: true },
      });
      expect(prisma.certificateRequest.createMany).toHaveBeenCalledTimes(1);
      expect(prisma.certificateRequest.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            userId: 'learner-1',
            courseId: 'course-1',
            status: 'APPROVED',
            certificateId: 'cert-1',
            requestedAt: issuedAt,
          }),
        ],
        skipDuplicates: true,
      });
      expect(prisma.certificateRequest.updateMany).not.toHaveBeenCalled();
    });

    it('an incomplete course creates nothing and only holds a PENDING request (decisions are never touched)', async () => {
      await upsert({}, { ...done, completedTopicCount: 1 });
      expect(prisma.certificateRequest.createMany).not.toHaveBeenCalled();
      expect(prisma.certificateRequest.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.certificateRequest.updateMany).toHaveBeenCalledWith({
        where: { userId: 'learner-1', courseId: 'course-1', status: 'PENDING' },
        data: { status: 'ON_HOLD' },
      });
    });

    it('topics done but the project not approved yet is not a completion: no request', async () => {
      await upsert({ hasProject: true }, done);
      expect(prisma.certificateRequest.createMany).not.toHaveBeenCalled();
    });
  });

  it('completes a course without project once every topic is done', async () => {
    await upsert(
      {},
      {
        totalTopics: 2,
        completedTopicCount: 2,
        approvedReviewedAt: null,
        hasApprovedProject: false,
      },
    );

    expect(written().create).toMatchObject({
      status: 'COMPLETED',
      progressPercent: 100,
      topicProgressPercent: 100,
      projectProgressPercent: 0,
    });
  });

  it('treats a course with no topics and no project as complete', async () => {
    await upsert(
      {},
      {
        totalTopics: 0,
        completedTopicCount: 0,
        approvedReviewedAt: null,
        hasApprovedProject: false,
      },
    );

    expect(written().create).toMatchObject({
      status: 'COMPLETED',
      progressPercent: 100,
    });
  });

  it('waits for project approval after topics finish, counting only topic weight', async () => {
    await upsert(
      { hasProject: true, topicWeight: 60, projectWeight: 40 },
      {
        totalTopics: 2,
        completedTopicCount: 2,
        approvedReviewedAt: null,
        hasApprovedProject: false,
      },
    );

    expect(written().create).toMatchObject({
      status: 'PROJECT_PENDING_APPROVAL',
      progressPercent: 60,
      topicProgressPercent: 60,
      projectProgressPercent: 0,
    });
  });

  it('completes with project approval and stamps projectApprovedAt from the review', async () => {
    const reviewedAt = new Date('2026-10-01T00:00:00Z');
    await upsert(
      { hasProject: true },
      {
        totalTopics: 2,
        completedTopicCount: 2,
        approvedReviewedAt: reviewedAt,
        hasApprovedProject: true,
      },
    );

    expect(written().create).toMatchObject({
      status: 'COMPLETED',
      progressPercent: 100,
      projectApprovedAt: reviewedAt,
    });
  });

  it('reports partial progress as IN_PROGRESS using rounded topic share', async () => {
    await upsert(
      { hasProject: true },
      {
        totalTopics: 3,
        completedTopicCount: 1,
        approvedReviewedAt: null,
        hasApprovedProject: false,
      },
    );

    expect(written().create).toMatchObject({
      status: 'IN_PROGRESS',
      progressPercent: 17,
      topicsCompletedAt: null,
      completedAt: null,
    });
  });

  it('clamps out-of-range weights to 0..100', async () => {
    await upsert(
      { hasProject: true, topicWeight: 250, projectWeight: -10 },
      {
        totalTopics: 2,
        completedTopicCount: 1,
        approvedReviewedAt: null,
        hasApprovedProject: false,
      },
    );

    expect(written().create).toMatchObject({
      topicProgressPercent: 50,
      projectProgressPercent: 0,
    });
  });

  it('clears both completion timestamps when a completed course is demoted', async () => {
    const topicsCompletedAt = new Date('2026-09-01T00:00:00Z');
    const completedAt = new Date('2026-09-02T00:00:00Z');
    await upsert(
      { hasProject: true },
      {
        totalTopics: 2,
        completedTopicCount: 1,
        approvedReviewedAt: null,
        hasApprovedProject: false,
      },
      { status: 'COMPLETED', topicsCompletedAt, completedAt },
    );

    expect(written().update).toMatchObject({
      status: 'IN_PROGRESS',
      topicsCompletedAt: null,
      completedAt: null,
    });
  });

  it('preserves the original completedAt when still completed', async () => {
    const completedAt = new Date('2026-09-02T00:00:00Z');
    await upsert(
      {},
      {
        totalTopics: 1,
        completedTopicCount: 1,
        approvedReviewedAt: null,
        hasApprovedProject: false,
      },
      {
        status: 'COMPLETED',
        topicsCompletedAt: completedAt,
        completedAt,
      },
    );

    expect(written().update).toMatchObject({ completedAt });
  });

  describe('syncUserTopicCoverage', () => {
    it('returns false and writes nothing when the user has no progress row', async () => {
      prisma.quiz.count.mockResolvedValue(10);
      prisma.topicProgress.findUnique.mockResolvedValue(null);

      await expect(service.syncUserTopicCoverage('u', 't')).resolves.toBe(
        false,
      );
      expect(prisma.topicProgress.update).not.toHaveBeenCalled();
    });

    it('marks completed at exactly 80% unique correct coverage', async () => {
      prisma.quiz.count.mockResolvedValue(10);
      prisma.topicProgress.findUnique.mockResolvedValue({
        isCompleted: false,
        completedAt: null,
      });
      prisma.$queryRaw.mockResolvedValue([{ count: 8 }]);

      await expect(service.syncUserTopicCoverage('u', 't')).resolves.toBe(true);
      expect(prisma.topicProgress.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isCompleted: true, completedAt: expect.any(Date) as Date },
        }),
      );
    });

    it('reopens a completed topic below 80% and clears completedAt', async () => {
      prisma.quiz.count.mockResolvedValue(10);
      prisma.topicProgress.findUnique.mockResolvedValue({
        isCompleted: true,
        completedAt: new Date(),
      });
      prisma.$queryRaw.mockResolvedValue([{ count: 7 }]);

      await expect(service.syncUserTopicCoverage('u', 't')).resolves.toBe(
        false,
      );
      expect(prisma.topicProgress.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isCompleted: false, completedAt: null },
        }),
      );
    });

    it('does not query or write when the topic has no quizzes', async () => {
      prisma.quiz.count.mockResolvedValue(0);
      prisma.topicProgress.findUnique.mockResolvedValue({
        isCompleted: false,
        completedAt: null,
      });

      await expect(service.syncUserTopicCoverage('u', 't')).resolves.toBe(
        false,
      );
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.topicProgress.update).not.toHaveBeenCalled();
    });
  });
});

describe('CourseProgressService coverage reevaluation', () => {
  const prisma = {
    quiz: { count: jest.fn(), groupBy: jest.fn() },
    topicProgress: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    courseTopic: { findMany: jest.fn() },
    course: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
  };
  const profilesService = {
    createTimelineEvent: jest.fn(),
    createTimelineEventForUser: jest.fn(),
  };
  let service: CourseProgressService;
  let reevaluateCourse: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CourseProgressService(
      prisma as never,
      profilesService as never,
    );
    reevaluateCourse = jest
      .spyOn(service, 'reevaluateAllUsersForCourse')
      .mockResolvedValue(0);
  });

  describe('reevaluateTopicCoverageForAllUsers', () => {
    it('flips only learners whose completion differs from live coverage, then fans out once per course', async () => {
      const completedAt = new Date('2026-09-01T00:00:00Z');
      prisma.quiz.count.mockResolvedValue(10);
      prisma.topicProgress.findMany.mockResolvedValue([
        { userId: 'now-complete', isCompleted: false, completedAt: null },
        { userId: 'now-incomplete', isCompleted: true, completedAt },
        { userId: 'unchanged', isCompleted: true, completedAt },
      ]);
      prisma.courseTopic.findMany.mockResolvedValue([
        { courseId: 'c1' },
        { courseId: 'c1' },
        { courseId: 'c2' },
      ]);
      prisma.$queryRaw
        .mockResolvedValueOnce([{ count: 9 }])
        .mockResolvedValueOnce([{ count: 3 }])
        .mockResolvedValueOnce([{ count: 10 }]);

      const updated = await service.reevaluateTopicCoverageForAllUsers('t1');

      expect(updated).toBe(2);
      expect(prisma.topicProgress.update).toHaveBeenCalledTimes(2);
      expect(prisma.topicProgress.update).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: { isCompleted: true, completedAt: expect.any(Date) as Date },
        }),
      );
      expect(prisma.topicProgress.update).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: { isCompleted: false, completedAt: null },
        }),
      );
      expect(reevaluateCourse).toHaveBeenCalledTimes(2);
      expect(reevaluateCourse).toHaveBeenCalledWith('c1');
      expect(reevaluateCourse).toHaveBeenCalledWith('c2');
    });

    it('treats a topic with no quizzes as incomplete without running SQL', async () => {
      prisma.quiz.count.mockResolvedValue(0);
      prisma.topicProgress.findMany.mockResolvedValue([
        {
          userId: 'u',
          isCompleted: true,
          completedAt: new Date('2026-09-01T00:00:00Z'),
        },
      ]);
      prisma.courseTopic.findMany.mockResolvedValue([]);

      await expect(
        service.reevaluateTopicCoverageForAllUsers('t1'),
      ).resolves.toBe(1);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.topicProgress.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isCompleted: false, completedAt: null },
        }),
      );
      expect(reevaluateCourse).not.toHaveBeenCalled();
    });
  });

  describe('evaluateCourseProgress', () => {
    it('returns null for a missing course without touching progress', async () => {
      prisma.course.findUnique.mockResolvedValue(null);
      const progressFindUnique = jest.fn().mockResolvedValue(null);
      (prisma as Record<string, unknown>).userCourseProgress = {
        findUnique: progressFindUnique,
      };

      await expect(
        service.evaluateCourseProgress('u', 'missing'),
      ).resolves.toBeNull();
      expect(prisma.topicProgress.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('healStaleTopicCompletions', () => {
    const heal = (topicIds: string[]) =>
      (
        service as unknown as {
          healStaleTopicCompletions: (
            userId: string,
            topicIds: string[],
          ) => Promise<void>;
        }
      ).healStaleTopicCompletions('u', topicIds);

    it('does nothing for an empty topic list', async () => {
      await heal([]);
      expect(prisma.topicProgress.findMany).not.toHaveBeenCalled();
    });

    it('reopens only topics whose newest quiz is newer than the completion time', async () => {
      prisma.topicProgress.findMany.mockResolvedValue([
        {
          topicId: 'stale',
          completedAt: new Date('2026-09-01T00:00:00Z'),
          updatedAt: new Date('2026-09-01T00:00:00Z'),
        },
        {
          topicId: 'fresh',
          completedAt: new Date('2026-09-10T00:00:00Z'),
          updatedAt: new Date('2026-09-10T00:00:00Z'),
        },
        {
          topicId: 'no-quizzes',
          completedAt: null,
          updatedAt: new Date('2026-09-01T00:00:00Z'),
        },
      ]);
      prisma.quiz.groupBy.mockResolvedValue([
        {
          topicId: 'stale',
          _max: { createdAt: new Date('2026-09-05T00:00:00Z') },
        },
        {
          topicId: 'fresh',
          _max: { createdAt: new Date('2026-09-05T00:00:00Z') },
        },
      ]);

      await heal(['stale', 'fresh', 'no-quizzes']);

      expect(prisma.topicProgress.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u', topicId: { in: ['stale'] }, isCompleted: true },
        data: { isCompleted: false, completedAt: null },
      });
    });

    it('falls back to updatedAt when completedAt is missing', async () => {
      prisma.topicProgress.findMany.mockResolvedValue([
        {
          topicId: 't',
          completedAt: null,
          updatedAt: new Date('2026-09-01T00:00:00Z'),
        },
      ]);
      prisma.quiz.groupBy.mockResolvedValue([
        { topicId: 't', _max: { createdAt: new Date('2026-09-02T00:00:00Z') } },
      ]);

      await heal(['t']);

      expect(prisma.topicProgress.updateMany).toHaveBeenCalledTimes(1);
    });

    it('writes nothing when no completed topic is stale', async () => {
      prisma.topicProgress.findMany.mockResolvedValue([
        {
          topicId: 't',
          completedAt: new Date('2026-09-10T00:00:00Z'),
          updatedAt: new Date('2026-09-10T00:00:00Z'),
        },
      ]);
      prisma.quiz.groupBy.mockResolvedValue([
        { topicId: 't', _max: { createdAt: new Date('2026-09-01T00:00:00Z') } },
      ]);

      await heal(['t']);

      expect(prisma.topicProgress.updateMany).not.toHaveBeenCalled();
    });
  });
});
