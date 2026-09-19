import { BadRequestException, ConflictException } from '@nestjs/common';
import { CourseService } from './course.service';

describe('CourseService.submitProject guards', () => {
  const prisma = {
    course: { findUnique: jest.fn() },
    courseProjectRequirement: { findUnique: jest.fn() },
    projectSubmission: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };

  const minioService = {
    createUploadSignature: jest.fn(),
  };

  const courseProgressService = {
    evaluateCourseProgress: jest.fn(),
  };

  const profilesService = {
    resolveUsers: jest.fn().mockResolvedValue(new Map()),
  };

  let service: CourseService;
  const req = { user: { id: 'user-1' } } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CourseService(
      prisma as never,
      courseProgressService as never,
      minioService as never,
      profilesService as never,
    );
  });

  it('rejects submit when course has no project', async () => {
    prisma.course.findUnique.mockResolvedValue({
      id: 'course-1',
      hasProject: false,
    });

    await expect(
      service.submitProject('course-1', req, { files: [] } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.projectSubmission.create).not.toHaveBeenCalled();
  });

  it('rejects submit when requirement is missing', async () => {
    prisma.course.findUnique.mockResolvedValue({
      id: 'course-1',
      hasProject: true,
    });
    prisma.courseProjectRequirement.findUnique.mockResolvedValue(null);

    await expect(
      service.submitProject('course-1', req, { files: [] } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate submission for the same user/course', async () => {
    prisma.course.findUnique.mockResolvedValue({
      id: 'course-1',
      hasProject: true,
    });
    prisma.courseProjectRequirement.findUnique.mockResolvedValue({
      id: 'req-1',
      description: 'Build something',
    });
    prisma.projectSubmission.findFirst.mockResolvedValue({ id: 'sub-1' });

    await expect(
      service.submitProject('course-1', req, {
        files: [
          {
            filePath: 'https://res.minio.com/demo/raw/upload/v1/x.pdf',
            storageKey: 'project-submissions/course-1/user-1/x',
            originalName: 'x.pdf',
          },
        ],
      } as never),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.projectSubmission.create).not.toHaveBeenCalled();
  });
});
