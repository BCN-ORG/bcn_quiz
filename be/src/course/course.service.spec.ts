import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
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

describe('CourseService.reviewProjectSubmission', () => {
  const prisma = {
    projectSubmission: { findFirst: jest.fn(), update: jest.fn() },
  };
  const courseProgressService = { evaluateCourseProgress: jest.fn() };
  let service: CourseService;
  const req = { user: { id: 'reviewer-1' } } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CourseService(
      prisma as never,
      courseProgressService as never,
      { createUploadSignature: jest.fn() } as never,
      { resolveUsers: jest.fn().mockResolvedValue(new Map()) } as never,
    );
    jest
      .spyOn(
        service as unknown as {
          mapProjectSubmission: (submission: unknown) => unknown;
        },
        'mapProjectSubmission',
      )
      .mockImplementation((submission: unknown) => submission);
  });

  it('throws NotFound when the submission is not in this course', async () => {
    prisma.projectSubmission.findFirst.mockResolvedValue(null);

    await expect(
      service.reviewProjectSubmission(
        'course-1',
        'sub-1',
        { decision: 'APPROVE' } as never,
        req,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.projectSubmission.update).not.toHaveBeenCalled();
    expect(courseProgressService.evaluateCourseProgress).not.toHaveBeenCalled();
  });

  it.each([
    ['APPROVE', 'APPROVED'],
    ['REJECT', 'REJECTED'],
  ])(
    'maps %s to %s and re-evaluates the learner, not the reviewer',
    async (decision, status) => {
      prisma.projectSubmission.findFirst.mockResolvedValue({
        id: 'sub-1',
        userId: 'learner-1',
      });
      prisma.projectSubmission.update.mockResolvedValue({
        id: 'sub-1',
        status,
      });

      await service.reviewProjectSubmission(
        'course-1',
        'sub-1',
        { decision, reviewerNote: 'note' } as never,
        req,
      );

      expect(prisma.projectSubmission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sub-1' },
          data: expect.objectContaining({
            status,
            reviewerId: 'reviewer-1',
            reviewerNote: 'note',
          }) as unknown,
        }),
      );
      expect(courseProgressService.evaluateCourseProgress).toHaveBeenCalledWith(
        'learner-1',
        'course-1',
      );
    },
  );
});

describe('CourseService.reviewProjectSubmission response mapping', () => {
  it('returns files sorted by sortOrder with the public file shape', async () => {
    const prisma = {
      projectSubmission: { findFirst: jest.fn(), update: jest.fn() },
    };
    const service = new CourseService(
      prisma as never,
      { evaluateCourseProgress: jest.fn() } as never,
      { createUploadSignature: jest.fn() } as never,
      { resolveUsers: jest.fn().mockResolvedValue(new Map()) } as never,
    );
    prisma.projectSubmission.findFirst.mockResolvedValue({
      id: 'sub-1',
      userId: 'learner-1',
    });
    const file = (id: string, sortOrder: number) => ({
      id,
      filePath: `https://cdn/${id}`,
      storageKey: `key-${id}`,
      originalName: `${id}.zip`,
      mimeType: 'application/zip',
      fileSize: 10,
      sortOrder,
    });
    prisma.projectSubmission.update.mockResolvedValue({
      id: 'sub-1',
      status: 'APPROVED',
      files: [file('b', 2), file('a', 1)],
    });

    const result = (await service.reviewProjectSubmission(
      'course-1',
      'sub-1',
      { decision: 'APPROVE' } as never,
      { user: { id: 'reviewer-1' } } as never,
    )) as { status: string; files: Array<Record<string, unknown>> };

    expect(result.status).toBe('APPROVED');
    expect(result.files.map((f) => f.id)).toEqual(['a', 'b']);
    expect(result.files[0]).toEqual({
      id: 'a',
      secureUrl: 'https://cdn/a',
      publicId: 'key-a',
      originalName: 'a.zip',
      mimeType: 'application/zip',
      fileSize: 10,
      sortOrder: 1,
    });
  });
});

describe('CourseService.submitProject extra guards', () => {
  const prisma = {
    course: { findUnique: jest.fn() },
    courseProjectRequirement: { findUnique: jest.fn() },
    projectSubmission: { findFirst: jest.fn(), create: jest.fn() },
  };
  const courseProgressService = { evaluateCourseProgress: jest.fn() };
  let service: CourseService;
  const req = { user: { id: 'user-1' } } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CourseService(
      prisma as never,
      courseProgressService as never,
      { createUploadSignature: jest.fn() } as never,
      { resolveUsers: jest.fn().mockResolvedValue(new Map()) } as never,
    );
    prisma.course.findUnique.mockResolvedValue({
      id: 'course-1',
      hasProject: true,
    });
  });

  it('rejects a requirement with a blank description', async () => {
    prisma.courseProjectRequirement.findUnique.mockResolvedValue({
      id: 'req-1',
      description: '   ',
    });

    await expect(
      service.submitProject('course-1', req, { files: [] } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.projectSubmission.findFirst).not.toHaveBeenCalled();
  });

  it('deletes uploaded files and rethrows when the DB insert fails', async () => {
    prisma.courseProjectRequirement.findUnique.mockResolvedValue({
      id: 'req-1',
      description: 'Build a thing',
    });
    prisma.projectSubmission.findFirst.mockResolvedValue(null);
    const internals = service as unknown as {
      normalizeAndValidateSubmissionFiles: () => Promise<unknown[]>;
      deleteMinioFiles: (ids: string[]) => Promise<void>;
    };
    jest
      .spyOn(internals, 'normalizeAndValidateSubmissionFiles')
      .mockResolvedValue([{ publicId: 'key-1' }, { publicId: 'key-2' }]);
    const cleanup = jest
      .spyOn(internals, 'deleteMinioFiles')
      .mockResolvedValue(undefined);
    const failure = new Error('db down');
    prisma.projectSubmission.create.mockRejectedValue(failure);

    await expect(
      service.submitProject('course-1', req, { files: [] } as never),
    ).rejects.toBe(failure);
    expect(cleanup).toHaveBeenCalledWith(['key-1', 'key-2']);
    expect(courseProgressService.evaluateCourseProgress).not.toHaveBeenCalled();
  });
});

describe('CourseService admin and ownership rules', () => {
  const prisma = {
    course: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    courseProjectRequirement: { findUnique: jest.fn(), upsert: jest.fn() },
    projectSubmission: {
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const courseProgressService = {
    reevaluateAllUsersForCourse: jest.fn(),
  };
  let service: CourseService;
  const spyPrivate = (name: string) =>
    jest.spyOn(service as never, name as never) as unknown as jest.SpyInstance;
  const req = { user: { id: 'user-1' } } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CourseService(
      prisma as never,
      courseProgressService as never,
      {
        createUploadSignature: jest.fn(),
        assertObjectWithinMaxBytes: jest.fn(),
      } as never,
      { resolveUsers: jest.fn().mockResolvedValue(new Map()) } as never,
    );
  });

  describe('deleteProjectSubmission', () => {
    it('is scoped to the caller and course, and 404s when not found', async () => {
      prisma.projectSubmission.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteProjectSubmission('course-1', 'sub-1', req),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.projectSubmission.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sub-1', courseId: 'course-1', userId: 'user-1' },
        }),
      );
      expect(prisma.projectSubmission.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete an approved submission', async () => {
      prisma.projectSubmission.findFirst.mockResolvedValue({
        id: 'sub-1',
        status: 'APPROVED',
        files: [],
      });

      await expect(
        service.deleteProjectSubmission('course-1', 'sub-1', req),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.projectSubmission.delete).not.toHaveBeenCalled();
    });

    it.each(['PENDING_REVIEW', 'REJECTED'])(
      'deletes a %s submission and removes only its stored files',
      async (status) => {
        prisma.projectSubmission.findFirst.mockResolvedValue({
          id: 'sub-1',
          status,
          files: [
            { storageKey: 'k1' },
            { storageKey: null },
            { storageKey: 'k2' },
          ],
        });
        const cleanup =
          spyPrivate('deleteMinioFiles').mockResolvedValue(undefined);

        await expect(
          service.deleteProjectSubmission('course-1', 'sub-1', req),
        ).resolves.toEqual({ id: 'sub-1', deleted: true });
        expect(prisma.projectSubmission.delete).toHaveBeenCalledWith({
          where: { id: 'sub-1' },
        });
        expect(cleanup).toHaveBeenCalledWith(['k1', 'k2']);
      },
    );
  });

  describe('deleteCourse', () => {
    it('404s for a missing course without deleting anything', async () => {
      prisma.course.findUnique.mockResolvedValue(null);

      await expect(service.deleteCourse('c1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.course.delete).not.toHaveBeenCalled();
    });

    it('deletes the row first, then the image when one exists', async () => {
      prisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        imagePublicId: 'img-1',
      });
      const order: string[] = [];
      prisma.course.delete.mockImplementation(() => {
        order.push('db');
        return Promise.resolve({});
      });
      spyPrivate('deleteCourseImage').mockImplementation(() => {
        order.push('image');
        return Promise.resolve();
      });

      await expect(service.deleteCourse('c1')).resolves.toEqual({
        id: 'c1',
        deleted: true,
      });
      expect(order).toEqual(['db', 'image']);
    });

    it('skips image cleanup when the course has no image', async () => {
      prisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        imagePublicId: null,
      });
      const image = spyPrivate('deleteCourseImage');

      await service.deleteCourse('c1');

      expect(image).not.toHaveBeenCalled();
    });
  });

  describe('updateCourseTopics', () => {
    it('dedupes topics, numbers them from 1, then re-evaluates learners', async () => {
      spyPrivate('ensureCourseExists').mockResolvedValue({ id: 'c1' });
      spyPrivate('ensureTopicsExist').mockResolvedValue(undefined);
      jest
        .spyOn(service, 'getCourseById')
        .mockResolvedValue({ id: 'c1' } as never);
      const tx = {
        courseTopic: {
          deleteMany: jest.fn(),
          createMany: jest.fn(),
        },
      };
      prisma.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) =>
        fn(tx),
      );

      await service.updateCourseTopics('c1', {
        topicIds: ['t2', 't1', 't2'],
      } as never);

      expect(tx.courseTopic.deleteMany).toHaveBeenCalledWith({
        where: { courseId: 'c1' },
      });
      expect(tx.courseTopic.createMany).toHaveBeenCalledWith({
        data: [
          { courseId: 'c1', topicId: 't2', sortOrder: 1 },
          { courseId: 'c1', topicId: 't1', sortOrder: 2 },
        ],
      });
      expect(
        courseProgressService.reevaluateAllUsersForCourse,
      ).toHaveBeenCalledWith('c1');
    });
  });

  describe('upsertProjectRequirement', () => {
    const dto = { title: 'T', description: '  Build it  ' } as never;

    beforeEach(() => {
      prisma.courseProjectRequirement.findUnique.mockResolvedValue(null);
      prisma.courseProjectRequirement.upsert.mockResolvedValue({ id: 'r1' });
      spyPrivate('resolveRequirementAttachmentPatch').mockReturnValue({
        data: {},
        publicIdToDelete: null,
      });
    });

    it('rejects a blank description before touching the DB write', async () => {
      spyPrivate('ensureCourseExists').mockResolvedValue({
        id: 'c1',
        hasProject: true,
      });

      await expect(
        service.upsertProjectRequirement('c1', {
          title: 'T',
          description: '   ',
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.courseProjectRequirement.upsert).not.toHaveBeenCalled();
    });

    it('trims the description, defaults isRequired, and leaves a project course alone', async () => {
      spyPrivate('ensureCourseExists').mockResolvedValue({
        id: 'c1',
        hasProject: true,
      });

      await service.upsertProjectRequirement('c1', dto);

      expect(prisma.courseProjectRequirement.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            description: 'Build it',
            isRequired: true,
          }) as unknown,
        }),
      );
      expect(prisma.course.update).not.toHaveBeenCalled();
      expect(
        courseProgressService.reevaluateAllUsersForCourse,
      ).not.toHaveBeenCalled();
    });

    it('turns on the project (50/50) and re-evaluates learners for a course without one', async () => {
      spyPrivate('ensureCourseExists').mockResolvedValue({
        id: 'c1',
        hasProject: false,
      });

      await service.upsertProjectRequirement('c1', dto);

      expect(prisma.course.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { hasProject: true, topicWeight: 50, projectWeight: 50 },
      });
      expect(
        courseProgressService.reevaluateAllUsersForCourse,
      ).toHaveBeenCalledWith('c1');
    });
  });

  describe('createCourse default weights', () => {
    beforeEach(() => {
      spyPrivate('ensureCourseSlugUnique').mockResolvedValue(undefined);
      prisma.course.create.mockResolvedValue({ id: 'c1' });
    });

    it('defaults to 100/0 without a project', async () => {
      await service.createCourse({
        name: 'N',
        slug: 's',
        description: 'd',
      } as never);

      expect(prisma.course.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          hasProject: false,
          topicWeight: 100,
          projectWeight: 0,
        }) as unknown,
      });
    });

    it('defaults to 50/50 with a project', async () => {
      await service.createCourse({
        name: 'N',
        slug: 's',
        description: 'd',
        hasProject: true,
      } as never);

      expect(prisma.course.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          hasProject: true,
          topicWeight: 50,
          projectWeight: 50,
        }) as unknown,
      });
    });
  });
});

describe('CourseService.updateProjectSubmission', () => {
  const tx = {
    projectSubmission: { update: jest.fn(), findUniqueOrThrow: jest.fn() },
    projectSubmissionFile: {
      deleteMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  };
  const prisma = {
    projectSubmission: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  let service: CourseService;
  let normalizeFiles: jest.SpyInstance;
  let deleteFiles: jest.SpyInstance;
  const req = { user: { id: 'user-1' } } as never;

  const file = (id: string, sortOrder: number) => ({
    id,
    filePath: `https://cdn/${id}`,
    storageKey: `key-${id}`,
    originalName: `${id}.zip`,
    mimeType: 'application/zip',
    fileSize: 10,
    sortOrder,
  });
  const submission = (overrides: Record<string, unknown> = {}) => ({
    id: 'sub-1',
    status: 'PENDING_REVIEW',
    note: 'old note',
    files: [file('a', 1), file('b', 2)],
    ...overrides,
  });
  const update = (data: Record<string, unknown>) =>
    service.updateProjectSubmission('course-1', 'sub-1', req, data as never);

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CourseService(
      prisma as never,
      { evaluateCourseProgress: jest.fn() } as never,
      { createUploadSignature: jest.fn() } as never,
      { resolveUsers: jest.fn().mockResolvedValue(new Map()) } as never,
    );
    normalizeFiles = jest
      .spyOn(service as never, 'normalizeAndValidateSubmissionFiles' as never)
      .mockResolvedValue([] as never) as unknown as jest.SpyInstance;
    deleteFiles = jest
      .spyOn(service as never, 'deleteMinioFiles' as never)
      .mockResolvedValue(undefined as never) as unknown as jest.SpyInstance;
    prisma.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) =>
      fn(tx),
    );
    tx.projectSubmission.update.mockResolvedValue({ id: 'sub-1' });
    tx.projectSubmission.findUniqueOrThrow.mockResolvedValue({
      id: 'sub-1',
      files: [],
    });
  });

  it('is scoped to the caller and 404s when the submission is not theirs', async () => {
    prisma.projectSubmission.findFirst.mockResolvedValue(null);

    await expect(update({ note: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.projectSubmission.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1', courseId: 'course-1', userId: 'user-1' },
      }),
    );
  });

  it('refuses to edit an approved submission', async () => {
    prisma.projectSubmission.findFirst.mockResolvedValue(
      submission({ status: 'APPROVED' }),
    );

    await expect(update({ note: 'x' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires files or a note', async () => {
    prisma.projectSubmission.findFirst.mockResolvedValue(submission());

    await expect(update({})).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects removing a file that is not part of the submission', async () => {
    prisma.projectSubmission.findFirst.mockResolvedValue(submission());

    await expect(update({ removeFiles: ['nope'] })).rejects.toThrow(
      /could not be found/,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects removing every file without adding one', async () => {
    prisma.projectSubmission.findFirst.mockResolvedValue(submission());

    await expect(update({ removeFiles: ['a', 'b'] })).rejects.toThrow(
      /At least one file/,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects going over the 5 file limit by exactly one (2 kept + 4 new)', async () => {
    prisma.projectSubmission.findFirst.mockResolvedValue(submission());

    await expect(
      update({ files: [{}, {}, {}, {}], removeFiles: [] }),
    ).rejects.toThrow(/maximum of 5 files/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts exactly 5 files in total (2 kept + 3 new)', async () => {
    prisma.projectSubmission.findFirst.mockResolvedValue(submission());
    normalizeFiles.mockResolvedValue(
      [1, 2, 3].map((n) => ({
        secureUrl: `https://cdn/n${n}`,
        publicId: `key-n${n}`,
        originalName: `n${n}.zip`,
        mimeType: 'application/zip',
        fileSize: 5,
      })),
    );

    await update({ files: [{}, {}, {}], removeFiles: [] });

    expect(tx.projectSubmissionFile.create).toHaveBeenCalledTimes(3);
    expect(deleteFiles).not.toHaveBeenCalled();
  });

  it('resets a rejected submission to pending review on note-only edit, keeping files', async () => {
    prisma.projectSubmission.findFirst.mockResolvedValue(
      submission({ status: 'REJECTED' }),
    );

    await update({ note: 'fixed' });

    expect(tx.projectSubmission.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: {
        note: 'fixed',
        status: 'PENDING_REVIEW',
        reviewerId: null,
        reviewerNote: null,
        reviewedAt: null,
      },
    });
    expect(tx.projectSubmissionFile.deleteMany).not.toHaveBeenCalled();
    expect(deleteFiles).not.toHaveBeenCalled();
  });

  it('replaces all files when only new files are sent, then deletes old storage objects', async () => {
    prisma.projectSubmission.findFirst.mockResolvedValue(submission());
    normalizeFiles.mockResolvedValue([
      {
        secureUrl: 'https://cdn/new',
        publicId: 'key-new',
        originalName: 'new.zip',
        mimeType: 'application/zip',
        fileSize: 5,
      },
    ]);

    await update({ files: [{}] });

    expect(tx.projectSubmissionFile.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b'] } },
    });
    expect(tx.projectSubmissionFile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        submissionId: 'sub-1',
        storageKey: 'key-new',
        sortOrder: 1,
      }) as unknown,
    });
    expect(deleteFiles).toHaveBeenCalledWith(['key-a', 'key-b']);
  });

  it('removes one file, renumbers the rest from 1 and appends new files after them', async () => {
    prisma.projectSubmission.findFirst.mockResolvedValue(submission());
    normalizeFiles.mockResolvedValue([
      {
        secureUrl: 'https://cdn/new',
        publicId: 'key-new',
        originalName: 'new.zip',
        mimeType: 'application/zip',
        fileSize: 5,
      },
    ]);

    await update({ files: [{}], removeFiles: ['a'] });

    expect(tx.projectSubmissionFile.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['a'] } },
    });
    expect(tx.projectSubmissionFile.update).toHaveBeenCalledWith({
      where: { id: 'b' },
      data: { sortOrder: 1 },
    });
    expect(tx.projectSubmissionFile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sortOrder: 2 }) as unknown,
    });
    expect(deleteFiles).toHaveBeenCalledWith(['key-a']);
  });

  it('cleans up newly uploaded files and keeps old ones when the transaction fails', async () => {
    prisma.projectSubmission.findFirst.mockResolvedValue(submission());
    normalizeFiles.mockResolvedValue([
      {
        secureUrl: 'https://cdn/new',
        publicId: 'key-new',
        originalName: 'new.zip',
        mimeType: 'application/zip',
        fileSize: 5,
      },
    ]);
    const failure = new Error('tx failed');
    prisma.$transaction.mockRejectedValue(failure);

    await expect(update({ files: [{}] })).rejects.toBe(failure);

    expect(deleteFiles).toHaveBeenCalledTimes(1);
    expect(deleteFiles).toHaveBeenCalledWith(['key-new']);
  });
});

describe('CourseService.updateCourse', () => {
  const prisma = {
    course: { findUnique: jest.fn(), update: jest.fn() },
  };
  const courseProgressService = { reevaluateAllUsersForCourse: jest.fn() };
  let service: CourseService;
  let deleteImage: jest.SpyInstance;
  const spy = (name: string) =>
    jest.spyOn(service as never, name as never) as unknown as jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CourseService(
      prisma as never,
      courseProgressService as never,
      { createUploadSignature: jest.fn() } as never,
      { resolveUsers: jest.fn().mockResolvedValue(new Map()) } as never,
    );
    spy('ensureCourseExists').mockResolvedValue({ id: 'c1' });
    spy('ensureCourseSlugUnique').mockResolvedValue(undefined);
    spy('validateCourseImageFields').mockResolvedValue(undefined);
    deleteImage = spy('deleteCourseImage').mockResolvedValue(undefined);
    prisma.course.update.mockResolvedValue({ id: 'c1' });
  });

  const stored = (imagePublicId: string | null, hasProject = false) => {
    prisma.course.findUnique.mockImplementation(
      (args: { select: Record<string, boolean> }) =>
        Promise.resolve(
          'imagePublicId' in args.select
            ? { imagePublicId }
            : {
                hasProject,
                topicWeight: hasProject ? 50 : 100,
                projectWeight: hasProject ? 50 : 0,
              },
        ),
    );
  };

  it('deletes the previous image when a different one is set', async () => {
    stored('old-img');

    await service.updateCourse('c1', { imagePublicId: 'new-img' } as never);

    expect(deleteImage).toHaveBeenCalledWith('old-img');
  });

  it.each([
    ['the same image id', 'same', 'same'],
    ['no previous image', null, 'new-img'],
  ])('keeps storage untouched with %s', async (_label, previous, next) => {
    stored(previous);

    await service.updateCourse('c1', { imagePublicId: next } as never);

    expect(deleteImage).not.toHaveBeenCalled();
  });

  it('404s when the course disappears before the weights lookup', async () => {
    prisma.course.findUnique.mockResolvedValue(null);

    await expect(
      service.updateCourse('c1', {} as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.course.update).not.toHaveBeenCalled();
  });

  it('enabling a project without weights writes 50/50 and re-evaluates learners', async () => {
    stored(null, false);

    await service.updateCourse('c1', { hasProject: true } as never);

    expect(prisma.course.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { hasProject: true, topicWeight: 50, projectWeight: 50 },
    });
    expect(
      courseProgressService.reevaluateAllUsersForCourse,
    ).toHaveBeenCalledWith('c1');
  });

  it('disabling a project writes 100/0', async () => {
    stored(null, true);

    await service.updateCourse('c1', { hasProject: false } as never);

    expect(prisma.course.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { hasProject: false, topicWeight: 100, projectWeight: 0 },
    });
  });

  it('does not re-evaluate learners for a name-only change', async () => {
    stored(null, true);

    await service.updateCourse('c1', { name: 'Renamed' } as never);

    expect(prisma.course.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { name: 'Renamed' },
    });
    expect(
      courseProgressService.reevaluateAllUsersForCourse,
    ).not.toHaveBeenCalled();
  });

  it('rejects weights that do not add up to 100 and writes nothing', async () => {
    stored(null, true);

    await expect(
      service.updateCourse('c1', {
        topicWeight: 70,
        projectWeight: 70,
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.course.update).not.toHaveBeenCalled();
  });
});
