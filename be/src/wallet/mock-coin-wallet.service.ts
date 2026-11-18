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
}
