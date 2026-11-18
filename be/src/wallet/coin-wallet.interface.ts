import { MockWalletTransaction } from '@prisma/client';
import { WalletHistoryQueryDto } from './dto/wallet.dto';

export interface WalletBalanceResult {
  balance: number;
  lastSyncedAt: Date;
  syncStatus: string;
}

export interface WalletUserSummary {
  id: string;
  fullName: string | null;
  email?: string;
  avatarUrl?: string | null;
}

export interface PaginatedTransactionsResult {
  transactions: MockWalletTransaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TransferCoinResult {
  transaction: MockWalletTransaction;
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
  abstract getTransactionDetail(
    userId: string,
    transactionId: string,
  ): Promise<MockWalletTransaction>;
}
