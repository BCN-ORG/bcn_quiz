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

  it('requires a full timestamp with a timezone and a real calendar date', async () => {
    const base = { title: 'T', description: 'D' };
    expect(await check({ ...base, dueAt: '2026-12-01T17:00:00+07:00' })).toBe(
      0,
    );
    expect(await check({ ...base, dueAt: '2026-12-01T10:00:00.123Z' })).toBe(0);
    // matches the pattern but is absurdly long
    const huge = `2026-12-01T10:00:00.${'0'.repeat(100_000)}Z`;
    for (const bad of [
      '2026-12-01',
      '2026-12-01T10:00:00',
      '2026-02-30T10:00:00Z',
      '0001-01-01T00:00:00Z',
      '',
      huge,
    ]) {
      expect(await check({ ...base, dueAt: bad })).toBeGreaterThan(0);
    }
  });
});

describe('CourseService.getAllCourses raw SQL mapping (INV: dueAt is returned to admin)', () => {
  it('maps req_due_at to projectRequirement.dueAt and keeps null when there is no requirement', async () => {
    const due = new Date('2026-12-01T10:00:00.000Z');
    const base = {
      slug: 's',
      description: null,
      imageUrl: null,
      imagePublicId: null,
      hasProject: true,
      topicWeight: 50,
      projectWeight: 50,
      createdAt: new Date(),
      updatedAt: new Date(),
      topic_count: 1,
      submission_count: 0,
      certificate_count: 0,
      total_count: 2,
      req_title: null,
      req_description: null,
      req_is_required: null,
      req_attachment_url: null,
      req_attachment_public_id: null,
      req_attachment_original_name: null,
      req_created_at: null,
      req_updated_at: null,
    };
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          ...base,
          id: 'c1',
          name: 'With',
          req_id: 'r1',
          req_title: 'P',
          req_is_required: true,
          req_due_at: due,
        },
        { ...base, id: 'c2', name: 'Without', req_id: null, req_due_at: null },
      ]),
    };
    const service = new CourseService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const result = await service.getAllCourses({ page: 1, limit: 10 } as never);
    expect(result.items[0].projectRequirement).toEqual(
      expect.objectContaining({ id: 'r1', dueAt: due }),
    );
    expect(result.items[1].projectRequirement).toBeNull();
  });
});
