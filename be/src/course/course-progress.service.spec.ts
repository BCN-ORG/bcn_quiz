import { CourseProgressService } from './course-progress.service';

describe('CourseProgressService.reopenTopicProgressAndCourses', () => {
  const prisma = {
    topicProgress: { updateMany: jest.fn() },
    courseTopic: { findMany: jest.fn() },
    userCourseProgress: { findMany: jest.fn() },
    certificate: { upsert: jest.fn() },
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
    expect(prisma.courseTopic.findMany).not.toHaveBeenCalled();
    expect(prisma.userCourseProgress.findMany).not.toHaveBeenCalled();
  });

  it('syncs a newly completed course when approval runs as a reviewer', async () => {
    prisma.certificate.upsert.mockResolvedValue({});
    const completion = service as unknown as {
      maybeIssueCertificateAndSyncProfiles: (
        userId: string,
        course: unknown,
        existing: unknown,
        progress: unknown,
      ) => Promise<void>;
    };

    await completion.maybeIssueCertificateAndSyncProfiles(
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
