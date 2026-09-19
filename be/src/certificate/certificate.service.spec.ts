import { NotFoundException } from '@nestjs/common';
import { CertificateService } from './certificate.service';

describe('CertificateService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    certificate: { findMany: jest.fn() },
  };

  let service: CertificateService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CertificateService(prisma as never);
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
