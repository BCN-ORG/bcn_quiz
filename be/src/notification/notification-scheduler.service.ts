import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationType, Prisma } from '@prisma/client';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import {
  businessDate,
  businessWeekEnd,
  businessWeekStart,
} from '../leaderboard/leaderboard-rules';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';
import { isTopicWindowOpen } from '../topic/topic-schedule';
import { NotificationService } from './notification.service';

export const MAX_DAILY_REMINDERS_PER_USER = 2;

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: ProfilesService,
    private readonly leaderboard: LeaderboardService,
    private readonly notifications: NotificationService,
  ) {}

  @Cron('0 19 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async dailyReminder(): Promise<void> {
    try {
      await this.runDailyReminders();
    } catch (error) {
      this.logger.error('Daily reminder failed', error);
    }
  }

  async runDailyReminders(now = new Date()): Promise<void> {
    const date = businessDate(now);
    const topics = (
      await this.prisma.topic.findMany({
        select: {
          id: true,
          name: true,
          startsAt: true,
          endsAt: true,
          _count: { select: { quizzes: true } },
        },
        orderBy: { createdAt: 'asc' },
      })
    ).filter(
      (topic) => topic._count.quizzes > 0 && isTopicWindowOpen(topic, now),
    );
    if (!topics.length) return;
    for (let page = 1; ; page += 1) {
      const { userIds, total } = await this.profiles.eligibleUserIds(page);
      if (!userIds.length) return;
      const [official, completedProgress, existing] = await Promise.all([
        this.prisma.topicLeaderboardResult.findMany({
          where: {
            userId: { in: userIds },
            topicId: { in: topics.map((topic) => topic.id) },
            businessDate: date,
          },
          select: { userId: true, topicId: true },
        }),
        this.prisma.topicProgress.findMany({
          where: {
            userId: { in: userIds },
            topicId: { in: topics.map((topic) => topic.id) },
            isCompleted: true,
          },
          select: { userId: true, topicId: true },
        }),
        this.prisma.notification.findMany({
          where: {
            userId: { in: userIds },
            type: NotificationType.DAILY_REMINDER,
            businessDate: date,
          },
          select: { userId: true },
        }),
      ]);
      const completed = new Set(
        [...official, ...completedProgress].map(
          (row) => `${row.userId}:${row.topicId}`,
        ),
      );
      const counts = new Map<string, number>();
      for (const row of existing) {
        counts.set(row.userId, (counts.get(row.userId) ?? 0) + 1);
      }
      const data: Prisma.NotificationCreateManyInput[] = [];
      for (const userId of userIds) {
        for (const topic of topics) {
          if ((counts.get(userId) ?? 0) >= MAX_DAILY_REMINDERS_PER_USER) break;
          if (completed.has(`${userId}:${topic.id}`)) continue;
          data.push({
            userId,
            type: NotificationType.DAILY_REMINDER,
            title: `Hôm nay bạn chưa làm ${topic.name}`,
            message: `Hoàn thành ${topic.name} để xuất hiện trên bảng xếp hạng hôm nay.`,
            topicId: topic.id,
            businessDate: date,
            dedupKey: `daily-reminder:${userId}:${topic.id}:${date}`,
          });
          counts.set(userId, (counts.get(userId) ?? 0) + 1);
        }
      }
      if (data.length) {
        const created = await this.prisma.notification.createManyAndReturn({
          data,
          skipDuplicates: true,
        });
        await this.notifications.publishCreated(created);
      }
      if (page * 100 >= total) return;
    }
  }

  @Cron('0 18 * * 4', { timeZone: 'Asia/Ho_Chi_Minh' })
  async weeklyProgress(): Promise<void> {
    try {
      await this.runWeekly('progress');
    } catch (error) {
      this.logger.error('Weekly progress failed', error);
    }
  }

  @Cron('0 8 * * 1', { timeZone: 'Asia/Ho_Chi_Minh' })
  async weeklySummary(): Promise<void> {
    try {
      await this.runWeekly('summary');
    } catch (error) {
      this.logger.error('Weekly summary failed', error);
    }
  }

  async runWeekly(
    mode: 'progress' | 'summary',
    now = new Date(),
  ): Promise<void> {
    const reference =
      mode === 'summary' ? new Date(now.getTime() - 7 * 86_400_000) : now;
    const start = businessWeekStart(businessDate(reference));
    const end = businessWeekEnd(start);
    const groups = await this.prisma.topicLeaderboardResult.groupBy({
      by: ['topicId'],
      where: { businessDate: { gte: start, lte: end } },
    });
    if (!groups.length) return;
    const topics = await this.prisma.topic.findMany({
      where: { id: { in: groups.map((row) => row.topicId) } },
      select: { id: true, name: true },
    });
    const names = new Map(topics.map((topic) => [topic.id, topic.name]));
    for (const group of groups) {
      const name = names.get(group.topicId);
      if (!name) continue;
      const ranked = await this.leaderboard.weeklyRows(group.topicId, start);
      for (let i = 0; i < ranked.length; i += 100) {
        const data: Prisma.NotificationCreateManyInput[] = ranked
          .slice(i, i + 100)
          .map((row) => ({
            userId: row.userId,
            type:
              mode === 'progress'
                ? NotificationType.WEEKLY_PROGRESS
                : NotificationType.WEEKLY_SUMMARY,
            title:
              mode === 'progress' ? 'Thứ hạng tuần của bạn' : 'Tổng kết tuần',
            message:
              mode === 'progress'
                ? `Bạn hiện đang đứng #${row.rank} với ${row.score.toLocaleString('en-US')} điểm trong ${name}. Bạn đã tham gia ${row.completedDays} ngày tuần này.`
                : `${name}: Hạng cuối #${row.rank}, tổng điểm ${row.score.toLocaleString('en-US')}, tham gia ${row.completedDays}/7 ngày.`,
            topicId: group.topicId,
            weekStart: start,
            dedupKey: `weekly-${mode}:${row.userId}:${group.topicId}:${start}`,
          }));
        const created = await this.prisma.notification.createManyAndReturn({
          data,
          skipDuplicates: true,
        });
        await this.notifications.publishCreated(created);
      }
    }
  }
}
