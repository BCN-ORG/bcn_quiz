import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BOSS_COIN_SERVICE_PROVIDER,
  type BossCoinServiceProvider,
} from './coin-provider.interface';

@Injectable()
export class BossCoinService {
  private readonly logger = new Logger(BossCoinService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(BOSS_COIN_SERVICE_PROVIDER)
    private readonly coinProvider: BossCoinServiceProvider,
  ) {}

  generateIdempotencyKey(
    weekKey: string,
    userId: string,
    milestoneIndex: number,
  ): string {
    return `boss:reward:week:${weekKey}:user:${userId}:m:${milestoneIndex}`;
  }

  async distributeMilestoneReward(
    userId: string,
    seasonId: string,
    weekKey: string,
    milestoneIndex: number,
    milestoneAt: number,
    milestoneName?: string,
    rewardCoins = 5,
  ) {
    const idempotencyKey = this.generateIdempotencyKey(
      weekKey,
      userId,
      milestoneIndex,
    );

    // 1. Check if transaction already exists
    const existing = await this.prisma.bossRewardTransaction.findUnique({
      where: {
        userId_seasonId_milestoneIndex: {
          userId,
          seasonId,
          milestoneIndex,
        },
      },
    });

    if (existing && existing.status !== 'FAILED') {
      this.logger.warn(
        `[BossCoinService] Milestone reward already exists for user=${userId}, week=${weekKey}, milestone=${milestoneIndex}, status=${existing.status}`,
      );
      return existing;
    }

    const requestPayload = {
      userId,
      amount: rewardCoins,
      idempotencyKey,
      metadata: {
        weekKey,
        milestoneIndex,
        milestoneAt,
        milestoneName,
      },
    };

    // 2. Insert PENDING record in DB first, or atomically claim FAILED retry
    let transaction = existing;
    if (existing && existing.status === 'FAILED') {
      const claimed = await this.prisma.bossRewardTransaction.updateMany({
        where: {
          id: existing.id,
          status: 'FAILED',
        },
        data: {
          status: 'PENDING',
          errorMessage: null,
          updatedAt: new Date(),
        },
      });

      if (claimed.count === 0) {
        this.logger.warn(
          `[BossCoinService] Concurrent retry already claimed FAILED transaction for ${idempotencyKey}`,
        );
        return this.prisma.bossRewardTransaction.findUnique({
          where: { id: existing.id },
        });
      }

      transaction = {
        ...existing,
        status: 'PENDING',
        errorMessage: null,
      };
    } else if (!transaction) {
      try {
        transaction = await this.prisma.bossRewardTransaction.create({
          data: {
            userId,
            seasonId,
            milestoneIndex,
            milestoneAt,
            rewardCoins,
            idempotencyKey,
            status: 'PENDING',
            requestPayload: requestPayload as unknown as Prisma.InputJsonValue,
            retryCount: 0,
          },
        });
      } catch (err: unknown) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          this.logger.warn(
            `[BossCoinService] Concurrent reward insert blocked by unique key for ${idempotencyKey}`,
          );
          return this.prisma.bossRewardTransaction.findUnique({
            where: { idempotencyKey },
          });
        }
        throw err;
      }
    }

    if (!transaction) return null;

    // 3. Invoke external Coin API
    try {
      const response = await this.coinProvider.creditReward(requestPayload);

      return await this.prisma.bossRewardTransaction.update({
        where: { id: transaction.id },
        data: {
          status: response.status,
          externalTxId: response.externalTxId,
          responsePayload: response as unknown as Prisma.InputJsonValue,
          errorMessage: response.errorMessage || null,
          processedAt: response.status === 'SUCCESS' ? new Date() : null,
        },
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[BossCoinService] Coin provider call failed ambiguously for ${idempotencyKey}: ${errorMsg}`,
      );

      // On ambiguous error (timeout, network drop), mark UNKNOWN so reconciliation handles it safely
      return await this.prisma.bossRewardTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'UNKNOWN',
          errorMessage: `Provider call failed: ${errorMsg}`,
          retryCount: { increment: 1 },
          updatedAt: new Date(),
        },
      });
    }
  }
}
