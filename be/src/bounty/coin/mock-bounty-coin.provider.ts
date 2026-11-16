import { Injectable, Logger } from '@nestjs/common';
import {
  BountyCheckStatusResponse,
  BountyCoinServiceProvider,
  BountyCreditRewardRequest,
  BountyCreditRewardResponse,
} from './coin-provider.interface';

@Injectable()
export class MockBountyCoinProvider implements BountyCoinServiceProvider {
  private readonly logger = new Logger(MockBountyCoinProvider.name);
  private readonly ledger = new Map<
    string,
    {
      txId: string;
      userId: string;
      amount: number;
      status: 'SUCCESS' | 'PENDING' | 'FAILED';
    }
  >();

  creditReward(
    req: BountyCreditRewardRequest,
  ): Promise<BountyCreditRewardResponse> {
    const existing = this.ledger.get(req.idempotencyKey);
    if (existing) {
      this.logger.log(
        `[MockBountyCoinProvider] Idempotent hit: ${req.idempotencyKey} -> tx ${existing.txId}`,
      );
      return Promise.resolve({
        success: existing.status === 'SUCCESS',
        externalTxId: existing.txId,
        status: existing.status,
      });
    }

    const txId = `bounty_mock_tx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    this.ledger.set(req.idempotencyKey, {
      txId,
      userId: req.userId,
      amount: req.amount,
      status: 'SUCCESS',
    });

    this.logger.log(
      `[MockBountyCoinProvider] Credited ${req.amount} coins to user ${req.userId} (key: ${req.idempotencyKey})`,
    );

    return Promise.resolve({
      success: true,
      externalTxId: txId,
      status: 'SUCCESS',
    });
  }

  checkStatus(idempotencyKey: string): Promise<BountyCheckStatusResponse> {
    const entry = this.ledger.get(idempotencyKey);
    if (!entry) {
      return Promise.resolve({ status: 'NOT_FOUND' });
    }
    return Promise.resolve({
      status: entry.status,
      externalTxId: entry.txId,
    });
  }
}
