import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Notification,
  NotificationType,
  Prisma,
  TopicLeaderboardResult,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationRealtimeService } from './notification-realtime.service';

type Boundary = { rank: number; userId: string };
type RankRow = { rank: number; userId: string };

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: NotificationRealtimeService,
  ) {}

  async captureBoundary(
    tx: Prisma.TransactionClient,
    topicId: string,
    date: string,
  ): Promise<Boundary[]> {
    return tx.$queryRaw<Boundary[]>`
      SELECT rank, "userId" FROM (
        SELECT ROW_NUMBER() OVER (ORDER BY score DESC, "durationMs" ASC, "submittedAt" ASC, "userId" ASC)::int AS rank, "userId"
        FROM topic_leaderboard_results
        WHERE "topicId" = ${topicId} AND "businessDate" = ${date}
      ) ranked WHERE rank IN (3, 10)`;
  }

  async recordOfficial(
    tx: Prisma.TransactionClient,
    result: TopicLeaderboardResult,
    topicName: string,
    before: Boundary[],
  ): Promise<Notification[]> {
    const watched = [result.userId, ...before.map((row) => row.userId)];
    const after = await tx.$queryRaw<RankRow[]>`
      SELECT rank, "userId" FROM (
        SELECT ROW_NUMBER() OVER (ORDER BY score DESC, "durationMs" ASC, "submittedAt" ASC, "userId" ASC)::int AS rank, "userId"
        FROM topic_leaderboard_results
        WHERE "topicId" = ${result.topicId} AND "businessDate" = ${result.businessDate}
      ) ranked WHERE "userId" IN (${Prisma.join(watched)})`;
    const ranks = new Map(after.map((row) => [row.userId, row.rank]));
    const rank = ranks.get(result.userId)!;
    const points = result.score.toLocaleString('en-US');
    const type =
      rank <= 3
        ? NotificationType.LEADERBOARD_TOP3
        : rank <= 10
          ? NotificationType.LEADERBOARD_TOP10
          : NotificationType.LEADERBOARD_RESULT;
    const main = {
      [NotificationType.LEADERBOARD_TOP3]: {
        title: 'Bạn đang ở Top 3!',
        message: `Bạn đạt ${points} điểm và hiện đang đứng #${rank} trong ${topicName}.`,
      },
      [NotificationType.LEADERBOARD_TOP10]: {
        title: 'Bạn đã vào Top 10!',
        message: `Bạn đang đứng #${rank} với ${points} điểm trong ${topicName}.`,
      },
      [NotificationType.LEADERBOARD_RESULT]: {
        title: 'Kết quả đã được ghi nhận',
        message: `Bạn đạt ${points} điểm và hiện đang xếp hạng #${rank} trong ${topicName}.`,
      },
    }[type];
    const data: Prisma.NotificationCreateManyInput[] = [
      {
        userId: result.userId,
        type,
        ...main,
        topicId: result.topicId,
        leaderboardResultId: result.id,
        businessDate: result.businessDate,
        dedupKey: `result:${result.userId}:${result.topicId}:${result.businessDate}`,
      },
    ];
    for (const old of before) {
      const current = ranks.get(old.userId);
      if (!current || current <= old.rank) continue;
      data.push({
        userId: old.userId,
        type: NotificationType.LEADERBOARD_RANK_DROPPED,
        title: old.rank === 3 ? 'Bạn vừa rời Top 3' : 'Bạn vừa rời Top 10',
        message: `Bạn hiện đang đứng #${current} trong ${topicName}.`,
        topicId: result.topicId,
        businessDate: result.businessDate,
        dedupKey: `drop-top${old.rank}:${old.userId}:${result.topicId}:${result.businessDate}`,
      });
    }
    return tx.notification.createManyAndReturn({ data, skipDuplicates: true });
  }

  async publishCreated(rows: Notification[]): Promise<void> {
    if (!rows.length) return;
    try {
      const unread = await this.prisma.notification.groupBy({
        by: ['userId'],
        where: {
          userId: { in: [...new Set(rows.map((row) => row.userId))] },
          isRead: false,
        },
        _count: { _all: true },
      });
      const counts = new Map(
        unread.map((row) => [row.userId, row._count._all]),
      );
      for (const row of rows) {
        this.realtime.publish(row.userId, {
          notification: this.publicRow(row),
          unreadCount: counts.get(row.userId) ?? 0,
        });
      }
    } catch (error) {
      this.logger.warn(
        `Notification SSE publish failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async list(userId: string, page: number, limit: number, unreadOnly: boolean) {
    const where = { userId, ...(unreadOnly ? { isRead: false } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return {
      items: rows.map((row) => this.publicRow(row)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  unreadCount(userId: string) {
    return this.prisma.notification
      .count({ where: { userId, isRead: false } })
      .then((count) => ({ count }));
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    const row = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException('Notification not found');
    return this.publicRow(row);
  }

  async markAllRead(userId: string) {
    const updated = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: updated.count };
  }

  publicRow(row: Notification) {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      topicId: row.topicId,
      businessDate: row.businessDate,
      weekStart: row.weekStart,
      isRead: row.isRead,
      readAt: row.readAt,
      createdAt: row.createdAt,
    };
  }
}
