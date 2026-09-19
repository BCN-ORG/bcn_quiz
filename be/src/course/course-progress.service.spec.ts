import { CourseProgressService } from './course-progress.service';

describe('CourseProgressService.reopenTopicProgressAndCourses', () => {
  const prisma = {
    topicProgress: { updateMany: jest.fn() },
    courseTopic: { findMany: jest.fn() },
    userCourseProgress: { findMany: jest.fn() },
  };

  const profilesService = {
    createTimelineEvent: jest.fn(),
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
});
