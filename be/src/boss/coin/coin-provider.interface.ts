export interface BossCreditRewardRequest {
  userId: string;
  amount: number; // 5 coins per milestone
  idempotencyKey: string;
  metadata: {
    weekKey: string;
    milestoneIndex: number;
    milestoneAt: number;
    milestoneName?: string;
  };
}

export interface BossCreditRewardResponse {
  success: boolean;
  externalTxId?: string;
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  errorMessage?: string;
}

export interface BossCheckStatusResponse {
  status: 'SUCCESS' | 'PENDING' | 'FAILED' | 'NOT_FOUND';
  externalTxId?: string;
  errorMessage?: string;
}

export interface BossCoinServiceProvider {
  creditReward(req: BossCreditRewardRequest): Promise<BossCreditRewardResponse>;
  checkStatus(idempotencyKey: string): Promise<BossCheckStatusResponse>;
}

export const BOSS_COIN_SERVICE_PROVIDER = 'BOSS_COIN_SERVICE_PROVIDER';
