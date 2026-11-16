export interface BountyCreditRewardRequest {
  userId: string;
  amount: number;
  idempotencyKey: string;
  metadata: {
    bountyId: string;
    bountySlug: string;
    bountyTitle: string;
    assignmentId: string;
  };
}

export interface BountyCreditRewardResponse {
  success: boolean;
  externalTxId?: string;
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  errorMessage?: string;
}

export interface BountyCheckStatusResponse {
  status: 'SUCCESS' | 'PENDING' | 'FAILED' | 'NOT_FOUND';
  externalTxId?: string;
  errorMessage?: string;
}

export interface BountyCoinServiceProvider {
  creditReward(
    req: BountyCreditRewardRequest,
  ): Promise<BountyCreditRewardResponse>;
  checkStatus(idempotencyKey: string): Promise<BountyCheckStatusResponse>;
}

export const BOUNTY_COIN_SERVICE_PROVIDER = 'BOUNTY_COIN_SERVICE_PROVIDER';
