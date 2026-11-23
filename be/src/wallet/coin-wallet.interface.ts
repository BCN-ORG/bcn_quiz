import { WalletHistoryQueryDto } from './dto/wallet.dto';

export interface WalletBalanceResult {
  balance: number;
  lockedBalance?: number;
  currency?: string;
  discordLinked?: boolean;
  isMock?: boolean;
  lastSyncedAt: Date;
  syncStatus: string;
}

export interface WalletUserSummary {
  id: string;
  fullName: string | null;
  email?: string;
  avatarUrl?: string | null;
  discordLinked?: boolean;
}

export interface WalletTransactionDto {
  id: string | null;
  userId?: string;
  type: string;
  amount: number;
  fee?: number;
  balanceAfter?: number;
  title?: string;
  description: string | null;
  counterparty?: { id: string; fullName: string | null } | null;
  counterpartyId?: string | null;
  counterpartyName?: string | null;
  idempotencyKey?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
  status: string;
  errorCode?: string | null;
  createdAt: Date | string;
}

export interface PaginatedTransactionsResult {
  transactions: WalletTransactionDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TransferCoinResult {
  transaction: WalletTransactionDto;
  senderBalance: number;
  recipientBalance?: number;
  message: string;
}

export abstract class CoinWalletService {
  abstract getBalance(userId: string): Promise<WalletBalanceResult>;
  abstract syncBalance(userId: string): Promise<WalletBalanceResult>;
  abstract getTransactionHistory(
    userId: string,
    query: WalletHistoryQueryDto,
  ): Promise<PaginatedTransactionsResult>;
  abstract searchUsers(
    currentUserId: string,
    keyword: string,
  ): Promise<WalletUserSummary[]>;
  abstract transferCoin(
    senderId: string,
    senderName: string,
    recipientId: string,
    amount: number,
    idempotencyKey?: string,
    description?: string,
  ): Promise<TransferCoinResult>;
  abstract transferToDiscordId(
    senderId: string,
    senderName: string,
    recipientDiscordId: string,
    amount: number,
    idempotencyKey: string,
    description?: string,
  ): Promise<TransferCoinResult>;
  abstract getTransactionDetail(
    userId: string,
    transactionId: string,
  ): Promise<WalletTransactionDto>;
}
