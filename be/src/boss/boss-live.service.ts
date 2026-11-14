import { Injectable, Logger } from '@nestjs/common';
import { BossSessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProfilesService,
  type ProfilesUserSummary,
} from '../profiles/profiles.service';
import {
  BOSS_DEFAULT_MAX_HP,
  BossService,
  DEFAULT_MILESTONES,
} from './boss.service';
import type {
  BossLiveDto,
  BossLiveFighterDto,
  BossLiveHitDto,
} from './dto/boss.dto';

export const BOSS_LIVE_CACHE_TTL_MS = 10_000;
export const BOSS_LIVE_MAX_FIGHTERS = 12;
export const BOSS_LIVE_MAX_RECENT_HITS = 8;
const FALLBACK_NAME = 'Người dùng';

type FighterRow = { id: string; userId: string; score: number; combo: number };
type HitRow = {
  id: string;
  userId: string;
  score: number;
  maxCombo: number;
  endedAt: Date | null;
};

/** Global (same for everyone) part of the payload; user ids stay server-side. */
type Snapshot = {
  weekKey: string;
  at: number;
  serverTime: string;
  community: BossLiveDto['community'];
  milestones: BossLiveDto['milestones'];
  fightingNow: number;
  fighters: FighterRow[];
  hits: HitRow[];
  profiles: Map<string, ProfilesUserSummary>;
};

/**
 * "Fighting together" feed. Read-only on purpose: unlike getOverview it neither finalizes sessions nor creates the season, so the client may
 * poll it during combat. One snapshot is shared by every viewer for BOSS_LIVE_CACHE_TTL_MS and concurrent cache
 * misses wait on a single in-flight build, so N viewers cost one DB + Profiles round, not N.
 */
@Injectable()
export class BossLiveService {
  private readonly logger = new Logger(BossLiveService.name);
  private cache: Snapshot | null = null;
  private inflight: Promise<Snapshot> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: ProfilesService,
    private readonly bossService: BossService,
  ) {}

  async getLive(userId: string): Promise<BossLiveDto> {
    const snapshot = await this.getSnapshot();
    const nameOf = (id: string) =>
      snapshot.profiles.get(id)?.fullName?.trim() || FALLBACK_NAME;
    const avatarOf = (id: string) =>
      snapshot.profiles.get(id)?.avatarUrl ?? null;

    const fighters: BossLiveFighterDto[] = snapshot.fighters.map((row) => ({
      sessionId: row.id,
      name: nameOf(row.userId),
      avatarUrl: avatarOf(row.userId),
      score: row.score,
      combo: row.combo,
      isYou: row.userId === userId,
    }));
    const recentHits: BossLiveHitDto[] = snapshot.hits.map((row) => ({
      sessionId: row.id,
      name: nameOf(row.userId),
      avatarUrl: avatarOf(row.userId),
      score: row.score,
      maxCombo: row.maxCombo,
      endedAt: (row.endedAt ?? new Date(snapshot.at)).toISOString(),
      isYou: row.userId === userId,
    }));

    return {
      serverTime: snapshot.serverTime,
      community: snapshot.community,
      milestones: snapshot.milestones,
      fightingNow: snapshot.fightingNow,
      fighters,
      recentHits,
    };
  }

  private async getSnapshot(): Promise<Snapshot> {
    const now = Date.now();
    const { weekKey } = this.bossService.getWeekBoundaries(new Date(now));
    if (
      this.cache &&
      this.cache.weekKey === weekKey &&
      now - this.cache.at < BOSS_LIVE_CACHE_TTL_MS
    ) {
      return this.cache;
    }
    if (!this.inflight) {
      this.inflight = this.buildSnapshot(weekKey).then(
        (snapshot) => {
          this.cache = snapshot;
          this.inflight = null;
          return snapshot;
        },
        (error: unknown) => {
          this.inflight = null;
          throw error;
        },
      );
    }
    return this.inflight;
  }

  private async buildSnapshot(weekKey: string): Promise<Snapshot> {
    const now = new Date();
    // Read-only: a week nobody has opened yet shows an empty boss instead of creating the season row here.
    const season = await this.bossService.findCurrentSeason();
    if (!season) {
      return {
        weekKey,
        at: now.getTime(),
        serverTime: now.toISOString(),
        community: {
          communityScore: 0,
          bossCurrentHp: BOSS_DEFAULT_MAX_HP,
          bossHpPercent: 100,
          totalParticipants: 0,
        },
        milestones: DEFAULT_MILESTONES.map((m, idx) => ({
          index: idx + 1,
          at: m.at,
          coin: m.coin,
          name: m.name,
          unlocked: false,
        })),
        fightingNow: 0,
        fighters: [],
        hits: [],
        profiles: new Map(),
      };
    }
    const { community, milestones } =
      await this.bossService.getCommunityStatus(season);

    const [fightingNow, fighters, hits] = await Promise.all([
      this.prisma.bossBattleSession.count({
        where: {
          seasonId: season.id,
          status: BossSessionStatus.IN_PROGRESS,
          expiresAt: { gt: now },
        },
      }),
      this.prisma.bossBattleSession.findMany({
        where: {
          seasonId: season.id,
          status: BossSessionStatus.IN_PROGRESS,
          expiresAt: { gt: now },
        },
        orderBy: { updatedAt: 'desc' },
        take: BOSS_LIVE_MAX_FIGHTERS,
        select: { id: true, userId: true, score: true, combo: true },
      }),
      this.prisma.bossBattleSession.findMany({
        where: {
          seasonId: season.id,
          status: {
            in: [BossSessionStatus.COMPLETED, BossSessionStatus.ABANDONED],
          },
          score: { gt: 0 },
        },
        orderBy: { endedAt: 'desc' },
        take: BOSS_LIVE_MAX_RECENT_HITS,
        select: {
          id: true,
          userId: true,
          score: true,
          maxCombo: true,
          endedAt: true,
        },
      }),
    ]);

    // A Profiles failure only costs names: the feed still renders with the fallback.
    let profiles = new Map<string, ProfilesUserSummary>();
    try {
      const ids = [...fighters, ...hits].map((row) => row.userId);
      profiles = (await this.profiles.resolveUsersDetailed(ids)).users;
    } catch (error) {
      this.logger.warn(
        `[BossLive] profile lookup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return {
      weekKey,
      at: now.getTime(),
      serverTime: now.toISOString(),
      community,
      milestones,
      fightingNow,
      fighters,
      hits,
      profiles,
    };
  }
}
