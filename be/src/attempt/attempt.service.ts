import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { AttemptSessionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';
import { AttemptQueryDto } from './dto/attempt-query.dto';
import { SessionHistoryQueryDto } from './dto/session-history-query.dto';
import { StartSessionDto } from './dto/start-session.dto';
import { SaveSessionDto } from './dto/save-session.dto';
import { CourseProgressService } from '../course/course-progress.service';
import { ProfilesService } from '../profiles/profiles.service';
import {
  assertTopicWindow,
  computeSessionExpiresAt,
} from '../topic/topic-schedule';

@Injectable()
export class AttemptService {
  private readonly logger = new Logger(AttemptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly courseProgressService: CourseProgressService,
    private readonly profilesService: ProfilesService,
  ) {}

  async startTopicSession(
    topicId: string,
    dto: StartSessionDto,
    req: ExpressRequest,
  ) {
    const userId = this.extractUserId(req);
    const topic = await this.getTopicScheduleOrThrow(topicId);
    assertTopicWindow(topic, 'start');

    const existing = await this.prisma.attemptSession.findFirst({
      where: {
        userId,
        topicId,
        status: AttemptSessionStatus.IN_PROGRESS,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (existing) {
      const expired = await this.expireSessionIfNeeded(
        existing.id,
        existing.expiresAt,
      );
      if (!expired) {
        return this.mapSession(existing);
      }
    }

    const expiresInMinutes = dto.expiresInMinutes ?? 525_600;
    const now = new Date();

    try {
      const session = await this.prisma.attemptSession.create({
        data: {
          userId,
          topicId,
          status: AttemptSessionStatus.IN_PROGRESS,
          answers: {},
          startedAt: now,
          lastSeenAt: now,
          expiresAt: computeSessionExpiresAt(
            now,
            expiresInMinutes,
            topic.endsAt,
          ),
        },
      });

      return this.mapSession(session);
    } catch (error) {
      // Concurrent start: return the existing in-progress session if another request won.
      const raced = await this.prisma.attemptSession.findFirst({
        where: {
          userId,
          topicId,
          status: AttemptSessionStatus.IN_PROGRESS,
        },
        orderBy: { updatedAt: 'desc' },
      });
      if (raced) {
        const expired = await this.expireSessionIfNeeded(
          raced.id,
          raced.expiresAt,
        );
        if (!expired) {
          return this.mapSession(raced);
        }
      }
      throw error;
    }
  }

  async resumeTopicSession(topicId: string, req: ExpressRequest) {
    const userId = this.extractUserId(req);
    const topic = await this.getTopicScheduleOrThrow(topicId);
    assertTopicWindow(topic, 'start');

    const session = await this.prisma.attemptSession.findFirst({
      where: {
        userId,
        topicId,
        status: {
          in: [AttemptSessionStatus.IN_PROGRESS, AttemptSessionStatus.EXPIRED],
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (!session) {
      return null;
    }

    const expired = await this.expireSessionIfNeeded(
      session.id,
      session.expiresAt,
    );
    if (expired) {
      return this.mapSession({
        ...session,
        status: AttemptSessionStatus.EXPIRED,
      });
    }

    return this.mapSession(session);
  }

  async abandonSession(sessionId: string, req: ExpressRequest) {
    const userId = this.extractUserId(req);

    const session = await this.prisma.attemptSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(
        `Session with id '${sessionId}' was not found`,
      );
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('You do not have access to this session');
    }

    if (
      session.status !== AttemptSessionStatus.IN_PROGRESS &&
      session.status !== AttemptSessionStatus.EXPIRED
    ) {
      throw new BadRequestException(
        'Only in-progress sessions can be abandoned',
      );
    }

    if (session.status === AttemptSessionStatus.EXPIRED) {
      return this.mapSession(session);
    }

    const updated = await this.prisma.attemptSession.update({
      where: { id: sessionId },
      data: {
        status: AttemptSessionStatus.EXPIRED,
        lastSeenAt: new Date(),
      },
    });

    return this.mapSession(updated);
  }

  async saveSessionProgress(
    sessionId: string,
    dto: SaveSessionDto,
    req: ExpressRequest,
  ) {
    const userId = this.extractUserId(req);

    const session = await this.prisma.attemptSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(
        `Session with id '${sessionId}' was not found`,
      );
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('You do not have access to this session');
    }

    if (session.status !== AttemptSessionStatus.IN_PROGRESS) {
      throw new BadRequestException('Session is not in progress');
    }

    if (await this.expireSessionIfNeeded(session.id, session.expiresAt)) {
      throw new BadRequestException('Session has expired');
    }

    const topic = await this.getTopicScheduleOrThrow(session.topicId);
    assertTopicWindow(topic, 'mutate');

    if (dto.currentQuizId) {
      await this.ensureQuizInTopic(dto.currentQuizId, session.topicId);
    }

    if (dto.selectedAnswer && !dto.currentQuizId) {
      throw new BadRequestException(
        'currentQuizId is required when selectedAnswer is provided',
      );
    }

    const previousAnswers = this.parseAnswers(session.answers);
    const nextAnswersFromSelection =
      dto.currentQuizId && dto.selectedAnswer
        ? { [dto.currentQuizId]: dto.selectedAnswer }
        : {};

    const mergedAnswers = {
      ...previousAnswers,
      ...nextAnswersFromSelection,
      ...(dto.answers ?? {}),
    };

    const now = new Date();
    const updated = await this.prisma.attemptSession.update({
      where: { id: sessionId },
      data: {
        currentQuizId: dto.currentQuizId ?? session.currentQuizId,
        answers: mergedAnswers,
        lastSeenAt: now,
      },
    });

    return this.mapSession(updated);
  }

  async submitSession(sessionId: string, req: ExpressRequest) {
    const userId = this.extractUserId(req);

    const session = await this.prisma.attemptSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(
        `Session with id '${sessionId}' was not found`,
      );
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('You do not have access to this session');
    }

    if (
      session.status !== AttemptSessionStatus.IN_PROGRESS &&
      session.status !== AttemptSessionStatus.EXPIRED
    ) {
      throw new BadRequestException('Session is not in progress');
    }

    const topic = await this.getTopicScheduleOrThrow(session.topicId);
    assertTopicWindow(topic, 'submit');

    // Allow submit even if session has expired — answers saved before expiry are still valid
    await this.expireSessionIfNeeded(session.id, session.expiresAt);

    const answers = this.parseAnswers(session.answers);
    const quizzes = await this.prisma.quiz.findMany({
      where: {
        topicId: session.topicId,
      },
      orderBy: {
        createdAt: 'asc',
      },
      include: {
        options: true,
      },
    });

    type AttemptPayload = {
      userId: string;
      quizId: string;
      topicId: string;
      selectedAnswer: string;
      isCorrect: boolean;
      score: number;
      startedAt: Date;
      submittedAt: Date;
      durationMs: number;
      quizCode: string;
      question: string;
      code: string | null;
      options: Array<{ label: string; content: string; isCode: boolean }>;
      correctAnswer: string;
      explanation: string;
    };

    const attemptPayloads: AttemptPayload[] = quizzes.map((quiz) => {
      const selectedRaw = answers[quiz.id];
      const answerExists = Boolean(
        selectedRaw &&
        quiz.options.some((option) => option.label === selectedRaw),
      );
      const selectedAnswer = answerExists ? selectedRaw : '';
      const isCorrect = answerExists && selectedAnswer === quiz.answer;

      return {
        userId,
        quizId: quiz.id,
        topicId: session.topicId,
        selectedAnswer,
        isCorrect,
        score: isCorrect ? 1 : 0,
        startedAt: session.startedAt,
        submittedAt: new Date(),
        durationMs: Math.max(
          0,
          new Date().getTime() - session.startedAt.getTime(),
        ),
        quizCode: quiz.quizCode,
        question: quiz.question,
        code: quiz.code ?? null,
        options: quiz.options.map((o) => ({
          label: o.label,
          content: o.content,
          isCode: o.isCode,
        })),
        correctAnswer: quiz.answer,
        explanation: quiz.explanation ?? '',
      };
    });

    const submittedAt = new Date();
    const correctCount = attemptPayloads.filter(
      (item) => item.isCorrect,
    ).length;
    const totalQuizCount = quizzes.length;
    const score = totalQuizCount > 0 ? correctCount / totalQuizCount : 0;

    const topicCompleted = await this.prisma.$transaction(async (tx) => {
      if (attemptPayloads.length > 0) {
        await tx.quizAttempt.createMany({
          data: attemptPayloads.map((payload) => ({
            userId: payload.userId,
            quizId: payload.quizId,
            topicId: payload.topicId,
            sessionId: session.id,
            selectedAnswer: payload.selectedAnswer,
            isCorrect: payload.isCorrect,
            score: payload.score,
            startedAt: payload.startedAt,
            submittedAt,
            durationMs: Math.max(
              0,
              submittedAt.getTime() - session.startedAt.getTime(),
            ),
          })),
        });
      }

      const completed = await this.updateTopicProgress(
        tx,
        userId,
        session.topicId,
        totalQuizCount,
        correctCount,
        submittedAt,
      );

      await tx.attemptSession.update({
        where: { id: session.id },
        data: {
          status: AttemptSessionStatus.SUBMITTED,
          submittedAt,
          lastSeenAt: submittedAt,
        },
      });

      return completed;
    });

    await this.safeReevaluateCourseProgressByTopic(
      userId,
      session.topicId,
      req,
    );

    if (topicCompleted) {
      await this.profilesService.createTimelineEvent(req, {
        eventType: 'QUIZ_COMPLETE',
        title: `Hoàn thành bộ câu hỏi ${topic.name}`,
        idempotencyKey: `quiz:topic:${topic.id}:${userId}`,
        metadata: {
          topicId: topic.id,
          topicSlug: topic.slug,
          score,
        },
      });
    }

    const attemptByQuizId = new Map(attemptPayloads.map((p) => [p.quizId, p]));

    return {
      sessionId: session.id,
      topicId: session.topicId,
      attemptedQuizCount: totalQuizCount,
      answeredCount: attemptPayloads.filter((item) => item.selectedAnswer)
        .length,
      correctCount,
      score,
      submittedAt,
      quizResults: quizzes.map((quiz) => {
        const attempt = attemptByQuizId.get(quiz.id);
        return {
          quizId: quiz.id,
          quizCode: quiz.quizCode,
          content: {
            text: quiz.question,
            code: quiz.code ?? null,
            has_code: Boolean(quiz.code),
            image: quiz.imageUrl ?? null,
            has_image: Boolean(quiz.imageUrl),
          },
          options: {
            is_code: quiz.options.some((o) => o.isCode),
            data: Object.fromEntries(
              quiz.options.map((o) => [o.label, o.content]),
            ),
          },
          selectedAnswer: attempt?.selectedAnswer || null,
          correctAnswer: quiz.answer,
          isCorrect: attempt?.isCorrect ?? false,
          explanation: quiz.explanation ?? '',
        };
      }),
    };
  }

  async submitAttempt(
    quizId: string,
    dto: SubmitAttemptDto,
    req: ExpressRequest,
  ) {
    const userId = this.extractUserId(req);

    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        options: true,
      },
    });

    if (!quiz) {
      throw new NotFoundException(`Quiz with id '${quizId}' was not found`);
    }

    const topic = await this.getTopicScheduleOrThrow(quiz.topicId);
    assertTopicWindow(topic, 'mutate');

    const answerExists = quiz.options.some(
      (option) => option.label === dto.selectedAnswer,
    );

    if (!answerExists) {
      throw new BadRequestException('selectedAnswer is invalid for this quiz');
    }

    const startedAt = dto.startedAt ? new Date(dto.startedAt) : null;
    const submittedAt = new Date();
    const durationMs =
      startedAt && !Number.isNaN(startedAt.getTime())
        ? Math.max(0, submittedAt.getTime() - startedAt.getTime())
        : null;

    const isCorrect = dto.selectedAnswer === quiz.answer;
    const score = isCorrect ? 1 : 0;

    const result = await this.prisma.$transaction(async (tx) => {
      const attempt = await tx.quizAttempt.create({
        data: {
          userId,
          quizId: quiz.id,
          topicId: quiz.topicId,
          selectedAnswer: dto.selectedAnswer,
          isCorrect,
          score,
          startedAt,
          submittedAt,
          durationMs,
        },
      });

      const topicCompleted = await this.updateTopicProgress(
        tx,
        userId,
        quiz.topicId,
        1,
        score,
        submittedAt,
      );

      return { attempt, topicCompleted };
    });

    await this.safeReevaluateCourseProgressByTopic(userId, quiz.topicId, req);

    if (result.topicCompleted) {
      await this.profilesService.createTimelineEvent(req, {
        eventType: 'QUIZ_COMPLETE',
        title: `Hoàn thành bộ câu hỏi ${topic.name}`,
        idempotencyKey: `quiz:topic:${topic.id}:${userId}`,
        metadata: {
          topicId: topic.id,
          topicSlug: topic.slug,
          score,
        },
      });
    }

    return {
      attemptId: result.attempt.id,
      quiz: {
        id: quiz.id,
        quizCode: quiz.quizCode,
      },
      selectedAnswer: dto.selectedAnswer,
      correctAnswer: quiz.answer,
      isCorrect,
      score,
      explanation: quiz.explanation ?? '',
      submittedAt: result.attempt.submittedAt,
      durationMs: result.attempt.durationMs,
    };
  }

  async getMyAttempts(query: AttemptQueryDto, req: ExpressRequest) {
    const userId = this.extractUserId(req);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    type AttemptListRow = {
      id: string;
      userId: string;
      quizId: string;
      topicId: string;
      sessionId: string | null;
      selectedAnswer: string;
      isCorrect: boolean;
      score: number;
      startedAt: Date | null;
      submittedAt: Date;
      durationMs: number | null;
      createdAt: Date;
      quiz_id: string;
      quiz_code: string;
      quiz_question: string;
      quiz_image_url: string | null;
      topic_id: string;
      topic_name: string;
      topic_slug: string;
      total_count: number;
    };

    const topicFilter = query.topicId
      ? Prisma.sql`AND a."topicId" = ${query.topicId}`
      : Prisma.empty;
    const quizFilter = query.quizId
      ? Prisma.sql`AND a."quizId" = ${query.quizId}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<AttemptListRow[]>`
      SELECT
        a.id,
        a."userId",
        a."quizId",
        a."topicId",
        a."sessionId",
        a."selectedAnswer",
        a."isCorrect",
        a.score,
        a."startedAt",
        a."submittedAt",
        a."durationMs",
        a."createdAt",
        q.id AS quiz_id,
        q."quizCode" AS quiz_code,
        q.question AS quiz_question,
        q."imageUrl" AS quiz_image_url,
        t.id AS topic_id,
        t.name AS topic_name,
        t.slug AS topic_slug,
        COUNT(*) OVER()::int AS total_count
      FROM quiz_attempts a
      INNER JOIN quizzes q ON q.id = a."quizId"
      INNER JOIN topics t ON t.id = a."topicId"
      WHERE a."userId" = ${userId}
      ${topicFilter}
      ${quizFilter}
      ORDER BY a."submittedAt" DESC
      LIMIT ${limit} OFFSET ${skip}
    `;

    const total = rows[0]?.total_count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      items: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        quizId: row.quizId,
        topicId: row.topicId,
        sessionId: row.sessionId,
        selectedAnswer: row.selectedAnswer,
        isCorrect: row.isCorrect,
        score: row.score,
        startedAt: row.startedAt,
        submittedAt: row.submittedAt,
        durationMs: row.durationMs,
        createdAt: row.createdAt,
        quiz: {
          id: row.quiz_id,
          quizCode: row.quiz_code,
          question: row.quiz_question,
          imageUrl: row.quiz_image_url,
        },
        topic: {
          id: row.topic_id,
          name: row.topic_name,
          slug: row.topic_slug,
        },
      })),
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

  async getMyAttemptById(attemptId: string, req: ExpressRequest) {
    const userId = this.extractUserId(req);

    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: {
        quiz: {
          select: {
            id: true,
            quizCode: true,
            question: true,
            imageUrl: true,
            answer: true,
            explanation: true,
            options: true,
          },
        },
        topic: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException(
        `Attempt with id '${attemptId}' was not found`,
      );
    }

    if (attempt.userId !== userId) {
      throw new ForbiddenException('You do not have access to this attempt');
    }

    return attempt;
  }

  async getMySessions(query: SessionHistoryQueryDto, req: ExpressRequest) {
    const userId = this.extractUserId(req);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where = {
      userId,
      status: {
        in: [
          AttemptSessionStatus.IN_PROGRESS,
          AttemptSessionStatus.SUBMITTED,
          AttemptSessionStatus.EXPIRED,
        ],
      },
      ...(query.topicId ? { topicId: query.topicId } : {}),
    };

    const [sessions, total] = await Promise.all([
      this.prisma.attemptSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ updatedAt: 'desc' }],
        include: {
          topic: {
            select: {
              id: true,
              name: true,
              slug: true,
              _count: { select: { quizzes: true } },
            },
          },
          attempts: {
            select: {
              id: true,
              quizId: true,
              isCorrect: true,
              selectedAnswer: true,
              score: true,
              durationMs: true,
            },
          },
        },
      }),
      this.prisma.attemptSession.count({ where }),
    ]);

    // Refresh overdue IN_PROGRESS rows so list status matches resume/save.
    await Promise.all(
      sessions
        .filter(
          (session) => session.status === AttemptSessionStatus.IN_PROGRESS,
        )
        .map(async (session) => {
          if (await this.expireSessionIfNeeded(session.id, session.expiresAt)) {
            session.status = AttemptSessionStatus.EXPIRED;
          }
        }),
    );

    const legacySessionIds = sessions
      .filter(
        (session) =>
          session.status === AttemptSessionStatus.SUBMITTED &&
          session.attempts.length === 0,
      )
      .map((session) => session.id);

    const legacySummaries = await this.buildLegacySessionSummaries(
      sessions.filter((session) => legacySessionIds.includes(session.id)),
    );

    const statusRank: Record<AttemptSessionStatus, number> = {
      [AttemptSessionStatus.IN_PROGRESS]: 0,
      [AttemptSessionStatus.SUBMITTED]: 1,
      [AttemptSessionStatus.EXPIRED]: 2,
    };

    const items = sessions
      .map((session) => {
        const quizTotal = session.topic._count.quizzes;
        const topic = {
          id: session.topic.id,
          name: session.topic.name,
          slug: session.topic.slug,
        };

        if (session.status !== AttemptSessionStatus.SUBMITTED) {
          const draftAnswers = this.parseAnswers(session.answers);
          return {
            id: session.id,
            topicId: session.topicId,
            topic,
            status: session.status,
            startedAt: session.startedAt,
            submittedAt: session.submittedAt,
            lastSeenAt: session.lastSeenAt,
            expiresAt: session.expiresAt,
            durationMs: null,
            answeredCount: Object.keys(draftAnswers).length,
            correctCount: null,
            score: null,
            quizTotal,
          };
        }

        if (session.attempts.length > 0) {
          const correctCount = session.attempts.filter(
            (a) => a.isCorrect,
          ).length;
          const answeredCount = session.attempts.filter(
            (a) => a.selectedAnswer,
          ).length;
          return {
            id: session.id,
            topicId: session.topicId,
            topic,
            status: session.status,
            startedAt: session.startedAt,
            submittedAt: session.submittedAt,
            lastSeenAt: session.lastSeenAt,
            expiresAt: session.expiresAt,
            durationMs:
              session.submittedAt != null
                ? Math.max(
                    0,
                    session.submittedAt.getTime() - session.startedAt.getTime(),
                  )
                : (session.attempts[0]?.durationMs ?? null),
            answeredCount,
            correctCount,
            // Missing attempts on older sessions count as unanswered/wrong.
            score: quizTotal > 0 ? correctCount / quizTotal : 0,
            quizTotal,
          };
        }

        const legacy = legacySummaries.get(session.id);
        const legacyCorrect = legacy?.correctCount ?? 0;
        return {
          id: session.id,
          topicId: session.topicId,
          topic,
          status: session.status,
          startedAt: session.startedAt,
          submittedAt: session.submittedAt,
          lastSeenAt: session.lastSeenAt,
          expiresAt: session.expiresAt,
          durationMs:
            session.submittedAt != null
              ? Math.max(
                  0,
                  session.submittedAt.getTime() - session.startedAt.getTime(),
                )
              : null,
          answeredCount: legacy?.answeredCount ?? 0,
          correctCount: legacyCorrect,
          score: quizTotal > 0 ? legacyCorrect / quizTotal : 0,
          quizTotal,
        };
      })
      .sort((a, b) => {
        const rank = statusRank[a.status] - statusRank[b.status];
        if (rank !== 0) return rank;
        const aTime = (a.submittedAt ?? a.startedAt).getTime();
        const bTime = (b.submittedAt ?? b.startedAt).getTime();
        return bTime - aTime;
      });

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      items,
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

  async getMySessionById(sessionId: string, req: ExpressRequest) {
    const userId = this.extractUserId(req);

    const session = await this.prisma.attemptSession.findUnique({
      where: { id: sessionId },
      include: {
        topic: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        attempts: {
          select: {
            id: true,
            quizId: true,
            selectedAnswer: true,
            isCorrect: true,
            score: true,
            durationMs: true,
            submittedAt: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(
        `Session with id '${sessionId}' was not found`,
      );
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('You do not have access to this session');
    }

    if (session.status !== AttemptSessionStatus.SUBMITTED) {
      throw new BadRequestException('Session has not been submitted yet');
    }

    const quizzes = await this.prisma.quiz.findMany({
      where: { topicId: session.topicId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        quizCode: true,
        question: true,
        code: true,
        imageUrl: true,
        answer: true,
        explanation: true,
        options: {
          select: {
            label: true,
            content: true,
            isCode: true,
          },
        },
      },
    });

    const attemptByQuizId = new Map(session.attempts.map((a) => [a.quizId, a]));
    const answers = this.parseAnswers(session.answers);
    const useLegacyAnswers = session.attempts.length === 0;

    const quizResults = quizzes.map((quiz) => {
      const linkedAttempt = attemptByQuizId.get(quiz.id);
      const selectedRaw = useLegacyAnswers
        ? (answers[quiz.id] ?? null)
        : linkedAttempt?.selectedAnswer || null;
      const selectedAnswer = selectedRaw || null;

      let isCorrect = false;
      if (linkedAttempt) {
        isCorrect = linkedAttempt.isCorrect;
      } else if (useLegacyAnswers && selectedAnswer) {
        const answerExists = quiz.options.some(
          (option) => option.label === selectedAnswer,
        );
        isCorrect = answerExists ? selectedAnswer === quiz.answer : false;
      }

      return {
        quizId: quiz.id,
        quizCode: quiz.quizCode,
        attemptId: linkedAttempt?.id ?? null,
        content: {
          text: quiz.question,
          code: quiz.code ?? null,
          has_code: Boolean(quiz.code),
          image: quiz.imageUrl ?? null,
          has_image: Boolean(quiz.imageUrl),
        },
        options: {
          is_code: quiz.options.some((o) => o.isCode),
          data: Object.fromEntries(
            quiz.options.map((o) => [o.label, o.content]),
          ),
        },
        selectedAnswer,
        correctAnswer: quiz.answer,
        isCorrect,
        explanation: quiz.explanation ?? '',
      };
    });

    const correctCount = quizResults.filter((item) => item.isCorrect).length;
    const answeredCount = quizResults.filter(
      (item) => item.selectedAnswer != null,
    ).length;
    const totalQuizCount = quizzes.length;

    return {
      id: session.id,
      topicId: session.topicId,
      topic: session.topic,
      status: session.status,
      startedAt: session.startedAt,
      submittedAt: session.submittedAt,
      durationMs:
        session.submittedAt != null
          ? Math.max(
              0,
              session.submittedAt.getTime() - session.startedAt.getTime(),
            )
          : null,
      answeredCount,
      correctCount,
      score: totalQuizCount > 0 ? correctCount / totalQuizCount : 0,
      quizTotal: totalQuizCount,
      quizResults,
    };
  }

  async getMyProgress(req: ExpressRequest) {
    const userId = this.extractUserId(req);

    type ProgressRow = {
      total_attempts: number;
      correct_attempts: number;
      by_topic: unknown;
    };

    const rows = await this.prisma.$queryRaw<ProgressRow[]>`
      SELECT
        (SELECT COUNT(*)::int FROM quiz_attempts a WHERE a."userId" = ${userId}) AS total_attempts,
        (SELECT COALESCE(SUM(a.score), 0)::int FROM quiz_attempts a WHERE a."userId" = ${userId}) AS correct_attempts,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', tp.id,
                'userId', tp."userId",
                'topicId', tp."topicId",
                'totalAttempts', tp."totalAttempts",
                'correctAttempts', tp."correctAttempts",
                'accuracy', tp.accuracy,
                'isCompleted', tp."isCompleted",
                'completedAt', tp."completedAt",
                'completionThreshold', tp."completionThreshold",
                'lastAttemptAt', tp."lastAttemptAt",
                'createdAt', tp."createdAt",
                'updatedAt', tp."updatedAt",
                'topic', json_build_object(
                  'id', t.id,
                  'name', t.name,
                  'slug', t.slug
                )
              )
              ORDER BY tp."updatedAt" DESC
            )
            FROM topic_progresses tp
            INNER JOIN topics t ON t.id = tp."topicId"
            WHERE tp."userId" = ${userId}
          ),
          '[]'::json
        ) AS by_topic
    `;

    const row = rows[0];
    const totalAttempts = row?.total_attempts ?? 0;
    const correctAttempts = row?.correct_attempts ?? 0;

    return {
      totalAttempts,
      correctAttempts,
      accuracy: totalAttempts > 0 ? correctAttempts / totalAttempts : 0,
      byTopic: row?.by_topic ?? [],
    };
  }

  async getMyTopicProgress(topicId: string, req: ExpressRequest) {
    const userId = this.extractUserId(req);

    await this.courseProgressService.syncUserTopicCoverage(userId, topicId);

    const [topic, progress, quizzesInTopic, attemptsInTopic, recentAttempts] =
      await Promise.all([
        this.prisma.topic.findUnique({
          where: { id: topicId },
          select: {
            id: true,
            name: true,
            slug: true,
          },
        }),
        this.prisma.topicProgress.findUnique({
          where: {
            userId_topicId: {
              userId,
              topicId,
            },
          },
        }),
        this.prisma.quiz.findMany({
          where: {
            topicId,
          },
          select: {
            id: true,
            quizCode: true,
            question: true,
            imageUrl: true,
            answer: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        }),
        // Latest attempt per quiz only — avoid loading unbounded attempt history.
        this.prisma.quizAttempt.findMany({
          where: {
            userId,
            topicId,
          },
          distinct: ['quizId'],
          select: {
            id: true,
            quizId: true,
            selectedAnswer: true,
            isCorrect: true,
            submittedAt: true,
          },
          orderBy: [{ quizId: 'asc' }, { submittedAt: 'desc' }],
        }),
        this.prisma.quizAttempt.findMany({
          where: {
            userId,
            topicId,
          },
          orderBy: {
            submittedAt: 'desc',
          },
          take: 10,
          include: {
            quiz: {
              select: {
                id: true,
                quizCode: true,
                question: true,
                imageUrl: true,
              },
            },
          },
        }),
      ]);

    if (!topic) {
      throw new NotFoundException(`Topic with id '${topicId}' was not found`);
    }

    const latestAttemptByQuiz = new Map(
      attemptsInTopic.map((attempt) => [attempt.quizId, attempt]),
    );

    const quizStats = quizzesInTopic.map((quiz) => {
      const attempt = latestAttemptByQuiz.get(quiz.id);

      return {
        quizId: quiz.id,
        quizCode: quiz.quizCode,
        question: quiz.question,
        image: quiz.imageUrl ?? null,
        answered: Boolean(attempt),
        selectedAnswer: attempt?.selectedAnswer ?? null,
        correctAnswer: attempt ? quiz.answer : null,
        isCorrect: attempt?.isCorrect ?? null,
        lastSubmittedAt: attempt?.submittedAt ?? null,
      };
    });

    const totalQuizCount = quizzesInTopic.length;
    const attemptedQuizCount = quizStats.filter((quiz) => quiz.answered).length;
    const correctQuizCount = quizStats.filter(
      (quiz) => quiz.isCorrect === true,
    ).length;
    const wrongQuizCount = quizStats.filter(
      (quiz) => quiz.isCorrect === false,
    ).length;
    const unansweredQuizCount = totalQuizCount - attemptedQuizCount;

    return {
      topic,
      summary: {
        totalQuizCount,
        attemptedQuizCount,
        unansweredQuizCount,
        correctQuizCount,
        wrongQuizCount,
        completionRate:
          totalQuizCount > 0 ? attemptedQuizCount / totalQuizCount : 0,
        accuracyByQuiz:
          attemptedQuizCount > 0 ? correctQuizCount / attemptedQuizCount : 0,
      },
      progress: progress ?? {
        userId,
        topicId,
        totalAttempts: 0,
        correctAttempts: 0,
        accuracy: 0,
        lastAttemptAt: null,
      },
      quizStats,
      recentAttempts,
    };
  }

  private extractUserId(req: ExpressRequest): string {
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

  private async getTopicScheduleOrThrow(topicId: string): Promise<{
    id: string;
    name: string;
    slug: string;
    startsAt: Date | null;
    endsAt: Date | null;
  }> {
    const topic = await this.prisma.topic.findUnique({
      where: { id: topicId },
      select: {
        id: true,
        name: true,
        slug: true,
        startsAt: true,
        endsAt: true,
      },
    });

    if (!topic) {
      throw new NotFoundException(`Topic with id '${topicId}' was not found`);
    }

    return topic;
  }

  private async ensureTopicExists(topicId: string): Promise<void> {
    await this.getTopicScheduleOrThrow(topicId);
  }

  private async ensureQuizInTopic(
    quizId: string,
    topicId: string,
  ): Promise<void> {
    const quiz = await this.prisma.quiz.findFirst({
      where: {
        id: quizId,
        topicId,
      },
      select: { id: true },
    });

    if (!quiz) {
      throw new BadRequestException(
        `Quiz '${quizId}' does not belong to topic '${topicId}'`,
      );
    }
  }

  private async expireSessionIfNeeded(
    sessionId: string,
    expiresAt: Date,
  ): Promise<boolean> {
    if (expiresAt.getTime() > Date.now()) {
      return false;
    }

    await this.prisma.attemptSession.update({
      where: { id: sessionId },
      data: {
        status: AttemptSessionStatus.EXPIRED,
        lastSeenAt: new Date(),
      },
    });

    return true;
  }

  private parseAnswers(answers: Prisma.JsonValue): Record<string, string> {
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return {};
    }

    const entries = Object.entries(answers as Record<string, unknown>).filter(
      ([, value]) => typeof value === 'string',
    );

    return Object.fromEntries(entries) as Record<string, string>;
  }

  private async buildLegacySessionSummaries(
    sessions: Array<{
      id: string;
      topicId: string;
      answers: Prisma.JsonValue;
    }>,
  ): Promise<
    Map<string, { answeredCount: number; correctCount: number; score: number }>
  > {
    const result = new Map<
      string,
      { answeredCount: number; correctCount: number; score: number }
    >();

    if (sessions.length === 0) {
      return result;
    }

    const topicIds = [...new Set(sessions.map((session) => session.topicId))];
    const quizzes = await this.prisma.quiz.findMany({
      where: { topicId: { in: topicIds } },
      select: {
        id: true,
        topicId: true,
        answer: true,
        options: {
          select: { label: true },
        },
      },
    });

    const quizzesByTopic = new Map<string, typeof quizzes>();
    for (const quiz of quizzes) {
      const list = quizzesByTopic.get(quiz.topicId) ?? [];
      list.push(quiz);
      quizzesByTopic.set(quiz.topicId, list);
    }

    for (const session of sessions) {
      const answers = this.parseAnswers(session.answers);
      const topicQuizzes = quizzesByTopic.get(session.topicId) ?? [];
      let answeredCount = 0;
      let correctCount = 0;

      for (const quiz of topicQuizzes) {
        const selectedAnswer = answers[quiz.id];
        if (!selectedAnswer) {
          continue;
        }

        const answerExists = quiz.options.some(
          (option) => option.label === selectedAnswer,
        );
        if (!answerExists) {
          continue;
        }

        answeredCount += 1;
        if (selectedAnswer === quiz.answer) {
          correctCount += 1;
        }
      }

      result.set(session.id, {
        answeredCount,
        correctCount,
        score: answeredCount > 0 ? correctCount / answeredCount : 0,
      });
    }

    return result;
  }

  private mapSession(session: {
    id: string;
    topicId: string;
    currentQuizId: string | null;
    status: AttemptSessionStatus;
    answers: Prisma.JsonValue;
    startedAt: Date;
    lastSeenAt: Date;
    expiresAt: Date;
    submittedAt: Date | null;
  }) {
    return {
      id: session.id,
      topicId: session.topicId,
      currentQuizId: session.currentQuizId,
      status: session.status,
      answers: this.parseAnswers(session.answers),
      startedAt: session.startedAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
      submittedAt: session.submittedAt,
    };
  }

  private async updateTopicProgress(
    tx: Prisma.TransactionClient,
    userId: string,
    topicId: string,
    attemptsToAdd: number,
    correctToAdd: number,
    lastAttemptAt: Date,
  ): Promise<boolean> {
    const existingProgress = await tx.topicProgress.findUnique({
      where: {
        userId_topicId: {
          userId,
          topicId,
        },
      },
    });

    const totalAttempts =
      (existingProgress?.totalAttempts ?? 0) + attemptsToAdd;
    const correctAttempts =
      (existingProgress?.correctAttempts ?? 0) + correctToAdd;
    const accuracy = totalAttempts > 0 ? correctAttempts / totalAttempts : 0;

    const coverageComplete = await this.isTopicCoverageComplete(
      tx,
      userId,
      topicId,
    );
    const isCompleted =
      Boolean(existingProgress?.isCompleted) || coverageComplete;

    if (!existingProgress) {
      await tx.topicProgress.create({
        data: {
          userId,
          topicId,
          totalAttempts,
          correctAttempts,
          accuracy,
          isCompleted,
          completedAt: isCompleted ? lastAttemptAt : null,
          completionThreshold: 0.8,
          lastAttemptAt,
        },
      });
      return isCompleted;
    }

    await tx.topicProgress.update({
      where: {
        userId_topicId: {
          userId,
          topicId,
        },
      },
      data: {
        totalAttempts,
        correctAttempts,
        accuracy,
        isCompleted,
        completedAt:
          existingProgress.isCompleted || !coverageComplete
            ? existingProgress.completedAt
            : lastAttemptAt,
        completionThreshold: 0.8,
        lastAttemptAt,
      },
    });

    return isCompleted;
  }

  /**
   * Topic is complete when unique quizzes with a latest correct attempt
   * cover at least 80% of quizzes in the topic.
   */
  private async isTopicCoverageComplete(
    tx: Prisma.TransactionClient,
    userId: string,
    topicId: string,
  ): Promise<boolean> {
    const totalQuizzes = await tx.quiz.count({ where: { topicId } });
    if (totalQuizzes === 0) {
      return false;
    }

    const correctUnique = await tx.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT DISTINCT ON (qa."quizId") qa."isCorrect"
        FROM quiz_attempts qa
        INNER JOIN quizzes q ON q.id = qa."quizId"
        WHERE qa."userId" = ${userId}
          AND q."topicId" = ${topicId}
        ORDER BY qa."quizId", qa."submittedAt" DESC
      ) latest
      WHERE latest."isCorrect" = true
    `;

    const correctCount = Number(correctUnique[0]?.count ?? 0);
    return correctCount / totalQuizzes >= 0.8;
  }

  private async safeReevaluateCourseProgressByTopic(
    userId: string,
    topicId: string,
    req: ExpressRequest,
  ): Promise<void> {
    try {
      await this.courseProgressService.evaluateCoursesByTopic(
        userId,
        topicId,
        req,
      );
    } catch {
      this.logger.warn(
        `[safeReevaluateCourseProgressByTopic] failed userId=${userId} topicId=${topicId}`,
      );
    }
  }
}
