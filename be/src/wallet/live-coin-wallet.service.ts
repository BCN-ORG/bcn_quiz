import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';
import { CoinApiClient } from '../coin/coin-api.client';
import {
  CoinWalletService,
  PaginatedTransactionsResult,
  TransferCoinResult,
  WalletBalanceResult,
  WalletTransactionDto,
  WalletUserSummary,
} from './coin-wallet.interface';
import { WalletHistoryQueryDto } from './dto/wallet.dto';

@Injectable()
export class LiveCoinWalletService implements CoinWalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profilesService: ProfilesService,
    private readonly coinApiClient: CoinApiClient,
  ) {}

  private async requireDiscordId(
    userId: string,
    roleLabel: 'người gửi' | 'người nhận' | 'tài khoản',
  ): Promise<string> {
    const discordId = await this.profilesService.resolveDiscordId(userId);
    if (!discordId) {
      throw new BadRequestException({
        errorCode: 'DISCORD_NOT_LINKED',
        message: `Tài khoản ${roleLabel} chưa liên kết Discord. Vui lòng liên kết Discord trên Profiles để sử dụng ví Coin.`,
      });
    }
    return discordId;
  }

  private async assertTransfersEnabled(): Promise<void> {
    const config = await this.prisma.coinSystemConfig.findUnique({
      where: { id: 'default' },
    });
    if (config && !config.transfersEnabled) {
      throw new ForbiddenException({
        errorCode: 'TRANSFERS_DISABLED',
        message: 'Chức năng chuyển Coin hiện đang tạm khóa để bảo trì.',
      });
    }
  }

  async getBalance(userId: string): Promise<WalletBalanceResult> {
    const discordId = await this.profilesService.resolveDiscordId(userId);
    if (!discordId) {
      return {
        balance: 0,
        lockedBalance: 0,
        currency: 'COIN',
        discordLinked: false,
        lastSyncedAt: new Date(),
        syncStatus: 'UNLINKED',
      };
    }

    const data = await this.coinApiClient.getBalance(discordId);
    return {
      balance: data.balance,
      lockedBalance: data.lockedBalance ?? 0,
      currency: data.currency ?? 'COIN',
      discordLinked: true,
      lastSyncedAt: new Date(data.lastSyncedAt),
      syncStatus: data.syncStatus,
    };
  }

  async syncBalance(userId: string): Promise<WalletBalanceResult> {
    const discordId = await this.requireDiscordId(userId, 'tài khoản');
    const data = await this.coinApiClient.syncBalance(discordId);
    return {
      balance: data.balance,
      lockedBalance: data.lockedBalance ?? 0,
      currency: data.currency ?? 'COIN',
      discordLinked: true,
      lastSyncedAt: new Date(data.lastSyncedAt),
      syncStatus: data.syncStatus,
    };
  }

  async getTransactionHistory(
    userId: string,
    query: WalletHistoryQueryDto,
  ): Promise<PaginatedTransactionsResult> {
    const discordId = await this.profilesService.resolveDiscordId(userId);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    if (!discordId) {
      return {
        transactions: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      };
    }

    let apiType = (query.type ?? 'ALL').toUpperCase();
    if (apiType === 'RECEIVED') apiType = 'TRANSFER_IN';
    if (apiType === 'SENT') apiType = 'TRANSFER_OUT';
    if (apiType === 'SYNC_ADJUSTMENT') apiType = 'ALL';

    const data = await this.coinApiClient.getTransactions(discordId, {
      page,
      limit,
      type: apiType,
    });

    const transactions: WalletTransactionDto[] = (data.items ?? []).map(
      (item) => ({
        id: item.id,
        type: item.type,
        amount: item.amount,
        balanceAfter: item.balanceAfter,
        title: item.title,
        description: item.description,
        counterparty: item.counterparty
          ? { id: item.counterparty.id, fullName: item.counterparty.fullName }
          : null,
        counterpartyName: item.counterparty?.fullName ?? null,
        status: item.status,
        createdAt: item.createdAt,
      }),
    );

    return {
      transactions,
      total: data.pagination?.total ?? transactions.length,
      page: data.pagination?.page ?? page,
      limit: data.pagination?.limit ?? limit,
      totalPages: data.pagination?.totalPages ?? 0,
    };
  }

  async searchUsers(
    currentUserId: string,
    keyword: string,
  ): Promise<WalletUserSummary[]> {
    const q = keyword.trim();
    if (!q) return [];
    const users = await this.profilesService.searchUsers(q);
    return users
      .filter((u) => u.id !== currentUserId)
      .slice(0, 20)
      .map((u) => ({
        id: u.id,
        fullName: u.fullName,
        avatarUrl: u.avatarUrl,
        discordLinked: Boolean(u.discordId),
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
    await this.assertTransfersEnabled();
    if (senderId === recipientId) {
      throw new BadRequestException({
        errorCode: 'SELF_TRANSFER_NOT_ALLOWED',
        message: 'Không thể tự chuyển Coin cho chính mình',
      });
    }
    const [senderDiscordId, recipientDiscordId] = await Promise.all([
      this.requireDiscordId(senderId, 'người gửi'),
      this.requireDiscordId(recipientId, 'người nhận'),
    ]);

    return this.executeTransfer(
      senderDiscordId,
      recipientDiscordId,
      amount,
      idempotencyKey,
      description ?? `Chuyển Coin từ ${senderName}`,
    );
  }

  async transferToDiscordId(
    senderId: string,
    senderName: string,
    recipientDiscordId: string,
    amount: number,
    idempotencyKey: string,
    description?: string,
  ): Promise<TransferCoinResult> {
    await this.assertTransfersEnabled();
    const senderDiscordId = await this.requireDiscordId(senderId, 'người gửi');
    return this.executeTransfer(
      senderDiscordId,
      recipientDiscordId,
      amount,
      idempotencyKey,
      description ?? `Thanh toán từ ${senderName}`,
    );
  }

  private async executeTransfer(
    senderDiscordId: string,
    recipientDiscordId: string,
    amount: number,
    idempotencyKey: string | undefined,
    description: string,
  ): Promise<TransferCoinResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException({
        errorCode: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Thiếu khóa chống trùng giao dịch (idempotencyKey)',
      });
    }

    const res = await this.coinApiClient.transfer({
      senderId: senderDiscordId,
      recipientId: recipientDiscordId,
      amount,
      idempotencyKey,
      description,
    });

    return {
      transaction: {
        id: res.transactionId,
        type: 'TRANSFER_OUT',
        amount: -res.amount,
        balanceAfter: res.senderBalance,
        description,
        status: res.status,
        idempotencyKey,
        createdAt: res.createdAt,
      },
      senderBalance: res.senderBalance,
      message: 'Chuyển Coin thành công',
    };
  }

  async getTransactionDetail(
    userId: string,
    transactionId: string,
  ): Promise<WalletTransactionDto> {
    const discordId = await this.requireDiscordId(userId, 'tài khoản');
    const detail = await this.coinApiClient.getTransactionDetail(transactionId);
    if (detail.senderId !== discordId && detail.recipientId !== discordId) {
      throw new NotFoundException('Không tìm thấy giao dịch');
    }

    return {
      id: detail.id,
      type: detail.type,
      amount: detail.amount,
      description: detail.description,
      status: detail.status,
      idempotencyKey: detail.idempotencyKey,
      errorCode: detail.errorCode ?? null,
      createdAt: detail.createdAt,
    };
  }
}
