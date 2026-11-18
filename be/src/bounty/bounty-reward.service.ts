import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CoinRewardSource, Prisma, XpSourceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { XpService } from '../xp/xp.service';
import { CoinTrackingService } from '../coin/coin-tracking.service';
import {
  BOUNTY_COIN_SERVICE_PROVIDER,
  type BountyCoinServiceProvider,
} from './coin/coin-provider.interface';

@Injectable()
export class BountyRewardService {
  private readonly logger = new Logger(BountyRewardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly xpService: XpService,
    @Inject(BOUNTY_COIN_SERVICE_PROVIDER)
    private readonly coinProvider: BountyCoinServiceProvider,
    @Optional()
    private readonly coinTrackingService?: CoinTrackingService,
  ) {}

  generateIdempotencyKey(assignmentId: string): string {
    return `bounty:reward:assignment:${assignmentId}`;
  }

  async rewardAssignmentCompletion(
    assignmentId: string,
    userId: string,
    bountyId: string,
    rewardCoins: number,
    rewardXp: number,
    bountyDetails?: { slug?: string; title?: string },
  ) {
    const idempotencyKey = this.generateIdempotencyKey(assignmentId);

    // 1. Check existing transaction
    const existing = await this.prisma.bountyRewardTransaction.findUnique({
      where: { assignmentId },
    });

    if (existing && existing.status === 'COMPLETED') {
      this.logger.log(
        `[BountyRewardService] Reward already completed for assignment ${assignmentId}`,
      );
      return existing;
    }

    const payload = {
      userId,
      amount: rewardCoins,
      idempotencyKey,
      metadata: {
        bountyId,
        bountySlug: bountyDetails?.slug || '',
        bountyTitle: bountyDetails?.title || '',
        assignmentId,
      },
    };

    // 2. Upsert PENDING transaction record
    const txRecord = existing
      ? await this.prisma.bountyRewardTransaction.update({
          where: { id: existing.id },
          data: {
            status: 'PENDING',
            retryCount: { increment: 1 },
            requestPayload: payload,
          },
        })
      : await this.prisma.bountyRewardTransaction.create({
          data: {
            userId,
            bountyId,
            assignmentId,
            rewardCoins,
            rewardXp,
            idempotencyKey,
            status: 'PENDING',
            requestPayload: payload,
          },
        });

    if (this.coinTrackingService) {
      await this.coinTrackingService
        .recordPending({
          userId,
          amount: rewardCoins,
          source: CoinRewardSource.BOUNTY,
          reason: bountyDetails?.title
            ? `Nhiệm vụ: ${bountyDetails.title}`
            : 'Hoàn thành nhiệm vụ Bounty',
          referenceId: assignmentId,
          idempotencyKey,
          requestPayload: payload,
        })
        .catch((e) =>
          this.logger.warn(
            `Failed to track pending bounty coin tx: ${e.message}`,
          ),
        );
    }

    // 3. Call coin provider
    try {
      const response = await this.coinProvider.creditReward(payload);

      if (response.success && response.status === 'SUCCESS') {
        if (this.coinTrackingService) {
          await this.coinTrackingService
            .recordSuccess(idempotencyKey, response.externalTxId, response)
            .catch((e) =>
              this.logger.warn(
                `Failed to track success bounty coin tx: ${e.message}`,
              ),
            );
        }

        // Award XP
        await this.xpService.award(
          userId,
          XpSourceType.BOUNTY_COMPLETED,
          assignmentId,
          undefined,
          rewardXp,
        );

        const completed = await this.prisma.bountyRewardTransaction.update({
          where: { id: txRecord.id },
          data: {
            status: 'COMPLETED',
            externalTxId: response.externalTxId,
            responsePayload: response as unknown as Prisma.InputJsonValue,
            processedAt: new Date(),
          },
        });

        this.logger.log(
          `[BountyRewardService] Successfully rewarded ${rewardCoins} coins and ${rewardXp} XP to user ${userId} for assignment ${assignmentId}`,
        );
        return completed;
      } else {
        if (this.coinTrackingService) {
          await this.coinTrackingService
            .recordFailed(
              idempotencyKey,
              response.errorMessage || 'Coin provider rejected reward',
              response,
            )
            .catch((e) =>
              this.logger.warn(
                `Failed to track failed bounty coin tx: ${e.message}`,
              ),
            );
        }

        return await this.prisma.bountyRewardTransaction.update({
          where: { id: txRecord.id },
          data: {
            status: 'FAILED',
            errorMessage:
              response.errorMessage || 'Coin provider rejected reward',
            responsePayload: response as unknown as Prisma.InputJsonValue,
          },
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[BountyRewardService] Error crediting coins for assignment ${assignmentId}: ${msg}`,
      );

      if (this.coinTrackingService) {
        await this.coinTrackingService
          .recordUnknown(idempotencyKey, msg)
          .catch((e) =>
            this.logger.warn(
              `Failed to track unknown bounty coin tx: ${e.message}`,
            ),
          );
      }

      return await this.prisma.bountyRewardTransaction.update({
        where: { id: txRecord.id },
        data: {
          status: 'UNKNOWN',
          errorMessage: msg,
          retryCount: { increment: 1 },
        },
      });
    }
  }
}
