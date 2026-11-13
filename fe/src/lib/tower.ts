import { request } from './api';

export interface TowerQuestionOption {
  label: string;
  content: string;
  isCode: boolean;
}

export interface TowerQuestion {
  id: string;
  question: string;
  code: string | null;
  imageUrl: string | null;
  options: TowerQuestionOption[];
  currentQuestionNumber: number;
  requiredStreak: number;
  timeLimitSeconds: number;
  expiresAt: string;
}

export interface TowerOverview {
  season: {
    id: string;
    seasonKey: string;
    name: string;
    startsAt: string;
    endsAt: string;
  };
  progress: {
    currentFloor: number;
    highestCompletedFloor: number;
    cooldownUntil: string | null;
    isCooldownActive: boolean;
    cooldownRemainingSeconds: number;
  };
  activeAttempt: {
    id: string;
    floor: number;
    currentStreak: number;
    requiredStreak: number;
    currentQuestionNumber: number;
    currentQuestion?: TowerQuestion | null;
  } | null;
}

export interface StartFloorResponse {
  attemptId: string;
  floor: number;
  currentStreak: number;
  requiredStreak: number;
  question: TowerQuestion;
}

export interface AnswerResponse {
  result: 'CORRECT' | 'FLOOR_COMPLETED' | 'FAILED';
  reason?: 'WRONG_ANSWER' | 'TIMEOUT';
  correctAnswer?: string;
  explanation?: string | null;
  currentStreak?: number;
  requiredStreak?: number;
  cooldownUntil?: string | null;
  cooldownRemainingSeconds?: number;
  completedFloor?: number;
  nextFloor?: number;
  rewardCoins?: number;
  rewardStatus?: string;
  nextQuestion?: TowerQuestion;
}

export interface TowerRewardTransactionItem {
  id: string;
  floor: number;
  rewardCoins: number;
  idempotencyKey: string;
  externalTxId: string | null;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'UNKNOWN';
  errorMessage: string | null;
  createdAt: string;
  processedAt: string | null;
  season?: {
    seasonKey: string;
    name: string;
  };
}

export const towerApi = {
  getOverview: () => request.get<TowerOverview>('/tower/overview'),
  startFloor: () => request.post<StartFloorResponse>('/tower/floor/start'),
  submitAnswer: (optionLabel: string) =>
    request.post<AnswerResponse>('/tower/floor/answer', { optionLabel }),
  getTransactions: (limit = 50) =>
    request.get<TowerRewardTransactionItem[]>(`/tower/transactions?limit=${limit}`),
};
