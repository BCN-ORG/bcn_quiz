import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BOSS_COIN_SERVICE_PROVIDER,
  type BossCoinServiceProvider,
} from './coin-provider.interface';

@Injectable()
export class BossReconciliationService {
  private readonly logger = new Logger(BossReconciliationService.name);
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(BOSS_COIN_SERVICE_PROVIDER)
    private readonly coinProvider: BossCoinServiceProvider,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleCronReconciliation() {
    await this.reconcilePendingTransactions();
  }

  async reconcilePendingTransactions(batchSize = 25, maxRetries = 5) {
    if (this.isRunning) {
      this.logger.debug('[BossReconciliationService] Skip: already running');
      return { processed: 0, resolved: 0, failed: 0 };
    }

    this.isRunning = true;
    let resolved = 0;
    let failed = 0;

    try {
      const cutoffDate = new Date(Date.now() - 30_000);
      const candidates = await this.prisma.bossRewardTransaction.findMany({
        where: {
          status: { in: ['PENDING', 'UNKNOWN'] },
          retryCount: { lt: maxRetries },
          updatedAt: { lte: cutoffDate },
        },
        orderBy: { createdAt: 'asc' },
        take: batchSize,
      });

      if (candidates.length === 0) {
        return { processed: 0, resolved: 0, failed: 0 };
      }

      this.logger.log(
        `[BossReconciliationService] Reconciling ${candidates.length} pending/unknown transactions`,
      );

      for (const tx of candidates) {
        try {
          const statusRes = await this.coinProvider.checkStatus(
            tx.idempotencyKey,
          );

          if (statusRes.status === 'SUCCESS') {
            await this.prisma.bossRewardTransaction.update({
              where: { id: tx.id },
              data: {
                status: 'SUCCESS',
                externalTxId: statusRes.externalTxId ?? tx.externalTxId,
                errorMessage: null,
                processedAt: new Date(),
              },
            });
            resolved++;
          } else if (statusRes.status === 'FAILED') {
            await this.prisma.bossRewardTransaction.update({
              where: { id: tx.id },
              data: {
                status: 'FAILED',
                errorMessage:
                  statusRes.errorMessage ?? 'Provider reported failure',
                processedAt: new Date(),
              },
            });
            failed++;
          } else if (statusRes.status === 'NOT_FOUND') {
            // Not found on external provider: re-attempt credit
            const payload = tx.requestPayload as {
              userId: string;
              amount: number;
              idempotencyKey: string;
              metadata: {
                weekKey: string;
                milestoneIndex: number;
                milestoneAt: number;
                milestoneName?: string;
              };
            };

            const creditRes = await this.coinProvider.creditReward(payload);
            await this.prisma.bossRewardTransaction.update({
              where: { id: tx.id },
              data: {
                status: creditRes.status,
                externalTxId: creditRes.externalTxId,
                responsePayload: creditRes as unknown as Prisma.InputJsonValue,
                errorMessage: creditRes.errorMessage ?? null,
                processedAt: creditRes.status === 'SUCCESS' ? new Date() : null,
                retryCount: { increment: 1 },
              },
            });

            if (creditRes.status === 'SUCCESS') resolved++;
          } else {
            // Still pending externally
            await this.prisma.bossRewardTransaction.update({
              where: { id: tx.id },
              data: {
                retryCount: { increment: 1 },
                updatedAt: new Date(),
              },
            });
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `[BossReconciliationService] Error reconciling tx ${tx.id}: ${msg}`,
          );
          await this.prisma.bossRewardTransaction.update({
            where: { id: tx.id },
            data: {
              status: 'UNKNOWN',
              retryCount: { increment: 1 },
              errorMessage: `Reconciliation error: ${msg}`,
            },
          });
        }
      }

      return { processed: candidates.length, resolved, failed };
    } finally {
      this.isRunning = false;
    }
  }
}
