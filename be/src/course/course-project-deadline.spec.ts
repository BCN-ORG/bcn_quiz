import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CourseService } from './course.service';
import { UpsertCourseProjectDto } from './dto/upsert-course-project.dto';

describe('CourseService.upsertProjectRequirement dueAt (INV3, INV4)', () => {
  const prisma = {
    course: { findUnique: jest.fn(), update: jest.fn() },
    courseProjectRequirement: { findUnique: jest.fn(), upsert: jest.fn() },
  };
  let service: CourseService;
  const base = { title: 'Project', description: 'Do it' };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.course.findUnique.mockResolvedValue({
      id: 'course-1',
      hasProject: true,
    });
    prisma.courseProjectRequirement.findUnique.mockResolvedValue(null);
    prisma.courseProjectRequirement.upsert.mockResolvedValue({ id: 'req-1' });
    service = new CourseService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  const call = () =>
    prisma.courseProjectRequirement.upsert.mock.calls[0][0] as {
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    };

  it('omitting dueAt keeps the stored deadline on update', async () => {
    await service.upsertProjectRequirement('course-1', base as never);
    expect('dueAt' in call().update).toBe(false);
    expect(call().create.dueAt).toBeNull();
  });

  it('dueAt null clears it and a string is stored as a Date', async () => {
    await service.upsertProjectRequirement('course-1', {
      ...base,
      dueAt: null,
    } as never);
    expect(call().update.dueAt).toBeNull();
    prisma.courseProjectRequirement.upsert.mockClear();
    await service.upsertProjectRequirement('course-1', {
      ...base,
      dueAt: '2026-12-01T10:00:00.000Z',
    } as never);
    expect(call().update.dueAt).toEqual(new Date('2026-12-01T10:00:00.000Z'));
    expect(call().create.dueAt).toEqual(new Date('2026-12-01T10:00:00.000Z'));
  });
});

describe('UpsertCourseProjectDto validation', () => {
  const check = async (plain: object) =>
    (
      await validate(plainToInstance(UpsertCourseProjectDto, plain), {
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    ).length;

  it('accepts ISO dueAt, null and omission, rejects junk', async () => {
    const base = { title: 'T', description: 'D' };
    expect(await check({ ...base, dueAt: '2026-12-01T10:00:00.000Z' })).toBe(0);
    expect(await check({ ...base, dueAt: null })).toBe(0);
    expect(await check(base)).toBe(0);
    expect(await check({ ...base, dueAt: 'next friday' })).toBeGreaterThan(0);
  });
});
