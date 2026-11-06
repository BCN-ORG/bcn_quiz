import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CertificateRequestStatus,
  CourseProgressStatus,
  NotificationType,
  Prisma,
  ProjectSubmissionStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import type { Request as ExpressRequest } from 'express';
import { CourseProgressService } from '../course/course-progress.service';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';
import { CertificateService } from './certificate.service';
import {
  ListCertificateRequestsQueryDto,
  ReviewCertificateRequestDto,
  RevokeCertificateDto,
} from './dto/certificate-request.dto';

/** Ids are cuid-like. Anything else (a NUL byte, a path...) is not a request/course and never reaches the database. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

const DECIDABLE: CertificateRequestStatus[] = [
  CertificateRequestStatus.PENDING,
  CertificateRequestStatus.REVOKED,
];

/**
 * Certificates are issued here and only here, by an admin decision. Every transition is a conditional update on the
 * current status (updateMany ... where status in (...)), so two admins, or an admin and a re-evaluation, can never both win.
 */
@Injectable()
export class CertificateRequestService {
  private readonly logger = new Logger(CertificateRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly certificates: CertificateService,
    private readonly progress: CourseProgressService,
    private readonly notifications: NotificationService,
    private readonly profiles: ProfilesService,
  ) {}

  // ---- learner -----------------------------------------------------------------------------------------------

  async listMine(req: ExpressRequest) {
    const userId = this.certificates.extractUserId(req);
    const rows = await this.prisma.certificateRequest.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        course: { select: { id: true, name: true, slug: true } },
        certificate: {
          select: {
            id: true,
            certificateCode: true,
            issuedAt: true,
            revokedAt: true,
          },
        },
      },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        status: row.status,
        requestedAt: row.requestedAt,
        resubmittedAt: row.resubmittedAt,
        reviewedAt: row.reviewedAt,
        // Shown to the learner for a rejection or a revocation (the reason the admin wrote).
        reviewerNote:
          row.status === CertificateRequestStatus.REJECTED ||
          row.status === CertificateRequestStatus.REVOKED
            ? row.reviewerNote
            : null,
        course: row.course,
        certificate: row.certificate,
      })),
    };
  }

  async resubmit(courseId: string, req: ExpressRequest) {
    if (!ID.test(courseId))
      throw new NotFoundException('Certificate request not found');
    const userId = this.certificates.extractUserId(req);
    const request = await this.prisma.certificateRequest.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!request) throw new NotFoundException('Certificate request not found');
    if (request.status !== CertificateRequestStatus.REJECTED) {
      throw new ConflictException(
        `Only a rejected request can be resubmitted (this one is ${request.status})`,
      );
    }
    const progress = await this.progress.evaluateCourseProgress(
      userId,
      courseId,
    );
    if (progress?.status !== CourseProgressStatus.COMPLETED) {
      throw new ConflictException(
        'Finish every topic (and the project, if any) before resubmitting',
      );
    }
    const claimed = await this.prisma.certificateRequest.updateMany({
      where: { id: request.id, status: CertificateRequestStatus.REJECTED },
      data: {
        status: CertificateRequestStatus.PENDING,
        resubmittedAt: new Date(),
      },
    });
    if (!claimed.count) throw new ConflictException('Request changed, reload');
    return { id: request.id, status: CertificateRequestStatus.PENDING };
  }

  // ---- admin -------------------------------------------------------------------------------------------------

  async adminList(query: ListCertificateRequestsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim() ?? '';
    const matchedIds = search
      ? await this.profiles.searchUserIds(search)
      : null;
    const where: Prisma.CertificateRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(matchedIds ? { userId: { in: matchedIds } } : {}),
    };
    const [rows, total, pending, onHold] = await Promise.all([
      this.prisma.certificateRequest.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
        include: {
          course: { select: { id: true, name: true } },
          certificate: { select: { certificateCode: true, revokedAt: true } },
        },
      }),
      this.prisma.certificateRequest.count({ where }),
      this.prisma.certificateRequest.count({
        where: { status: CertificateRequestStatus.PENDING },
      }),
      this.prisma.certificateRequest.count({
        where: { status: CertificateRequestStatus.ON_HOLD },
      }),
    ]);
    const { users, failed } = await this.profiles.resolveUsersDetailed(
      rows.map((row) => row.userId),
    );
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return {
      pendingCount: pending,
      onHoldCount: onHold,
      profilesAvailable: !failed,
      items: rows.map((row) => {
        const profile = users.get(row.userId);
        return {
          id: row.id,
          status: row.status,
          requestedAt: row.requestedAt,
          reviewedAt: row.reviewedAt,
          reviewerNote: row.reviewerNote,
          course: row.course,
          certificateCode: row.certificate?.certificateCode ?? null,
          user: {
            id: row.userId,
            fullName: profile?.fullName ?? null,
            email: profile?.email ?? null,
            avatarUrl: profile?.avatarUrl ?? null,
          },
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  async adminDetail(id: string) {
    const request = await this.mustFind(id);
    const [eligibility, users, certificate] = await Promise.all([
      this.eligibility(request.userId, request.courseId),
      this.profiles.resolveUsersDetailed([request.userId]),
      request.certificateId
        ? this.prisma.certificate.findUnique({
            where: { id: request.certificateId },
            select: {
              certificateCode: true,
              issuedAt: true,
              revokedAt: true,
              revokedReason: true,
            },
          })
        : Promise.resolve(null),
    ]);
    const profile = users.users.get(request.userId);
    // Re-read: the live evaluation above may have moved the request between PENDING and ON_HOLD.
    const fresh = await this.mustFind(id);
    return {
      id: fresh.id,
      status: fresh.status,
      requestedAt: fresh.requestedAt,
      resubmittedAt: fresh.resubmittedAt,
      reviewedAt: fresh.reviewedAt,
      reviewerNote: fresh.reviewerNote,
      user: {
        id: request.userId,
        fullName: profile?.fullName ?? null,
        email: profile?.email ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
      },
      certificate,
      eligibility,
    };
  }

  async review(
    id: string,
    dto: ReviewCertificateRequestDto,
    req: ExpressRequest,
  ) {
    const reviewerId = this.certificates.extractUserId(req);
    const note = dto.note?.trim() || null;
    const request = await this.mustFind(id);
    if (dto.decision === 'REJECT') {
      if (!note)
        throw new BadRequestException('A reason is required to reject');
      return this.reject(
        request.id,
        request.userId,
        request.courseId,
        reviewerId,
        note,
      );
    }
    return this.approve(request, reviewerId, note);
  }

  async revoke(id: string, dto: RevokeCertificateDto, req: ExpressRequest) {
    const reviewerId = this.certificates.extractUserId(req);
    const reason = dto.reason?.trim();
    if (!reason)
      throw new BadRequestException('A reason is required to revoke');
    const request = await this.mustFind(id);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.certificateRequest.updateMany({
        where: { id, status: CertificateRequestStatus.APPROVED },
        data: {
          status: CertificateRequestStatus.REVOKED,
          reviewerId,
          reviewerNote: reason,
          reviewedAt: now,
        },
      });
      if (!claimed.count) {
        throw new ConflictException(
          'Only an approved certificate can be revoked',
        );
      }
      await tx.certificate.updateMany({
        where: request.certificateId
          ? { id: request.certificateId }
          : { userId: request.userId, courseId: request.courseId },
        data: { revokedAt: now, revokedBy: reviewerId, revokedReason: reason },
      });
    });
    await this.notify(
      request.userId,
      NotificationType.CERTIFICATE_REVOKED,
      'Chứng chỉ đã bị thu hồi',
      `Chứng chỉ khóa học ${await this.courseName(request.courseId)} đã bị thu hồi. Lý do: ${reason}`,
      `certificate-revoked:${id}:${now.getTime()}`,
    );
    return { id, status: CertificateRequestStatus.REVOKED };
  }

  // ---- internals ---------------------------------------------------------------------------------------------

  private async approve(
    request: {
      id: string;
      userId: string;
      courseId: string;
      status: CertificateRequestStatus;
    },
    reviewerId: string,
    note: string | null,
  ) {
    // Live check against the course as it is NOW (topics may have been added since the learner completed it).
    // Running it first also lets a request that was on hold move back to PENDING if the learner did finish.
    const eligibility = await this.eligibility(
      request.userId,
      request.courseId,
    );
    const current = (await this.mustFind(request.id)).status;
    if (!DECIDABLE.includes(current)) {
      throw new ConflictException(
        current === CertificateRequestStatus.ON_HOLD
          ? `Request is on hold, the learner has not finished the new content: ${eligibility.reasons.join('; ')}`
          : `A ${current} request cannot be approved`,
      );
    }
    // Reinstating a REVOKED certificate only undoes the revocation (same code, same issue date). An approved certificate
    // stays valid when the course changes, so the course changing since then must not block restoring it: it needs a
    // written reason instead, and the admin sees the warning that the learner has not finished the new content.
    const reinstating = current === CertificateRequestStatus.REVOKED;
    if (reinstating && !note) {
      throw new BadRequestException(
        'A reason is required to reinstate a revoked certificate',
      );
    }
    if (!reinstating && !eligibility.eligible) {
      throw new ConflictException(
        `Learner is not eligible: ${eligibility.reasons.join('; ') || 'course not completed'}`,
      );
    }
    const now = new Date();
    const certificate = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.certificateRequest.updateMany({
        where: { id: request.id, status: { in: DECIDABLE } },
        data: {
          status: CertificateRequestStatus.APPROVED,
          reviewerId,
          reviewerNote: note,
          reviewedAt: now,
        },
      });
      if (!claimed.count) {
        throw new ConflictException(
          'Request was decided or changed meanwhile, reload',
        );
      }
      // The course may have gained a topic since the eligibility check a few milliseconds ago: re-count inside the
      // transaction (a throw rolls the claim back).
      const topicsNow = await tx.courseTopic.count({
        where: { courseId: request.courseId },
      });
      if (!reinstating && topicsNow !== eligibility.topicsTotal) {
        throw new ConflictException(
          'The course changed while reviewing, reload and review again',
        );
      }
      const metadata: Prisma.InputJsonValue = {
        topicIds: eligibility.topics.map((topic) => topic.id),
        topicsTotal: eligibility.topicsTotal,
        topicProgressPercent: eligibility.topicProgressPercent,
        projectProgressPercent: eligibility.projectProgressPercent,
        approvedBy: reviewerId,
        approvedAt: now.toISOString(),
      };
      const issued = await tx.certificate.upsert({
        where: {
          userId_courseId: {
            userId: request.userId,
            courseId: request.courseId,
          },
        },
        // Reinstating keeps the original code AND the original issue date.
        // (the snapshot of what the learner had when it was issued is left untouched when reinstating)
        update: {
          revokedAt: null,
          revokedBy: null,
          revokedReason: null,
          ...(reinstating ? {} : { metadata }),
        },
        create: {
          userId: request.userId,
          courseId: request.courseId,
          certificateCode: `CRT-${randomUUID()}`,
          issuedAt: now,
          metadata,
        },
      });
      await tx.certificateRequest.update({
        where: { id: request.id },
        data: { certificateId: issued.id },
      });
      return issued;
    });
    await this.notify(
      request.userId,
      NotificationType.CERTIFICATE_APPROVED,
      'Chứng chỉ đã được duyệt',
      `Bạn đã được cấp chứng chỉ khóa học ${await this.courseName(request.courseId)}. Mã: ${certificate.certificateCode}`,
      `certificate-approved:${request.id}:${now.getTime()}`,
    );
    return {
      id: request.id,
      status: CertificateRequestStatus.APPROVED,
      certificateCode: certificate.certificateCode,
    };
  }

  private async reject(
    id: string,
    userId: string,
    courseId: string,
    reviewerId: string,
    note: string,
  ) {
    const now = new Date();
    const claimed = await this.prisma.certificateRequest.updateMany({
      where: { id, status: CertificateRequestStatus.PENDING },
      data: {
        status: CertificateRequestStatus.REJECTED,
        reviewerId,
        reviewerNote: note,
        reviewedAt: now,
      },
    });
    if (!claimed.count) {
      throw new ConflictException('Only a pending request can be rejected');
    }
    await this.notify(
      userId,
      NotificationType.CERTIFICATE_REJECTED,
      'Yêu cầu chứng chỉ chưa được duyệt',
      `Yêu cầu chứng chỉ khóa học ${await this.courseName(courseId)} bị từ chối. Lý do: ${note}`,
      `certificate-rejected:${id}:${now.getTime()}`,
    );
    return { id, status: CertificateRequestStatus.REJECTED };
  }

  /**
   * The learner's standing against the course as it is right now. evaluateCourseProgress heals stale topic
   * completions and also moves a PENDING/ON_HOLD request to match, so what the admin sees is what approve enforces.
   */
  private async eligibility(userId: string, courseId: string) {
    const progress = await this.progress.evaluateCourseProgress(
      userId,
      courseId,
    );
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        topics: {
          orderBy: { sortOrder: 'asc' },
          include: {
            topic: {
              select: {
                id: true,
                name: true,
                _count: { select: { quizzes: true } },
              },
            },
          },
        },
        projectRequirement: { select: { title: true, isRequired: true } },
      },
    });
    if (!course || !progress) throw new NotFoundException('Course not found');
    const topicIds = course.topics.map((link) => link.topicId);
    const [topicProgress, submission, request] = await Promise.all([
      topicIds.length
        ? this.prisma.topicProgress.findMany({
            where: { userId, topicId: { in: topicIds } },
          })
        : Promise.resolve([]),
      course.hasProject
        ? this.prisma.projectSubmission.findFirst({
            where: { userId, courseId },
            orderBy: { submittedAt: 'desc' },
            select: { status: true, reviewedAt: true },
          })
        : Promise.resolve(null),
      this.prisma.certificateRequest.findUnique({
        where: { userId_courseId: { userId, courseId } },
        select: { requestedAt: true },
      }),
    ]);
    const byTopic = new Map(topicProgress.map((row) => [row.topicId, row]));
    const topics = course.topics.map((link) => {
      const row = byTopic.get(link.topicId);
      return {
        id: link.topicId,
        name: link.topic.name,
        sortOrder: link.sortOrder,
        quizCount: link.topic._count.quizzes,
        completed: row?.isCompleted ?? false,
        accuracy: row ? Math.round(row.accuracy * 100) : null,
        totalAttempts: row?.totalAttempts ?? 0,
        // Linked to the course after the learner's request was created: the "admin added a topic later" case.
        addedAfterRequest: request
          ? link.createdAt.getTime() > request.requestedAt.getTime()
          : false,
      };
    });
    const missing = topics.filter((topic) => !topic.completed);
    const reasons: string[] = [];
    if (missing.length) {
      reasons.push(
        `Chưa hoàn thành ${missing.length}/${topics.length} topic: ${missing.map((t) => t.name).join(', ')}`,
      );
    }
    if (
      course.hasProject &&
      submission?.status !== ProjectSubmissionStatus.APPROVED
    ) {
      reasons.push(
        `Đồ án chưa được duyệt (${submission ? submission.status : 'chưa nộp'})`,
      );
    }
    const warnings: string[] = [];
    if (!topics.length && !course.hasProject) {
      warnings.push(
        'Khóa học không có topic và không có đồ án: hệ thống coi là hoàn thành ngay.',
      );
    }
    for (const topic of topics.filter((t) => t.quizCount === 0)) {
      warnings.push(`Topic "${topic.name}" chưa có câu hỏi.`);
    }
    const added = topics.filter((topic) => topic.addedAfterRequest);
    if (added.length) {
      warnings.push(
        `Khóa học được thêm ${added.length} topic sau khi học viên hoàn thành: ${added.map((t) => t.name).join(', ')}.`,
      );
    }
    return {
      eligible: progress.status === CourseProgressStatus.COMPLETED,
      courseStatus: progress.status,
      course: {
        id: course.id,
        name: course.name,
        hasProject: course.hasProject,
      },
      topicsDone: topics.length - missing.length,
      topicsTotal: topics.length,
      topicProgressPercent: progress.topicProgressPercent,
      projectProgressPercent: progress.projectProgressPercent,
      topics,
      project: course.hasProject
        ? {
            required: true,
            title: course.projectRequirement?.title ?? null,
            status: submission?.status ?? null,
            reviewedAt: submission?.reviewedAt ?? null,
          }
        : { required: false, title: null, status: null, reviewedAt: null },
      reasons,
      warnings,
    };
  }

  private async mustFind(id: string) {
    if (!ID.test(id))
      throw new NotFoundException('Certificate request not found');
    const request = await this.prisma.certificateRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Certificate request not found');
    return request;
  }

  private async courseName(courseId: string): Promise<string> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { name: true },
    });
    return course?.name ?? '';
  }

  /** The decision is already committed: a failed notification must not undo or fail it. */
  private async notify(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    dedupKey: string,
  ) {
    try {
      const rows = await this.prisma.notification.createManyAndReturn({
        data: [{ userId, type, title, message, dedupKey }],
        skipDuplicates: true,
      });
      await this.notifications.publishCreated(rows);
    } catch (error) {
      this.logger.warn(
        `Certificate notification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
