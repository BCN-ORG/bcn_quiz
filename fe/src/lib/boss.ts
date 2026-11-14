import { request } from './api';

export interface BossQuestionOption {
  label: string;
  content: string;
  isCode: boolean;
}

export interface BossQuestion {
  id: string;
  question: string;
  code: string | null;
  imageUrl: string | null;
  options: BossQuestionOption[];
  currentQuestionNumber: number;
  questionExpiresAt: string;
  sessionExpiresAt: string;
}

export interface BossMilestoneStatus {
  index: number;
  at: number;
  coin: number;
  name: string;
  unlocked: boolean;
}

export interface BossActiveSession {
  id: string;
  score: number;
  combo: number;
  maxCombo: number;
  currentQuestionNumber: number;
  sessionExpiresAt: string;
  sessionRemainingSeconds: number;
  currentQuestion: BossQuestion | null;
}

export interface BossOverview {
  season: {
    id: string;
    weekKey: string;
    name: string;
    bossName: string;
    bossMaxHp: number;
    startsAt: string;
    endsAt: string;
    isActive: boolean;
    isSettled: boolean;
  };
  community: {
    communityScore: number;
    bossCurrentHp: number;
    bossHpPercent: number;
    totalParticipants: number;
  };
  milestones: BossMilestoneStatus[];
  personal: {
    personalBest: number;
    totalAttempts: number;
    bestCombo: number;
    hasParticipated: boolean;
  };
  activeSession: BossActiveSession | null;
}

export interface BossStartSessionResponse {
  sessionId: string;
  score: number;
  combo: number;
  maxCombo: number;
  currentQuestionNumber: number;
  sessionExpiresAt: string;
  sessionRemainingSeconds: number;
  question: BossQuestion | null;
}

export interface BossAnswerResponse {
  result: 'CORRECT' | 'WRONG_ANSWER' | 'TIMEOUT' | 'SESSION_COMPLETED';
  score?: number;
  combo?: number;
  maxCombo?: number;
  correctAnswer?: string;
  correctAnswerContent?: string | null;
  explanation?: string | null;
  sessionRemainingSeconds?: number;
  questionRemainingSeconds?: number;
  nextQuestion?: BossQuestion | null;

  // Final summary fields if SESSION_COMPLETED
  sessionId?: string;
  personalBest?: number;
  isNewRecord?: boolean;
  totalAnswered?: number;
  correctCount?: number;
  wrongCount?: number;
  accuracy?: number;
  endReason?: string;
}

export interface BossNextQuestionResponse {
  result: 'NEXT_QUESTION' | 'SESSION_COMPLETED';
  score?: number;
  combo?: number;
  maxCombo?: number;
  sessionRemainingSeconds?: number;
  question?: BossQuestion | null;
  // Final summary fields if SESSION_COMPLETED
  personalBest?: number;
  isNewRecord?: boolean;
  totalAnswered?: number;
  accuracy?: number;
}

export interface BossTransactionItem {
  id: string;
  milestoneIndex: number;
  milestoneAt: number;
  rewardCoins: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'UNKNOWN';
  createdAt: string;
  processedAt: string | null;
  season?: {
    weekKey: string;
    name: string;
  };
}

export const bossApi = {
  getOverview: () => request.get<BossOverview>('/boss/overview'),
  startSession: () => request.post<BossStartSessionResponse>('/boss/session/start'),
  submitAnswer: (optionLabel: string) =>
    request.post<BossAnswerResponse>('/boss/session/answer', { optionLabel }),
  nextQuestion: () => request.post<BossNextQuestionResponse>('/boss/session/next'),
  abandonSession: () => request.post<{ success: boolean }>('/boss/session/abandon'),
  getTransactions: (limit = 50) =>
    request.get<BossTransactionItem[]>(`/boss/transactions?limit=${limit}`),
};
