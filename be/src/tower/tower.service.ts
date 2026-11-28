import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, XpSourceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TowerCoinService } from './coin/tower-coin.service';
import { XpService } from '../xp/xp.service';
import { TowerQuestionSelector } from './tower-question-selector.service';
import {
  TowerAntiCheatService,
  type TowerAnswerClientMeta,
} from './tower-anticheat.service';
import {
  AnswerResponseDto,
  TowerOverviewDto,
  TowerQuestionDto,
} from './dto/tower.dto';

const TIME_LIMIT_SECONDS = 10;
const NETWORK_GRACE_MS = 1500;
const DEFAULT_COOLDOWN_SECONDS = 14400; // 4 hours in production
const MAX_FLOOR = 100;
const VN_OFFSET_MS = 7 * 3600 * 1000; // Asia/Ho_Chi_Minh (UTC+7)

@Injectable()
export class TowerService {
  private readonly logger = new Logger(TowerService.name);
  private readonly userStartLocks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly coinService: TowerCoinService,
    private readonly xpService: XpService,
    @Optional() private readonly questionSelector?: TowerQuestionSelector,
    @Optional() private readonly antiCheat?: TowerAntiCheatService,
  ) {}

  /**
   * Retrieves the configured cooldown duration in seconds.
   * If TOWER_COOLDOWN_ENABLED=false or TOWER_COOLDOWN_SECONDS=0 (typical in dev/test),
   * returns 0 (no cooldown applied).
   * Otherwise defaults to DEFAULT_COOLDOWN_SECONDS (14400 = 4 hours) in production.
   */
  getCooldownSeconds(): number {
    const rawEnabled = process.env.TOWER_COOLDOWN_ENABLED;
    if (rawEnabled !== undefined) {
      const normalized = rawEnabled.trim().toLowerCase();
      if (
        normalized === 'false' ||
        normalized === '0' ||
        normalized === 'off' ||
        normalized === 'no'
      ) {
        return 0;
      }
    }

    const rawSec = process.env.TOWER_COOLDOWN_SECONDS;
    if (rawSec !== undefined && rawSec.trim() !== '') {
      const parsed = Number(rawSec);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return parsed;
      }
    }

    const rawHours = process.env.TOWER_COOLDOWN_HOURS;
    if (rawHours !== undefined && rawHours.trim() !== '') {
      const parsed = Number(rawHours);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return parsed * 3600;
      }
    }

    return DEFAULT_COOLDOWN_SECONDS;
  }

  /**
   * Retrieves the question time limit in seconds (default: 10s).
   */
  getTimeLimitSeconds(): number {
    const rawLimit = process.env.TOWER_QUESTION_TIME_LIMIT_SECONDS;
    if (rawLimit !== undefined && rawLimit.trim() !== '') {
      const parsed = Number(rawLimit);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return TIME_LIMIT_SECONDS;
  }

  /**
   * Computes or retrieves the active monthly season.
   * Format: YYYY-MM strictly anchored to Asia/Ho_Chi_Minh (UTC+7).
   */
  async getOrCreateCurrentSeason(now = new Date()) {
    const vnTime = new Date(now.getTime() + VN_OFFSET_MS);
    const year = vnTime.getUTCFullYear();
    const monthIndex = vnTime.getUTCMonth();
    const month = String(monthIndex + 1).padStart(2, '0');
    const seasonKey = `${year}-${month}`;

    let season = await this.prisma.towerSeason.findUnique({
      where: { seasonKey },
    });

    if (!season) {
      const startsAt = new Date(
        Date.UTC(year, monthIndex, 1, 0, 0, 0, 0) - VN_OFFSET_MS,
      );
      const endsAt = new Date(
        Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999) - VN_OFFSET_MS,
      );

      try {
        season = await this.prisma.towerSeason.create({
          data: {
            seasonKey,
            name: `Mùa giải tháng ${month}/${year}`,
            startsAt,
            endsAt,
            isActive: true,
          },
        });
      } catch (err: unknown) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          season = await this.prisma.towerSeason.findUnique({
            where: { seasonKey },
          });
        } else {
          throw err;
        }
      }
    }

    if (!season) {
      throw new Error(`Failed to resolve tower season for ${seasonKey}`);
    }

    return season;
  }

  /**
   * Retrieves or initializes the user progress for the current season.
   */
  async getOrCreateUserProgress(userId: string, seasonId: string) {
    let progress = await this.prisma.towerUserProgress.findUnique({
      where: {
        userId_seasonId: { userId, seasonId },
      },
    });

    if (!progress) {
      try {
        progress = await this.prisma.towerUserProgress.create({
          data: {
            userId,
            seasonId,
            currentFloor: 1,
            highestCompletedFloor: 0,
          },
        });
      } catch (err: unknown) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          progress = await this.prisma.towerUserProgress.findUnique({
            where: {
              userId_seasonId: { userId, seasonId },
            },
          });
        } else {
          throw err;
        }
      }
    }

    if (!progress) {
      throw new Error(`Failed to resolve tower progress for user ${userId}`);
    }

    return progress;
  }

  /**
   * Returns user's tower overview, season info, and active attempt if any.
   */
  async getOverview(userId: string): Promise<TowerOverviewDto> {
    const season = await this.getOrCreateCurrentSeason();
    const progress = await this.getOrCreateUserProgress(userId, season.id);

    const now = Date.now();
    const cooldownSeconds = this.getCooldownSeconds();
    let isCooldownActive = false;
    let cooldownRemainingSeconds = 0;

    if (progress.cooldownUntil) {
      const diff = progress.cooldownUntil.getTime() - now;
      if (diff > 0 && cooldownSeconds > 0) {
        isCooldownActive = true;
        cooldownRemainingSeconds = Math.ceil(diff / 1000);
      } else if (cooldownSeconds === 0) {
        isCooldownActive = false;
        cooldownRemainingSeconds = 0;
      }
    }

    // Check for an active in-progress attempt
    const activeAttempt = await this.prisma.towerFloorAttempt.findFirst({
      where: {
        userId,
        seasonId: season.id,
        status: 'IN_PROGRESS',
      },
      orderBy: { createdAt: 'desc' },
    });

    let mappedAttempt = null;

    if (activeAttempt) {
      // Check if attempt question expired
      const expiresAtMs =
        activeAttempt.currentQuestionExpiresAt?.getTime() ?? 0;
      if (expiresAtMs > 0 && now > expiresAtMs + NETWORK_GRACE_MS) {
        // Expired -> Mark FAILED, trigger cooldown if enabled
        const expiredUpdate = await this.prisma.towerFloorAttempt.updateMany({
          where: { id: activeAttempt.id, status: 'IN_PROGRESS' },
          data: {
            status: 'FAILED',
            failedReason: 'TIMEOUT',
          },
        });
        if (expiredUpdate.count > 0) {
          const cooldownUntil =
            cooldownSeconds > 0 ? new Date(now + cooldownSeconds * 1000) : null;
          await this.prisma.towerUserProgress.update({
            where: { id: progress.id },
            data: { cooldownUntil },
          });
          isCooldownActive = cooldownSeconds > 0;
          cooldownRemainingSeconds = cooldownSeconds;
          progress.cooldownUntil = cooldownUntil;
        }
      } else if (activeAttempt.currentQuizId) {
        // Active and valid -> fetch quiz details
        const quiz = await this.prisma.quiz.findUnique({
          where: { id: activeAttempt.currentQuizId },
          include: { options: true },
        });

        if (quiz) {
          mappedAttempt = {
            id: activeAttempt.id,
            floor: activeAttempt.floor,
            currentStreak: activeAttempt.currentStreak,
            requiredStreak: activeAttempt.requiredStreak,
            currentQuestionNumber: activeAttempt.currentQuestionNumber,
            currentQuestion: this.mapQuizToQuestionDto(
              quiz,
              activeAttempt.currentQuestionNumber,
              activeAttempt.requiredStreak,
              activeAttempt.currentQuestionExpiresAt ??
                new Date(now + TIME_LIMIT_SECONDS * 1000),
              activeAttempt.currentQuestionToken,
              this.parseOptionMap(activeAttempt.currentOptionMap),
            ),
          };
        } else {
          // Quiz was deleted by admin mid-attempt -> cancel attempt without cooldown penalty
          await this.prisma.towerFloorAttempt.updateMany({
            where: { id: activeAttempt.id, status: 'IN_PROGRESS' },
            data: { status: 'FAILED', failedReason: 'QUIZ_DELETED' },
          });
        }
      }
    }

    return {
      season: {
        id: season.id,
        seasonKey: season.seasonKey,
        name: season.name,
        startsAt: season.startsAt.toISOString(),
        endsAt: season.endsAt.toISOString(),
      },
      progress: {
        currentFloor: progress.currentFloor,
        highestCompletedFloor: progress.highestCompletedFloor,
        cooldownUntil: progress.cooldownUntil
          ? progress.cooldownUntil.toISOString()
          : null,
        isCooldownActive,
        cooldownRemainingSeconds,
        isBlocked: progress.isBlocked ?? false,
        blockedReason: progress.blockedReason ?? null,
      },
      activeAttempt: mappedAttempt,
    };
  }

  /**
   * Starts a new floor attempt for the current floor, serialized per user.
   */
  async startFloorAttempt(userId: string) {
    const prev = this.userStartLocks.get(userId) ?? Promise.resolve();
    const run = prev
      .catch(() => undefined)
      .then(() => this.startFloorAttemptInternal(userId));
    this.userStartLocks.set(userId, run);
    try {
      return await run;
    } finally {
      if (this.userStartLocks.get(userId) === run) {
        this.userStartLocks.delete(userId);
      }
    }
  }

  private async startFloorAttemptInternal(userId: string) {
    const season = await this.getOrCreateCurrentSeason();
    const progress = await this.getOrCreateUserProgress(userId, season.id);
    this.antiCheat?.assertNotBlocked(progress);

    const now = Date.now();
    const cooldownSeconds = this.getCooldownSeconds();

    // 1. Verify cooldown
    if (
      cooldownSeconds > 0 &&
      progress.cooldownUntil &&
      progress.cooldownUntil.getTime() > now
    ) {
      const remainingSeconds = Math.ceil(
        (progress.cooldownUntil.getTime() - now) / 1000,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          message: `Bạn đang bị cooldown. Vui lòng chờ thêm ${remainingSeconds} giây nữa.`,
          cooldownRemainingSeconds: remainingSeconds,
          cooldownUntil: progress.cooldownUntil.toISOString(),
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // Check if player has already conquered all 100 floors this season
    if (progress.highestCompletedFloor >= MAX_FLOOR) {
      throw new BadRequestException(
        'Bạn đã chinh phục toàn bộ 100 tầng của Tháp trong mùa giải này!',
      );
    }

    // 2. Check existing active attempt
    const existing = await this.prisma.towerFloorAttempt.findFirst({
      where: {
        userId,
        seasonId: season.id,
        status: 'IN_PROGRESS',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      const expiresAtMs = existing.currentQuestionExpiresAt?.getTime() ?? 0;
      if (expiresAtMs > 0 && now <= expiresAtMs + NETWORK_GRACE_MS) {
        // Still valid, return current question
        const quiz = await this.prisma.quiz.findUnique({
          where: { id: existing.currentQuizId! },
          include: { options: true },
        });

        if (quiz) {
          return {
            attemptId: existing.id,
            floor: existing.floor,
            currentStreak: existing.currentStreak,
            requiredStreak: existing.requiredStreak,
            question: this.mapQuizToQuestionDto(
              quiz,
              existing.currentQuestionNumber,
              existing.requiredStreak,
              existing.currentQuestionExpiresAt!,
              existing.currentQuestionToken,
              this.parseOptionMap(existing.currentOptionMap),
            ),
          };
        }

        // Quiz was deleted by admin -> cancel orphaned attempt without cooldown and create a fresh one
        await this.prisma.towerFloorAttempt.updateMany({
          where: { id: existing.id, status: 'IN_PROGRESS' },
          data: { status: 'FAILED', failedReason: 'QUIZ_DELETED' },
        });
      } else {
        // Expired -> mark FAILED
        const cooldownUntil =
          cooldownSeconds > 0 ? new Date(now + cooldownSeconds * 1000) : null;
        const expiredUpdate = await this.prisma.towerFloorAttempt.updateMany({
          where: { id: existing.id, status: 'IN_PROGRESS' },
          data: { status: 'FAILED', failedReason: 'TIMEOUT' },
        });
        if (expiredUpdate.count > 0 && cooldownSeconds > 0) {
          await this.prisma.towerUserProgress.update({
            where: { id: progress.id },
            data: { cooldownUntil },
          });
        }

        if (cooldownSeconds > 0 && cooldownUntil) {
          throw new HttpException(
            {
              statusCode: HttpStatus.FORBIDDEN,
              message: `Lượt chơi trước đã quá thời gian 10 giây. Bạn đang bị cooldown ${Math.ceil(cooldownSeconds / 3600)} giờ.`,
              cooldownRemainingSeconds: cooldownSeconds,
              cooldownUntil: cooldownUntil.toISOString(),
            },
            HttpStatus.FORBIDDEN,
          );
        }
      }
    }

    // 3. Pick first random quiz according to floor difficulty tier and knowledge distribution
    const floor = Math.min(Math.max(progress.currentFloor, 1), MAX_FLOOR);
    const quiz = this.questionSelector
      ? await this.questionSelector.selectQuestionForFloor(season.id, floor, [])
      : await this.getRandomQuiz([], floor);
    if (!quiz) {
      throw new BadRequestException('Hiện chưa có câu hỏi nào trong hệ thống');
    }

    const requiredStreak = floor; // Floor 1 requires 1, Floor 2 requires 2, ..., Floor 100 requires 100
    const timeLimit = this.getTimeLimitSeconds();
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + timeLimit * 1000);
    const questionToken = randomUUID();
    const optionMap = this.buildShuffledOptionMap(quiz.options);

    let attempt;
    try {
      attempt = await this.prisma.towerFloorAttempt.create({
        data: {
          userId,
          seasonId: season.id,
          floor,
          requiredStreak,
          currentStreak: 0,
          status: 'IN_PROGRESS',
          currentQuizId: quiz.id,
          currentQuestionToken: questionToken,
          currentOptionMap: optionMap,
          currentQuestionStartedAt: startedAt,
          currentQuestionExpiresAt: expiresAt,
          currentQuestionNumber: 1,
          usedQuizIds: [quiz.id],
          answerTimingsMs: [],
        },
      });
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const concurrent = await this.prisma.towerFloorAttempt.findFirst({
          where: { userId, seasonId: season.id, status: 'IN_PROGRESS' },
          orderBy: { createdAt: 'desc' },
        });
        if (concurrent && concurrent.currentQuizId) {
          const cQuiz = await this.prisma.quiz.findUnique({
            where: { id: concurrent.currentQuizId },
            include: { options: true },
          });
          if (cQuiz) {
            return {
              attemptId: concurrent.id,
              floor: concurrent.floor,
              currentStreak: concurrent.currentStreak,
              requiredStreak: concurrent.requiredStreak,
              question: this.mapQuizToQuestionDto(
                cQuiz,
                concurrent.currentQuestionNumber,
                concurrent.requiredStreak,
                concurrent.currentQuestionExpiresAt!,
                concurrent.currentQuestionToken,
                this.parseOptionMap(concurrent.currentOptionMap),
              ),
            };
          }
        }
      }
      throw err;
    }

    return {
      attemptId: attempt.id,
      floor: attempt.floor,
      currentStreak: attempt.currentStreak,
      requiredStreak: attempt.requiredStreak,
      question: this.mapQuizToQuestionDto(
        quiz,
        1,
        requiredStreak,
        expiresAt,
        questionToken,
        optionMap,
      ),
    };
  }

  /**
   * Evaluates the submitted answer for the active floor attempt.
   */
  async answerFloorQuestion(
    userId: string,
    optionLabel: string,
    quizId?: string,
    clientMeta?: TowerAnswerClientMeta,
  ): Promise<AnswerResponseDto> {
    const season = await this.getOrCreateCurrentSeason();
    const progress = await this.getOrCreateUserProgress(userId, season.id);
    this.antiCheat?.assertNotBlocked(progress);

    // 1. Find active attempt
    const attempt = await this.prisma.towerFloorAttempt.findFirst({
      where: {
        userId,
        seasonId: season.id,
        status: 'IN_PROGRESS',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!attempt || !attempt.currentQuizId) {
      throw new BadRequestException('Không tìm thấy lượt chơi đang hoạt động');
    }

    // Reject stale answer/timeout for a question that is no longer active
    const expectedQuestionKey =
      attempt.currentQuestionToken || attempt.currentQuizId;
    if (
      quizId &&
      quizId !== expectedQuestionKey &&
      quizId !== attempt.currentQuizId
    ) {
      throw new BadRequestException(
        'Câu hỏi này đã hết hạn hoặc đã được trả lời',
      );
    }

    // Prevent stale/duplicate floor attempt from regressing user's floor
    if (attempt.floor !== progress.currentFloor) {
      await this.prisma.towerFloorAttempt.updateMany({
        where: { id: attempt.id, status: 'IN_PROGRESS' },
        data: { status: 'FAILED', failedReason: 'STALE_FLOOR' },
      });
      throw new BadRequestException('Lượt chơi không khớp với tầng hiện tại');
    }

    const now = Date.now();
    const expiresAt = attempt.currentQuestionExpiresAt?.getTime() ?? 0;

    // 2. Check 10s timer (+ grace)
    if (now > expiresAt + NETWORK_GRACE_MS) {
      const cooldownSeconds = this.getCooldownSeconds();
      const cooldownUntil =
        cooldownSeconds > 0 ? new Date(now + cooldownSeconds * 1000) : null;

      const timeoutUpdate = await this.prisma.towerFloorAttempt.updateMany({
        where: {
          id: attempt.id,
          status: 'IN_PROGRESS',
          currentQuizId: attempt.currentQuizId,
        },
        data: {
          status: 'FAILED',
          failedReason: 'TIMEOUT',
        },
      });

      if (timeoutUpdate.count === 0) {
        throw new BadRequestException('Câu hỏi này đã được trả lời');
      }

      await this.prisma.towerUserProgress.update({
        where: { id: progress.id },
        data: { cooldownUntil },
      });

      const quizOnTimeout = await this.prisma.quiz.findUnique({
        where: { id: attempt.currentQuizId },
      });

      return {
        result: 'FAILED',
        reason: 'TIMEOUT',
        correctAnswer: quizOnTimeout
          ? this.reverseMapOptionLabel(
              this.parseOptionMap(attempt.currentOptionMap),
              quizOnTimeout.answer,
            )
          : undefined,
        explanation: quizOnTimeout?.explanation,
        cooldownUntil: cooldownUntil ? cooldownUntil.toISOString() : null,
        cooldownRemainingSeconds: cooldownSeconds,
      };
    }

    // 3. Fetch current quiz to check answer
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: attempt.currentQuizId },
    });

    if (!quiz) {
      // Quiz was deleted by admin mid-attempt -> cancel attempt without imposing 4h cooldown
      await this.prisma.towerFloorAttempt.updateMany({
        where: { id: attempt.id, status: 'IN_PROGRESS' },
        data: { status: 'FAILED', failedReason: 'QUIZ_DELETED' },
      });
      throw new BadRequestException('Câu hỏi không tồn tại');
    }

    const normalizedSubmitted = optionLabel.trim().toUpperCase();
    const isExplicitTimeout = normalizedSubmitted === 'TIMEOUT';
    const prevTimings = Array.isArray(attempt.answerTimingsMs)
      ? (attempt.answerTimingsMs as number[]).filter((v) => Number.isFinite(v))
      : [];
    const serverResponseMs = attempt.currentQuestionStartedAt
      ? Math.max(0, now - attempt.currentQuestionStartedAt.getTime())
      : 1500;

    let nextTimingsMs = prevTimings;
    if (this.antiCheat) {
      const antiCheatEval = await this.antiCheat.evaluateAnswer({
        userId,
        seasonId: season.id,
        progressId: progress.id,
        currentSuspicionScore: progress.suspicionScore ?? 0,
        attemptId: attempt.id,
        floor: attempt.floor,
        serverResponseMs,
        previousTimingsMs: prevTimings,
        isExplicitTimeout,
        meta: clientMeta,
      });
      nextTimingsMs = antiCheatEval.nextTimingsMs;
      if (antiCheatEval.autoBlocked) {
        throw new ForbiddenException(
          'Tài khoản đã bị tạm khóa Leo Tháp do phát hiện dấu hiệu dùng bot hoặc click tự động bất thường.',
        );
      }
      if (antiCheatEval.rejectedAsSuperhuman) {
        await this.prisma.towerFloorAttempt
          .updateMany({
            where: { id: attempt.id, status: 'IN_PROGRESS' },
            data: { answerTimingsMs: nextTimingsMs },
          })
          .catch(() => undefined);
        throw new ForbiddenException(
          'Tốc độ trả lời bất thường. Vui lòng đọc kỹ câu hỏi trước khi chọn đáp án.',
        );
      }
    }

    const optionMap = this.parseOptionMap(attempt.currentOptionMap);
    const mappedOriginalLabel =
      optionMap?.[normalizedSubmitted] ?? normalizedSubmitted;
    const isCorrect =
      mappedOriginalLabel.trim().toUpperCase() ===
      quiz.answer.trim().toUpperCase();
    const displayedCorrectAnswer = this.reverseMapOptionLabel(
      optionMap,
      quiz.answer,
    );

    if (!isCorrect) {
      const cooldownSeconds = this.getCooldownSeconds();
      const cooldownUntil =
        cooldownSeconds > 0 ? new Date(now + cooldownSeconds * 1000) : null;

      const wrongUpdate = await this.prisma.towerFloorAttempt.updateMany({
        where: {
          id: attempt.id,
          status: 'IN_PROGRESS',
          currentQuizId: attempt.currentQuizId,
        },
        data: {
          status: 'FAILED',
          failedReason: isExplicitTimeout ? 'TIMEOUT' : 'WRONG_ANSWER',
          answerTimingsMs: nextTimingsMs,
        },
      });

      if (wrongUpdate.count === 0) {
        throw new BadRequestException('Câu hỏi này đã được trả lời');
      }

      await this.prisma.towerUserProgress.update({
        where: { id: progress.id },
        data: { cooldownUntil },
      });

      return {
        result: 'FAILED',
        reason: isExplicitTimeout ? 'TIMEOUT' : 'WRONG_ANSWER',
        correctAnswer: displayedCorrectAnswer,
        explanation: quiz.explanation,
        cooldownUntil: cooldownUntil ? cooldownUntil.toISOString() : null,
        cooldownRemainingSeconds: cooldownSeconds,
      };
    }

    // 4. Answer is correct! Increment streak
    const nextStreak = attempt.currentStreak + 1;

    if (nextStreak >= attempt.requiredStreak) {
      // --- FLOOR COMPLETED! ---
      const nextFloor = Math.min(
        Math.max(progress.currentFloor, attempt.floor + 1),
        MAX_FLOOR,
      );
      const newHighest = Math.max(
        progress.highestCompletedFloor,
        attempt.floor,
      );

      const updateResult = await this.prisma.towerFloorAttempt.updateMany({
        where: {
          id: attempt.id,
          status: 'IN_PROGRESS',
          currentQuizId: attempt.currentQuizId,
        },
        data: {
          status: 'COMPLETED',
          currentStreak: nextStreak,
          completedAt: new Date(),
          answerTimingsMs: nextTimingsMs,
        },
      });

      if (updateResult.count === 0) {
        throw new BadRequestException('Lượt hoàn thành tầng này đã được xử lý');
      }

      await this.prisma.towerUserProgress.update({
        where: { id: progress.id },
        data: {
          currentFloor: nextFloor,
          highestCompletedFloor: newHighest,
          cooldownUntil: null,
        },
      });

      // Official XP: only after the atomic COMPLETED claim above (count === 1), idempotent per season floor.
      try {
        await this.xpService.award(
          userId,
          XpSourceType.TOWER_FLOOR,
          `${season.id}:${attempt.floor}`,
        );
      } catch (error) {
        this.logger.error(
          `XP award failed (TOWER_FLOOR) userId=${userId} season=${season.id} floor=${attempt.floor}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Dispatch 1 coin reward
      const rewardTx = await this.coinService.rewardFloorCompletion(
        userId,
        season.id,
        season.seasonKey,
        attempt.floor,
        attempt.id,
      );

      return {
        result: 'FLOOR_COMPLETED',
        completedFloor: attempt.floor,
        nextFloor,
        rewardCoins: 1, // Fixed: 1 coin per completed floor
        rewardStatus: rewardTx?.status ?? 'SUCCESS',
        explanation: quiz.explanation,
      };
    }

    // 5. Correct, but streak not complete yet: pick next question
    const usedIds: string[] = Array.isArray(attempt.usedQuizIds)
      ? (attempt.usedQuizIds as string[])
      : [];

    const nextQuiz = this.questionSelector
      ? await this.questionSelector.selectQuestionForFloor(
          attempt.seasonId,
          attempt.floor,
          usedIds,
        )
      : await this.getRandomQuiz(usedIds, attempt.floor);
    if (!nextQuiz) {
      throw new BadRequestException('Không còn câu hỏi khả dụng cho tầng này');
    }

    const timeLimit = this.getTimeLimitSeconds();
    const questionStartedAt = new Date();
    const questionExpiresAt = new Date(
      questionStartedAt.getTime() + timeLimit * 1000,
    );
    const updatedUsedIds = [...usedIds, nextQuiz.id];
    const nextQuestionNumber = attempt.currentQuestionNumber + 1;
    const nextQuestionToken = randomUUID();
    const nextOptionMap = this.buildShuffledOptionMap(nextQuiz.options);

    const atomicUpdate = await this.prisma.towerFloorAttempt.updateMany({
      where: {
        id: attempt.id,
        status: 'IN_PROGRESS',
        currentQuizId: attempt.currentQuizId,
      },
      data: {
        currentStreak: nextStreak,
        currentQuestionNumber: nextQuestionNumber,
        currentQuizId: nextQuiz.id,
        currentQuestionToken: nextQuestionToken,
        currentOptionMap: nextOptionMap,
        currentQuestionStartedAt: questionStartedAt,
        currentQuestionExpiresAt: questionExpiresAt,
        usedQuizIds: updatedUsedIds,
        answerTimingsMs: nextTimingsMs,
      },
    });

    if (atomicUpdate.count === 0) {
      throw new BadRequestException('Câu hỏi này đã được trả lời');
    }

    return {
      result: 'CORRECT',
      currentStreak: nextStreak,
      requiredStreak: attempt.requiredStreak,
      explanation: quiz.explanation,
      nextQuestion: this.mapQuizToQuestionDto(
        nextQuiz,
        nextQuestionNumber,
        attempt.requiredStreak,
        questionExpiresAt,
        nextQuestionToken,
        nextOptionMap,
      ),
    };
  }

  /**
   * Retrieves transaction logs for the user.
   */
  async getUserTransactions(userId: string, limit = 50) {
    return this.prisma.towerRewardTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        season: {
          select: {
            seasonKey: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Selects a random quiz from the database excluding already used quiz IDs.
   * Applies floor-based difficulty weighting (Floors 1-30: foundation/conceptual,
   * Floors 31-70: intermediate mix, Floors 71-100: advanced/code-heavy) with
   * non-repeating random fallback when the question pool is smaller than the floor streak.
   */
  private async getRandomQuiz(excludeIds: string[], floor = 1) {
    const baseWhere: Prisma.QuizWhereInput =
      excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {};

    // Determine difficulty preference probability based on floor tier
    // Tier 1 (1..30): 20% code-analysis | Tier 2 (31..70): 50% code-analysis | Tier 3 (71..100): 80% code-analysis
    const codeProbability = floor <= 30 ? 0.2 : floor <= 70 ? 0.5 : 0.8;
    const preferCode = Math.random() < codeProbability;
    const tierWhere: Prisma.QuizWhereInput = {
      ...baseWhere,
      code: preferCode ? { not: null } : null,
    };

    const tierCount = await this.prisma.quiz.count({ where: tierWhere });
    if (tierCount > 0) {
      const skip = Math.floor(Math.random() * tierCount);
      const picked = await this.prisma.quiz.findFirst({
        where: tierWhere,
        skip,
        include: { options: true },
      });
      if (picked) return picked;
    }

    // Fallback 1: Any unasked quiz in the general pool
    const count = await this.prisma.quiz.count({ where: baseWhere });
    if (count > 0) {
      const skip = Math.floor(Math.random() * count);
      return this.prisma.quiz.findFirst({
        where: baseWhere,
        skip,
        include: { options: true },
      });
    }

    // Fallback 2: Pool exhausted (total quizzes in DB < floor requiredStreak).
    // Exclude only the immediately preceding question to avoid back-to-back repeats,
    // and pick a random offset across the entire pool rather than repeating index 0.
    const lastAskedId =
      excludeIds.length > 0 ? excludeIds[excludeIds.length - 1] : null;
    const cycleWhere: Prisma.QuizWhereInput = lastAskedId
      ? { id: { notIn: [lastAskedId] } }
      : {};
    const cycleCount = await this.prisma.quiz.count({ where: cycleWhere });
    if (cycleCount > 0) {
      const skip = Math.floor(Math.random() * cycleCount);
      return this.prisma.quiz.findFirst({
        where: cycleWhere,
        skip,
        include: { options: true },
      });
    }

    // Ultimate fallback when DB has only 1 quiz total
    return this.prisma.quiz.findFirst({
      include: { options: true },
    });
  }

  private buildShuffledOptionMap(
    options: { label: string }[],
  ): Record<string, string> {
    const sortedLabels = [...options]
      .map((o) => o.label.trim().toUpperCase())
      .sort((a, b) => a.localeCompare(b));
    const shuffled = [...sortedLabels];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const map: Record<string, string> = {};
    for (let i = 0; i < sortedLabels.length; i++) {
      map[sortedLabels[i]] = shuffled[i];
    }
    return map;
  }

  private parseOptionMap(raw: unknown): Record<string, string> | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) {
        result[k.trim().toUpperCase()] = v.trim().toUpperCase();
      }
    }
    return Object.keys(result).length > 0 ? result : null;
  }

  private reverseMapOptionLabel(
    optionMap: Record<string, string> | null,
    originalAnswer: string,
  ): string {
    const upper = originalAnswer.trim().toUpperCase();
    if (!optionMap) return upper;
    for (const [displayLabel, origLabel] of Object.entries(optionMap)) {
      if (origLabel === upper) return displayLabel;
    }
    return upper;
  }

  /**
   * Maps a Quiz entity to a client-safe question DTO (without the correct answer).
   * Uses opaque questionToken + shuffled option labels so answer-lookup scripts fail.
   */
  private mapQuizToQuestionDto(
    quiz: {
      id: string;
      question: string;
      code: string | null;
      imageUrl: string | null;
      options: { label: string; content: string; isCode: boolean }[];
    },
    questionNumber: number,
    requiredStreak: number,
    expiresAt: Date,
    questionToken?: string | null,
    optionMap?: Record<string, string> | null,
  ): TowerQuestionDto {
    const byOrigLabel = new Map(
      quiz.options.map((opt) => [opt.label.trim().toUpperCase(), opt]),
    );
    const mappedOptions = optionMap
      ? Object.entries(optionMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([displayLabel, origLabel]) => {
            const opt = byOrigLabel.get(origLabel);
            return opt
              ? {
                  label: displayLabel,
                  content: opt.content,
                  isCode: opt.isCode,
                }
              : null;
          })
          .filter(
            (v): v is { label: string; content: string; isCode: boolean } =>
              v !== null,
          )
      : [...quiz.options]
          .sort((a, b) => a.label.localeCompare(b.label))
          .map((opt) => ({
            label: opt.label,
            content: opt.content,
            isCode: opt.isCode,
          }));

    return {
      id: questionToken || quiz.id,
      question: quiz.question,
      code: quiz.code,
      imageUrl: quiz.imageUrl,
      options: mappedOptions,
      currentQuestionNumber: questionNumber,
      requiredStreak,
      timeLimitSeconds: TIME_LIMIT_SECONDS,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
