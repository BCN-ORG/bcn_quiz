import { Injectable, Logger } from '@nestjs/common';
import {
  CheckStatusResponse,
  CoinServiceProvider,
  CreditRewardRequest,
  CreditRewardResponse,
} from './coin-provider.interface';

@Injectable()
export class MockCoinProvider implements CoinServiceProvider {
  private readonly logger = new Logger(MockCoinProvider.name);
  private readonly ledger = new Map<
    string,
    {
      request: CreditRewardRequest;
      status: 'SUCCESS' | 'PENDING' | 'FAILED';
      externalTxId: string;
      createdAt: Date;
    }
  >();

  // Configurable for testing failure and reconciliation behaviors
  public nextOutcomeOverride?: 'SUCCESS' | 'PENDING' | 'FAILED' | 'TIMEOUT';

  creditReward(req: CreditRewardRequest): Promise<CreditRewardResponse> {
    this.logger.log(
      `[MockCoinProvider] creditReward called: userId=${req.userId}, amount=${req.amount}, idempotencyKey=${req.idempotencyKey}`,
    );

    // Idempotency check: if key already exists, return existing outcome
    const existing = this.ledger.get(req.idempotencyKey);
    if (existing) {
      this.logger.log(
        `[MockCoinProvider] Idempotency hit for ${req.idempotencyKey}, status=${existing.status}`,
      );
      return Promise.resolve({
        success: existing.status === 'SUCCESS',
        externalTxId: existing.externalTxId,
        status: existing.status,
      });
    }

    if (this.nextOutcomeOverride === 'TIMEOUT') {
      this.nextOutcomeOverride = undefined;
      // Simulate external API timeout without updating ledger
      return Promise.reject(
        new Error('External Coin Service Gateway Timeout (504)'),
      );
    }

    const outcome = this.nextOutcomeOverride ?? 'SUCCESS';
    this.nextOutcomeOverride = undefined;

    const externalTxId = `mock_tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    this.ledger.set(req.idempotencyKey, {
      request: req,
      status: outcome,
      externalTxId,
      createdAt: new Date(),
    });

    if (outcome === 'FAILED') {
      return Promise.resolve({
        success: false,
        status: 'FAILED',
        errorMessage: 'External coin account rejected reward credit',
      });
    }

    return Promise.resolve({
      success: outcome === 'SUCCESS',
      externalTxId,
      status: outcome,
    });
  }

  checkStatus(idempotencyKey: string): Promise<CheckStatusResponse> {
    const entry = this.ledger.get(idempotencyKey);
    if (!entry) {
      return Promise.resolve({ status: 'NOT_FOUND' });
    }
    return Promise.resolve({
      status: entry.status,
      externalTxId: entry.externalTxId,
    });
  }

  // Helper for test assertions
  getRecord(idempotencyKey: string) {
    return this.ledger.get(idempotencyKey);
  }

  clear() {
    this.ledger.clear();
    this.nextOutcomeOverride = undefined;
  }
}
