import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CourseService } from './course.service';
import { CreateUploadSignatureDto } from './dto/create-upload-signature.dto';

const req = { user: { id: 'user-1' } } as never;

describe('CourseService.createUploadSignature method selection', () => {
  const minio = {
    createUploadSignature: jest.fn().mockResolvedValue({ method: 'PUT' }),
    createPostSignature: jest.fn().mockResolvedValue({ method: 'POST' }),
  };
  const prisma = {
    course: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'course-1', hasProject: true }),
    },
  };
  let service: CourseService;
  const previous = process.env.UPLOAD_ALLOW_LEGACY_PUT;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.UPLOAD_ALLOW_LEGACY_PUT;
    service = new CourseService(
      prisma as never,
      {} as never,
      minio as never,
      {} as never,
    );
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.UPLOAD_ALLOW_LEGACY_PUT;
    else process.env.UPLOAD_ALLOW_LEGACY_PUT = previous;
  });

  it('keeps the legacy PUT response when no method is given (INV6)', async () => {
    await expect(
      service.createUploadSignature('course-1', req, {}),
    ).resolves.toEqual({ method: 'PUT' });
    expect(minio.createPostSignature).not.toHaveBeenCalled();
    expect(minio.createUploadSignature).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: 'project-submissions/course-1/user-1',
      }),
    );
  });

  it('returns a POST policy scoped to the caller folder when method=POST', async () => {
    await expect(
      service.createUploadSignature('course-1', req, { method: 'POST' }),
    ).resolves.toEqual({ method: 'POST' });
    expect(minio.createPostSignature).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: 'project-submissions/course-1/user-1',
      }),
    );
    expect(minio.createUploadSignature).not.toHaveBeenCalled();
  });

  it('rejects legacy PUT when UPLOAD_ALLOW_LEGACY_PUT=false but still serves POST (INV1)', async () => {
    process.env.UPLOAD_ALLOW_LEGACY_PUT = 'false';
    await expect(
      service.createUploadSignature('course-1', req, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createUploadSignature('course-1', req, { method: 'PUT' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(minio.createUploadSignature).not.toHaveBeenCalled();
    await expect(
      service.createUploadSignature('course-1', req, { method: 'POST' }),
    ).resolves.toEqual({ method: 'POST' });
  });
});

describe('UPLOAD_ALLOW_LEGACY_PUT parsing', () => {
  const minio = {
    createUploadSignature: jest.fn().mockResolvedValue({ method: 'PUT' }),
    createPostSignature: jest.fn(),
  };
  const prisma = {
    course: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'course-1', hasProject: true }),
    },
  };
  const previous = process.env.UPLOAD_ALLOW_LEGACY_PUT;
  afterAll(() => {
    if (previous === undefined) delete process.env.UPLOAD_ALLOW_LEGACY_PUT;
    else process.env.UPLOAD_ALLOW_LEGACY_PUT = previous;
  });

  it.each(['false', 'FALSE', ' False ', '0', 'off', 'no'])(
    'treats %p as "legacy PUT disabled"',
    async (value) => {
      process.env.UPLOAD_ALLOW_LEGACY_PUT = value;
      const service = new CourseService(
        prisma as never,
        {} as never,
        minio as never,
        {} as never,
      );
      await expect(
        service.createUploadSignature('course-1', req, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it.each(['true', '1', 'on', ''])('keeps legacy PUT for %p', async (value) => {
    process.env.UPLOAD_ALLOW_LEGACY_PUT = value;
    const service = new CourseService(
      prisma as never,
      {} as never,
      minio as never,
      {} as never,
    );
    await expect(
      service.createUploadSignature('course-1', req, {}),
    ).resolves.toEqual({ method: 'PUT' });
  });
});

describe('CreateUploadSignatureDto validation', () => {
  const check = async (plain: object) =>
    (
      await validate(plainToInstance(CreateUploadSignatureDto, plain), {
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    ).length;

  it('whitelists method PUT|POST only', async () => {
    expect(await check({ method: 'POST' })).toBe(0);
    expect(await check({ method: 'PUT' })).toBe(0);
    expect(await check({})).toBe(0);
    expect(await check({ method: 'GET' })).toBeGreaterThan(0);
  });
});
