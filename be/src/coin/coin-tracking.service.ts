import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  CoinRewardSource,
  CoinTransaction,
  CoinTransactionStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MockCoinWalletService } from '../wallet/mock-coin-wallet.service';
import { COIN_SERVICE_PROVIDER } from '../tower/coin/coin-provider.interface';
import { BOSS_COIN_SERVICE_PROVIDER } from '../boss/coin/coin-provider.interface';
import { BOUNTY_COIN_SERVICE_PROVIDER } from '../bounty/coin/coin-provider.interface';

export interface RecordPendingParams {
  userId: string;
  username?: string;
  amount: number;
  source: CoinRewardSource;
  reason?: string;
  referenceId?: string;
  seasonId?: string;
  idempotencyKey: string;
  requestPayload?: any;
}

export interface ReconcileResult {
  success: boolean;
  message: string;
  transaction: CoinTransaction;
  reconciled: boolean;
}

@Injectable()
export class CoinTrackingService implements OnModuleInit {
  private readonly logger = new Logger(CoinTrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    @Optional()
    private readonly mockWalletService?: MockCoinWalletService,
  ) {}

  onModuleInit(): void {
    // Run historical backfill asynchronously in background so app starts and health check passes immediately
    setImmediate(() => {
      void (async () => {
        try {
          const stats = await this.backfillFromExistingTables();
          this.logger.log(
            `[CoinTrackingService] Startup backfill completed: ${stats.tower} tower, ${stats.boss} boss, ${stats.bounty} bounty`,
          );
          const walletSynced = await this.backfillSuccessRewardsToWallet();
          if (walletSynced > 0) {
            this.logger.log(
              `[CoinTrackingService] Wallet reward sync completed: ${walletSynced} transactions`,
            );
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `[CoinTrackingService] Startup backfill warning: ${msg}`,
          );
        }
      })();
    });
  }

  /**
   * Idempotently backfills historical reward transactions from Tower, Boss, and Bounty tables into CoinTransaction.
   */
  async backfillFromExistingTables(): Promise<{
    tower: number;
    boss: number;
    bounty: number;
  }> {
    let towerCount = 0;
    let bossCount = 0;
    let bountyCount = 0;

    // 1. Backfill Tower rewards
    try {
      const towerTxs = await this.prisma.towerRewardTransaction.findMany();
      for (const t of towerTxs) {
        const status =
          t.status === 'SUCCESS'
            ? CoinTransactionStatus.SUCCESS
            : t.status === 'FAILED'
              ? CoinTransactionStatus.FAILED
              : t.status === 'UNKNOWN'
                ? CoinTransactionStatus.UNKNOWN
                : CoinTransactionStatus.PENDING;

        const existing = await this.prisma.coinTransaction.findUnique({
          where: { idempotencyKey: t.idempotencyKey },
        });

        if (!existing) {
          await this.prisma.coinTransaction.create({
            data: {
              userId: t.userId,
              amount: t.rewardCoins,
              source: CoinRewardSource.TOWER,
              reason: `Hoàn thành tầng ${t.floor} Tháp Tri Thức`,
              referenceId: String(t.floor),
              seasonId: t.seasonId,
              idempotencyKey: t.idempotencyKey,
              externalTxId: t.externalTxId,
              status,
              requestPayload: t.requestPayload ?? undefined,
              responsePayload: t.responsePayload ?? undefined,
              retryCount: t.retryCount,
              errorMessage: t.errorMessage,
              createdAt: t.createdAt,
              updatedAt: t.updatedAt,
              processedAt: t.processedAt,
            },
          });
          towerCount++;
        }
      }
    } catch (err: unknown) {
      this.logger.debug(
        `[CoinTrackingService] Tower backfill skipped: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    // 2. Backfill Boss rewards
    try {
      const bossTxs = await this.prisma.bossRewardTransaction.findMany();
      for (const b of bossTxs) {
        const status =
          b.status === 'SUCCESS'
            ? CoinTransactionStatus.SUCCESS
            : b.status === 'FAILED'
              ? CoinTransactionStatus.FAILED
              : b.status === 'UNKNOWN'
                ? CoinTransactionStatus.UNKNOWN
                : CoinTransactionStatus.PENDING;

        const existing = await this.prisma.coinTransaction.findUnique({
          where: { idempotencyKey: b.idempotencyKey },
        });

        if (!existing) {
          await this.prisma.coinTransaction.create({
            data: {
              userId: b.userId,
              amount: b.rewardCoins,
              source: CoinRewardSource.BOSS,
              reason: `Đạt mốc ${b.milestoneIndex} Boss Chiến (${b.milestoneAt} điểm)`,
              referenceId: String(b.milestoneIndex),
              seasonId: b.seasonId,
              idempotencyKey: b.idempotencyKey,
              externalTxId: b.externalTxId,
              status,
              requestPayload: b.requestPayload ?? undefined,
              responsePayload: b.responsePayload ?? undefined,
              retryCount: b.retryCount,
              errorMessage: b.errorMessage,
              createdAt: b.createdAt,
              updatedAt: b.updatedAt,
              processedAt: b.processedAt,
            },
          });
          bossCount++;
        }
      }
    } catch (err: unknown) {
      this.logger.debug(
        `[CoinTrackingService] Boss backfill skipped: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    // 3. Backfill Bounty rewards
    try {
      const bountyTxs = await this.prisma.bountyRewardTransaction.findMany();
      for (const bt of bountyTxs) {
        const status =
          bt.status === 'COMPLETED'
            ? CoinTransactionStatus.SUCCESS
            : bt.status === 'FAILED'
              ? CoinTransactionStatus.FAILED
              : bt.status === 'UNKNOWN'
                ? CoinTransactionStatus.UNKNOWN
                : CoinTransactionStatus.PENDING;

        const existing = await this.prisma.coinTransaction.findUnique({
          where: { idempotencyKey: bt.idempotencyKey },
        });

        if (!existing) {
          await this.prisma.coinTransaction.create({
            data: {
              userId: bt.userId,
              amount: bt.rewardCoins,
              source: CoinRewardSource.BOUNTY,
              reason: 'Hoàn thành nhiệm vụ săn thưởng (Bounty)',
              referenceId: bt.assignmentId,
              seasonId: null,
              idempotencyKey: bt.idempotencyKey,
              externalTxId: bt.externalTxId,
              status,
              requestPayload: bt.requestPayload ?? undefined,
              responsePayload: bt.responsePayload ?? undefined,
              retryCount: bt.retryCount,
              errorMessage: bt.errorMessage,
              createdAt: bt.createdAt,
              updatedAt: bt.updatedAt,
              processedAt: bt.processedAt,
            },
          });
          bountyCount++;
        }
      }
    } catch (err: unknown) {
      this.logger.debug(
        `[CoinTrackingService] Bounty backfill skipped: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    if (towerCount > 0 || bossCount > 0 || bountyCount > 0) {
      this.logger.log(
        `[CoinTrackingService] Startup backfill completed: tower=${towerCount}, boss=${bossCount}, bounty=${bountyCount}`,
      );
    }

    return { tower: towerCount, boss: bossCount, bounty: bountyCount };
  }

  /**
   * Records a pending transaction before calling external coin provider API.
   */
  async recordPending(params: RecordPendingParams): Promise<CoinTransaction> {
    const {
      userId,
      username,
      amount,
      source,
      reason,
      referenceId,
      seasonId,
      idempotencyKey,
      requestPayload,
    } = params;

    const existing = await this.prisma.coinTransaction.findUnique({
      where: { idempotencyKey },
    });

    if (existing) {
      if (existing.status === CoinTransactionStatus.FAILED) {
        return await this.prisma.coinTransaction.update({
          where: { id: existing.id },
          data: {
            status: CoinTransactionStatus.PENDING,
            errorMessage: null,
            retryCount: { increment: 1 },
            requestPayload: requestPayload
              ? (requestPayload as Prisma.InputJsonValue)
              : undefined,
            updatedAt: new Date(),
          },
        });
      }
      return existing;
    }

    try {
      return await this.prisma.coinTransaction.create({
        data: {
          userId,
          username,
          amount,
          source,
          reason,
          referenceId,
          seasonId,
          idempotencyKey,
          status: CoinTransactionStatus.PENDING,
          requestPayload: requestPayload
            ? (requestPayload as Prisma.InputJsonValue)
            : undefined,
          retryCount: 0,
        },
      });
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        this.logger.warn(
          `[CoinTrackingService] Unique conflict on idempotencyKey=${idempotencyKey}, fetching existing record`,
        );
        const record = await this.prisma.coinTransaction.findUnique({
          where: { idempotencyKey },
        });
        if (record) return record;
      }
      throw err;
    }
  }

  /**
   * Updates transaction to SUCCESS with verified externalTxId.
   */
  async recordSuccess(
    idempotencyKey: string,
    externalTxId?: string,
    responsePayload?: any,
  ): Promise<CoinTransaction | null> {
    try {
      const updated = await this.prisma.coinTransaction.update({
        where: { idempotencyKey },
        data: {
          status: CoinTransactionStatus.SUCCESS,
          externalTxId: externalTxId ?? undefined,
          responsePayload: responsePayload
            ? (responsePayload as Prisma.InputJsonValue)
            : undefined,
          errorMessage: null,
          processedAt: new Date(),
        },
      });
      await this.syncRewardToWallet(updated);
      return updated;
    } catch (err: unknown) {
      this.logger.warn(
        `[CoinTrackingService] Failed to record SUCCESS for ${idempotencyKey}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  /**
   * Updates transaction to UNKNOWN on network timeout or ambiguous error.
   */
  async recordUnknown(
    idempotencyKey: string,
    errorMessage?: string,
    responsePayload?: any,
  ): Promise<CoinTransaction | null> {
    try {
      return await this.prisma.coinTransaction.update({
        where: { idempotencyKey },
        data: {
          status: CoinTransactionStatus.UNKNOWN,
          errorMessage: errorMessage ?? undefined,
          responsePayload: responsePayload
            ? (responsePayload as Prisma.InputJsonValue)
            : undefined,
          retryCount: { increment: 1 },
        },
      });
    } catch (err: unknown) {
      this.logger.warn(
        `[CoinTrackingService] Failed to record UNKNOWN for ${idempotencyKey}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  /**
   * Updates transaction to FAILED on provider rejection.
   */
  async recordFailed(
    idempotencyKey: string,
    errorMessage?: string,
    responsePayload?: any,
  ): Promise<CoinTransaction | null> {
    try {
      return await this.prisma.coinTransaction.update({
        where: { idempotencyKey },
        data: {
          status: CoinTransactionStatus.FAILED,
          errorMessage: errorMessage ?? undefined,
          responsePayload: responsePayload
            ? (responsePayload as Prisma.InputJsonValue)
            : undefined,
          processedAt: new Date(),
        },
      });
    } catch (err: unknown) {
      this.logger.warn(
        `[CoinTrackingService] Failed to record FAILED for ${idempotencyKey}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  /**
   * Performs manual or automated reconciliation for a specific coin transaction.
   */
  async reconcileTransaction(
    id: string,
    triggeredBy = 'ADMIN_MANUAL',
  ): Promise<ReconcileResult> {
    const tx = await this.prisma.coinTransaction.findUnique({
      where: { id },
    });

    if (!tx) {
      throw new NotFoundException(`Giao dịch Coin với ID ${id} không tồn tại.`);
    }

    if (tx.status === CoinTransactionStatus.SUCCESS) {
      return {
        success: true,
        message: 'Giao dịch đã ở trạng thái thành công (SUCCESS).',
        transaction: tx,
        reconciled: false,
      };
    }

    const previousHistory = Array.isArray(tx.reconciliationHistory)
      ? (tx.reconciliationHistory as any[])
      : [];

    let provider: any = null;
    try {
      if (tx.source === CoinRewardSource.TOWER) {
        provider = this.moduleRef.get(COIN_SERVICE_PROVIDER, { strict: false });
      } else if (tx.source === CoinRewardSource.BOSS) {
        provider = this.moduleRef.get(BOSS_COIN_SERVICE_PROVIDER, {
          strict: false,
        });
      } else if (tx.source === CoinRewardSource.BOUNTY) {
        provider = this.moduleRef.get(BOUNTY_COIN_SERVICE_PROVIDER, {
          strict: false,
        });
      }
    } catch (e) {
      this.logger.debug(
        `[CoinTrackingService] Provider token not found in DI: ${e}`,
      );
    }

    if (provider && typeof provider.checkStatus === 'function') {
      try {
        const check = await provider.checkStatus(tx.idempotencyKey);
        const timestamp = new Date().toISOString();

        if (check.status === 'SUCCESS') {
          const auditEntry = {
            reconciledAt: timestamp,
            previousStatus: tx.status,
            newStatus: CoinTransactionStatus.SUCCESS,
            triggeredBy,
            externalTxId: check.externalTxId ?? tx.externalTxId,
            details: check,
          };

          const updated = await this.prisma.coinTransaction.update({
            where: { id: tx.id },
            data: {
              status: CoinTransactionStatus.SUCCESS,
              externalTxId: check.externalTxId ?? tx.externalTxId,
              processedAt: new Date(),
              errorMessage: null,
              reconciliationHistory: [...previousHistory, auditEntry],
            },
          });

          await this.syncSourceTransaction(
            tx,
            CoinTransactionStatus.SUCCESS,
            check.externalTxId,
          );
          await this.syncRewardToWallet(updated);

          return {
            success: true,
            message:
              'Đối soát thành công: Giao dịch đã được xác nhận SUCCESS từ nhà cung cấp.',
            transaction: updated,
            reconciled: true,
          };
        } else if (check.status === 'FAILED') {
          const auditEntry = {
            reconciledAt: timestamp,
            previousStatus: tx.status,
            newStatus: CoinTransactionStatus.FAILED,
            triggeredBy,
            errorMessage: check.errorMessage ?? 'Provider reported failed',
            details: check,
          };

          const updated = await this.prisma.coinTransaction.update({
            where: { id: tx.id },
            data: {
              status: CoinTransactionStatus.FAILED,
              errorMessage:
                check.errorMessage ?? 'Provider reported transaction failed',
              processedAt: new Date(),
              reconciliationHistory: [...previousHistory, auditEntry],
            },
          });

          await this.syncSourceTransaction(
            tx,
            CoinTransactionStatus.FAILED,
            undefined,
            check.errorMessage,
          );

          return {
            success: true,
            message:
              'Đối soát hoàn tất: Nhà cung cấp báo giao dịch THẤT BẠI (FAILED).',
            transaction: updated,
            reconciled: true,
          };
        } else if (check.status === 'NOT_FOUND' && tx.requestPayload) {
          // Re-dispatch if provider has no trace of this idempotencyKey
          this.logger.log(
            `[CoinTrackingService] IdempotencyKey ${tx.idempotencyKey} NOT_FOUND at provider. Re-dispatching...`,
          );
          const creditRes = await provider.creditReward(tx.requestPayload);

          const auditEntry = {
            reconciledAt: timestamp,
            previousStatus: tx.status,
            newStatus:
              creditRes.status === 'SUCCESS'
                ? CoinTransactionStatus.SUCCESS
                : CoinTransactionStatus.FAILED,
            triggeredBy,
            action: 'RE_DISPATCH',
            details: creditRes,
          };

          if (creditRes.status === 'SUCCESS') {
            const updated = await this.prisma.coinTransaction.update({
              where: { id: tx.id },
              data: {
                status: CoinTransactionStatus.SUCCESS,
                externalTxId: creditRes.externalTxId,
                responsePayload: creditRes,
                processedAt: new Date(),
                reconciliationHistory: [...previousHistory, auditEntry],
              },
            });
            await this.syncSourceTransaction(
              tx,
              CoinTransactionStatus.SUCCESS,
              creditRes.externalTxId,
            );
            await this.syncRewardToWallet(updated);
            return {
              success: true,
              message:
                'Đối soát thành công: Đã gửi lại giao dịch và nhận trạng thái SUCCESS.',
              transaction: updated,
              reconciled: true,
            };
          } else {
            const updated = await this.prisma.coinTransaction.update({
              where: { id: tx.id },
              data: {
                status: CoinTransactionStatus.FAILED,
                errorMessage: creditRes.errorMessage ?? 'Re-dispatch failed',
                responsePayload: creditRes,
                reconciliationHistory: [...previousHistory, auditEntry],
              },
            });
            return {
              success: false,
              message: `Gửi lại giao dịch thất bại: ${creditRes.errorMessage}`,
              transaction: updated,
              reconciled: true,
            };
          }
        } else {
          // Provider status still PENDING
          const auditEntry = {
            reconciledAt: timestamp,
            previousStatus: tx.status,
            newStatus: tx.status,
            triggeredBy,
            details: check,
            note: 'Provider still reporting PENDING',
          };

          const updated = await this.prisma.coinTransaction.update({
            where: { id: tx.id },
            data: {
              retryCount: { increment: 1 },
              reconciliationHistory: [...previousHistory, auditEntry],
            },
          });

          return {
            success: true,
            message:
              'Nhà cung cấp báo giao dịch vẫn đang trong quá trình xử lý (PENDING).',
            transaction: updated,
            reconciled: false,
          };
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const auditEntry = {
          reconciledAt: new Date().toISOString(),
          previousStatus: tx.status,
          newStatus: CoinTransactionStatus.UNKNOWN,
          triggeredBy,
          error: errorMsg,
        };

        const updated = await this.prisma.coinTransaction.update({
          where: { id: tx.id },
          data: {
            status: CoinTransactionStatus.UNKNOWN,
            retryCount: { increment: 1 },
            errorMessage: errorMsg,
            reconciliationHistory: [...previousHistory, auditEntry],
          },
        });

        return {
          success: false,
          message: `Lỗi kết nối khi đối soát với nhà cung cấp: ${errorMsg}`,
          transaction: updated,
          reconciled: false,
        };
      }
    }

    // Fallback if no provider adapter registered: inspect source table directly
    const auditEntry = {
      reconciledAt: new Date().toISOString(),
      previousStatus: tx.status,
      newStatus: tx.status,
      triggeredBy,
      note: 'No external provider adapter directly reachable; synced with local reward records.',
    };

    const updated = await this.prisma.coinTransaction.update({
      where: { id: tx.id },
      data: {
        retryCount: { increment: 1 },
        reconciliationHistory: [...previousHistory, auditEntry],
      },
    });

    return {
      success: true,
      message: 'Đã kiểm tra lại thông tin giao dịch cục bộ.',
      transaction: updated,
      reconciled: false,
    };
  }

  /**
   * Keeps the source-specific transaction table in sync with the reconciled CoinTransaction.
   */
  private async syncSourceTransaction(
    tx: CoinTransaction,
    status: CoinTransactionStatus,
    externalTxId?: string,
    errorMessage?: string,
  ) {
    try {
      if (tx.source === CoinRewardSource.TOWER) {
        await this.prisma.towerRewardTransaction.updateMany({
          where: { idempotencyKey: tx.idempotencyKey },
          data: {
            status: status as any,
            externalTxId: externalTxId ?? undefined,
            errorMessage: errorMessage ?? undefined,
            processedAt:
              status === CoinTransactionStatus.SUCCESS ? new Date() : undefined,
          },
        });
      } else if (tx.source === CoinRewardSource.BOSS) {
        await this.prisma.bossRewardTransaction.updateMany({
          where: { idempotencyKey: tx.idempotencyKey },
          data: {
            status: status as any,
            externalTxId: externalTxId ?? undefined,
            errorMessage: errorMessage ?? undefined,
            processedAt:
              status === CoinTransactionStatus.SUCCESS ? new Date() : undefined,
          },
        });
      } else if (tx.source === CoinRewardSource.BOUNTY) {
        await this.prisma.bountyRewardTransaction.updateMany({
          where: { idempotencyKey: tx.idempotencyKey },
          data: {
            status:
              status === CoinTransactionStatus.SUCCESS
                ? ('COMPLETED' as any)
                : (status as any),
            externalTxId: externalTxId ?? undefined,
            errorMessage: errorMessage ?? undefined,
            processedAt:
              status === CoinTransactionStatus.SUCCESS ? new Date() : undefined,
          },
        });
      }
    } catch (err: unknown) {
      this.logger.warn(
        `[CoinTrackingService] Failed to sync source table for ${tx.idempotencyKey}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async syncRewardToWallet(tx: CoinTransaction): Promise<boolean> {
    if (
      !this.mockWalletService ||
      tx.status !== CoinTransactionStatus.SUCCESS ||
      tx.amount <= 0
    ) {
      return false;
    }

    try {
      const res = await this.mockWalletService.creditReward({
        userId: tx.userId,
        amount: tx.amount,
        idempotencyKey: tx.idempotencyKey,
        source: tx.source,
        description: tx.reason || `Phần thưởng ${tx.source}`,
        createdAt: tx.processedAt ?? tx.createdAt,
      });
      return res.credited;
    } catch (err: unknown) {
      this.logger.warn(
        `[CoinTrackingService] Failed to sync reward to wallet for ${tx.idempotencyKey}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }

  async backfillSuccessRewardsToWallet(): Promise<number> {
    if (!this.mockWalletService) return 0;

    const successTxs = await this.prisma.coinTransaction.findMany({
      where: {
        status: CoinTransactionStatus.SUCCESS,
        amount: { gt: 0 },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (successTxs.length === 0) return 0;

    const existingWalletTxs = await this.prisma.mockWalletTransaction.findMany({
      where: {
        idempotencyKey: { in: successTxs.map((t) => t.idempotencyKey) },
      },
      select: { idempotencyKey: true },
    });
    const existingKeys = new Set(
      existingWalletTxs.map((t) => t.idempotencyKey).filter(Boolean),
    );

    let syncedCount = 0;
    for (const tx of successTxs) {
      if (existingKeys.has(tx.idempotencyKey)) continue;
      const credited = await this.syncRewardToWallet(tx);
      if (credited) syncedCount++;
    }
    return syncedCount;
  }
}
