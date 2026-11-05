import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProfilesService,
  type ProfilesUserSummary,
} from '../profiles/profiles.service';
import {
  businessDate,
  businessWeekEnd,
  businessWeekStart,
  endOfBusinessDay,
  parseBusinessDate,
} from './leaderboard-rules';

type ListQuery = {
  date?: string;
  weekStart?: string;
  page?: number;
  limit?: number;
  search?: string;
};
type RankedRow = {
  rank: number;
  userId: string;
  score: number;
  correctCount?: number;
  totalQuestions?: number;
  durationMs?: number;
  submittedAt?: Date;
  topicsCompleted?: number;
  totalDurationMs?: bigint | number;
  lastSubmittedAt?: Date;
};

@Injectable()
export class LeaderboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: ProfilesService,
  ) {}

  async list(
    topicId: string,
    _mode: 'daily',
    query: ListQuery,
    req: Request,
    admin = false,
  ) {
    const topic = await this.prisma.topic.findUnique({
      where: { id: topicId },
      select: { id: true, name: true, slug: true },
    });
    if (!topic) throw new NotFoundException('Topic not found');
    const date = this.dateOrThrow(query.date);
    const ranked = this.rankedQuery(topicId, date);
    const board = await this.board(ranked, query, req, admin);
    return {
      topic,
      mode: 'daily' as const,
      date,
      closesAt: endOfBusinessDay(date),
      ...board,
    };
  }

  /**
   * The overall weekly board: one row per user, summing their official (first-ever) topic results whose business date
   * falls in the Monday-Sunday week, across every topic.
   */
  async listWeekly(query: ListQuery, req: Request, admin = false) {
    const selected = this.dateOrThrow(query.weekStart);
    const start = businessWeekStart(selected);
    const end = businessWeekEnd(selected);
    const ranked = this.weeklyRankedQuery(start, end);
    const [board, progress] = await Promise.all([
      this.board(ranked, query, req, admin),
      this.progressFor(this.userId(req)),
    ]);
    return {
      mode: 'weekly' as const,
      weekStart: start,
      weekEnd: end,
      closesAt: endOfBusinessDay(end),
      progress,
      ...board,
    };
  }

  /** How many topics the viewer has an official result for (all time) out of the topics that can be done at all. */
  private async progressFor(userId: string | null) {
    const [topicsDone, topicsTotal] = await Promise.all([
      userId
        ? this.prisma.topicLeaderboardResult.count({
            where: { userId, isCounted: true },
          })
        : Promise.resolve(0),
      this.prisma.topic.count({ where: { quizzes: { some: {} } } }),
    ]);
    return { topicsDone, topicsTotal };
  }

  private async board(
    ranked: Prisma.Sql,
    query: ListQuery,
    req: Request,
    admin: boolean,
  ) {
    const page = this.pageOrThrow(query.page, 1, 1_000_000);
    const limit = this.pageOrThrow(query.limit, 20, 100);
    const search = admin ? (query.search?.trim() ?? '') : '';
    const matchedIds = search ? await this.profiles.searchUserIds(search) : [];
    const filter = search
      ? matchedIds.length
        ? Prisma.sql`WHERE "userId" IN (${Prisma.join(matchedIds)})`
        : Prisma.sql`WHERE FALSE`
      : Prisma.empty;
    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<
        RankedRow[]
      >`${ranked} SELECT * FROM ranked ${filter} ORDER BY rank LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      this.prisma.$queryRaw<
        Array<{ total: number }>
      >`${ranked} SELECT COUNT(*)::int AS total FROM ranked ${filter}`,
    ]);
    const total = totals[0]?.total ?? 0;
    const currentUserId = this.userId(req);
    const [currentRows, topRows] = await Promise.all([
      currentUserId
        ? this.prisma.$queryRaw<
            RankedRow[]
          >`${ranked} SELECT * FROM ranked WHERE "userId" = ${currentUserId} LIMIT 1`
        : Promise.resolve([]),
      this.prisma.$queryRaw<
        RankedRow[]
      >`${ranked} SELECT * FROM ranked WHERE rank <= 10 ORDER BY rank`,
    ]);
    const current = currentRows[0] ?? null;
    const aroundRows = current
      ? await this.prisma.$queryRaw<
          RankedRow[]
        >`${ranked} SELECT * FROM ranked WHERE rank BETWEEN ${Math.max(1, current.rank - 2)} AND ${current.rank + 2} ORDER BY rank`
      : [];
    const { rows: enriched, lookupFailed } = await this.withUsers(
      [...rows, ...topRows, ...aroundRows, ...currentRows],
      admin,
    );
    const byRank = new Map(enriched.map((row) => [row.rank, row]));
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return {
      // false when Profiles could not be asked for names: the UI must not present that as anonymous users.
      profilesAvailable: !lookupFailed,
      items: rows.map((row) => byRank.get(row.rank)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
      top3: topRows.slice(0, 3).map((row) => byRank.get(row.rank)),
      top10Cutoff: topRows[9]?.score ?? null,
      currentUserRank: current?.rank ?? null,
      currentUserResult: current ? byRank.get(current.rank) : null,
      aroundMe: aroundRows.map((row) => byRank.get(row.rank)),
    };
  }

  async resultForSubmit(userId: string, topicId: string, sessionId: string) {
    // The user's one official result for the topic, whatever day it was made on. The current session is practice
    // when that result belongs to an earlier session.
    const result = await this.prisma.topicLeaderboardResult.findUnique({
      where: {
        userId_topicId_isCounted: { userId, topicId, isCounted: true },
      },
    });
    if (!result) throw new NotFoundException('Leaderboard result not found');
    const officialDate = result.businessDate;
    const ranked = this.rankedQuery(topicId, officialDate);
    const rows = await this.prisma.$queryRaw<
      Array<{ rank: number }>
    >`${ranked} SELECT rank FROM ranked WHERE "userId" = ${userId}`;
    return {
      isOfficial: result.sessionId === sessionId,
      score: result.score,
      maxScore: 1000,
      rank: rows[0]?.rank ?? null,
      businessDate: officialDate,
    };
  }

  async exportDaily(
    topicId: string,
    dateValue?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const topic = await this.prisma.topic.findUnique({
      where: { id: topicId },
      select: { name: true, slug: true },
    });
    if (!topic) throw new NotFoundException('Topic not found');
    const date = this.dateOrThrow(dateValue);
    const ranked = this.rankedQuery(topicId, date);
    const rows = await this.prisma.$queryRaw<
      RankedRow[]
    >`${ranked} SELECT * FROM ranked ORDER BY rank`;
    const { profiles } = await this.resolveProfiles(
      rows.map((row) => row.userId),
    );
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Daily');
    sheet.columns = [
      'Rank',
      'User ID',
      'Full Name',
      'Email',
      'Topic',
      'Date',
      'Score',
      'Correct Answers',
      'Total Questions',
      'Accuracy',
      'Duration (ms)',
      'Submitted At',
    ].map((header) => ({ header, key: header, width: 22 }));
    for (const row of rows) {
      const profile = profiles.get(row.userId);
      sheet.addRow([
        row.rank,
        row.userId,
        profile?.fullName ?? 'Unknown',
        profile?.email ?? '',
        topic.name,
        date,
        row.score,
        row.correctCount,
        row.totalQuestions,
        row.totalQuestions ? (row.correctCount ?? 0) / row.totalQuestions : 0,
        row.durationMs,
        row.submittedAt?.toISOString(),
      ]);
    }
    sheet.getRow(1).font = { bold: true };
    const safeSlug =
      topic.slug
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-')
        .slice(0, 60) || topicId;
    return {
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      filename: `daily-leaderboard-${safeSlug}-${date}.xlsx`,
    };
  }

  async exportWeekly(
    weekStartValue?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const selected = this.dateOrThrow(weekStartValue);
    const start = businessWeekStart(selected);
    const end = businessWeekEnd(selected);
    const rows = await this.weeklyRows(start);
    const { profiles } = await this.resolveProfiles(
      rows.map((row) => row.userId),
    );
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Weekly');
    sheet.columns = [
      'Rank',
      'User ID',
      'Full Name',
      'Email',
      'Week Start',
      'Week End',
      'Weekly Score',
      'Topics Completed',
      'Total Duration (ms)',
      'Last Submitted At',
    ].map((header) => ({ header, key: header, width: 22 }));
    for (const row of rows) {
      const profile = profiles.get(row.userId);
      sheet.addRow([
        row.rank,
        row.userId,
        profile?.fullName ?? 'Unknown',
        profile?.email ?? '',
        start,
        end,
        row.score,
        row.topicsCompleted,
        Number(row.totalDurationMs ?? 0),
        row.lastSubmittedAt?.toISOString(),
      ]);
    }
    sheet.getRow(1).font = { bold: true };
    return {
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      filename: `weekly-leaderboard-${start}_${end}.xlsx`,
    };
  }

  /** Every ranked row of the overall weekly board (used by the export and the weekly notifications). */
  async weeklyRows(weekStart: string): Promise<RankedRow[]> {
    const start = businessWeekStart(parseBusinessDate(weekStart));
    const ranked = this.weeklyRankedQuery(start, businessWeekEnd(start));
    return this.prisma.$queryRaw<
      RankedRow[]
    >`${ranked} SELECT * FROM ranked ORDER BY rank`;
  }

  private rankedQuery(topicId: string, start: string): Prisma.Sql {
    return Prisma.sql`WITH ranked AS (
        SELECT ROW_NUMBER() OVER (ORDER BY score DESC, "durationMs" ASC, "submittedAt" ASC, "userId" ASC)::int AS rank,
          "userId", score, "correctCount", "totalQuestions", "durationMs", "submittedAt"
        FROM topic_leaderboard_results WHERE "topicId" = ${topicId} AND "businessDate" = ${start} AND "isCounted" IS TRUE
      )`;
  }

  private weeklyRankedQuery(start: string, end: string): Prisma.Sql {
    return Prisma.sql`WITH totals AS (
      SELECT "userId", SUM(score)::int AS score, COUNT(*)::int AS "topicsCompleted",
        SUM("durationMs")::bigint AS "totalDurationMs", MAX("submittedAt") AS "lastSubmittedAt"
      FROM topic_leaderboard_results
      WHERE "businessDate" BETWEEN ${start} AND ${end} AND "isCounted" IS TRUE
      GROUP BY "userId"
    ), ranked AS (
      SELECT ROW_NUMBER() OVER (ORDER BY score DESC, "topicsCompleted" DESC, "totalDurationMs" ASC, "lastSubmittedAt" ASC, "userId" ASC)::int AS rank,
        "userId", score, "topicsCompleted", "totalDurationMs", "lastSubmittedAt" FROM totals
    )`;
  }

  private async withUsers(rows: RankedRow[], admin: boolean) {
    const { profiles, failed } = await this.resolveProfiles(
      rows.map((row) => row.userId),
    );
    const mapped = rows.map((row) => {
      const profile = profiles.get(row.userId);
      const user = {
        id: row.userId,
        fullName: profile?.fullName?.trim() || 'Người dùng',
        avatarUrl: profile?.avatarUrl ?? null,
      };
      return row.topicsCompleted === undefined
        ? {
            rank: row.rank,
            user,
            ...(admin ? { email: profile?.email ?? null } : {}),
            score: row.score,
            correctCount: row.correctCount,
            totalQuestions: row.totalQuestions,
            accuracy: row.totalQuestions
              ? (row.correctCount ?? 0) / row.totalQuestions
              : 0,
            durationMs: row.durationMs,
            submittedAt: row.submittedAt,
          }
        : {
            rank: row.rank,
            user,
            ...(admin ? { email: profile?.email ?? null } : {}),
            weeklyScore: row.score,
            topicsCompleted: row.topicsCompleted,
            totalDurationMs: Number(row.totalDurationMs),
            lastSubmittedAt: row.lastSubmittedAt,
          };
    });
    return { rows: mapped, lookupFailed: failed };
  }

  private async resolveProfiles(ids: string[]) {
    const unique = [...new Set(ids)];
    const profiles = new Map<string, ProfilesUserSummary>();
    let failed = false;
    for (let i = 0; i < unique.length; i += 100) {
      const batch = await this.profiles.resolveUsersDetailed(
        unique.slice(i, i + 100),
      );
      if (batch.failed) failed = true;
      for (const [id, profile] of batch.users) profiles.set(id, profile);
    }
    return { profiles, failed };
  }

  private dateOrThrow(value?: string): string {
    try {
      const date = parseBusinessDate(value ?? businessDate(new Date()));
      // Week maths on the very first/last year produces dates the rest of the code rejects (a 500): refuse them here.
      const year = Number(date.slice(0, 4));
      if (year < 2000 || year > 2099) throw new Error('out of range');
      return date;
    } catch {
      throw new BadRequestException('Date must be YYYY-MM-DD, years 2000-2099');
    }
  }

  private pageOrThrow(
    value: number | undefined,
    fallback: number,
    max: number,
  ): number {
    const result = value ?? fallback;
    if (!Number.isInteger(result) || result < 1 || result > max)
      throw new BadRequestException('Invalid pagination');
    return result;
  }

  private userId(req: Request): string | null {
    const user = (req as Request & { user?: { id?: string; sub?: string } })
      .user;
    return user?.id ?? user?.sub ?? null;
  }
}
