import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

export type CoinProviderMode = 'mock' | 'live';

export function getCoinProviderMode(): CoinProviderMode {
  return process.env.COIN_PROVIDER?.trim().toLowerCase() === 'live'
    ? 'live'
    : 'mock';
}

export type CoinApiRewardSource =
  'TOWER_COMPLETION' | 'BOSS_BATTLE' | 'DAILY_QUEST' | 'BOUNTY_COMPLETION';

export interface CoinApiBalanceData {
  userId: string;
  balance: number;
  lockedBalance: number;
  currency: string;
  lastSyncedAt: string;
  syncStatus: string;
}

export interface CoinApiTransactionItem {
  id: string | null;
  type: string;
  amount: number;
  balanceAfter: number;
  title: string;
  description: string | null;
  counterparty: { id: string; fullName: string | null } | null;
  status: string;
  createdAt: string;
}

export interface CoinApiTransactionsData {
  items: CoinApiTransactionItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CoinApiTransactionDetail {
  id: string;
  senderId: string;
  recipientId: string;
  amount: number;
  fee: number;
  type: string;
  status: string;
  idempotencyKey: string;
  description: string | null;
  source?: string;
  metadata?: Record<string, unknown>;
  errorCode?: string;
  createdAt: string;
}

export interface CoinApiTransferData {
  transactionId: string;
  senderId: string;
  recipientId: string;
  amount: number;
  senderBalance: number;
  status: string;
  createdAt: string;
}

export interface CoinApiRewardData {
  transactionId: string;
  userId: string;
  amount: number;
  newBalance: number;
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
}

export interface CoinApiCheckStatusData {
  idempotencyKey: string;
  status: 'SUCCESS' | 'PENDING' | 'FAILED' | 'NOT_FOUND';
  transactionId?: string;
  amount?: number;
  errorCode?: string;
  createdAt?: string;
}

export interface CoinApiOutcome<T> {
  ok: boolean;
  outcome: 'SUCCESS' | 'PENDING' | 'FAILED' | 'UNKNOWN';
  data?: T;
  errorCode?: string;
  errorMessage?: string;
  httpStatus?: number;
}

const IDEMPOTENCY_KEY_RE = /^[a-zA-Z0-9:_.-]{1,128}$/;

@Injectable()
export class CoinApiClient implements OnModuleInit {
  private readonly logger = new Logger(CoinApiClient.name);

  constructor(private readonly httpService: HttpService) {}

  onModuleInit(): void {
    if (getCoinProviderMode() !== 'live') return;

    const baseUrl = this.getBaseUrl();
    const apiKey = this.getApiKey();
    const treasuryId = this.getTreasuryDiscordId();

    if (!baseUrl) {
      throw new Error('COIN_API_BASE_URL is required when COIN_PROVIDER=live');
    }
    if (!apiKey || apiKey.length < 32) {
      throw new Error(
        'BCN_COIN_API_KEY (min 32 characters) is required when COIN_PROVIDER=live',
      );
    }
    if (!treasuryId) {
      this.logger.warn(
        'COIN_TREASURY_DISCORD_ID is not set; cosmetic purchases will be disabled until configured.',
      );
    }
  }

  getBaseUrl(): string {
    return (process.env.COIN_API_BASE_URL?.trim() ?? '').replace(/\/$/, '');
  }

  getApiKey(): string {
    return (
      process.env.BCN_COIN_API_KEY?.trim() ||
      process.env.COIN_API_KEY?.trim() ||
      ''
    );
  }

  getTreasuryDiscordId(): string {
    return process.env.COIN_TREASURY_DISCORD_ID?.trim() ?? '';
  }

  getTimeoutMs(): number {
    const parsed = Number(process.env.COIN_API_TIMEOUT_MS ?? 8000);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 8000;
  }

  validateIdempotencyKey(key: string): string {
    const trimmed = (key ?? '').trim();
    if (!IDEMPOTENCY_KEY_RE.test(trimmed)) {
      throw new BadRequestException(
        'idempotencyKey phải dài 1–128 ký tự và chỉ gồm chữ, số, :, _, ., -',
      );
    }
    return trimmed;
  }

  sanitizeDescription(
    description: string | undefined,
    fallback: string,
  ): string {
    const raw = (description ?? '').trim() || fallback;
    return raw.slice(0, 200);
  }

  validateMetadata(
    metadata?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (!metadata) return undefined;
    const bytes = Buffer.byteLength(JSON.stringify(metadata), 'utf8');
    if (bytes > 2048) {
      throw new BadRequestException('metadata vượt quá giới hạn 2 KB');
    }
    return metadata;
  }

  async getBalance(discordUserId: string): Promise<CoinApiBalanceData> {
    const res = await this.requestOrThrow<{ data: CoinApiBalanceData }>(
      'GET',
      `/wallets/${encodeURIComponent(discordUserId)}/balance`,
    );
    return res.data;
  }

  async syncBalance(discordUserId: string): Promise<CoinApiBalanceData> {
    const res = await this.requestOrThrow<{ data: CoinApiBalanceData }>(
      'POST',
      `/wallets/${encodeURIComponent(discordUserId)}/sync`,
    );
    return res.data;
  }

  async getTransactions(
    discordUserId: string,
    params: { page?: number; limit?: number; type?: string },
  ): Promise<CoinApiTransactionsData> {
    const page = Math.max(1, Math.floor(params.page ?? 1));
    const limit = Math.min(100, Math.max(1, Math.floor(params.limit ?? 10)));
    const type = (params.type ?? 'ALL').toUpperCase();
    const res = await this.requestOrThrow<{ data: CoinApiTransactionsData }>(
      'GET',
      `/wallets/${encodeURIComponent(discordUserId)}/transactions`,
      undefined,
      { page, limit, type },
    );
    return res.data;
  }

  async getTransactionDetail(
    transactionId: string,
  ): Promise<CoinApiTransactionDetail> {
    const res = await this.requestOrThrow<{ data: CoinApiTransactionDetail }>(
      'GET',
      `/transactions/${encodeURIComponent(transactionId)}`,
    );
    return res.data;
  }

  async transfer(params: {
    senderId: string;
    recipientId: string;
    amount: number;
    idempotencyKey: string;
    description?: string;
  }): Promise<CoinApiTransferData> {
    const key = this.validateIdempotencyKey(params.idempotencyKey);
    const body = {
      senderId: params.senderId,
      recipientId: params.recipientId,
      amount: params.amount,
      idempotencyKey: key,
      description: params.description
        ? this.sanitizeDescription(params.description, 'Chuyển Coin')
        : undefined,
    };
    const res = await this.requestOrThrow<{ data: CoinApiTransferData }>(
      'POST',
      '/wallets/transfer',
      body,
      undefined,
      { 'Idempotency-Key': key },
    );
    return res.data;
  }

  async reward(params: {
    userId: string;
    amount: number;
    idempotencyKey: string;
    source: CoinApiRewardSource;
    description: string;
    metadata?: Record<string, unknown>;
  }): Promise<CoinApiOutcome<CoinApiRewardData>> {
    const key = this.validateIdempotencyKey(params.idempotencyKey);
    const description = this.sanitizeDescription(
      params.description,
      'Thưởng BCN Quiz',
    );
    const metadata = this.validateMetadata(params.metadata);

    const body = {
      userId: params.userId,
      amount: params.amount,
      idempotencyKey: key,
      source: params.source,
      description,
      ...(metadata ? { metadata } : {}),
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post<{ success: boolean; data: CoinApiRewardData }>(
          `${this.getBaseUrl()}/coins/reward`,
          body,
          {
            headers: {
              ...this.authHeaders(),
              'Content-Type': 'application/json',
              'Idempotency-Key': key,
            },
            timeout: this.getTimeoutMs(),
          },
        ),
      );
      return {
        ok: true,
        outcome: 'SUCCESS',
        data: response.data.data,
        httpStatus: response.status,
      };
    } catch (error) {
      return this.classifyError<CoinApiRewardData>(error, 'reward');
    }
  }

  async checkStatus(
    idempotencyKey: string,
  ): Promise<CoinApiOutcome<CoinApiCheckStatusData>> {
    const key = this.validateIdempotencyKey(idempotencyKey);
    try {
      const response = await firstValueFrom(
        this.httpService.get<{
          success: boolean;
          data: CoinApiCheckStatusData;
        }>(
          `${this.getBaseUrl()}/coins/check-status/${encodeURIComponent(key)}`,
          {
            headers: this.authHeaders(),
            timeout: this.getTimeoutMs(),
          },
        ),
      );
      return {
        ok: true,
        outcome: 'SUCCESS',
        data: response.data.data,
        httpStatus: response.status,
      };
    } catch (error) {
      return this.classifyError<CoinApiCheckStatusData>(error, 'checkStatus');
    }
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.getApiKey()}`,
    };
  }

  private async requestOrThrow<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    params?: Record<string, unknown>,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const url = `${this.getBaseUrl()}${path}`;
    try {
      const response = await firstValueFrom(
        this.httpService.request<T>({
          method,
          url,
          data: body,
          params,
          headers: {
            ...this.authHeaders(),
            ...(body !== undefined
              ? { 'Content-Type': 'application/json' }
              : {}),
            ...extraHeaders,
          },
          timeout: this.getTimeoutMs(),
        }),
      );
      return response.data;
    } catch (error) {
      const classified = this.classifyError<never>(error, `${method} ${path}`);
      throw this.toHttpException(
        classified.httpStatus,
        classified.errorCode,
        classified.errorMessage,
      );
    }
  }

  private classifyError<T>(error: unknown, op: string): CoinApiOutcome<T> {
    if (!(error instanceof AxiosError)) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[CoinApiClient:${op}] unexpected error: ${msg}`);
      return {
        ok: false,
        outcome: 'UNKNOWN',
        errorCode: 'INTERNAL_ERROR',
        errorMessage: 'Lỗi không xác định khi gọi Coin Service',
      };
    }

    const status = error.response?.status;
    const data = error.response?.data as
      { errorCode?: string; message?: string } | undefined;
    const errorCode = data?.errorCode;
    const rawMessage = data?.message;

    if (
      !status ||
      error.code === 'ECONNABORTED' ||
      error.code === 'ETIMEDOUT'
    ) {
      this.logger.warn(
        `[CoinApiClient:${op}] network/timeout: ${error.code ?? error.message}`,
      );
      return {
        ok: false,
        outcome: 'UNKNOWN',
        errorCode: 'TIMEOUT_OR_NETWORK',
        errorMessage: 'Mất kết nối hoặc timeout khi gọi Coin Service',
      };
    }

    if (status === 409 && errorCode === 'TRANSACTION_IN_PROGRESS') {
      return {
        ok: false,
        outcome: 'PENDING',
        errorCode,
        errorMessage:
          rawMessage ?? 'Giao dịch đang được xử lý, vui lòng thử lại sau',
        httpStatus: status,
      };
    }

    if (status >= 500) {
      this.logger.error(
        `[CoinApiClient:${op}] upstream ${status} ${errorCode ?? ''}`,
      );
      return {
        ok: false,
        outcome: 'UNKNOWN',
        errorCode: errorCode ?? 'INTERNAL_ERROR',
        errorMessage:
          rawMessage ??
          'Coin Service đang tạm thời gián đoạn, vui lòng thử lại',
        httpStatus: status,
      };
    }

    if (status === 401) {
      this.logger.error(
        `[CoinApiClient:${op}] auth failure ${errorCode ?? 'UNAUTHORIZED'}`,
      );
    }

    return {
      ok: false,
      outcome: 'FAILED',
      errorCode: errorCode ?? `HTTP_${status}`,
      errorMessage: this.mapFriendlyMessage(errorCode, rawMessage),
      httpStatus: status,
    };
  }

  mapFriendlyMessage(errorCode?: string, fallback?: string): string {
    switch (errorCode) {
      case 'INSUFFICIENT_BALANCE':
        return 'Số dư Coin của bạn không đủ để thực hiện giao dịch';
      case 'SELF_TRANSFER_NOT_ALLOWED':
        return 'Không thể tự chuyển Coin cho chính mình';
      case 'RECIPIENT_NOT_FOUND':
        return 'Người nhận chưa tham gia server Discord hoặc là tài khoản bot';
      case 'SENDER_NOT_ALLOWED':
        return 'Tài khoản gửi không hợp lệ (ví hệ thống)';
      case 'RECIPIENT_NOT_ALLOWED':
        return 'Tài khoản nhận thưởng không hợp lệ (ví hệ thống)';
      case 'WALLET_NOT_FOUND':
        return 'Chưa tìm thấy ví Coin trên server Discord';
      case 'REWARD_POOL_INSUFFICIENT':
        return 'Ví thưởng hệ thống tạm thời hết Coin, quản trị sẽ xử lý và đối soát lại';
      case 'API_DISABLED':
      case 'UNAUTHORIZED':
        return 'Kết nối Coin Service chưa được cấu hình hợp lệ';
      case 'REWARD_POOL_NOT_CONFIGURED':
        return 'Ví thưởng hệ thống chưa được cấu hình trên Coin Service';
      case 'IDEMPOTENCY_KEY_REUSED':
        return 'Khóa giao dịch đã được sử dụng cho một giao dịch khác';
      default:
        return fallback ?? 'Giao dịch Coin thất bại';
    }
  }

  private toHttpException(
    httpStatus?: number,
    errorCode?: string,
    message?: string,
  ): HttpException {
    const payload = {
      errorCode: errorCode ?? 'COIN_SERVICE_ERROR',
      message: this.mapFriendlyMessage(errorCode, message),
    };
    if (!httpStatus || httpStatus >= 500) {
      return new ServiceUnavailableException(payload);
    }
    return new HttpException(payload, httpStatus || HttpStatus.BAD_GATEWAY);
  }
}
