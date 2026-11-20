import * as crypto from 'crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  MockWalletTransaction,
  MockWalletTxStatus,
  MockWalletTxType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';
import {
  CoinWalletService,
  PaginatedTransactionsResult,
  TransferCoinResult,
  WalletBalanceResult,
  WalletUserSummary,
} from './coin-wallet.interface';
import { WalletHistoryQueryDto } from './dto/wallet.dto';

@Injectable()
export class MockCoinWalletService implements CoinWalletService {
  private readonly logger = new Logger(MockCoinWalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly profilesService: ProfilesService,
  ) {}

  async getBalance(userId: string): Promise<WalletBalanceResult> {
    const wallet = await this.prisma.mockWallet.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        balance: 100,
        syncStatus: 'SYNCED',
        lastSyncedAt: new Date(),
      },
    });

    return {
      balance: wallet.balance,
      lastSyncedAt: wallet.lastSyncedAt,
      syncStatus: wallet.syncStatus,
    };
  }

  async syncBalance(userId: string): Promise<WalletBalanceResult> {
    const now = new Date();
    const wallet = await this.prisma.mockWallet.upsert({
      where: { userId },
      update: {
        lastSyncedAt: now,
        syncStatus: 'SYNCED',
      },
      create: {
        userId,
        balance: 100,
        syncStatus: 'SYNCED',
        lastSyncedAt: now,
      },
    });

    return {
      balance: wallet.balance,
      lastSyncedAt: wallet.lastSyncedAt,
      syncStatus: wallet.syncStatus,
    };
  }

  async getTransactionHistory(
    userId: string,
    query: WalletHistoryQueryDto,
  ): Promise<PaginatedTransactionsResult> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.MockWalletTransactionWhereInput = {
      userId,
    };

    if (query.type) {
      where.type = query.type;
    }

    if (query.status) {
      where.status = query.status;
    }

    const startDate = query.startDate || query.from;
    const endDate = query.endDate || query.to;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { reference: { contains: term, mode: 'insensitive' } },
        { counterpartName: { contains: term, mode: 'insensitive' } },
        { counterpartUserId: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [transactions, total] = await Promise.all([
      this.prisma.mockWalletTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.mockWalletTransaction.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      transactions,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getTransactionDetail(
    userId: string,
    transactionId: string,
  ): Promise<MockWalletTransaction> {
    const transaction = await this.prisma.mockWalletTransaction.findFirst({
      where: {
        id: transactionId,
        userId,
      },
    });

    if (!transaction) {
      throw new NotFoundException(
        'Giao dịch không tồn tại hoặc bạn không có quyền xem.',
      );
    }

    return transaction;
  }

  async searchUsers(
    currentUserId: string,
    keyword: string,
  ): Promise<WalletUserSummary[]> {
    const term = keyword?.trim() ?? '';
    if (!term) {
      return [];
    }

    try {
      const userIds = await this.profilesService.searchUserIds(term);
      const filteredIds = userIds.filter((id) => id !== currentUserId);
      if (filteredIds.length > 0) {
        const resolved = await this.profilesService.resolveUsers(filteredIds);
        const results: WalletUserSummary[] = [];
        for (const id of filteredIds) {
          const u = resolved.get(id);
          if (u) {
            results.push({
              id: u.id,
              fullName: u.fullName,
              email: u.email,
              avatarUrl: u.avatarUrl,
            });
          }
        }
        if (results.length > 0) {
          return results;
        }
      }
    } catch (error) {
      this.logger.warn(
        `Profiles search failed, checking mock wallets: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Fallback: search existing mock wallets
    const wallets = await this.prisma.mockWallet.findMany({
      where: {
        userId: {
          not: currentUserId,
          contains: term,
          mode: 'insensitive',
        },
      },
      take: 20,
    });

    return wallets.map((w) => ({
      id: w.userId,
      fullName: w.userId,
      email: `${w.userId}@example.com`,
      avatarUrl: null,
    }));
  }

  async transferCoin(
    senderId: string,
    senderName: string,
    recipientId: string,
    amount: number,
    idempotencyKey?: string,
    description?: string,
  ): Promise<TransferCoinResult> {
    if (senderId === recipientId) {
      throw new BadRequestException('Không thể tự chuyển coin cho chính mình.');
    }

    if (!amount || !Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException(
        'Số lượng coin chuyển phải là số nguyên dương.',
      );
    }

    const cleanIdempotencyKey = idempotencyKey?.trim() || undefined;

    // Idempotency check: if already processed, return existing result without re-charging
    if (cleanIdempotencyKey) {
      const existingTx = await this.prisma.mockWalletTransaction.findUnique({
        where: { idempotencyKey: cleanIdempotencyKey },
      });
      if (existingTx) {
        const senderWallet = await this.prisma.mockWallet.findUnique({
          where: { userId: senderId },
        });
        return {
          transaction: existingTx,
          senderBalance: senderWallet?.balance ?? 0,
          message: 'Giao dịch đã được xử lý thành công trước đó.',
        };
      }
    }

    // Validate recipient existence
    const { recipientFound, recipientDisplayName } =
      await this.validateRecipient(recipientId);

    if (!recipientFound) {
      throw new NotFoundException('Người nhận không tồn tại.');
    }

    const sName = senderName?.trim() || 'Người gửi ẩn danh';
    const txDescription =
      description?.trim() || `Chuyển coin cho ${recipientDisplayName}`;
    const timestamp = Date.now();
    const randomSuffix = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();
    const senderRef = `TX-SENT-${timestamp}-${randomSuffix}`;
    const recipientRef = `TX-RECV-${timestamp}-${randomSuffix}`;

    return await this.prisma.$transaction(async (tx) => {
      // 1. Get or create sender wallet
      let senderWallet = await tx.mockWallet.findUnique({
        where: { userId: senderId },
      });
      if (!senderWallet) {
        senderWallet = await tx.mockWallet.create({
          data: {
            userId: senderId,
            balance: 100,
            syncStatus: 'SYNCED',
          },
        });
      }

      // 2. Validate sender balance
      if (senderWallet.balance < amount) {
        throw new BadRequestException(
          `Số dư coin không đủ. Số dư hiện tại: ${senderWallet.balance}, cần: ${amount}`,
        );
      }

      // 3. Get or create recipient wallet
      let recipientWallet = await tx.mockWallet.findUnique({
        where: { userId: recipientId },
      });
      if (!recipientWallet) {
        recipientWallet = await tx.mockWallet.create({
          data: {
            userId: recipientId,
            balance: 100,
            syncStatus: 'SYNCED',
          },
        });
      }

      // 4. Update balances atomically
      const updatedSender = await tx.mockWallet.update({
        where: { id: senderWallet.id },
        data: {
          balance: { decrement: amount },
        },
      });

      const updatedRecipient = await tx.mockWallet.update({
        where: { id: recipientWallet.id },
        data: {
          balance: { increment: amount },
        },
      });

      // 5. Create transaction for sender (SENT)
      const senderTx = await tx.mockWalletTransaction.create({
        data: {
          reference: senderRef,
          walletId: senderWallet.id,
          userId: senderId,
          type: MockWalletTxType.SENT,
          amount,
          status: MockWalletTxStatus.SUCCESS,
          counterpartUserId: recipientId,
          counterpartName: recipientDisplayName,
          description: txDescription,
          idempotencyKey: cleanIdempotencyKey,
        },
      });

      // 6. Create transaction for recipient (RECEIVED)
      await tx.mockWalletTransaction.create({
        data: {
          reference: recipientRef,
          walletId: recipientWallet.id,
          userId: recipientId,
          type: MockWalletTxType.RECEIVED,
          amount,
          status: MockWalletTxStatus.SUCCESS,
          counterpartUserId: senderId,
          counterpartName: sName,
          description: description?.trim() || `Nhận coin từ ${sName}`,
          idempotencyKey: cleanIdempotencyKey
            ? `${cleanIdempotencyKey}-recv`
            : null,
        },
      });

      return {
        transaction: senderTx,
        senderBalance: updatedSender.balance,
        recipientBalance: updatedRecipient.balance,
        message: 'Chuyển coin thành công.',
      };
    });
  }

  private async validateRecipient(
    recipientId: string,
  ): Promise<{ recipientFound: boolean; recipientDisplayName: string }> {
    try {
      const detailed = await this.profilesService.resolveUsersDetailed([
        recipientId,
      ]);
      const profile = detailed.users.get(recipientId);
      if (profile) {
        return {
          recipientFound: true,
          recipientDisplayName:
            profile.fullName || profile.email || recipientId,
        };
      }
      if (!detailed.failed) {
        // Profiles responded and explicitly does not have this user.
        // Check if user has an existing MockWallet (e.g. from local tests/seed)
        const wallet = await this.prisma.mockWallet.findUnique({
          where: { userId: recipientId },
        });
        if (wallet) {
          return {
            recipientFound: true,
            recipientDisplayName: recipientId,
          };
        }
        return { recipientFound: false, recipientDisplayName: recipientId };
      }
    } catch (err) {
      this.logger.warn(
        `Profiles resolve failed for recipient ${recipientId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Fallback: If Profiles service is not configured or offline,
    // check if recipient exists in mock wallet or accept in non-production.
    const wallet = await this.prisma.mockWallet.findUnique({
      where: { userId: recipientId },
    });
    if (wallet) {
      return {
        recipientFound: true,
        recipientDisplayName: recipientId,
      };
    }

    // If in test or dev environment and Profiles is down, treat recipient as valid mock user
    if (process.env.NODE_ENV !== 'production') {
      return {
        recipientFound: true,
        recipientDisplayName: recipientId,
      };
    }

    return { recipientFound: false, recipientDisplayName: recipientId };
  }

  /**
   * Idempotently credits a game reward (Boss, Tower, Bounty) into the user's MockWallet
   * and records a REWARD transaction so it appears in /wallet balance & history.
   */
  async creditReward(params: {
    userId: string;
    amount: number;
    idempotencyKey: string;
    source: string;
    description: string;
    createdAt?: Date;
  }): Promise<{ credited: boolean; transaction?: MockWalletTransaction }> {
    const { userId, amount, idempotencyKey, source, description, createdAt } =
      params;
    if (
      !userId ||
      !idempotencyKey ||
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      return { credited: false };
    }

    const counterpartMap: Record<string, string> = {
      BOSS: 'Phần thưởng Săn Boss',
      TOWER: 'Phần thưởng Leo Tháp',
      BOUNTY: 'Phần thưởng Nhiệm vụ',
      LEVEL_UP: 'Phần thưởng Thăng Cấp',
      DAILY_QUEST: 'Rương Nhiệm vụ ngày',
    };
    const counterpartName = counterpartMap[source] ?? 'Phần thưởng BCN Arena';
    const reference = `RW-${crypto
      .createHash('sha1')
      .update(idempotencyKey)
      .digest('hex')
      .slice(0, 12)
      .toUpperCase()}`;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.mockWalletTransaction.findUnique({
          where: { idempotencyKey },
        });
        if (existing) {
          return { credited: false, transaction: existing };
        }

        const now = new Date();
        const wallet = await tx.mockWallet.upsert({
          where: { userId },
          update: {
            balance: { increment: amount },
            lastSyncedAt: now,
            syncStatus: 'SYNCED',
          },
          create: {
            userId,
            balance: 100 + amount,
            lastSyncedAt: now,
            syncStatus: 'SYNCED',
          },
        });

        const transaction = await tx.mockWalletTransaction.create({
          data: {
            reference,
            walletId: wallet.id,
            userId,
            type: MockWalletTxType.REWARD,
            amount,
            status: MockWalletTxStatus.SUCCESS,
            counterpartUserId: `SYSTEM_${source}`,
            counterpartName,
            description: description || counterpartName,
            idempotencyKey,
            createdAt: createdAt ?? now,
          },
        });

        return { credited: true, transaction };
      });
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return { credited: false };
      }
      throw err;
    }
  }

  private cachedTreasuryUserId: string | null | undefined = undefined;

  private async resolveTreasuryAdminUserId(): Promise<string | null> {
    const envUserId = process.env.COSMETIC_TREASURY_USER_ID?.trim();
    if (envUserId) return envUserId;
    if (this.cachedTreasuryUserId !== undefined) {
      return this.cachedTreasuryUserId;
    }
    const targetEmail = (
      process.env.COSMETIC_TREASURY_EMAIL || 'tuanhungvip12@gmail.com'
    )
      .trim()
      .toLowerCase();
    try {
      const ids = await this.profilesService.searchUserIds(targetEmail);
      if (ids.length > 0) {
        const resolved = await this.profilesService.resolveUsers(ids);
        for (const [id, profile] of resolved.entries()) {
          if (profile.email?.trim().toLowerCase() === targetEmail) {
            this.cachedTreasuryUserId = id;
            return id;
          }
        }
      }
    } catch {
      this.logger.warn(
        `Could not resolve treasury admin (${targetEmail}) from Profiles; falling back to SYSTEM_COSMETIC_SHOP.`,
      );
      return null;
    }
    this.cachedTreasuryUserId = null;
    return null;
  }

  /**
   * Atomically debits Coins for an in-app cosmetic purchase and transfers them
   * to the unified admin treasury account (tuanhungvip12@gmail.com) when resolved.
   */
  async debitPurchase(params: {
    userId: string;
    amount: number;
    idempotencyKey: string;
    description: string;
  }): Promise<{
    debited: boolean;
    balance: number;
    transaction?: MockWalletTransaction;
  }> {
    const { userId, amount, idempotencyKey, description } = params;
    if (
      !userId ||
      !idempotencyKey ||
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      throw new BadRequestException('Thông tin giao dịch không hợp lệ.');
    }

    const treasuryUserId = await this.resolveTreasuryAdminUserId();
    const transferToTreasury = Boolean(
      treasuryUserId && treasuryUserId !== userId,
    );
    const counterpartUserId = transferToTreasury
      ? treasuryUserId!
      : 'SYSTEM_COSMETIC_SHOP';
    const counterpartName = transferToTreasury
      ? 'Quỹ Admin BCN (tuanhungvip12@gmail.com)'
      : 'Cửa hàng Trang bị BCN';

    const reference = `SP-${crypto
      .createHash('sha1')
      .update(idempotencyKey)
      .digest('hex')
      .slice(0, 12)
      .toUpperCase()}`;

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.mockWalletTransaction.findUnique({
        where: { idempotencyKey },
      });
      const now = new Date();
      let wallet = await tx.mockWallet.findUnique({ where: { userId } });
      if (!wallet) {
        wallet = await tx.mockWallet.create({
          data: {
            userId,
            balance: 100,
            lastSyncedAt: now,
            syncStatus: 'SYNCED',
          },
        });
      }

      if (existing) {
        return {
          debited: false,
          balance: wallet.balance,
          transaction: existing,
        };
      }

      if (wallet.balance < amount) {
        throw new BadRequestException(
          `Số dư không đủ (cần ${amount.toLocaleString('vi-VN')} Coin, hiện có ${wallet.balance.toLocaleString('vi-VN')} Coin).`,
        );
      }

      const updatedWallet = await tx.mockWallet.update({
        where: { userId },
        data: {
          balance: { decrement: amount },
          lastSyncedAt: now,
          syncStatus: 'SYNCED',
        },
      });

      const transaction = await tx.mockWalletTransaction.create({
        data: {
          reference,
          walletId: updatedWallet.id,
          userId,
          type: MockWalletTxType.SENT,
          amount,
          status: MockWalletTxStatus.SUCCESS,
          counterpartUserId,
          counterpartName,
          description,
          idempotencyKey,
          createdAt: now,
        },
      });

      if (transferToTreasury) {
        const treasuryWallet = await tx.mockWallet.upsert({
          where: { userId: treasuryUserId! },
          update: {
            balance: { increment: amount },
            lastSyncedAt: now,
            syncStatus: 'SYNCED',
          },
          create: {
            userId: treasuryUserId!,
            balance: 100 + amount,
            lastSyncedAt: now,
            syncStatus: 'SYNCED',
          },
        });

        await tx.mockWalletTransaction.create({
          data: {
            reference: `${reference}-RC`,
            walletId: treasuryWallet.id,
            userId: treasuryUserId!,
            type: MockWalletTxType.RECEIVED,
            amount,
            status: MockWalletTxStatus.SUCCESS,
            counterpartUserId: userId,
            counterpartName: 'Cửa hàng Trang bị BCN',
            description,
            idempotencyKey: `${idempotencyKey}:rcpt`,
            createdAt: now,
          },
        });
      }

      return {
        debited: true,
        balance: updatedWallet.balance,
        transaction,
      };
    });
  }
}
