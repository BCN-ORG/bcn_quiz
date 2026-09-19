import { AttemptSessionStatus } from '@prisma/client';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AttemptSessionCleanupService {
  private readonly logger = new Logger(AttemptSessionCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireStaleSessions(): Promise<void> {
    const now = new Date();

    const result = await this.prisma.attemptSession.updateMany({
      where: {
        status: AttemptSessionStatus.IN_PROGRESS,
        expiresAt: {
          lte: now,
        },
      },
      data: {
        status: AttemptSessionStatus.EXPIRED,
        lastSeenAt: now,
      },
    });

    if (result.count > 0) {
      this.logger.log(`Expired ${result.count} session(s)`);
    }
  }
}
