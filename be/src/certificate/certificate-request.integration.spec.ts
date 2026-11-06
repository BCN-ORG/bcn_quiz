import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CourseProgressService } from '../course/course-progress.service';
import { NotificationRealtimeService } from '../notification/notification-realtime.service';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { CertificateRequestService } from './certificate-request.service';
import { CertificateService } from './certificate.service';

/**
 * Real PostgreSQL checks of the certificate approval flow (migrations applied). Skipped unless
 * INTEGRATION_DATABASE_URL points at a disposable database, e.g.
 *   INTEGRATION_DATABASE_URL=postgresql://.../bcn_quiz_verify?schema=public npx jest src/certificate/certificate-request.integration.spec.ts
 */
const integrationUrl = process.env.INTEGRATION_DATABASE_URL;
const maybeDescribe = integrationUrl ? describe : describe.skip;

maybeDescribe('Certificate approval on real PostgreSQL', () => {
  let prisma: PrismaService;
  let progress: CourseProgressService;
  let certificates: CertificateService;
  let service: CertificateRequestService;
  const courseIds: string[] = [];
  const topicIds: string[] = [];
  const users: string[] = [];

  const profiles = {
    createTimelineEventForUser: jest.fn().mockResolvedValue(undefined),
    resolveUsersDetailed: jest
      .fn()
      .mockResolvedValue({ users: new Map(), failed: false }),
    searchUserIds: jest.fn().mockResolvedValue([]),
  };
  const asUser = (id: string) => ({ user: { id } }) as never;
  const admin = asUser('admin-1');

  const newUser = () => {
    const id = `cu-${randomUUID()}`;
    users.push(id);
    return id;
  };

  const newTopic = async (name = 'Topic') => {
    const topic = await prisma.topic.create({
      data: {
        name,
        slug: `ct-${randomUUID()}`,
        quizzes: { create: { quizCode: 'Q1', question: 'q', answer: 'A' } },
      },
    });
    topicIds.push(topic.id);
    return topic;
  };

  /** A course with `topics` topics (each with one question) and an optional project requirement. */
  const newCourse = async (topics = 2, hasProject = false) => {
    const course = await prisma.course.create({
      data: {
        name: `Course ${randomUUID().slice(0, 4)}`,
        slug: `cc-${randomUUID()}`,
        hasProject,
      },
    });
    courseIds.push(course.id);
    const created = [];
    for (let i = 0; i < topics; i += 1) {
      const topic = await newTopic(`T${i + 1}`);
      await prisma.courseTopic.create({
        data: { courseId: course.id, topicId: topic.id, sortOrder: i + 1 },
      });
      created.push(topic);
    }
    if (hasProject) {
      await prisma.courseProjectRequirement.create({
        data: { courseId: course.id, title: 'Project' },
      });
    }
    return { course, topics: created };
  };

  const complete = (userId: string, topicId: string) =>
    prisma.topicProgress.upsert({
      where: { userId_topicId: { userId, topicId } },
      create: {
        userId,
        topicId,
        totalAttempts: 1,
        correctAttempts: 1,
        accuracy: 1,
        isCompleted: true,
        completedAt: new Date(),
      },
      update: { isCompleted: true, completedAt: new Date() },
    });

  /** The learner finishes every topic of the course, then the course is evaluated like after a real submit. */
  const finishCourse = async (
    userId: string,
    courseId: string,
    topics: Array<{ id: string }>,
  ) => {
    for (const topic of topics) await complete(userId, topic.id);
    return progress.evaluateCourseProgress(userId, courseId);
  };

  const requestOf = (userId: string, courseId: string) =>
    prisma.certificateRequest.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
  const certCount = (userId: string, courseId: string) =>
    prisma.certificate.count({ where: { userId, courseId } });
  const review = (id: string, decision: 'APPROVE' | 'REJECT', note?: string) =>
    service.review(id, { decision, note }, admin);
  const notifications = (userId: string, type: string) =>
    prisma.notification.count({ where: { userId, type: type as never } });

  beforeAll(async () => {
    process.env.DATABASE_URL = integrationUrl;
    prisma = new PrismaService();
    await prisma.$connect();
    progress = new CourseProgressService(prisma, profiles as never);
    certificates = new CertificateService(prisma);
    service = new CertificateRequestService(
      prisma,
      certificates,
      progress,
      new NotificationService(prisma, new NotificationRealtimeService()),
      profiles as never,
    );
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: users } } });
    await prisma.topicProgress.deleteMany({ where: { userId: { in: users } } });
    await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
    await prisma.topic.deleteMany({ where: { id: { in: topicIds } } });
    await prisma.onModuleDestroy();
  });

  it('a completed course creates ONE pending request and no certificate, however often it is evaluated', async () => {
    const { course, topics } = await newCourse(2);
    const user = newUser();
    await finishCourse(user, course.id, topics);
    await Promise.all(
      Array.from({ length: 6 }, () =>
        progress.evaluateCourseProgress(user, course.id),
      ),
    );
    await progress.evaluateCourseProgressBatch(user, [course.id]);

    expect(
      await prisma.certificateRequest.count({
        where: { userId: user, courseId: course.id },
      }),
    ).toBe(1);
    expect((await requestOf(user, course.id))?.status).toBe('PENDING');
    expect(await certCount(user, course.id)).toBe(0);
  });

  it('an incomplete course creates no request; the batch (GET) path also creates it once complete', async () => {
    const { course, topics } = await newCourse(2);
    const user = newUser();
    await complete(user, topics[0].id);
    await progress.evaluateCourseProgress(user, course.id);
    expect(await requestOf(user, course.id)).toBeNull();

    await complete(user, topics[1].id);
    await progress.evaluateCourseProgressBatch(user, [course.id]);
    expect((await requestOf(user, course.id))?.status).toBe('PENDING');
  });

  it('approve issues the certificate once, notifies once, and a second approve is a conflict', async () => {
    const { course, topics } = await newCourse(2);
    const user = newUser();
    await finishCourse(user, course.id, topics);
    const request = (await requestOf(user, course.id))!;

    const approved = await review(request.id, 'APPROVE', 'ok');
    expect(approved).toMatchObject({ status: 'APPROVED' });
    const cert = await prisma.certificate.findUniqueOrThrow({
      where: { userId_courseId: { userId: user, courseId: course.id } },
    });
    expect(cert.certificateCode).toMatch(/^CRT-/);
    expect(cert.metadata).toMatchObject({
      topicsTotal: 2,
      approvedBy: 'admin-1',
    });
    expect(await requestOf(user, course.id)).toMatchObject({
      status: 'APPROVED',
      certificateId: cert.id,
      reviewerId: 'admin-1',
    });
    expect(await notifications(user, 'CERTIFICATE_APPROVED')).toBe(1);

    await expect(review(request.id, 'APPROVE')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(await certCount(user, course.id)).toBe(1);
    expect(await notifications(user, 'CERTIFICATE_APPROVED')).toBe(1);
  });

  it('two admins approving at the same time: exactly one wins, one certificate, one notification', async () => {
    const { course, topics } = await newCourse(1);
    const user = newUser();
    await finishCourse(user, course.id, topics);
    const request = (await requestOf(user, course.id))!;

    const settled = await Promise.allSettled([
      review(request.id, 'APPROVE'),
      review(request.id, 'APPROVE'),
      review(request.id, 'APPROVE'),
    ]);
    expect(settled.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(settled.filter((r) => r.status === 'rejected')).toHaveLength(2);
    expect(await certCount(user, course.id)).toBe(1);
    expect(await notifications(user, 'CERTIFICATE_APPROVED')).toBe(1);
  });

  it('a topic added to the course after completion puts a pending request on hold; approve is refused until the learner finishes it', async () => {
    const { course, topics } = await newCourse(2);
    const user = newUser();
    await finishCourse(user, course.id, topics);
    const request = (await requestOf(user, course.id))!;

    const extra = await newTopic('Chủ đề mới');
    await prisma.courseTopic.create({
      data: { courseId: course.id, topicId: extra.id, sortOrder: 3 },
    });
    await progress.reevaluateAllUsersForCourse(course.id);
    expect((await requestOf(user, course.id))?.status).toBe('ON_HOLD');

    const refused = review(request.id, 'APPROVE');
    await expect(refused).rejects.toBeInstanceOf(ConflictException);
    await expect(refused).rejects.toThrow(/Chủ đề mới/);
    expect(await certCount(user, course.id)).toBe(0);

    const detail = await service.adminDetail(request.id);
    expect(detail.status).toBe('ON_HOLD');
    expect(detail.eligibility).toMatchObject({
      eligible: false,
      topicsDone: 2,
      topicsTotal: 3,
    });
    expect(
      detail.eligibility.topics.find((t) => t.name === 'Chủ đề mới'),
    ).toMatchObject({ completed: false, addedAfterRequest: true });

    await complete(user, extra.id);
    await progress.evaluateCourseProgress(user, course.id);
    expect((await requestOf(user, course.id))?.status).toBe('PENDING');
    expect(await review(request.id, 'APPROVE')).toMatchObject({
      status: 'APPROVED',
    });
  });

  it('an approved certificate stays valid and verifiable when a topic is added later', async () => {
    const { course, topics } = await newCourse(2);
    const user = newUser();
    await finishCourse(user, course.id, topics);
    const request = (await requestOf(user, course.id))!;
    await review(request.id, 'APPROVE');
    const cert = await prisma.certificate.findFirstOrThrow({
      where: { userId: user, courseId: course.id },
    });

    const extra = await newTopic();
    await prisma.courseTopic.create({
      data: { courseId: course.id, topicId: extra.id, sortOrder: 3 },
    });
    await progress.reevaluateAllUsersForCourse(course.id);

    expect(
      (
        await prisma.userCourseProgress.findUniqueOrThrow({
          where: { userId_courseId: { userId: user, courseId: course.id } },
        })
      ).status,
    ).not.toBe('COMPLETED');
    expect((await requestOf(user, course.id))?.status).toBe('APPROVED');
    expect(await certificates.verifyByCode(cert.certificateCode)).toMatchObject(
      { valid: true },
    );
    expect(
      (await certificates.getMyCertificates({}, asUser(user))).items,
    ).toHaveLength(1);
    // finishing the new topic later changes nothing: no second certificate, no new request state
    await complete(user, extra.id);
    await progress.evaluateCourseProgress(user, course.id);
    expect(await certCount(user, course.id)).toBe(1);
    expect((await requestOf(user, course.id))?.status).toBe('APPROVED');
  });

  it('a question added to a completed topic holds the pending request, and approve re-checks live', async () => {
    const { course, topics } = await newCourse(1);
    const user = newUser();
    await finishCourse(user, course.id, topics);
    const request = (await requestOf(user, course.id))!;

    await new Promise((r) => setTimeout(r, 20));
    await prisma.quiz.create({
      data: {
        quizCode: 'NEW',
        question: 'q2',
        answer: 'A',
        topicId: topics[0].id,
      },
    });
    await progress.reopenTopicProgressAndCourses(topics[0].id);
    expect((await requestOf(user, course.id))?.status).toBe('ON_HOLD');
    await expect(review(request.id, 'APPROVE')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(await certCount(user, course.id)).toBe(0);
  });

  it('even if nobody re-evaluated after a question was added, approve heals and refuses', async () => {
    const { course, topics } = await newCourse(1);
    const user = newUser();
    await finishCourse(user, course.id, topics);
    const request = (await requestOf(user, course.id))!;
    await new Promise((r) => setTimeout(r, 20));
    await prisma.quiz.create({
      data: {
        quizCode: 'LATE',
        question: 'q2',
        answer: 'A',
        topicId: topics[0].id,
      },
    });
    // request is still PENDING here: the admin action itself must notice
    expect((await requestOf(user, course.id))?.status).toBe('PENDING');
    await expect(review(request.id, 'APPROVE')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(await certCount(user, course.id)).toBe(0);
    expect((await requestOf(user, course.id))?.status).toBe('ON_HOLD');
  });

  it('a topic removed so the learner is now complete creates the request', async () => {
    const { course, topics } = await newCourse(2);
    const user = newUser();
    await complete(user, topics[0].id);
    await progress.evaluateCourseProgress(user, course.id);
    expect(await requestOf(user, course.id)).toBeNull();

    await prisma.courseTopic.deleteMany({
      where: { courseId: course.id, topicId: topics[1].id },
    });
    await progress.reevaluateAllUsersForCourse(course.id);
    expect((await requestOf(user, course.id))?.status).toBe('PENDING');
  });

  it('a course with a project only creates the request once the project is approved', async () => {
    const { course, topics } = await newCourse(1, true);
    const user = newUser();
    await finishCourse(user, course.id, topics);
    expect(await requestOf(user, course.id)).toBeNull();

    const requirement = await prisma.courseProjectRequirement.findUniqueOrThrow(
      { where: { courseId: course.id } },
    );
    await prisma.projectSubmission.create({
      data: {
        userId: user,
        courseId: course.id,
        requirementId: requirement.id,
        status: 'APPROVED',
        reviewedAt: new Date(),
      },
    });
    await progress.evaluateCourseProgress(user, course.id);
    expect((await requestOf(user, course.id))?.status).toBe('PENDING');
    const detail = await service.adminDetail(
      (await requestOf(user, course.id))!.id,
    );
    expect(detail.eligibility.project).toMatchObject({
      required: true,
      status: 'APPROVED',
    });
  });

  it('reject needs a reason, tells the learner, and resubmit works only for a rejected request of a completed course', async () => {
    const { course, topics } = await newCourse(1);
    const user = newUser();
    await finishCourse(user, course.id, topics);
    const request = (await requestOf(user, course.id))!;

    await expect(review(request.id, 'REJECT')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(review(request.id, 'REJECT', '   ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // resubmit while still pending is a conflict
    await expect(
      service.resubmit(course.id, asUser(user)),
    ).rejects.toBeInstanceOf(ConflictException);

    await review(request.id, 'REJECT', 'Thiếu minh chứng');
    expect(await notifications(user, 'CERTIFICATE_REJECTED')).toBe(1);
    const mine = await service.listMine(asUser(user));
    expect(mine.items[0]).toMatchObject({
      status: 'REJECTED',
      reviewerNote: 'Thiếu minh chứng',
    });
    await expect(review(request.id, 'REJECT', 'again')).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(review(request.id, 'APPROVE')).rejects.toBeInstanceOf(
      ConflictException,
    );

    // the course changes while rejected: the learner is no longer complete, resubmit is refused
    const extra = await newTopic();
    await prisma.courseTopic.create({
      data: { courseId: course.id, topicId: extra.id, sortOrder: 2 },
    });
    await expect(
      service.resubmit(course.id, asUser(user)),
    ).rejects.toBeInstanceOf(ConflictException);
    expect((await requestOf(user, course.id))?.status).toBe('REJECTED');

    await complete(user, extra.id);
    await expect(
      service.resubmit(course.id, asUser(user)),
    ).resolves.toMatchObject({ status: 'PENDING' });
    expect((await requestOf(user, course.id))?.resubmittedAt).not.toBeNull();
    // someone else cannot resubmit it
    await expect(
      service.resubmit(course.id, asUser(newUser())),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('revoke needs a reason and an approved certificate; a revoked code never verifies as valid; admin can reinstate it', async () => {
    const { course, topics } = await newCourse(1);
    const user = newUser();
    await finishCourse(user, course.id, topics);
    const request = (await requestOf(user, course.id))!;

    await expect(
      service.revoke(request.id, { reason: 'x' }, admin),
    ).rejects.toBeInstanceOf(ConflictException); // still pending
    await review(request.id, 'APPROVE');
    const cert = await prisma.certificate.findFirstOrThrow({
      where: { userId: user, courseId: course.id },
    });

    await expect(
      service.revoke(request.id, { reason: '   ' }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
    await service.revoke(request.id, { reason: 'Gian lận' }, admin);
    expect((await requestOf(user, course.id))?.status).toBe('REVOKED');
    expect(await notifications(user, 'CERTIFICATE_REVOKED')).toBe(1);
    const verified = await certificates.verifyByCode(cert.certificateCode);
    expect(verified).toMatchObject({ valid: false, revoked: true });
    expect(JSON.stringify(verified)).not.toContain('Gian lận');
    expect(
      await certificates.suggest(cert.certificateCode.slice(0, 8)),
    ).not.toContainEqual(
      expect.objectContaining({ certificateCode: cert.certificateCode }),
    );
    expect(
      (await certificates.getMyCertificates({}, asUser(user))).items,
    ).toHaveLength(0);
    await expect(
      service.revoke(request.id, { reason: 'twice' }, admin),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.resubmit(course.id, asUser(user)),
    ).rejects.toBeInstanceOf(ConflictException);
    expect((await service.listMine(asUser(user))).items[0]).toMatchObject({
      status: 'REVOKED',
      reviewerNote: 'Gian lận',
    });

    // reinstated by an admin while still eligible: same code AND the same issue date, valid again
    await review(request.id, 'APPROVE', 'Xác minh lại');
    expect(
      (await prisma.certificate.findUniqueOrThrow({ where: { id: cert.id } }))
        .issuedAt,
    ).toEqual(cert.issuedAt);
    expect(await certificates.verifyByCode(cert.certificateCode)).toMatchObject(
      { valid: true },
    );
    expect(await certCount(user, course.id)).toBe(1);
  });

  it('a revoked request is not reinstated while the learner is not complete', async () => {
    const { course, topics } = await newCourse(1);
    const user = newUser();
    await finishCourse(user, course.id, topics);
    const request = (await requestOf(user, course.id))!;
    await review(request.id, 'APPROVE');
    await service.revoke(request.id, { reason: 'r' }, admin);
    const extra = await newTopic();
    await prisma.courseTopic.create({
      data: { courseId: course.id, topicId: extra.id, sortOrder: 2 },
    });
    await expect(review(request.id, 'APPROVE')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect((await requestOf(user, course.id))?.status).toBe('REVOKED');
  });

  it('admin list filters by status and course, reports pending counts, and the learner sees only their own requests', async () => {
    const { course, topics } = await newCourse(1);
    const [a, b] = [newUser(), newUser()];
    await finishCourse(a, course.id, topics);
    await finishCourse(b, course.id, topics);
    const list = await service.adminList({
      courseId: course.id,
      status: 'PENDING',
    });
    expect(list.items.map((i) => i.user.id).sort()).toEqual([a, b].sort());
    expect(list.pagination.total).toBe(2);
    expect(list.pendingCount).toBeGreaterThanOrEqual(2);
    expect(
      (await service.adminList({ courseId: course.id, status: 'APPROVED' }))
        .items,
    ).toHaveLength(0);

    const mine = await service.listMine(asUser(a));
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0].course.id).toBe(course.id);
    await expect(service.adminDetail('does-not-exist')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('approve re-counts the course topics inside its transaction: a stale eligibility snapshot is refused and rolled back', async () => {
    const { course, topics } = await newCourse(1);
    const user = newUser();
    await finishCourse(user, course.id, topics);
    const request = (await requestOf(user, course.id))!;
    const real = (
      service as never as {
        eligibility: (u: string, c: string) => Promise<{ topicsTotal: number }>;
      }
    ).eligibility.bind(service);
    const spy = jest
      .spyOn(service as never as { eligibility: typeof real }, 'eligibility')
      .mockImplementation(async (u: string, c: string) => {
        const live = await real(u, c);
        // a topic is linked right after the check, before the transaction runs
        const extra = await newTopic('Vừa thêm');
        await prisma.courseTopic.create({
          data: { courseId: c, topicId: extra.id, sortOrder: 9 },
        });
        return live;
      });
    await expect(review(request.id, 'APPROVE')).rejects.toThrow(
      /course changed while reviewing/,
    );
    spy.mockRestore();
    expect(await certCount(user, course.id)).toBe(0);
    expect(await requestOf(user, course.id)).toMatchObject({
      status: 'PENDING',
      reviewerId: null,
      certificateId: null,
    });
    expect(await notifications(user, 'CERTIFICATE_APPROVED')).toBe(0);
    // the next honest attempt sees the new topic and holds the request instead
    await expect(review(request.id, 'APPROVE')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect((await requestOf(user, course.id))?.status).toBe('ON_HOLD');
  });

  it('ids that cannot exist (NUL byte, path) are a 404 before touching the database', async () => {
    await expect(service.adminDetail('a\u0000b')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.review('../x', { decision: 'APPROVE' }, admin),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.resubmit('a\u0000b', asUser(newUser())),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a live certificate without a request (issued by an old instance) does not get a new request', async () => {
    const { course, topics } = await newCourse(1);
    const user = newUser();
    await prisma.certificate.create({
      data: {
        userId: user,
        courseId: course.id,
        certificateCode: `CRT-${randomUUID()}`,
      },
    });
    await finishCourse(user, course.id, topics);
    expect(await requestOf(user, course.id)).toBeNull();
  });

  it('deleting the course removes its requests and certificates', async () => {
    const { course, topics } = await newCourse(1);
    const user = newUser();
    await finishCourse(user, course.id, topics);
    await review((await requestOf(user, course.id))!.id, 'APPROVE');
    await prisma.course.delete({ where: { id: course.id } });
    expect(
      await prisma.certificateRequest.count({ where: { userId: user } }),
    ).toBe(0);
    expect(await prisma.certificate.count({ where: { userId: user } })).toBe(0);
  });
});
