import { request } from "./api";

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
    bossImageUrl: string | null;
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
  /** True when this read ended the session for 5 unanswered questions in a row. */
  idleEnded?: boolean;
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
  result: "CORRECT" | "WRONG_ANSWER" | "TIMEOUT" | "SESSION_COMPLETED";
  score?: number;
  combo?: number;
  maxCombo?: number;
  correctAnswer?: string;
  correctAnswerContent?: string | null;
  explanation?: string | null;
  sessionRemainingSeconds?: number;
  questionRemainingSeconds?: number;
  nextQuestion?: BossQuestion | null;
  /** Present only when this correct answer beat the weekly record and was already deducted from the boss. */
  bossDamage?: number;
  communityScore?: number;

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
  result: "NEXT_QUESTION" | "SESSION_COMPLETED";
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
  status: "PENDING" | "SUCCESS" | "FAILED" | "UNKNOWN";
  createdAt: string;
  processedAt: string | null;
  season?: {
    weekKey: string;
    name: string;
  };
}

export interface BossLiveParticipant {
  /** Session id: stable key, no user identity. */
  sessionId: string;
  name: string;
  avatarUrl: string | null;
  score: number;
  isYou: boolean;
}

export interface BossLiveFighter extends BossLiveParticipant {
  combo: number;
}

export interface BossLiveHit extends BossLiveParticipant {
  maxCombo: number;
  endedAt: string;
}

/** Side-effect free snapshot (GET /boss/live): safe to poll while a session is running. */
export interface BossLive {
  serverTime: string;
  community: BossOverview["community"];
  milestones: BossMilestoneStatus[];
  fightingNow: number;
  fighters: BossLiveFighter[];
  recentHits: BossLiveHit[];
}

export type BossSeasonPhase = "UPCOMING" | "RUNNING" | "ENDED";

export interface BossAdminSeasonSummary {
  weekKey: string;
  name: string;
  bossName: string;
  bossImageUrl: string | null;
  bossMaxHp: number;
  startsAt: string;
  endsAt: string;
  phase: BossSeasonPhase;
  isSettled: boolean;
  settledAt: string | null;
  editable: boolean;
  communityScore: number;
  bossCurrentHp: number;
  participants: number;
  milestonesUnlocked: number;
  milestonesTotal: number;
}

export interface BossAdminSeasonList {
  currentWeekKey: string;
  upcomingWeekKeys: string[];
  items: BossAdminSeasonSummary[];
}

export interface BossMilestoneConfig {
  at: number;
  coin: number;
  name: string;
}

export interface BossAdminSeasonDetail {
  season: Omit<
    BossAdminSeasonSummary,
    | "communityScore"
    | "bossCurrentHp"
    | "participants"
    | "milestonesUnlocked"
    | "milestonesTotal"
  > & { canSettle: boolean };
  milestoneConfig: BossMilestoneConfig[];
  community: BossOverview["community"];
  milestones: BossMilestoneStatus[];
  profilesAvailable: boolean;
  topPlayers: Array<{
    rank: number;
    userId: string;
    name: string;
    highestScore: number;
    contribution: number;
    bestCombo: number;
    totalAttempts: number;
    lastPlayedAt: string;
    rewardEligible: boolean;
  }>;
  rewards: {
    byStatus: Array<{ status: string; count: number; coins: number }>;
    problems: Array<{
      id: string;
      userId: string;
      name: string;
      milestoneIndex: number;
      rewardCoins: number;
      status: string;
      retryCount: number;
      errorMessage: string | null;
      updatedAt: string;
    }>;
  };
}

export interface BossSeasonInput {
  name: string;
  bossName: string;
  bossImageUrl: string | null;
  bossMaxHp: number;
  milestones: BossMilestoneConfig[];
}

export const bossApi = {
  getOverview: () => request.get<BossOverview>("/boss/overview"),
  getLive: () => request.get<BossLive>("/boss/live"),
  startSession: () =>
    request.post<BossStartSessionResponse>("/boss/session/start"),
  submitAnswer: (optionLabel: string) =>
    request.post<BossAnswerResponse>("/boss/session/answer", { optionLabel }),
  nextQuestion: () =>
    request.post<BossNextQuestionResponse>("/boss/session/next"),
  abandonSession: () =>
    request.post<{ success: boolean }>("/boss/session/abandon"),
  getTransactions: (limit = 50) =>
    request.get<BossTransactionItem[]>(`/boss/transactions?limit=${limit}`),
  adminListSeasons: () =>
    request.get<BossAdminSeasonList>("/boss/admin/seasons"),
  adminGetSeason: (weekKey: string) =>
    request.get<BossAdminSeasonDetail>(`/boss/admin/seasons/${weekKey}`),
  adminSaveSeason: (weekKey: string, body: BossSeasonInput) =>
    request.put<BossAdminSeasonDetail>(`/boss/admin/seasons/${weekKey}`, body),
  adminSettle: (weekKey: string) =>
    request.post<{ settled: boolean; message?: string }>("/boss/admin/settle", {
      weekKey,
    }),
  adminReconcile: () => request.post<unknown>("/boss/admin/reconcile"),
};
