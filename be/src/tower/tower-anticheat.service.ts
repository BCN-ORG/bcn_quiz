import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { DiscordWebhookService } from '../discord-webhook/discord-webhook.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';

export interface TowerAnswerClientMeta {
  ip?: string;
  userAgent?: string;
  isTrusted?: boolean;
  webdriver?: boolean;
}

export interface AntiCheatEvaluationResult {
  rejectedAsSuperhuman: boolean;
  autoBlocked: boolean;
  nextTimingsMs: number[];
  addedSuspicion: number;
}

const DEFAULT_MIN_THINK_MS = 450;
const FAST_STREAK_THRESHOLD_MS = 900;
const FAST_STREAK_COUNT = 5;
const CADENCE_MIN_SAMPLES = 8;
const CADENCE_MAX_STDDEV_MS = 70;
const AUTO_BLOCK_SCORE = 100;

@Injectable()
export class TowerAntiCheatService {
  private readonly logger = new Logger(TowerAntiCheatService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly profilesService?: ProfilesService,
    @Optional() private readonly discordWebhook?: DiscordWebhookService,
  ) {}

  getMinThinkMs(): number {
    const raw = process.env.TOWER_MIN_THINK_MS;
    if (raw !== undefined && raw.trim() !== '') {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    return DEFAULT_MIN_THINK_MS;
  }

  /**
   * Evaluates a single Tower answer using server-measured elapsed time
   * plus optional client interaction signals. Never trusts client clock.
   */
  async evaluateAnswer(params: {
    userId: string;
    seasonId: string;
    progressId: string;
    currentSuspicionScore: number;
    attemptId: string;
    floor: number;
    serverResponseMs: number;
    previousTimingsMs: number[];
    isExplicitTimeout: boolean;
    meta?: TowerAnswerClientMeta;
  }): Promise<AntiCheatEvaluationResult> {
    const nextTimingsMs = params.isExplicitTimeout
      ? params.previousTimingsMs
      : [...params.previousTimingsMs.slice(-99), params.serverResponseMs];

    if (params.isExplicitTimeout) {
      return {
        rejectedAsSuperhuman: false,
        autoBlocked: false,
        nextTimingsMs,
        addedSuspicion: 0,
      };
    }

    const events: Array<{
      ruleCode: string;
      severity: 'MEDIUM' | 'HIGH' | 'CRITICAL';
      points: number;
      details: Record<string, unknown>;
    }> = [];

    const minThinkMs = this.getMinThinkMs();
    let rejectedAsSuperhuman = false;

    // Rule 1: Superhuman answer speed measured strictly on server
    if (minThinkMs > 0 && params.serverResponseMs < minThinkMs) {
      rejectedAsSuperhuman = true;
      events.push({
        ruleCode: 'SUPERHUMAN_SPEED',
        severity: 'CRITICAL',
        points: 30,
        details: {
          serverResponseMs: params.serverResponseMs,
          minThinkMs,
          floor: params.floor,
        },
      });
    }

    // Rule 2: Untrusted synthetic click or navigator.webdriver flag
    if (params.meta?.isTrusted === false || params.meta?.webdriver === true) {
      events.push({
        ruleCode: 'UNTRUSTED_CLIENT',
        severity: 'HIGH',
        points: 40,
        details: {
          isTrusted: params.meta.isTrusted ?? null,
          webdriver: params.meta.webdriver ?? null,
          floor: params.floor,
        },
      });
    }

    // Rule 3: Sustained fast streak (5 consecutive answers < 900ms)
    if (nextTimingsMs.length >= FAST_STREAK_COUNT) {
      const tail = nextTimingsMs.slice(-FAST_STREAK_COUNT);
      if (tail.every((ms) => ms < FAST_STREAK_THRESHOLD_MS)) {
        events.push({
          ruleCode: 'FAST_STREAK',
          severity: 'HIGH',
          points: 30,
          details: { recentTimingsMs: tail, floor: params.floor },
        });
      }
    }

    // Rule 4: Robotic cadence (very low variance over >= 8 answers, catches fixed sleep bots)
    if (nextTimingsMs.length >= CADENCE_MIN_SAMPLES) {
      const window = nextTimingsMs.slice(-CADENCE_MIN_SAMPLES);
      const mean = window.reduce((a, b) => a + b, 0) / window.length;
      const variance =
        window.reduce((acc, v) => acc + (v - mean) ** 2, 0) / window.length;
      const stddev = Math.sqrt(variance);
      if (stddev < CADENCE_MAX_STDDEV_MS && mean < 4500) {
        events.push({
          ruleCode: 'ROBOTIC_CADENCE',
          severity: 'HIGH',
          points: 35,
          details: {
            meanMs: Math.round(mean),
            stddevMs: Math.round(stddev),
            window,
            floor: params.floor,
          },
        });
      }
    }

    if (events.length === 0) {
      return {
        rejectedAsSuperhuman: false,
        autoBlocked: false,
        nextTimingsMs,
        addedSuspicion: 0,
      };
    }

    const addedSuspicion = events.reduce((sum, e) => sum + e.points, 0);

    await Promise.all(
      events.map((e) =>
        this.prisma.towerAntiCheatEvent
          .create({
            data: {
              userId: params.userId,
              seasonId: params.seasonId,
              attemptId: params.attemptId,
              floor: params.floor,
              ruleCode: e.ruleCode,
              severity: e.severity,
              serverResponseMs: params.serverResponseMs,
              ip: params.meta?.ip?.slice(0, 64) || null,
              userAgent: params.meta?.userAgent?.slice(0, 300) || null,
              details: e.details as never,
            },
          })
          .catch(() => undefined),
      ),
    );

    const updatedProgress = await this.prisma.towerUserProgress
      .update({
        where: { id: params.progressId },
        data: { suspicionScore: { increment: addedSuspicion } },
        select: { suspicionScore: true },
      })
      .catch(() => null);

    const nextScore =
      updatedProgress?.suspicionScore ??
      params.currentSuspicionScore + addedSuspicion;
    const autoBlocked = nextScore >= AUTO_BLOCK_SCORE;

    if (autoBlocked) {
      await this.prisma.towerUserProgress
        .update({
          where: { id: params.progressId },
          data: {
            isBlocked: true,
            blockedAt: new Date(),
            blockedReason: `Hệ thống tự động khóa do phát hiện dấu hiệu bot/click bất thường (${events.map((e) => e.ruleCode).join(', ')}).`,
          },
        })
        .catch(() => undefined);

      await this.prisma.towerFloorAttempt
        .updateMany({
          where: { id: params.attemptId, status: 'IN_PROGRESS' },
          data: { status: 'FAILED', failedReason: 'ANTICHEAT_BLOCKED' },
        })
        .catch(() => undefined);

      this.logger.warn(
        `[TowerAntiCheat] Auto-blocked userId=${params.userId} floor=${params.floor} score=${nextScore}`,
      );
      if (this.discordWebhook) {
        void this.discordWebhook.sendAnnouncement({
          title: 'Cảnh báo Anti-Cheat Leo Tháp',
          description: `Tài khoản \`${params.userId}\` vừa bị tự động khóa Leo Tháp tại **Tầng ${params.floor}** (Điểm nghi vấn: **${nextScore}**, Quy tắc: ${events.map((e) => e.ruleCode).join(', ')}).`,
          color: 0xf43f5e,
        });
      }
    }

    return {
      rejectedAsSuperhuman,
      autoBlocked,
      nextTimingsMs,
      addedSuspicion,
    };
  }

  assertNotBlocked(progress: {
    isBlocked?: boolean;
    blockedReason?: string | null;
  }): void {
    if (progress.isBlocked) {
      throw new ForbiddenException(
        progress.blockedReason ||
          'Tài khoản của bạn tạm thời bị khóa tính năng Leo Tháp do phát hiện hoạt động bất thường. Vui lòng liên hệ Ban Quản Trị.',
      );
    }
  }

  // --------------------------------------------------------------------------
  // ADMIN ANTI-CHEAT DASHBOARD (INCLUDES HISTORICAL FORENSICS!)
  // --------------------------------------------------------------------------

  async getAdminOverview(seasonId: string) {
    const [progresses, attempts, recentEvents] = await Promise.all([
      this.prisma.towerUserProgress.findMany({
        where: { seasonId },
        orderBy: [
          { isBlocked: 'desc' },
          { suspicionScore: 'desc' },
          { highestCompletedFloor: 'desc' },
        ],
        take: 100,
      }),
      this.prisma.towerFloorAttempt.findMany({
        where: { seasonId },
        select: {
          userId: true,
          floor: true,
          requiredStreak: true,
          status: true,
          startedAt: true,
          completedAt: true,
        },
      }),
      this.prisma.towerAntiCheatEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    // Aggregate per-user historical timing stats from tower_floor_attempts
    const statsByUser = new Map<
      string,
      {
        completedFloors: number;
        failedFloors: number;
        secPerQSum: number;
        secPerQCount: number;
        fastestSecPerQ: number | null;
      }
    >();

    for (const a of attempts) {
      let entry = statsByUser.get(a.userId);
      if (!entry) {
        entry = {
          completedFloors: 0,
          failedFloors: 0,
          secPerQSum: 0,
          secPerQCount: 0,
          fastestSecPerQ: null,
        };
        statsByUser.set(a.userId, entry);
      }
      if (a.status === 'COMPLETED') {
        entry.completedFloors += 1;
        if (a.completedAt && a.requiredStreak > 0) {
          const secPerQ =
            Math.max(0, a.completedAt.getTime() - a.startedAt.getTime()) /
            1000 /
            a.requiredStreak;
          entry.secPerQSum += secPerQ;
          entry.secPerQCount += 1;
          if (entry.fastestSecPerQ === null || secPerQ < entry.fastestSecPerQ) {
            entry.fastestSecPerQ = secPerQ;
          }
        }
      } else if (a.status === 'FAILED') {
        entry.failedFloors += 1;
      }
    }

    const userIds = Array.from(
      new Set([
        ...progresses.map((p) => p.userId),
        ...recentEvents.map((e) => e.userId).filter((id) => id !== 'anonymous'),
      ]),
    );
    const profiles =
      this.profilesService && userIds.length > 0
        ? await this.profilesService
            .resolveUsers(userIds)
            .catch(() => new Map())
        : new Map();

    const climbers = progresses.map((p) => {
      const st = statsByUser.get(p.userId);
      const avgSecPerQ =
        st && st.secPerQCount > 0
          ? Number((st.secPerQSum / st.secPerQCount).toFixed(2))
          : null;
      const fastestSecPerQ =
        st?.fastestSecPerQ !== null && st?.fastestSecPerQ !== undefined
          ? Number(st.fastestSecPerQ.toFixed(2))
          : null;
      const completedFloors = st?.completedFloors ?? 0;
      const failedFloors = st?.failedFloors ?? 0;

      // Historical heuristic flag (catches existing suspicious climbers like floor 100!)
      const historicalSuspicious =
        (avgSecPerQ !== null && avgSecPerQ < 1.2 && completedFloors >= 5) ||
        (completedFloors >= 25 && failedFloors === 0) ||
        p.suspicionScore >= 40;

      const prof = profiles.get(p.userId) as
        { fullName?: string | null; email?: string | null } | undefined;

      return {
        userId: p.userId,
        fullName: prof?.fullName ?? null,
        email: prof?.email ?? null,
        currentFloor: p.currentFloor,
        highestCompletedFloor: p.highestCompletedFloor,
        completedFloors,
        failedFloors,
        avgSecPerQ,
        fastestSecPerQ,
        suspicionScore: p.suspicionScore,
        isBlocked: p.isBlocked,
        blockedReason: p.blockedReason,
        blockedAt: p.blockedAt?.toISOString() ?? null,
        flagged: p.isBlocked || historicalSuspicious,
      };
    });

    // Sort flagged/blocked users to the top
    climbers.sort((a, b) => {
      if (a.isBlocked !== b.isBlocked) return a.isBlocked ? -1 : 1;
      if (a.flagged !== b.flagged) return a.flagged ? -1 : 1;
      if (b.suspicionScore !== a.suspicionScore) {
        return b.suspicionScore - a.suspicionScore;
      }
      return b.highestCompletedFloor - a.highestCompletedFloor;
    });

    return {
      summary: {
        blockedCount: climbers.filter((c) => c.isBlocked).length,
        flaggedCount: climbers.filter((c) => c.flagged && !c.isBlocked).length,
        totalEvents: recentEvents.length,
        trackedClimbers: climbers.length,
      },
      climbers,
      recentEvents: recentEvents.map((e) => {
        const prof = profiles.get(e.userId) as
          { fullName?: string | null } | undefined;
        return {
          id: e.id,
          userId: e.userId,
          fullName: prof?.fullName ?? e.userId,
          floor: e.floor,
          ruleCode: e.ruleCode,
          severity: e.severity,
          serverResponseMs: e.serverResponseMs,
          ip: e.ip,
          userAgent: e.userAgent,
          createdAt: e.createdAt.toISOString(),
        };
      }),
    };
  }

  async blockUser(seasonId: string, userId: string, reason?: string) {
    const cleanId = typeof userId === 'string' ? userId.trim() : '';
    if (!cleanId) throw new BadRequestException('Thiếu userId.');
    const safeReason =
      typeof reason === 'string' && reason.trim().length > 0
        ? reason.trim().slice(0, 300)
        : 'Bị khóa bởi quản trị viên do phát hiện gian lận / dùng bot Leo Tháp.';

    const updated = await this.prisma.towerUserProgress.upsert({
      where: { userId_seasonId: { userId: cleanId, seasonId } },
      update: {
        isBlocked: true,
        blockedAt: new Date(),
        blockedReason: safeReason,
      },
      create: {
        userId: cleanId,
        seasonId,
        currentFloor: 1,
        highestCompletedFloor: 0,
        isBlocked: true,
        blockedAt: new Date(),
        blockedReason: safeReason,
      },
    });

    await this.prisma.towerFloorAttempt.updateMany({
      where: { userId: cleanId, seasonId, status: 'IN_PROGRESS' },
      data: { status: 'FAILED', failedReason: 'ADMIN_BLOCKED' },
    });

    return { userId: cleanId, isBlocked: updated.isBlocked };
  }

  async unblockUser(seasonId: string, userId: string) {
    const cleanId = typeof userId === 'string' ? userId.trim() : '';
    if (!cleanId) throw new BadRequestException('Thiếu userId.');
    const existing = await this.prisma.towerUserProgress.findUnique({
      where: { userId_seasonId: { userId: cleanId, seasonId } },
    });
    if (!existing) {
      throw new NotFoundException(
        'Không tìm thấy tiến độ Leo Tháp của học viên.',
      );
    }

    await this.prisma.towerUserProgress.update({
      where: { id: existing.id },
      data: {
        isBlocked: false,
        blockedAt: null,
        blockedReason: null,
        suspicionScore: 0,
      },
    });

    return { userId: cleanId, isBlocked: false };
  }

  async resetUserFloor(seasonId: string, userId: string, targetFloor = 1) {
    const cleanId = typeof userId === 'string' ? userId.trim() : '';
    if (!cleanId) throw new BadRequestException('Thiếu userId.');
    const floor = Number.isFinite(targetFloor)
      ? Math.min(100, Math.max(1, Math.floor(targetFloor)))
      : 1;

    const existing = await this.prisma.towerUserProgress.findUnique({
      where: { userId_seasonId: { userId: cleanId, seasonId } },
    });
    if (!existing) {
      throw new NotFoundException(
        'Không tìm thấy tiến độ Leo Tháp của học viên.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.towerFloorAttempt.updateMany({
        where: { userId: cleanId, seasonId, status: 'IN_PROGRESS' },
        data: { status: 'FAILED', failedReason: 'ADMIN_RESET' },
      }),
      this.prisma.towerUserProgress.update({
        where: { id: existing.id },
        data: {
          currentFloor: floor,
          highestCompletedFloor: Math.max(0, floor - 1),
          cooldownUntil: null,
          suspicionScore: 0,
        },
      }),
    ]);

    return { userId: cleanId, currentFloor: floor };
  }
}
