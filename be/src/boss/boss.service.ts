import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BossSessionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BOSS_REWARD_MIN_PERSONAL_SCORE } from '../xp/xp.constants';
import { XpService, cappedBossContribution } from '../xp/xp.service';
import { BossCoinService } from './coin/boss-coin.service';
import {
  BossMilestoneConfigItem,
  BossMilestoneStatusDto,
  BossOverviewDto,
  BossQuestionDto,
  BossQuestionOptionDto,
} from './dto/boss.dto';

export const BOSS_DEFAULT_MAX_HP = 1500;

export const DEFAULT_MILESTONES: BossMilestoneConfigItem[] = [
  { at: 300, coin: 5, name: 'Rương Đồng' },
  { at: 600, coin: 5, name: 'Rương Bạc' },
  { at: 900, coin: 5, name: 'Rương Vàng' },
  { at: 1200, coin: 5, name: 'Rương Bạch Kim' },
  { at: 1500, coin: 5, name: 'Rương Kim Cương' },
];

export const BOSS_SESSION_DURATION_SECONDS = 300; // 5 minutes
export const BOSS_QUESTION_TIME_LIMIT_SECONDS = 10; // 10 seconds per question
export const BOSS_QUESTION_GRACE_PERIOD_MS = 1500; // 1.5s network grace period
export const BOSS_IDLE_TIMEOUT_LIMIT = 5; // consecutive unanswered questions that end a session

@Injectable()
export class BossService {
  private readonly logger = new Logger(BossService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly coinService: BossCoinService,
    private readonly xpService?: XpService,
  ) {}

  /**
   * Computes the current ISO week key and date range (Monday 00:00:00 to Sunday 23:59:59 in UTC+7).
   */
  getWeekBoundaries(targetDate: Date = new Date()): {
    weekKey: string;
    startsAt: Date;
    endsAt: Date;
    year: number;
    weekNumber: number;
  } {
    // Offset for UTC+7 (Vietnam time: 7 * 60 minutes)
    const offsetMs = 7 * 60 * 60 * 1000;
    const vnDate = new Date(targetDate.getTime() + offsetMs);

    // Compute day of week (0 is Sunday, 1 is Monday ... 6 is Saturday)
    const day = vnDate.getUTCDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const monday = new Date(vnDate);
    monday.setUTCDate(vnDate.getUTCDate() + diffToMonday);
    monday.setUTCHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    sunday.setUTCHours(23, 59, 59, 999);

    // Revert offset to get exact UTC timestamps for DB storage
    const startsAt = new Date(monday.getTime() - offsetMs);
    const endsAt = new Date(sunday.getTime() - offsetMs);

    // ISO week number calculation
    const temp = new Date(monday.getTime());
    temp.setUTCDate(temp.getUTCDate() + 3); // Thursday of that week
    const firstThursday = new Date(Date.UTC(temp.getUTCFullYear(), 0, 4));
    const firstDay = firstThursday.getUTCDay() || 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 4);

    const weekNumber = Math.ceil(
      ((temp.getTime() - firstThursday.getTime()) / 86400000 + 1) / 7,
    );
    const year = temp.getUTCFullYear();
    const weekKey = `${year}-W${weekNumber.toString().padStart(2, '0')}`;

    return { weekKey, startsAt, endsAt, year, weekNumber };
  }

  /** Current week's season if it already exists; never creates one (used by read-only endpoints). */
  async findCurrentSeason(): Promise<{
    id: string;
    bossMaxHp: number;
    milestoneConfig: BossMilestoneConfigItem[];
  } | null> {
    const { weekKey } = this.getWeekBoundaries();
    const season = await this.prisma.bossWeeklySeason.findUnique({
      where: { weekKey },
    });
    if (!season) return null;
    return {
      id: season.id,
      bossMaxHp: season.bossMaxHp,
      milestoneConfig: Array.isArray(season.milestoneConfig)
        ? (season.milestoneConfig as unknown as BossMilestoneConfigItem[])
        : DEFAULT_MILESTONES,
    };
  }

  /**
   * Retrieves or lazily creates the current active weekly boss season.
   */
  async getOrCreateCurrentSeason(): Promise<{
    id: string;
    weekKey: string;
    name: string;
    bossName: string;
    bossImageUrl: string | null;
    bossMaxHp: number;
    milestoneConfig: BossMilestoneConfigItem[];
    startsAt: Date;
    endsAt: Date;
    isActive: boolean;
    isSettled: boolean;
  }> {
    const { weekKey, startsAt, endsAt, weekNumber } = this.getWeekBoundaries();

    let season = await this.prisma.bossWeeklySeason.findUnique({
      where: { weekKey },
    });

    if (!season) {
      try {
        season = await this.prisma.bossWeeklySeason.create({
          data: {
            weekKey,
            name: `Tuần ${weekNumber}: Đại Ma Vương Hư Không`,
            bossName: 'Ma Vương Hư Không',
            bossMaxHp: BOSS_DEFAULT_MAX_HP,
            milestoneConfig:
              DEFAULT_MILESTONES as unknown as Prisma.InputJsonValue,
            startsAt,
            endsAt,
            isActive: true,
            isSettled: false,
          },
        });
        this.logger.log(`[BossService] Created new weekly season ${weekKey}`);
      } catch (err: unknown) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          season = await this.prisma.bossWeeklySeason.findUnique({
            where: { weekKey },
          });
        } else {
          throw err;
        }
      }
    }

    if (!season) {
      throw new NotFoundException('Không thể khởi tạo mùa giải Boss tuần này');
    }

    const milestones = Array.isArray(season.milestoneConfig)
      ? (season.milestoneConfig as unknown as BossMilestoneConfigItem[])
      : DEFAULT_MILESTONES;

    return {
      ...season,
      milestoneConfig: milestones,
    };
  }

  /**
   * Community boss HP and milestone state (read-only; shared by the overview and the live feed).
   * Each user's personal best counts up to BOSS_COMMUNITY_CONTRIB_CAP.
   */
  async getCommunityStatus(season: {
    id: string;
    bossMaxHp: number;
    milestoneConfig: BossMilestoneConfigItem[];
  }): Promise<{
    community: BossOverviewDto['community'];
    milestones: BossMilestoneStatusDto[];
  }> {
    const communityRows = await this.prisma.bossUserWeeklyStat.findMany({
      where: {
        seasonId: season.id,
        hasParticipated: true,
      },
      select: { highestScore: true },
    });

    const communityScore = communityRows.reduce(
      (sum, row) => sum + cappedBossContribution(row.highestScore),
      0,
    );
    const totalParticipants = communityRows.length;
    const bossCurrentHp = Math.max(0, season.bossMaxHp - communityScore);
    const bossHpPercent = Math.max(
      0,
      Math.min(100, Math.round((bossCurrentHp / season.bossMaxHp) * 100)),
    );

    const milestones: BossMilestoneStatusDto[] = season.milestoneConfig.map(
      (m, idx) => ({
        index: idx + 1,
        at: m.at,
        coin: m.coin,
        name: m.name,
        unlocked: communityScore >= m.at,
      }),
    );

    return {
      community: {
        communityScore,
        bossCurrentHp,
        bossHpPercent,
        totalParticipants,
      },
      milestones,
    };
  }

  /**
   * Retrieves community overview, milestone progress, personal stats and active session.
   */
  async getOverview(userId: string): Promise<BossOverviewDto> {
    const season = await this.getOrCreateCurrentSeason();
    const now = new Date();

    // 1. Check active session first and finalize if expired so stats reflect latest score
    let activeSession = null;
    let idleEnded = false;
    const currentSession = await this.prisma.bossBattleSession.findFirst({
      where: {
        userId,
        status: BossSessionStatus.IN_PROGRESS,
      },
      orderBy: { startedAt: 'desc' },
    });

    if (currentSession) {
      if (now.getTime() >= currentSession.expiresAt.getTime()) {
        // Session expired (5 minutes up): complete it lazily before aggregating stats
        await this.endSession(currentSession.id, 'TIME_UP_5M');
      } else if (await this.endIfIdle(currentSession, now)) {
        // 5 unanswered questions in a row (including time spent away from the page)
        idleEnded = true;
      } else if (currentSession.seasonId === season.id) {
        // Active session valid for current season
        let currentQuestion: BossQuestionDto | null = null;
        if (currentSession.currentQuestionId) {
          const quiz = await this.prisma.quiz.findUnique({
            where: { id: currentSession.currentQuestionId },
            include: { options: true },
          });

          if (quiz && currentSession.currentQuestionExpiresAt) {
            currentQuestion = this.mapQuizToQuestionDto(
              quiz,
              currentSession.currentQuestionNumber,
              currentSession.currentQuestionExpiresAt,
              currentSession.expiresAt,
            );
          }
        }

        const remainingMs = Math.max(
          0,
          currentSession.expiresAt.getTime() - now.getTime(),
        );

        activeSession = {
          id: currentSession.id,
          score: currentSession.score,
          combo: currentSession.combo,
          maxCombo: currentSession.maxCombo,
          currentQuestionNumber: currentSession.currentQuestionNumber,
          sessionExpiresAt: currentSession.expiresAt.toISOString(),
          sessionRemainingSeconds: Math.ceil(remainingMs / 1000),
          currentQuestion,
        };
      }
    }

    // 2. Community Score = SUM of personal bests (each capped per user) of all valid participants
    const { community, milestones } = await this.getCommunityStatus(season);

    // 4. User's weekly personal stats
    const userStat = await this.prisma.bossUserWeeklyStat.findUnique({
      where: {
        userId_seasonId: {
          userId,
          seasonId: season.id,
        },
      },
    });

    const personal = {
      personalBest: userStat?.highestScore || 0,
      totalAttempts: userStat?.totalAttempts || 0,
      bestCombo: userStat?.bestCombo || 0,
      hasParticipated: userStat?.hasParticipated || false,
    };

    return {
      season: {
        id: season.id,
        weekKey: season.weekKey,
        name: season.name,
        bossName: season.bossName,
        bossImageUrl: season.bossImageUrl,
        bossMaxHp: season.bossMaxHp,
        startsAt: season.startsAt.toISOString(),
        endsAt: season.endsAt.toISOString(),
        isActive: season.isActive,
        isSettled: season.isSettled,
      },
      community,
      milestones,
      personal,
      activeSession,
      ...(idleEnded ? { idleEnded: true } : {}),
    };
  }

  /**
   * Starts a new 5-minute boss battle session, or resumes an active valid session.
   */
  async startSession(userId: string) {
    const season = await this.getOrCreateCurrentSeason();
    const now = new Date();

    // 1. Check if user already has an active session
    const existing = await this.prisma.bossBattleSession.findFirst({
      where: {
        userId,
        status: BossSessionStatus.IN_PROGRESS,
      },
      orderBy: { startedAt: 'desc' },
    });

    if (existing) {
      if (
        now.getTime() < existing.expiresAt.getTime() &&
        (!existing.seasonId || existing.seasonId === season.id) &&
        !(await this.endIfIdle(existing, now))
      ) {
        // Resume existing active session
        let currentQuestion: BossQuestionDto | null = null;
        if (existing.currentQuestionId && existing.currentQuestionExpiresAt) {
          const quiz = await this.prisma.quiz.findUnique({
            where: { id: existing.currentQuestionId },
            include: { options: true },
          });
          if (quiz) {
            currentQuestion = this.mapQuizToQuestionDto(
              quiz,
              existing.currentQuestionNumber,
              existing.currentQuestionExpiresAt,
              existing.expiresAt,
            );
          }
        }

        const remainingSec = Math.ceil(
          Math.max(0, existing.expiresAt.getTime() - now.getTime()) / 1000,
        );

        return {
          sessionId: existing.id,
          score: existing.score,
          combo: existing.combo,
          maxCombo: existing.maxCombo,
          currentQuestionNumber: existing.currentQuestionNumber,
          sessionExpiresAt: existing.expiresAt.toISOString(),
          sessionRemainingSeconds: remainingSec,
          question: currentQuestion,
        };
      } else {
        // Expired or previous season: finalize old session
        await this.endSession(existing.id, 'TIME_UP_5M');
      }
    }

    // 2. Pick first random question
    const firstQuiz = await this.getRandomQuiz([]);
    if (!firstQuiz) {
      throw new BadRequestException('Kho câu hỏi hiện chưa sẵn sàng');
    }

    const rawExpiresAtMs = now.getTime() + BOSS_SESSION_DURATION_SECONDS * 1000;
    const sessionExpiresAt =
      season.endsAt && season.endsAt.getTime() > now.getTime()
        ? new Date(Math.min(rawExpiresAtMs, season.endsAt.getTime()))
        : new Date(rawExpiresAtMs);
    const questionExpiresAt = new Date(
      Math.min(
        now.getTime() + BOSS_QUESTION_TIME_LIMIT_SECONDS * 1000,
        sessionExpiresAt.getTime(),
      ),
    );
    const sessionRemainingSeconds = Math.max(
      0,
      Math.ceil((sessionExpiresAt.getTime() - now.getTime()) / 1000),
    );

    const newSession = await this.prisma.bossBattleSession.create({
      data: {
        userId,
        seasonId: season.id,
        status: BossSessionStatus.IN_PROGRESS,
        score: 0,
        combo: 0,
        maxCombo: 0,
        totalAnswered: 0,
        correctCount: 0,
        wrongCount: 0,
        currentQuestionId: firstQuiz.id,
        currentQuestionNumber: 1,
        currentQuestionStartedAt: now,
        currentQuestionExpiresAt: questionExpiresAt,
        usedQuestionIds: [firstQuiz.id],
        startedAt: now,
        expiresAt: sessionExpiresAt,
      },
    });

    // Touch user weekly stat
    await this.prisma.bossUserWeeklyStat.upsert({
      where: {
        userId_seasonId: {
          userId,
          seasonId: season.id,
        },
      },
      create: {
        userId,
        seasonId: season.id,
        highestScore: 0,
        totalAttempts: 1,
        bestCombo: 0,
        hasParticipated: true,
        lastPlayedAt: now,
      },
      update: {
        totalAttempts: { increment: 1 },
        hasParticipated: true,
        lastPlayedAt: now,
      },
    });

    const questionDto = this.mapQuizToQuestionDto(
      firstQuiz,
      1,
      questionExpiresAt,
      sessionExpiresAt,
    );

    return {
      sessionId: newSession.id,
      score: 0,
      combo: 0,
      maxCombo: 0,
      currentQuestionNumber: 1,
      sessionExpiresAt: sessionExpiresAt.toISOString(),
      sessionRemainingSeconds,
      question: questionDto,
    };
  }

  /**
   * Submits an answer for the current question in the active session.
   * Handles:
   * - 5-minute session expiration
   * - 10-second question timer validation
   * - Correct answer: +1 point, combo++, next question immediately
   * - Wrong answer: combo reset, shows feedback and retains 10s timer
   * - Timeout: combo reset, advances to next question
   */
  async submitAnswer(userId: string, optionLabel: string) {
    const now = new Date();

    const session = await this.prisma.bossBattleSession.findFirst({
      where: {
        userId,
        status: BossSessionStatus.IN_PROGRESS,
      },
      orderBy: { startedAt: 'desc' },
    });

    if (!session) {
      throw new BadRequestException('Không có lượt chơi nào đang diễn ra');
    }

    // 1. Check if 5-minute session has expired
    if (now.getTime() >= session.expiresAt.getTime()) {
      return await this.finalizeAndReturnSessionSummary(
        session.id,
        'TIME_UP_5M',
      );
    }

    if (!session.currentQuestionId || !session.currentQuestionExpiresAt) {
      throw new BadRequestException(
        'Câu hỏi này đã được trả lời hoặc không hợp lệ',
      );
    }

    const quiz = await this.prisma.quiz.findUnique({
      where: { id: session.currentQuestionId },
      include: { options: true },
    });

    if (!quiz) {
      throw new NotFoundException('Câu hỏi không tồn tại');
    }

    const correctLabel = (quiz.answer || 'A').trim().toUpperCase();
    const correctOption = quiz.options.find(
      (o) => o.label.trim().toUpperCase() === correctLabel,
    );

    // 2. Validate Question Timer
    const normalizedOptionLabel = optionLabel.trim().toUpperCase();
    const questionExpiresAtMs = session.currentQuestionExpiresAt.getTime();
    if (
      normalizedOptionLabel === 'TIMEOUT' &&
      now.getTime() + BOSS_QUESTION_GRACE_PERIOD_MS < questionExpiresAtMs
    ) {
      throw new BadRequestException('Vui lòng đợi hết thời gian 10 giây');
    }

    const isTimeout =
      normalizedOptionLabel === 'TIMEOUT' ||
      now.getTime() > questionExpiresAtMs + BOSS_QUESTION_GRACE_PERIOD_MS;

    const isCorrect = !isTimeout && normalizedOptionLabel === correctLabel;

    const usedIds: string[] = Array.isArray(session.usedQuestionIds)
      ? (session.usedQuestionIds as string[])
      : [];

    const sessionRemainingSec = Math.max(
      0,
      Math.ceil((session.expiresAt.getTime() - now.getTime()) / 1000),
    );

    const questionClaimWhere = {
      id: session.id,
      status: BossSessionStatus.IN_PROGRESS,
      currentQuestionId: quiz.id,
      currentQuestionNumber: session.currentQuestionNumber,
    };

    // 3. Handle Correct Answer: +1 point, combo++, advance immediately
    if (isCorrect) {
      const newScore = session.score + 1;
      const newCombo = session.combo + 1;
      const newMaxCombo = Math.max(session.maxCombo, newCombo);
      const newCorrectCount = session.correctCount + 1;
      const newTotalAnswered = session.totalAnswered + 1;

      // Check if session will expire right after this answer
      if (sessionRemainingSec <= 0) {
        const claimed = await this.prisma.bossBattleSession.updateMany({
          where: questionClaimWhere,
          data: {
            score: newScore,
            idleStreak: 0,
            combo: newCombo,
            maxCombo: newMaxCombo,
            correctCount: newCorrectCount,
            totalAnswered: newTotalAnswered,
            currentQuestionId: null,
          },
        });
        if (claimed.count === 0) {
          throw new BadRequestException(
            'Câu hỏi này đã được trả lời hoặc không hợp lệ',
          );
        }
        return await this.finalizeAndReturnSessionSummary(
          session.id,
          'TIME_UP_5M',
        );
      }

      // Pick next question
      const nextQuiz = await this.getRandomQuiz(usedIds);
      const nextQuestionExpiresAt = new Date(
        now.getTime() + BOSS_QUESTION_TIME_LIMIT_SECONDS * 1000,
      );
      const updatedUsedIds = nextQuiz ? [...usedIds, nextQuiz.id] : usedIds;

      const claimed = await this.prisma.bossBattleSession.updateMany({
        where: questionClaimWhere,
        data: {
          score: newScore,
          idleStreak: 0,
          combo: newCombo,
          maxCombo: newMaxCombo,
          correctCount: newCorrectCount,
          totalAnswered: newTotalAnswered,
          currentQuestionId: nextQuiz?.id || null,
          currentQuestionNumber: { increment: 1 },
          currentQuestionStartedAt: now,
          currentQuestionExpiresAt: nextQuestionExpiresAt,
          usedQuestionIds: updatedUsedIds,
        },
      });
      if (claimed.count === 0) {
        throw new BadRequestException(
          'Câu hỏi này đã được trả lời hoặc không hợp lệ',
        );
      }

      // Boss HP is derived from the stored weekly best, so raising it here (a monotonic conditional update) takes
      // effect immediately and can never be counted twice: endSession's later raise is a no-op for the same score.
      const bossHit = await this.applyLiveBossHit(
        session.userId,
        session.seasonId,
        newScore,
      );

      const nextQuestionDto = nextQuiz
        ? this.mapQuizToQuestionDto(
            nextQuiz,
            session.currentQuestionNumber + 1,
            nextQuestionExpiresAt,
            session.expiresAt,
          )
        : null;

      return {
        result: 'CORRECT' as const,
        ...(bossHit ?? {}),
        score: newScore,
        combo: newCombo,
        maxCombo: newMaxCombo,
        correctAnswer: correctLabel,
        correctAnswerContent: correctOption?.content || null,
        explanation: quiz.explanation,
        sessionRemainingSeconds: sessionRemainingSec,
        nextQuestion: nextQuestionDto,
      };
    }

    // 4. Handle Incorrect Answer or Timeout: combo = 0
    const newWrongCount = session.wrongCount + 1;
    const newTotalAnswered = session.totalAnswered + 1;

    if (isTimeout) {
      // An unanswered question (including time spent away) counts toward the idle limit; 5 in a row ends the session.
      const newIdleStreak =
        session.idleStreak + Math.max(1, this.missedQuestions(session, now));
      if (newIdleStreak >= BOSS_IDLE_TIMEOUT_LIMIT) {
        return await this.finalizeAndReturnSessionSummary(
          session.id,
          'IDLE_TIMEOUT',
        );
      }

      // Timeout: advance immediately to next question
      const nextQuiz = await this.getRandomQuiz(usedIds);
      const nextQuestionExpiresAt = new Date(
        now.getTime() + BOSS_QUESTION_TIME_LIMIT_SECONDS * 1000,
      );
      const updatedUsedIds = nextQuiz ? [...usedIds, nextQuiz.id] : usedIds;

      const claimed = await this.prisma.bossBattleSession.updateMany({
        where: questionClaimWhere,
        data: {
          combo: 0,
          idleStreak: newIdleStreak,
          wrongCount: newWrongCount,
          totalAnswered: newTotalAnswered,
          currentQuestionId: nextQuiz?.id || null,
          currentQuestionNumber: { increment: 1 },
          currentQuestionStartedAt: now,
          currentQuestionExpiresAt: nextQuestionExpiresAt,
          usedQuestionIds: updatedUsedIds,
        },
      });
      if (claimed.count === 0) {
        throw new BadRequestException(
          'Câu hỏi này đã được trả lời hoặc không hợp lệ',
        );
      }

      const nextQuestionDto = nextQuiz
        ? this.mapQuizToQuestionDto(
            nextQuiz,
            session.currentQuestionNumber + 1,
            nextQuestionExpiresAt,
            session.expiresAt,
          )
        : null;

      return {
        result: 'TIMEOUT' as const,
        score: session.score,
        combo: 0,
        maxCombo: session.maxCombo,
        correctAnswer: correctLabel,
        correctAnswerContent: correctOption?.content || null,
        explanation: quiz.explanation,
        sessionRemainingSeconds: sessionRemainingSec,
        nextQuestion: nextQuestionDto,
      };
    }

    // Wrong answer submitted while time remains:
    // "Trả lời sai: hiển thị feedback và chờ hết 10 giây mới chuyển câu."
    // Clear currentQuestionId so user cannot submit again on this question, while retaining currentQuestionExpiresAt.
    const claimed = await this.prisma.bossBattleSession.updateMany({
      where: questionClaimWhere,
      data: {
        combo: 0,
        idleStreak: 0,
        wrongCount: newWrongCount,
        totalAnswered: newTotalAnswered,
        currentQuestionId: null,
      },
    });
    if (claimed.count === 0) {
      throw new BadRequestException(
        'Câu hỏi này đã được trả lời hoặc không hợp lệ',
      );
    }

    const questionRemainingSec = Math.max(
      0,
      Math.ceil((questionExpiresAtMs - now.getTime()) / 1000),
    );

    return {
      result: 'WRONG_ANSWER' as const,
      score: session.score,
      combo: 0,
      maxCombo: session.maxCombo,
      correctAnswer: correctLabel,
      correctAnswerContent: correctOption?.content || null,
      explanation: quiz.explanation,
      questionRemainingSeconds: questionRemainingSec,
      sessionRemainingSeconds: sessionRemainingSec,
    };
  }

  /**
   * Advances to next question after wrong-answer feedback pause or question timeout.
   */
  async nextQuestion(userId: string) {
    const now = new Date();

    const session = await this.prisma.bossBattleSession.findFirst({
      where: {
        userId,
        status: BossSessionStatus.IN_PROGRESS,
      },
      orderBy: { startedAt: 'desc' },
    });

    if (!session) {
      throw new BadRequestException('Không có lượt chơi nào đang diễn ra');
    }

    if (now.getTime() >= session.expiresAt.getTime()) {
      return await this.finalizeAndReturnSessionSummary(
        session.id,
        'TIME_UP_5M',
      );
    }

    if (
      session.currentQuestionExpiresAt &&
      now.getTime() < session.currentQuestionExpiresAt.getTime()
    ) {
      throw new BadRequestException('Vui lòng đợi hết thời gian 10 giây');
    }

    const wasUnanswered = session.currentQuestionId !== null;
    // Moving on from an unanswered question is idle time; a question that was answered wrongly is not.
    const newIdleStreak = wasUnanswered
      ? session.idleStreak + Math.max(1, this.missedQuestions(session, now))
      : session.idleStreak;
    if (newIdleStreak >= BOSS_IDLE_TIMEOUT_LIMIT) {
      return await this.finalizeAndReturnSessionSummary(
        session.id,
        'IDLE_TIMEOUT',
      );
    }

    const usedIds: string[] = Array.isArray(session.usedQuestionIds)
      ? (session.usedQuestionIds as string[])
      : [];

    const nextQuiz = await this.getRandomQuiz(usedIds);
    if (!nextQuiz) {
      throw new BadRequestException('Kho câu hỏi hiện chưa sẵn sàng');
    }

    const nextQuestionExpiresAt = new Date(
      now.getTime() + BOSS_QUESTION_TIME_LIMIT_SECONDS * 1000,
    );
    const updatedUsedIds = [...usedIds, nextQuiz.id];

    const claimed = await this.prisma.bossBattleSession.updateMany({
      where: {
        id: session.id,
        status: BossSessionStatus.IN_PROGRESS,
        currentQuestionNumber: session.currentQuestionNumber,
      },
      data: {
        ...(wasUnanswered
          ? {
              idleStreak: newIdleStreak,
              combo: 0,
              wrongCount: { increment: 1 },
              totalAnswered: { increment: 1 },
            }
          : {}),
        currentQuestionId: nextQuiz.id,
        currentQuestionNumber: { increment: 1 },
        currentQuestionStartedAt: now,
        currentQuestionExpiresAt: nextQuestionExpiresAt,
        usedQuestionIds: updatedUsedIds,
      },
    });

    if (claimed.count === 0) {
      throw new BadRequestException(
        'Câu hỏi này đã được trả lời hoặc không hợp lệ',
      );
    }

    const sessionRemainingSec = Math.max(
      0,
      Math.ceil((session.expiresAt.getTime() - now.getTime()) / 1000),
    );

    const questionDto = this.mapQuizToQuestionDto(
      nextQuiz,
      session.currentQuestionNumber + 1,
      nextQuestionExpiresAt,
      session.expiresAt,
    );

    return {
      result: 'NEXT_QUESTION' as const,
      score: session.score,
      combo: wasUnanswered ? 0 : session.combo,
      maxCombo: session.maxCombo,
      sessionRemainingSeconds: sessionRemainingSec,
      question: questionDto,
    };
  }

  /**
   * Gives up / abandons the current session early.
   */
  async abandonSession(userId: string) {
    const session = await this.prisma.bossBattleSession.findFirst({
      where: {
        userId,
        status: BossSessionStatus.IN_PROGRESS,
      },
      orderBy: { startedAt: 'desc' },
    });

    if (!session) {
      return { success: true, message: 'Không có phiên nào đang mở' };
    }

    return await this.finalizeAndReturnSessionSummary(session.id, 'GIVE_UP');
  }

  /**
   * Concludes a session and updates user weekly personal best.
   */
  private async finalizeAndReturnSessionSummary(
    sessionId: string,
    endReason: string,
  ) {
    const session = await this.endSession(sessionId, endReason);
    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên chơi');
    }

    const userStat = await this.prisma.bossUserWeeklyStat.findUnique({
      where: {
        userId_seasonId: {
          userId: session.userId,
          seasonId: session.seasonId,
        },
      },
    });

    const personalBest = userStat?.highestScore || session.score;
    const isNewRecord = session.score >= personalBest && session.score > 0;
    const accuracy =
      session.totalAnswered > 0
        ? Math.round((session.correctCount / session.totalAnswered) * 100)
        : 0;

    return {
      result: 'SESSION_COMPLETED' as const,
      sessionId: session.id,
      score: session.score,
      personalBest,
      isNewRecord,
      maxCombo: session.maxCombo,
      totalAnswered: session.totalAnswered,
      correctCount: session.correctCount,
      wrongCount: session.wrongCount,
      accuracy,
      endReason,
    };
  }

  /**
   * How many questions the player has left unanswered up to `now`, counting time spent away (reload, other tab or
   * page, idle). 0 while the current question is still live, was already answered (wrong-answer pause) or is within
   * the network grace; otherwise the expired question plus every whole 10s window that elapsed after it.
   */
  private missedQuestions(
    session: {
      currentQuestionId: string | null;
      currentQuestionExpiresAt: Date | null;
    },
    now: Date,
  ): number {
    if (!session.currentQuestionId || !session.currentQuestionExpiresAt) {
      return 0;
    }
    const lateMs = now.getTime() - session.currentQuestionExpiresAt.getTime();
    if (lateMs <= BOSS_QUESTION_GRACE_PERIOD_MS) return 0;
    return 1 + Math.floor(lateMs / (BOSS_QUESTION_TIME_LIMIT_SECONDS * 1000));
  }

  /** True (and the session is ended as IDLE_TIMEOUT) when the player has abandoned 5 questions in a row. */
  private async endIfIdle(
    session: {
      id: string;
      idleStreak: number;
      currentQuestionId: string | null;
      currentQuestionExpiresAt: Date | null;
    },
    now: Date,
  ): Promise<boolean> {
    if (
      session.idleStreak + this.missedQuestions(session, now) <
      BOSS_IDLE_TIMEOUT_LIMIT
    ) {
      return false;
    }
    await this.endSession(session.id, 'IDLE_TIMEOUT');
    return true;
  }

  /**
   * Persists a new weekly personal best as soon as a correct answer beats it, so the community HP drops live.
   * The community HP is a pure function of the stored bests (sum of min(best, cap)), and the write is a conditional
   * `highestScore < score` update, so retries, concurrent calls and endSession cannot deduct the same points twice.
   * Returns null when the answer did not beat the record. Never throws: endSession raises the best again as a backstop.
   */
  private async applyLiveBossHit(
    userId: string,
    seasonId: string,
    score: number,
  ): Promise<{
    bossDamage: number;
    personalBest: number;
    communityScore: number;
  } | null> {
    try {
      const stat = await this.prisma.bossUserWeeklyStat.findUnique({
        where: { userId_seasonId: { userId, seasonId } },
        select: { highestScore: true },
      });
      const previousBest = stat?.highestScore ?? 0;
      if (score <= previousBest) return null;

      const raised = await this.prisma.bossUserWeeklyStat.updateMany({
        where: { userId, seasonId, highestScore: { lt: score } },
        data: { highestScore: score },
      });
      if (raised.count === 0) return null;

      const rows = await this.prisma.bossUserWeeklyStat.findMany({
        where: { seasonId, hasParticipated: true },
        select: { highestScore: true },
      });
      return {
        bossDamage:
          cappedBossContribution(score) - cappedBossContribution(previousBest),
        personalBest: score,
        communityScore: rows.reduce(
          (sum, row) => sum + cappedBossContribution(row.highestScore),
          0,
        ),
      };
    } catch (error) {
      this.logger.warn(
        `Live boss hit not persisted session user=${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Internal session finalizer: sets COMPLETED / ABANDONED and updates weekly stat.
   */
  private async endSession(sessionId: string, endReason: string) {
    const session = await this.prisma.bossBattleSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.status !== BossSessionStatus.IN_PROGRESS) {
      return session;
    }

    const now = new Date();
    const targetStatus =
      endReason === 'GIVE_UP'
        ? BossSessionStatus.ABANDONED
        : BossSessionStatus.COMPLETED;

    const claimed = await this.prisma.bossBattleSession.updateMany({
      where: {
        id: sessionId,
        status: BossSessionStatus.IN_PROGRESS,
      },
      data: {
        status: targetStatus,
        endedAt: now,
        endReason,
      },
    });

    if (claimed.count === 0) {
      return await this.prisma.bossBattleSession.findUnique({
        where: { id: sessionId },
      });
    }

    const updated = {
      ...session,
      status: targetStatus,
      endedAt: now,
      endReason,
    };

    // Update or create BossUserWeeklyStat. The upsert never writes the best values; two conditional updates raise
    // them atomically so concurrent session ends cannot lower a personal best with a stale read.
    await this.prisma.bossUserWeeklyStat.upsert({
      where: {
        userId_seasonId: {
          userId: session.userId,
          seasonId: session.seasonId,
        },
      },
      create: {
        userId: session.userId,
        seasonId: session.seasonId,
        highestScore: session.score,
        totalAttempts: 1,
        bestCombo: session.maxCombo,
        hasParticipated: true,
        lastPlayedAt: now,
      },
      update: {
        hasParticipated: true,
        lastPlayedAt: now,
      },
    });
    await this.prisma.bossUserWeeklyStat.updateMany({
      where: {
        userId: session.userId,
        seasonId: session.seasonId,
        highestScore: { lt: session.score },
      },
      data: { highestScore: session.score },
    });
    await this.prisma.bossUserWeeklyStat.updateMany({
      where: {
        userId: session.userId,
        seasonId: session.seasonId,
        bestCombo: { lt: session.maxCombo },
      },
      data: { bestCombo: session.maxCombo },
    });

    // Official XP: only for a COMPLETED session (atomic claim above), needs real correct answers, capped per day.
    if (this.xpService && targetStatus === BossSessionStatus.COMPLETED) {
      try {
        const xp = await this.xpService.awardBossSession(
          session.userId,
          session.id,
          { correctCount: session.correctCount, maxCombo: session.maxCombo },
        );
        if (xp.skipped) {
          this.logger.log(
            `Boss XP skipped (${xp.skipped}) session=${session.id} userId=${session.userId}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `XP award failed for boss session=${session.id} userId=${session.userId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return updated;
  }

  /**
   * Weekly Settlement:
   * Evaluates community progress, unlocks milestones, and distributes rewards idempotently.
   * Logs complete transaction audit records.
   */
  async settleWeek(weekKey?: string) {
    const now = new Date();
    let season;
    if (weekKey) {
      season = await this.prisma.bossWeeklySeason.findUnique({
        where: { weekKey },
      });
    } else {
      // Find latest unsettled season where endsAt has passed, or previous week
      const { weekKey: currentWeekKey } = this.getWeekBoundaries(now);
      season = await this.prisma.bossWeeklySeason.findFirst({
        where: {
          isSettled: false,
          weekKey: { not: currentWeekKey },
          endsAt: { lte: now },
        },
        orderBy: { endsAt: 'desc' },
      });
    }

    if (!season) {
      return {
        settled: false,
        message: 'Không có tuần nào cần kết toán',
      };
    }

    if (season.isSettled) {
      return {
        settled: false,
        message: 'Tuần này đã được kết toán',
      };
    }

    if (season.endsAt && now.getTime() < season.endsAt.getTime()) {
      throw new BadRequestException(
        'Chưa kết thúc tuần, không thể kết toán sớm',
      );
    }

    this.logger.log(
      `[BossService] Starting weekly settlement for season=${season.weekKey} (id=${season.id})`,
    );

    // 1. Finalize any lingering IN_PROGRESS sessions for that season and update their highestScore
    const lingeringSessions =
      (await this.prisma.bossBattleSession.findMany?.({
        where: {
          seasonId: season.id,
          status: BossSessionStatus.IN_PROGRESS,
        },
      })) ?? [];

    for (const lingering of lingeringSessions) {
      await this.endSession(lingering.id, 'TIME_UP_5M');
    }

    // 2. Claim season with atomic updateMany
    const claimed = await this.prisma.bossWeeklySeason.updateMany({
      where: {
        id: season.id,
        isSettled: false,
      },
      data: {
        isSettled: true,
        settledAt: now,
        isActive: false,
      },
    });

    if (claimed.count === 0) {
      return {
        settled: false,
        message: 'Tuần này đã được kết toán',
      };
    }

    // 3. Calculate final community score (each user's personal best is capped)
    const participants = await this.prisma.bossUserWeeklyStat.findMany({
      where: {
        seasonId: season.id,
        hasParticipated: true,
      },
      select: {
        userId: true,
        highestScore: true,
      },
    });

    const communityScore = participants.reduce(
      (sum, p) => sum + cappedBossContribution(p.highestScore),
      0,
    );
    const totalParticipants = participants.length;

    // 4. Determine reached milestones
    const milestones = Array.isArray(season.milestoneConfig)
      ? (season.milestoneConfig as unknown as BossMilestoneConfigItem[])
      : DEFAULT_MILESTONES;

    const unlockedMilestones = milestones
      .map((m, idx) => ({ ...m, index: idx + 1 }))
      .filter((m) => communityScore >= m.at);

    this.logger.log(
      `[BossService] Week ${season.weekKey} result: communityScore=${communityScore}, unlocked=${unlockedMilestones.length}/${milestones.length} milestones, participants=${totalParticipants}`,
    );

    // 5. Only participants with a real personal best earn coins (starting a session alone is not enough)
    const eligibleParticipants = participants.filter(
      (p) => p.highestScore >= BOSS_REWARD_MIN_PERSONAL_SCORE,
    );

    let rewardsInitiated = 0;
    let totalCoinsDistributed = 0;

    // 6. Distribute rewards for each unlocked milestone to each participant
    for (const participant of eligibleParticipants) {
      for (const milestone of unlockedMilestones) {
        try {
          await this.coinService.distributeMilestoneReward(
            participant.userId,
            season.id,
            season.weekKey,
            milestone.index,
            milestone.at,
            milestone.name,
            milestone.coin,
          );
          rewardsInitiated++;
          totalCoinsDistributed += milestone.coin;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `[BossService] Settlement reward failed for userId=${participant.userId}, milestone=${milestone.index}: ${msg}`,
          );
        }
      }
    }

    this.logger.log(
      `[BossService] Settlement completed for week ${season.weekKey}: rewardsInitiated=${rewardsInitiated}, totalCoins=${totalCoinsDistributed}`,
    );

    return {
      settled: true,
      weekKey: season.weekKey,
      communityScore,
      totalParticipants,
      unlockedMilestones: unlockedMilestones.length,
      rewardsInitiated,
      totalCoinsDistributed,
    };
  }

  /**
   * Automated Cron Job: runs every Monday at 00:00:00 (Asia/Ho_Chi_Minh).
   */
  @Cron('0 0 * * 1', { timeZone: 'Asia/Ho_Chi_Minh' })
  async handleWeeklySettlementCron() {
    this.logger.log(
      '[BossService] Running weekly scheduled settlement cron job (Monday 00:00 UTC+7)',
    );
    try {
      const result = await this.settleWeek();
      this.logger.log(
        `[BossService] Cron settlement finished: ${JSON.stringify(result)}`,
      );
      // Ensure the new week's season is active
      await this.getOrCreateCurrentSeason();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[BossService] Cron settlement failed: ${msg}`);
    }
  }

  /**
   * Retrieves transaction logs for the user.
   */
  async getUserTransactions(userId: string, limit = 50) {
    return this.prisma.bossRewardTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      // Only what the client shows: provider payloads, idempotency keys and error text stay server-side.
      select: {
        id: true,
        milestoneIndex: true,
        milestoneAt: true,
        rewardCoins: true,
        status: true,
        createdAt: true,
        processedAt: true,
        season: {
          select: {
            weekKey: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Picks a random question from prisma.quiz, excluding already asked question IDs.
   */
  private async getRandomQuiz(excludeIds: string[]) {
    const baseWhere: Prisma.QuizWhereInput =
      excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {};

    const count = await this.prisma.quiz.count({ where: baseWhere });
    if (count > 0) {
      const skip = Math.floor(Math.random() * count);
      return this.prisma.quiz.findFirst({
        where: baseWhere,
        skip,
        include: { options: true },
      });
    }

    // Fallback: exclude only the latest question if pool smaller than answered
    const lastAskedId =
      excludeIds.length > 0 ? excludeIds[excludeIds.length - 1] : null;
    const fallbackWhere: Prisma.QuizWhereInput = lastAskedId
      ? { id: { notIn: [lastAskedId] } }
      : {};

    const fallbackCount = await this.prisma.quiz.count({
      where: fallbackWhere,
    });
    if (fallbackCount > 0) {
      const skip = Math.floor(Math.random() * fallbackCount);
      return this.prisma.quiz.findFirst({
        where: fallbackWhere,
        skip,
        include: { options: true },
      });
    }

    return this.prisma.quiz.findFirst({
      include: { options: true },
    });
  }

  /**
   * Maps a Quiz entity to a safe question DTO.
   */
  private mapQuizToQuestionDto(
    quiz: {
      id: string;
      question: string;
      code: string | null;
      imageUrl: string | null;
      options: {
        label: string;
        content: string;
        isCode: boolean;
      }[];
    },
    questionNumber: number,
    questionExpiresAt: Date,
    sessionExpiresAt: Date,
  ): BossQuestionDto {
    const safeOptions: BossQuestionOptionDto[] = quiz.options.map((o) => ({
      label: o.label,
      content: o.content,
      isCode: o.isCode,
    }));

    return {
      id: quiz.id,
      question: quiz.question,
      code: quiz.code,
      imageUrl: quiz.imageUrl,
      options: safeOptions,
      currentQuestionNumber: questionNumber,
      questionExpiresAt: questionExpiresAt.toISOString(),
      sessionExpiresAt: sessionExpiresAt.toISOString(),
    };
  }
}
