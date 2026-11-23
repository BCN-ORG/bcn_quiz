import { Injectable } from '@nestjs/common';
import { CoinRewardSource } from '@prisma/client';
import { ProfilesService } from '../profiles/profiles.service';
import { CoinApiClient, CoinApiRewardSource } from './coin-api.client';
import { CoinConfigService } from './coin-config.service';

export interface UnifiedRewardRequest {
  userId: string;
  amount: number;
  idempotencyKey: string;
  source: CoinRewardSource;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface UnifiedRewardResponse {
  success: boolean;
  externalTxId?: string;
  status: 'SUCCESS' | 'PENDING' | 'FAILED' | 'UNKNOWN';
  errorCode?: string;
  errorMessage?: string;
  requestPayload?: Record<string, unknown>;
  responsePayload?: Record<string, unknown>;
}

export interface UnifiedCheckStatusResponse {
  status: 'SUCCESS' | 'PENDING' | 'FAILED' | 'NOT_FOUND' | 'UNKNOWN';
  externalTxId?: string;
  errorCode?: string;
  errorMessage?: string;
}

@Injectable()
export class LiveCoinRewardAdapter {
  constructor(
    private readonly coinApiClient: CoinApiClient,
    private readonly coinConfigService: CoinConfigService,
    private readonly profilesService: ProfilesService,
  ) {}

  mapSource(source: CoinRewardSource): CoinApiRewardSource {
    switch (source) {
      case CoinRewardSource.TOWER:
        return 'TOWER_COMPLETION';
      case CoinRewardSource.BOSS:
        return 'BOSS_BATTLE';
      case CoinRewardSource.BOUNTY:
        return 'BOUNTY_COMPLETION';
      case CoinRewardSource.DAILY_QUEST:
      case CoinRewardSource.LEVEL_UP:
      default:
        return 'DAILY_QUEST';
    }
  }

  async preparePayload(req: UnifiedRewardRequest): Promise<{
    ok: boolean;
    errorCode?: string;
    errorMessage?: string;
    payload?: {
      userId: string;
      amount: number;
      idempotencyKey: string;
      source: CoinApiRewardSource;
      description: string;
      metadata?: Record<string, unknown>;
    };
  }> {
    const config = await this.coinConfigService.getConfig();
    if (!config.rewardsEnabled) {
      return {
        ok: false,
        errorCode: 'REWARDS_DISABLED',
        errorMessage: 'Hệ thống trả thưởng Coin đang tạm khóa để bảo trì',
      };
    }

    const discordId = await this.profilesService.resolveDiscordId(req.userId);
    if (!discordId) {
      return {
        ok: false,
        errorCode: 'DISCORD_NOT_LINKED',
        errorMessage:
          'Tài khoản chưa liên kết Discord. Vui lòng liên kết Discord trên Profiles để nhận Coin.',
      };
    }

    const clampedAmount = await this.coinConfigService.clampRewardAmount(
      req.source,
      req.amount,
    );
    const apiSource = this.mapSource(req.source);
    const metadata =
      req.source === CoinRewardSource.LEVEL_UP
        ? { ...(req.metadata ?? {}), kind: 'LEVEL_MILESTONE' }
        : req.metadata;

    return {
      ok: true,
      payload: {
        userId: discordId,
        amount: clampedAmount,
        idempotencyKey: this.coinApiClient.validateIdempotencyKey(
          req.idempotencyKey,
        ),
        source: apiSource,
        description: this.coinApiClient.sanitizeDescription(
          req.description,
          'Thưởng BCN Quiz',
        ),
        metadata: this.coinApiClient.validateMetadata(metadata),
      },
    };
  }

  async dispatchPayload(payload: {
    userId: string;
    amount: number;
    idempotencyKey: string;
    source: CoinApiRewardSource;
    description: string;
    metadata?: Record<string, unknown>;
  }): Promise<UnifiedRewardResponse> {
    const res = await this.coinApiClient.reward(payload);
    if (res.ok && res.data) {
      return {
        success: true,
        externalTxId: res.data.transactionId,
        status: 'SUCCESS',
        requestPayload: payload,
        responsePayload: res.data as unknown as Record<string, unknown>,
      };
    }

    return {
      success: false,
      status: res.outcome,
      errorCode: res.errorCode,
      errorMessage: res.errorMessage,
      requestPayload: payload,
    };
  }

  async checkStatus(
    idempotencyKey: string,
  ): Promise<UnifiedCheckStatusResponse> {
    const res = await this.coinApiClient.checkStatus(idempotencyKey);
    if (!res.ok || !res.data) {
      return {
        status: res.outcome === 'PENDING' ? 'PENDING' : 'UNKNOWN',
        errorCode: res.errorCode,
        errorMessage: res.errorMessage,
      };
    }

    return {
      status: res.data.status,
      externalTxId: res.data.transactionId,
      errorCode: res.data.errorCode,
    };
  }
}
