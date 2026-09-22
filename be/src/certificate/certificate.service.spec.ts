import { NotFoundException } from '@nestjs/common';
import { CertificateService } from './certificate.service';

describe('CertificateService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    certificate: { findMany: jest.fn(), count: jest.fn() },
  };

  let service: CertificateService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CertificateService(prisma as never);
  });

  describe('getMyCertificates', () => {
    it('returns one requested page and its total', async () => {
      const item = { id: 'cert-2', course: { id: 'c1', name: 'Nest', slug: 'nest' } };
      prisma.certificate.findMany.mockResolvedValue([item]);
      prisma.certificate.count.mockResolvedValue(11);

      await expect(
        service.getMyCertificates(
          { page: 2, limit: 10 },
          { user: { id: 'u1' } } as never,
        ),
      ).resolves.toEqual({
        items: [item],
        pagination: { page: 2, limit: 10, total: 11, totalPages: 2 },
      });
      expect(prisma.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u1' },
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  describe('verifyByCode', () => {
    it('returns public certificate payload', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          certificateCode: 'CRT-1',
          issuedAt: new Date('2026-01-01T00:00:00.000Z'),
          course_id: 'c1',
          course_name: 'Nest',
          course_slug: 'nest',
        },
      ]);

      await expect(service.verifyByCode('crt-1')).resolves.toEqual({
        valid: true,
        certificateCode: 'CRT-1',
        issuedAt: new Date('2026-01-01T00:00:00.000Z'),
        course: { id: 'c1', name: 'Nest', slug: 'nest' },
      });
    });

    it('throws NotFound for unknown codes', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      await expect(service.verifyByCode('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('suggest', () => {
    it('returns empty for short queries', async () => {
      await expect(service.suggest('C')).resolves.toEqual([]);
      expect(prisma.certificate.findMany).not.toHaveBeenCalled();
    });

    it('returns matching public suggestion rows', async () => {
      prisma.certificate.findMany.mockResolvedValue([
        {
          certificateCode: 'CRT-abc',
          issuedAt: new Date('2026-01-01T00:00:00.000Z'),
          course: { name: 'Nest' },
        },
      ]);

      await expect(service.suggest('crt')).resolves.toEqual([
        {
          certificateCode: 'CRT-abc',
          issuedAt: new Date('2026-01-01T00:00:00.000Z'),
          courseName: 'Nest',
        },
      ]);
      expect(prisma.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            certificateCode: { contains: 'crt', mode: 'insensitive' },
          },
          take: 8,
        }),
      );
    });
  });
});
