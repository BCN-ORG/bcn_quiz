import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  COIN_SERVICE_PROVIDER,
  type CoinServiceProvider,
  CreditRewardRequest,
} from './coin-provider.interface';

@Injectable()
export class TowerReconciliationService {
  private readonly logger = new Logger(TowerReconciliationService.name);
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(COIN_SERVICE_PROVIDER)
    private readonly coinProvider: CoinServiceProvider,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCronReconciliation() {
    await this.reconcilePendingAndUnknown();
  }

  /**
   * Scans for PENDING or UNKNOWN coin transactions and reconciles against the external provider.
   */
  async reconcilePendingAndUnknown(batchSize = 50) {
    if (this.isRunning) {
      this.logger.warn('[TowerReconciliationService] Reconciliation already running. Skipping concurrent trigger.');
      return { total: 0, reconciledSuccess: 0, reconciledFailed: 0, stillPending: 0, skipped: true };
    }
    this.isRunning = true;

    try {
      const cutoffDate = new Date(Date.now() - 30 * 1000); // Only process if created at least 30s ago

      const pendingList = await this.prisma.towerRewardTransaction.findMany({
        where: {
          status: { in: ['PENDING', 'UNKNOWN'] },
          createdAt: { lte: cutoffDate },
          retryCount: { lt: 10 },
        },
        take: batchSize,
        orderBy: { createdAt: 'asc' },
      });

      if (pendingList.length === 0) {
        return { total: 0, reconciledSuccess: 0, reconciledFailed: 0, stillPending: 0 };
      }

      this.logger.log(
        `[TowerReconciliationService] Found ${pendingList.length} transactions needing reconciliation`,
      );

      let reconciledSuccess = 0;
      let reconciledFailed = 0;
      let stillPending = 0;

      for (const tx of pendingList) {
        try {
          const check = await this.coinProvider.checkStatus(tx.idempotencyKey);

          if (check.status === 'SUCCESS') {
            await this.prisma.towerRewardTransaction.update({
              where: { id: tx.id },
              data: {
                status: 'SUCCESS',
                externalTxId: check.externalTxId ?? tx.externalTxId,
                processedAt: new Date(),
              },
            });
            reconciledSuccess++;
            this.logger.log(
              `[TowerReconciliationService] Reconciled SUCCESS for tx=${tx.id}, idempotencyKey=${tx.idempotencyKey}`,
            );
          } else if (check.status === 'FAILED') {
            await this.prisma.towerRewardTransaction.update({
              where: { id: tx.id },
              data: {
                status: 'FAILED',
                errorMessage: check.errorMessage ?? 'Provider reported transaction failed',
                processedAt: new Date(),
              },
            });
            reconciledFailed++;
            this.logger.log(
              `[TowerReconciliationService] Reconciled FAILED for tx=${tx.id}, idempotencyKey=${tx.idempotencyKey}`,
            );
          } else if (check.status === 'NOT_FOUND') {
            // Provider has no record of this idempotencyKey. Safe to re-dispatch!
            this.logger.log(
              `[TowerReconciliationService] Provider has no record for ${tx.idempotencyKey}. Re-dispatching...`,
            );

            if (tx.requestPayload && typeof tx.requestPayload === 'object') {
              const req = tx.requestPayload as unknown as CreditRewardRequest;
              const res = await this.coinProvider.creditReward(req);
              if (res.status === 'SUCCESS') {
                await this.prisma.towerRewardTransaction.update({
                  where: { id: tx.id },
                  data: {
                    status: 'SUCCESS',
                    externalTxId: res.externalTxId,
                    responsePayload: res as unknown as Prisma.InputJsonValue,
                    processedAt: new Date(),
                  },
                });
                reconciledSuccess++;
              } else if (res.status === 'FAILED') {
                await this.prisma.towerRewardTransaction.update({
                  where: { id: tx.id },
                  data: {
                    status: 'FAILED',
                    errorMessage: res.errorMessage,
                    responsePayload: res as unknown as Prisma.InputJsonValue,
                    processedAt: new Date(),
                  },
                });
                reconciledFailed++;
              } else {
                stillPending++;
              }
            } else {
              stillPending++;
            }
          } else {
            // Still PENDING at provider
            await this.prisma.towerRewardTransaction.update({
              where: { id: tx.id },
              data: {
                retryCount: { increment: 1 },
              },
            });
            stillPending++;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `[TowerReconciliationService] Error checking status for ${tx.idempotencyKey}: ${msg}`,
          );
          await this.prisma.towerRewardTransaction.update({
            where: { id: tx.id },
            data: {
              retryCount: { increment: 1 },
              errorMessage: msg,
            },
          });
          stillPending++;
        }
      }

      return {
        total: pendingList.length,
        reconciledSuccess,
        reconciledFailed,
        stillPending,
      };
    } finally {
      this.isRunning = false;
    }
  }
}
