import { Injectable, Logger } from '@nestjs/common';
import {
  BossCoinServiceProvider,
  BossCreditRewardRequest,
  BossCreditRewardResponse,
  BossCheckStatusResponse,
} from './coin-provider.interface';

@Injectable()
export class MockBossCoinProvider implements BossCoinServiceProvider {
  private readonly logger = new Logger(MockBossCoinProvider.name);
  private readonly ledger = new Map<
    string,
    { externalTxId: string; status: 'SUCCESS' | 'PENDING' | 'FAILED' }
  >();

  creditReward(
    req: BossCreditRewardRequest,
  ): Promise<BossCreditRewardResponse> {
    this.logger.log(
      `[MockBossCoinProvider] Credit reward userId=${req.userId}, amount=${req.amount}, key=${req.idempotencyKey}`,
    );

    if (this.ledger.has(req.idempotencyKey)) {
      const existing = this.ledger.get(req.idempotencyKey)!;
      return Promise.resolve({
        success: existing.status === 'SUCCESS',
        externalTxId: existing.externalTxId,
        status: existing.status,
      });
    }

    const externalTxId = `mock_tx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    this.ledger.set(req.idempotencyKey, { externalTxId, status: 'SUCCESS' });

    return Promise.resolve({
      success: true,
      externalTxId,
      status: 'SUCCESS',
    });
  }

  checkStatus(idempotencyKey: string): Promise<BossCheckStatusResponse> {
    if (this.ledger.has(idempotencyKey)) {
      const entry = this.ledger.get(idempotencyKey)!;
      return Promise.resolve({
        status: entry.status,
        externalTxId: entry.externalTxId,
      });
    }

    return Promise.resolve({
      status: 'NOT_FOUND',
    });
  }
}
