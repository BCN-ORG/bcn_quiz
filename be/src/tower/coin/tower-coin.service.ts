import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  COIN_SERVICE_PROVIDER,
  type CoinServiceProvider,
} from './coin-provider.interface';

@Injectable()
export class TowerCoinService {
  private readonly logger = new Logger(TowerCoinService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(COIN_SERVICE_PROVIDER)
    private readonly coinProvider: CoinServiceProvider,
  ) {}

  /**
   * Generates a deterministic idempotency key for floor reward in a season.
   */
  generateIdempotencyKey(
    seasonKey: string,
    userId: string,
    floor: number,
  ): string {
    return `tower:season:${seasonKey}:user:${userId}:floor:${floor}`;
  }

  /**
   * Rewards 1 coin for completing a floor.
   * Guarantees idempotency and handles ambiguous external outcomes.
   */
  async rewardFloorCompletion(
    userId: string,
    seasonId: string,
    seasonKey: string,
    floor: number,
    attemptId?: string,
  ) {
    const idempotencyKey = this.generateIdempotencyKey(
      seasonKey,
      userId,
      floor,
    );

    // 1. Check if an existing reward transaction exists for this floor & user in this season
    const existing = await this.prisma.towerRewardTransaction.findUnique({
      where: {
        userId_seasonId_floor: {
          userId,
          seasonId,
          floor,
        },
      },
    });

    if (existing && existing.status !== 'FAILED') {
      this.logger.warn(
        `[TowerCoinService] Reward already initiated or processed for user=${userId}, season=${seasonKey}, floor=${floor}, status=${existing.status}`,
      );
      return existing;
    }

    const requestPayload = {
      userId,
      amount: 1, // Fixed: 1 coin per completed floor
      idempotencyKey,
      metadata: {
        seasonKey,
        floor,
        attemptId,
      },
    };

    // 2. Insert PENDING transaction in DB first (Outbox pattern) or reuse existing FAILED row for retry
    let transaction = existing;
    if (!transaction) {
      try {
        transaction = await this.prisma.towerRewardTransaction.create({
          data: {
            userId,
            seasonId,
            floor,
            rewardCoins: 1,
            idempotencyKey,
            status: 'PENDING',
            requestPayload: requestPayload as unknown as Prisma.InputJsonValue,
            retryCount: 0,
          },
        });
      } catch (err: unknown) {
        // Prisma unique constraint violation code is P2002
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          this.logger.warn(
            `[TowerCoinService] Concurrent reward insert blocked by unique key for idempotencyKey=${idempotencyKey}`,
          );
          return await this.prisma.towerRewardTransaction.findUnique({
            where: { idempotencyKey },
          });
        }
        throw err;
      }
    }

    if (!transaction) {
      throw new Error('Failed to initialize tower reward transaction');
    }

    // 3. Dispatch to External Coin Provider
    try {
      const response = await this.coinProvider.creditReward(requestPayload);

      if (response.status === 'SUCCESS') {
        return await this.prisma.towerRewardTransaction.update({
          where: { id: transaction.id },
          data: {
            status: 'SUCCESS',
            externalTxId: response.externalTxId,
            responsePayload: response as unknown as Prisma.InputJsonValue,
            processedAt: new Date(),
          },
        });
      } else if (response.status === 'FAILED') {
        return await this.prisma.towerRewardTransaction.update({
          where: { id: transaction.id },
          data: {
            status: 'FAILED',
            errorMessage: response.errorMessage || 'Provider rejected credit',
            responsePayload: response as unknown as Prisma.InputJsonValue,
            processedAt: new Date(),
          },
        });
      } else {
        // Provider returned PENDING
        return await this.prisma.towerRewardTransaction.update({
          where: { id: transaction.id },
          data: {
            status: 'PENDING',
            externalTxId: response.externalTxId,
            responsePayload: response as unknown as Prisma.InputJsonValue,
          },
        });
      }
    } catch (error: unknown) {
      // Network timeout / unhandled error from external provider:
      // Invariant: Do NOT mark as FAILED! Must transition to UNKNOWN for reconciliation.
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[TowerCoinService] Coin provider call failed ambiguously for ${idempotencyKey}: ${errMsg}`,
      );

      return await this.prisma.towerRewardTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'UNKNOWN',
          errorMessage: errMsg,
          retryCount: { increment: 1 },
        },
      });
    }
  }
}
