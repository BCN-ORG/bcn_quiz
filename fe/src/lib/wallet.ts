import { request } from './api';

export type WalletSyncStatus = 'SYNCED' | 'SYNCING' | 'FAILED' | 'PENDING';

export interface WalletBalance {
  balance: number;
  lastSyncedAt: string | null;
  syncStatus: WalletSyncStatus;
  isMock: boolean;
}

export interface WalletUser {
  id: string;
  username?: string | null;
  email: string;
  fullName?: string | null;
  avatarUrl?: string | null;
}

export interface WalletTransferPayload {
  recipientId: string;
  amount: number;
  note?: string;
  idempotencyKey?: string;
}

export interface WalletTransferResult {
  success: boolean;
  transactionId?: string;
  referenceCode?: string;
  balance?: number;
  message?: string;
}

export type WalletTransactionType = 'RECEIVED' | 'SENT' | 'REWARD' | 'REFUND';
export type WalletTransactionStatus = 'SUCCESS' | 'PENDING' | 'FAILED';

export interface WalletTransaction {
  id: string;
  referenceCode: string;
  type: WalletTransactionType;
  amount: number;
  status: WalletTransactionStatus;
  counterpartUserId?: string | null;
  counterpartUsername?: string | null;
  counterpartEmail?: string | null;
  counterpartFullName?: string | null;
  note?: string | null;
  createdAt: string;
}

export interface RawWalletTransaction {
  id: string;
  reference?: string;
  referenceCode?: string;
  type: WalletTransactionType;
  amount: number;
  status: WalletTransactionStatus;
  counterpartUserId?: string | null;
  counterpartName?: string | null;
  counterpartFullName?: string | null;
  counterpartUsername?: string | null;
  counterpartEmail?: string | null;
  description?: string | null;
  note?: string | null;
  createdAt: string;
}

export interface RawWalletTransactionsResponse {
  items?: RawWalletTransaction[];
  transactions?: RawWalletTransaction[];
  total?: number;
  page?: number;
  limit?: number;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface WalletTransactionsQuery {
  page?: number;
  limit?: number;
  type?: string;
  status?: string;
  search?: string;
  from?: string;
  to?: string;
}

export interface WalletTransactionsResult {
  items: WalletTransaction[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function formatCoinAmount(amount: number, options?: { showSign?: boolean; isReceived?: boolean }): string {
  const formatted = Math.abs(amount).toLocaleString('vi-VN');
  if (options?.showSign) {
    if (options.isReceived || amount > 0) return `+${formatted}`;
    if (amount < 0) return `-${formatted}`;
  }
  return formatted;
}

export function formatVNDateTime(iso?: string | null): string {
  if (!iso) return 'Chưa đồng bộ';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Thời gian không hợp lệ';
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(d);
  } catch {
    return iso;
  }
}

export function formatVNDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(d);
  } catch {
    return iso;
  }
}

export const walletApi = {
  async getBalance(): Promise<WalletBalance> {
    return request.get<WalletBalance>('/wallet/balance');
  },

  async syncBalance(): Promise<WalletBalance> {
    return request.post<WalletBalance>('/wallet/sync');
  },

  async searchUsers(q: string): Promise<WalletUser[]> {
    const res = await request.get<WalletUser[] | { items: WalletUser[] }>(`/wallet/users/search?q=${encodeURIComponent(q.trim())}`);
    if (Array.isArray(res)) return res;
    if (res && Array.isArray((res as { items?: WalletUser[] }).items)) {
      return (res as { items: WalletUser[] }).items;
    }
    return [];
  },

  async transfer(payload: WalletTransferPayload): Promise<WalletTransferResult> {
    const res = await request.post<{
      transaction?: { id: string; reference?: string; referenceCode?: string };
      senderBalance?: number;
      balance?: number;
      message?: string;
      referenceCode?: string;
    }>('/wallet/transfer', {
      recipientId: payload.recipientId,
      amount: payload.amount,
      note: payload.note,
      description: payload.note,
      idempotencyKey: payload.idempotencyKey,
    });

    return {
      success: true,
      transactionId: res.transaction?.id,
      referenceCode:
        res.referenceCode ||
        res.transaction?.reference ||
        res.transaction?.referenceCode,
      balance: res.senderBalance ?? res.balance,
      message: res.message,
    };
  },

  async getTransactions(query: WalletTransactionsQuery = {}): Promise<WalletTransactionsResult> {
    const params = new URLSearchParams();
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));
    if (query.type && query.type !== 'ALL') params.set('type', query.type);
    if (query.status && query.status !== 'ALL') params.set('status', query.status);
    if (query.search?.trim()) params.set('search', query.search.trim());
    if (query.from) {
      params.set('from', query.from);
      params.set('startDate', query.from);
    }
    if (query.to) {
      params.set('to', query.to);
      params.set('endDate', query.to);
    }

    const queryString = params.toString();
    const endpoint = `/wallet/transactions${queryString ? `?${queryString}` : ''}`;
    const res = await request.get<
      | WalletTransactionsResult
      | RawWalletTransactionsResponse
    >(endpoint);

    const rawItems: RawWalletTransaction[] =
      'items' in res && Array.isArray(res.items)
        ? res.items
        : 'transactions' in res && Array.isArray(res.transactions)
          ? res.transactions
          : [];

    const items: WalletTransaction[] = rawItems.map((tx: RawWalletTransaction) => ({
      id: tx.id,
      referenceCode: tx.referenceCode || tx.reference || '',
      type: tx.type,
      amount: tx.amount,
      status: tx.status,
      counterpartUserId: tx.counterpartUserId,
      counterpartUsername: tx.counterpartUsername,
      counterpartEmail: tx.counterpartEmail,
      counterpartFullName: tx.counterpartFullName || tx.counterpartName,
      note: tx.note || tx.description,
      createdAt: tx.createdAt,
    }));

    const paginationRes = res as RawWalletTransactionsResponse;
    const limit =
      query.limit ||
      ('pagination' in res && typeof res.pagination?.limit === 'number'
        ? res.pagination.limit
        : paginationRes.limit || 10);
    const page =
      query.page ||
      ('pagination' in res && typeof res.pagination?.page === 'number'
        ? res.pagination.page
        : paginationRes.page || 1);
    const total =
      'pagination' in res && typeof res.pagination?.total === 'number'
        ? res.pagination.total
        : typeof paginationRes.total === 'number'
          ? paginationRes.total
          : items.length;

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  },

  async getTransaction(id: string): Promise<WalletTransaction> {
    return request.get<WalletTransaction>(`/wallet/transactions/${id}`);
  },
};
