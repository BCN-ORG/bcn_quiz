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

type Mode = 'daily' | 'weekly';
type RankedRow = {
  rank: number;
  userId: string;
  score: number;
  correctCount?: number;
  totalQuestions?: number;
  durationMs?: number;
  submittedAt?: Date;
  completedDays?: number;
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
    mode: Mode,
    query: {
      date?: string;
      weekStart?: string;
      page?: number;
      limit?: number;
      search?: string;
    },
    req: Request,
    admin = false,
  ) {
    const topic = await this.prisma.topic.findUnique({
      where: { id: topicId },
      select: { id: true, name: true, slug: true },
    });
    if (!topic) throw new NotFoundException('Topic not found');
    const selectedDate = this.dateOrThrow(
      mode === 'daily' ? query.date : query.weekStart,
    );
    const start =
      mode === 'daily' ? selectedDate : businessWeekStart(selectedDate);
    const end = mode === 'daily' ? selectedDate : businessWeekEnd(selectedDate);
    const page = this.pageOrThrow(query.page, 1, 1_000_000);
    const limit = this.pageOrThrow(query.limit, 20, 100);
    const search = admin ? (query.search?.trim() ?? '') : '';
    const ranked = this.rankedQuery(topicId, mode, start, end);
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
    const enriched = await this.withUsers(
      [...rows, ...topRows, ...aroundRows, ...currentRows],
      admin,
    );
    const byRank = new Map(enriched.map((row) => [row.rank, row]));
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return {
      topic,
      mode,
      date: mode === 'daily' ? start : undefined,
      weekStart: mode === 'weekly' ? start : undefined,
      weekEnd: mode === 'weekly' ? end : undefined,
      closesAt: endOfBusinessDay(end),
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

  async resultForSubmit(
    userId: string,
    topicId: string,
    date: string,
    sessionId: string,
  ) {
    const result = await this.prisma.topicLeaderboardResult.findUnique({
      where: {
        userId_topicId_businessDate: { userId, topicId, businessDate: date },
      },
    });
    if (!result) throw new NotFoundException('Leaderboard result not found');
    const ranked = this.rankedQuery(topicId, 'daily', date, date);
    const rows = await this.prisma.$queryRaw<
      Array<{ rank: number }>
    >`${ranked} SELECT rank FROM ranked WHERE "userId" = ${userId}`;
    return {
      isOfficial: result.sessionId === sessionId,
      score: result.score,
      maxScore: 1000,
      rank: rows[0]?.rank ?? null,
      businessDate: date,
    };
  }

  async export(
    topicId: string,
    mode: Mode,
    dateValue?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const topic = await this.prisma.topic.findUnique({
      where: { id: topicId },
      select: { name: true, slug: true },
    });
    if (!topic) throw new NotFoundException('Topic not found');
    const selected = this.dateOrThrow(dateValue);
    const start = mode === 'daily' ? selected : businessWeekStart(selected);
    const end = mode === 'daily' ? selected : businessWeekEnd(selected);
    const ranked = this.rankedQuery(topicId, mode, start, end);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(mode === 'daily' ? 'Daily' : 'Weekly');
    sheet.columns = (
      mode === 'daily'
        ? [
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
          ]
        : [
            'Rank',
            'User ID',
            'Full Name',
            'Email',
            'Topic',
            'Week Start',
            'Week End',
            'Weekly Score',
            'Completed Days',
            'Total Duration (ms)',
            'Last Submitted At',
          ]
    ).map((header) => ({ header, key: header, width: 22 }));
    const rows = await this.prisma.$queryRaw<
      RankedRow[]
    >`${ranked} SELECT * FROM ranked ORDER BY rank`;
    const profiles = await this.resolveProfiles(rows.map((row) => row.userId));
    for (const row of rows) {
      const profile = profiles.get(row.userId);
      sheet.addRow(
        mode === 'daily'
          ? [
              row.rank,
              row.userId,
              profile?.fullName ?? 'Unknown',
              profile?.email ?? '',
              topic.name,
              start,
              row.score,
              row.correctCount,
              row.totalQuestions,
              row.totalQuestions
                ? (row.correctCount ?? 0) / row.totalQuestions
                : 0,
              row.durationMs,
              row.submittedAt?.toISOString(),
            ]
          : [
              row.rank,
              row.userId,
              profile?.fullName ?? 'Unknown',
              profile?.email ?? '',
              topic.name,
              start,
              end,
              row.score,
              row.completedDays,
              Number(row.totalDurationMs ?? 0),
              row.lastSubmittedAt?.toISOString(),
            ],
      );
    }
    sheet.getRow(1).font = { bold: true };
    const safeSlug =
      topic.slug
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-')
        .slice(0, 60) || topicId;
    const filename = `${mode}-leaderboard-${safeSlug}-${start}${mode === 'weekly' ? `_${end}` : ''}.xlsx`;
    return { buffer: Buffer.from(await workbook.xlsx.writeBuffer()), filename };
  }

  async weeklyRows(topicId: string, weekStart: string): Promise<RankedRow[]> {
    const start = businessWeekStart(parseBusinessDate(weekStart));
    const ranked = this.rankedQuery(
      topicId,
      'weekly',
      start,
      businessWeekEnd(start),
    );
    return this.prisma.$queryRaw<
      RankedRow[]
    >`${ranked} SELECT * FROM ranked ORDER BY rank`;
  }

  private rankedQuery(
    topicId: string,
    mode: Mode,
    start: string,
    end: string,
  ): Prisma.Sql {
    if (mode === 'daily') {
      return Prisma.sql`WITH ranked AS (
        SELECT ROW_NUMBER() OVER (ORDER BY score DESC, "durationMs" ASC, "submittedAt" ASC, "userId" ASC)::int AS rank,
          "userId", score, "correctCount", "totalQuestions", "durationMs", "submittedAt"
        FROM topic_leaderboard_results WHERE "topicId" = ${topicId} AND "businessDate" = ${start}
      )`;
    }
    return Prisma.sql`WITH totals AS (
      SELECT "userId", SUM(score)::int AS score, COUNT(*)::int AS "completedDays",
        SUM("durationMs")::bigint AS "totalDurationMs", MAX("submittedAt") AS "lastSubmittedAt"
      FROM topic_leaderboard_results
      WHERE "topicId" = ${topicId} AND "businessDate" BETWEEN ${start} AND ${end}
      GROUP BY "userId"
    ), ranked AS (
      SELECT ROW_NUMBER() OVER (ORDER BY score DESC, "completedDays" DESC, "totalDurationMs" ASC, "lastSubmittedAt" ASC, "userId" ASC)::int AS rank,
        "userId", score, "completedDays", "totalDurationMs", "lastSubmittedAt" FROM totals
    )`;
  }

  private async withUsers(rows: RankedRow[], admin: boolean) {
    const profiles = await this.resolveProfiles(rows.map((row) => row.userId));
    return rows.map((row) => {
      const profile = profiles.get(row.userId);
      const user = {
        id: row.userId,
        fullName: profile?.fullName?.trim() || 'Người dùng',
        avatarUrl: profile?.avatarUrl ?? null,
      };
      return row.completedDays === undefined
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
            completedDays: row.completedDays,
            totalDurationMs: Number(row.totalDurationMs),
            lastSubmittedAt: row.lastSubmittedAt,
          };
    });
  }

  private async resolveProfiles(ids: string[]) {
    const unique = [...new Set(ids)];
    const profiles = new Map<string, ProfilesUserSummary>();
    for (let i = 0; i < unique.length; i += 100) {
      const batch = await this.profiles.resolveUsers(unique.slice(i, i + 100));
      for (const [id, profile] of batch) profiles.set(id, profile);
    }
    return profiles;
  }

  private dateOrThrow(value?: string): string {
    try {
      return parseBusinessDate(value ?? businessDate(new Date()));
    } catch {
      throw new BadRequestException('Date must be YYYY-MM-DD');
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
