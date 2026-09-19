import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CertificateService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyCertificates(req: ExpressRequest) {
    const userId = this.extractUserId(req);

    type CertificateRow = {
      id: string;
      userId: string;
      courseId: string;
      certificateCode: string;
      issuedAt: Date;
      metadata: unknown;
      createdAt: Date;
      course_id: string;
      course_name: string;
      course_slug: string;
    };

    const rows = await this.prisma.$queryRaw<CertificateRow[]>`
      SELECT
        cert.id,
        cert."userId",
        cert."courseId",
        cert."certificateCode",
        cert."issuedAt",
        cert.metadata,
        cert."createdAt",
        c.id AS course_id,
        c.name AS course_name,
        c.slug AS course_slug
      FROM certificates cert
      INNER JOIN courses c ON c.id = cert."courseId"
      WHERE cert."userId" = ${userId}
      ORDER BY cert."issuedAt" DESC
    `;

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      courseId: row.courseId,
      certificateCode: row.certificateCode,
      issuedAt: row.issuedAt,
      metadata: row.metadata,
      createdAt: row.createdAt,
      course: {
        id: row.course_id,
        name: row.course_name,
        slug: row.course_slug,
      },
    }));
  }

  /**
   * Public code suggestions for the verify UI. No user PII.
   */
  async suggest(query: string) {
    const normalized = query?.trim() ?? '';
    if (normalized.length < 2) return [];

    const rows = await this.prisma.certificate.findMany({
      where: {
        certificateCode: { contains: normalized, mode: 'insensitive' },
      },
      take: 8,
      orderBy: { issuedAt: 'desc' },
      select: {
        certificateCode: true,
        issuedAt: true,
        course: { select: { name: true } },
      },
    });

    return rows.map((row) => ({
      certificateCode: row.certificateCode,
      issuedAt: row.issuedAt,
      courseName: row.course.name,
    }));
  }

  /**
   * Public verification by certificate code — no PII beyond course + issue date.
   */
  async verifyByCode(code: string) {
    const normalized = code?.trim();
    if (!normalized) {
      throw new NotFoundException('Certificate not found');
    }

    type VerifyRow = {
      certificateCode: string;
      issuedAt: Date;
      course_id: string;
      course_name: string;
      course_slug: string;
    };

    const rows = await this.prisma.$queryRaw<VerifyRow[]>`
      SELECT
        cert."certificateCode",
        cert."issuedAt",
        c.id AS course_id,
        c.name AS course_name,
        c.slug AS course_slug
      FROM certificates cert
      INNER JOIN courses c ON c.id = cert."courseId"
      WHERE lower(cert."certificateCode") = lower(${normalized})
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) {
      throw new NotFoundException('Certificate not found');
    }

    return {
      valid: true,
      certificateCode: row.certificateCode,
      issuedAt: row.issuedAt,
      course: {
        id: row.course_id,
        name: row.course_name,
        slug: row.course_slug,
      },
    };
  }

  extractUserId(req: ExpressRequest): string {
    const user = (req as ExpressRequest & { user?: any }).user;
    const candidates = [
      user?.id,
      user?.sub,
      user?.user?.id,
      user?.data?.id,
      user?.data?.user?.id,
    ];

    const userId = candidates.find(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0,
    );

    if (!userId) {
      throw new ForbiddenException('Unable to resolve authenticated user id');
    }

    return userId;
  }
}
