export interface CreditRewardRequest {
  userId: string;
  amount: number; // 1 coin
  idempotencyKey: string;
  metadata: {
    seasonKey: string;
    floor: number;
    attemptId?: string;
  };
}

export interface CreditRewardResponse {
  success: boolean;
  externalTxId?: string;
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  errorMessage?: string;
}

export interface CheckStatusResponse {
  status: 'SUCCESS' | 'PENDING' | 'FAILED' | 'NOT_FOUND';
  externalTxId?: string;
  errorMessage?: string;
}

export interface CoinServiceProvider {
  creditReward(req: CreditRewardRequest): Promise<CreditRewardResponse>;
  checkStatus(idempotencyKey: string): Promise<CheckStatusResponse>;
}

export const COIN_SERVICE_PROVIDER = 'COIN_SERVICE_PROVIDER';
