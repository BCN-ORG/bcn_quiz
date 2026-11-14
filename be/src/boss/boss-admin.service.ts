import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BossRewardStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';
import { cappedBossContribution } from '../xp/xp.service';
import { BossService } from './boss.service';
import type {
  BossMilestoneConfigItem,
  UpsertBossSeasonDto,
} from './dto/boss.dto';

const WEEK_KEY_RE = /^(\d{4})-W(\d{2})$/;
const MAX_TOP_PLAYERS = 50;
const MAX_PROBLEM_TX = 50;
const FALLBACK_NAME = 'Người dùng';

export type BossSeasonPhase = 'UPCOMING' | 'RUNNING' | 'ENDED';

/** Admin read/config side of the weekly boss event. Never exposes email or phone, only name and avatar. */
@Injectable()
export class BossAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bossService: BossService,
    private readonly profiles: ProfilesService,
  ) {}

  private phase(
    season: { startsAt: Date; endsAt: Date },
    now: Date,
  ): BossSeasonPhase {
    if (season.startsAt.getTime() > now.getTime()) return 'UPCOMING';
    if (season.endsAt.getTime() >= now.getTime()) return 'RUNNING';
    return 'ENDED';
  }

  private milestonesOf(value: unknown): BossMilestoneConfigItem[] {
    return Array.isArray(value) ? (value as BossMilestoneConfigItem[]) : [];
  }

  /** Date inside the given ISO week (VN noon of its Thursday); null if that week does not exist. */
  private dateInWeek(weekKey: string): Date | null {
    const match = WEEK_KEY_RE.exec(weekKey);
    if (!match) return null;
    const year = Number(match[1]);
    const week = Number(match[2]);
    if (week < 1 || week > 53) return null;
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Dow = jan4.getUTCDay() || 7;
    const week1Monday = Date.UTC(year, 0, 4 - (jan4Dow - 1));
    const thursdayNoonUtc =
      week1Monday + ((week - 1) * 7 + 3) * 86400000 + 5 * 3600000; // 12:00 VN
    const date = new Date(thursdayNoonUtc);
    return this.bossService.getWeekBoundaries(date).weekKey === weekKey
      ? date
      : null;
  }

  /** Recent + upcoming seasons with community progress. */
  async listSeasons(limit = 12) {
    const now = new Date();
    const seasons = await this.prisma.bossWeeklySeason.findMany({
      orderBy: { startsAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 52),
    });
    const stats = seasons.length
      ? await this.prisma.bossUserWeeklyStat.findMany({
          where: {
            seasonId: { in: seasons.map((s) => s.id) },
            hasParticipated: true,
          },
          select: { seasonId: true, highestScore: true },
        })
      : [];
    const bySeason = new Map<string, { score: number; players: number }>();
    for (const row of stats) {
      const cur = bySeason.get(row.seasonId) ?? { score: 0, players: 0 };
      cur.score += cappedBossContribution(row.highestScore);
      cur.players += 1;
      bySeason.set(row.seasonId, cur);
    }
    return {
      currentWeekKey: this.bossService.getWeekBoundaries(now).weekKey,
      upcomingWeekKeys: [1, 2, 3, 4].map(
        (n) =>
          this.bossService.getWeekBoundaries(
            new Date(now.getTime() + n * 7 * 86400000),
          ).weekKey,
      ),
      items: seasons.map((season) => {
        const agg = bySeason.get(season.id) ?? { score: 0, players: 0 };
        const milestones = this.milestonesOf(season.milestoneConfig);
        return {
          weekKey: season.weekKey,
          name: season.name,
          bossName: season.bossName,
          bossImageUrl: season.bossImageUrl,
          bossMaxHp: season.bossMaxHp,
          startsAt: season.startsAt.toISOString(),
          endsAt: season.endsAt.toISOString(),
          phase: this.phase(season, now),
          isSettled: season.isSettled,
          settledAt: season.settledAt?.toISOString() ?? null,
          editable: this.phase(season, now) === 'UPCOMING',
          communityScore: agg.score,
          bossCurrentHp: Math.max(0, season.bossMaxHp - agg.score),
          participants: agg.players,
          milestonesUnlocked: milestones.filter((m) => agg.score >= m.at)
            .length,
          milestonesTotal: milestones.length,
        };
      }),
    };
  }

  async getSeason(weekKey: string) {
    const season = await this.prisma.bossWeeklySeason.findUnique({
      where: { weekKey },
    });
    if (!season) throw new NotFoundException('Không tìm thấy mùa Boss');
    const now = new Date();
    const milestones = this.milestonesOf(season.milestoneConfig);

    const [{ community, milestones: milestoneStatus }, top, txGroups, problem] =
      await Promise.all([
        this.bossService.getCommunityStatus({
          id: season.id,
          bossMaxHp: season.bossMaxHp,
          milestoneConfig: milestones,
        }),
        this.prisma.bossUserWeeklyStat.findMany({
          where: { seasonId: season.id, hasParticipated: true },
          orderBy: [{ highestScore: 'desc' }, { lastPlayedAt: 'asc' }],
          take: MAX_TOP_PLAYERS,
          select: {
            userId: true,
            highestScore: true,
            bestCombo: true,
            totalAttempts: true,
            lastPlayedAt: true,
          },
        }),
        this.prisma.bossRewardTransaction.groupBy({
          by: ['status'],
          where: { seasonId: season.id },
          _count: { _all: true },
          _sum: { rewardCoins: true },
        }),
        this.prisma.bossRewardTransaction.findMany({
          where: {
            seasonId: season.id,
            status: { in: [BossRewardStatus.FAILED, BossRewardStatus.UNKNOWN] },
          },
          orderBy: { updatedAt: 'desc' },
          take: MAX_PROBLEM_TX,
          select: {
            id: true,
            userId: true,
            milestoneIndex: true,
            rewardCoins: true,
            status: true,
            retryCount: true,
            errorMessage: true,
            updatedAt: true,
          },
        }),
      ]);

    const ids = [...top.map((r) => r.userId), ...problem.map((r) => r.userId)];
    const resolved = await this.profiles.resolveUsersDetailed(ids);
    const nameOf = (id: string) =>
      resolved.users.get(id)?.fullName?.trim() || FALLBACK_NAME;

    const phase = this.phase(season, now);
    return {
      season: {
        weekKey: season.weekKey,
        name: season.name,
        bossName: season.bossName,
        bossImageUrl: season.bossImageUrl,
        bossMaxHp: season.bossMaxHp,
        startsAt: season.startsAt.toISOString(),
        endsAt: season.endsAt.toISOString(),
        phase,
        isSettled: season.isSettled,
        settledAt: season.settledAt?.toISOString() ?? null,
        editable: phase === 'UPCOMING',
        canSettle: phase === 'ENDED' && !season.isSettled,
      },
      milestoneConfig: milestones,
      community,
      milestones: milestoneStatus,
      profilesAvailable: !resolved.failed,
      topPlayers: top.map((row, index) => ({
        rank: index + 1,
        userId: row.userId,
        name: nameOf(row.userId),
        highestScore: row.highestScore,
        contribution: cappedBossContribution(row.highestScore),
        bestCombo: row.bestCombo,
        totalAttempts: row.totalAttempts,
        lastPlayedAt: row.lastPlayedAt.toISOString(),
        rewardEligible: row.highestScore >= 5,
      })),
      rewards: {
        byStatus: txGroups.map((g) => ({
          status: g.status,
          count: g._count._all,
          coins: g._sum.rewardCoins ?? 0,
        })),
        problems: problem.map((tx) => ({
          id: tx.id,
          userId: tx.userId,
          name: nameOf(tx.userId),
          milestoneIndex: tx.milestoneIndex,
          rewardCoins: tx.rewardCoins,
          status: tx.status,
          retryCount: tx.retryCount,
          errorMessage: tx.errorMessage,
          updatedAt: tx.updatedAt.toISOString(),
        })),
      },
    };
  }

  /**
   * Creates or edits the config of a season that has NOT started. A running or finished season is locked so the
   * HP, milestones and coin rewards cannot change under players mid-week.
   */
  async upsertUpcomingSeason(weekKey: string, dto: UpsertBossSeasonDto) {
    const date = this.dateInWeek(weekKey);
    if (!date) throw new BadRequestException('Mã tuần không hợp lệ');
    const bounds = this.bossService.getWeekBoundaries(date);
    const now = new Date();
    if (bounds.startsAt.getTime() <= now.getTime()) {
      throw new ConflictException(
        'Chỉ sửa được tuần chưa bắt đầu; tuần đang chạy hoặc đã qua bị khoá',
      );
    }

    const milestones = [...dto.milestones];
    for (let i = 0; i < milestones.length; i++) {
      if (milestones[i].at > dto.bossMaxHp) {
        throw new BadRequestException('Mốc rương không được vượt máu Boss');
      }
      if (i > 0 && milestones[i].at <= milestones[i - 1].at) {
        throw new BadRequestException('Các mốc rương phải tăng dần');
      }
    }
    const data = {
      name: dto.name.trim(),
      bossName: dto.bossName.trim(),
      bossImageUrl: dto.bossImageUrl?.trim() || null,
      bossMaxHp: dto.bossMaxHp,
      milestoneConfig: milestones.map((m) => ({
        at: m.at,
        coin: m.coin,
        name: m.name.trim(),
      })) as unknown as Prisma.InputJsonValue,
    };

    try {
      // Conditional on the season still being upcoming so a race with the week starting cannot edit a live season.
      const updated = await this.prisma.bossWeeklySeason.updateMany({
        where: { weekKey, startsAt: { gt: now } },
        data,
      });
      if (updated.count === 0) {
        await this.prisma.bossWeeklySeason.create({
          data: {
            ...data,
            weekKey,
            startsAt: bounds.startsAt,
            endsAt: bounds.endsAt,
            isActive: true,
            isSettled: false,
          },
        });
      }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Tuần này đã bắt đầu, không thể sửa');
      }
      throw error;
    }
    return this.getSeason(weekKey);
  }
}
