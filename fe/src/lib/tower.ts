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
    isBlocked?: boolean;
    blockedReason?: string | null;
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

export type TowerDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface TowerPoolKpis {
  totalCollected?: number;
  collectedInPool?: number;
  totalQuizzes?: number;
  totalEligible?: number;
  eligibleCount?: number;
  totalDuplicates?: number;
  duplicateCount?: number;
  ineligibleCount?: number;
  topicCalendarExpiredCount?: number;
}

export interface TowerBreakdownBySubject {
  subject: string;
  count: number;
  eligibleCount?: number;
}

export interface TowerBreakdownByDifficulty {
  difficulty: TowerDifficulty | string;
  count: number;
  eligibleCount?: number;
  label?: string;
}

export interface TowerBreakdownByCourse {
  courseId: string | null;
  courseName: string;
  count: number;
}

export interface TowerBreakdownByTopic {
  topicId: string;
  topicName: string;
  count: number;
}

export interface TowerAntiRepeatStats {
  seasonKey: string;
  totalUsedInSeason?: number;
  unusedInSeason?: number;
  reusedInSeason?: number;
  totalUsesCount?: number;
  totalUniqueUsedCurrentSeason?: number;
  totalHistoricalUsages?: number;
  unusedEligibleInCurrentSeason?: number;
}

export interface TowerFloorRangeCoverage {
  range: string;
  minFloor?: number;
  maxFloor?: number;
  floorStart?: number;
  floorEnd?: number;
  requiredStreakMax?: number;
  availableQuestions?: number;
  matchingCount?: number;
  subjectCoverage?: Record<string, number>;
  difficultyCoverage?: Record<string, number>;
  isSufficient: boolean;
  warnings?: string[];
}

export interface TowerDistributionCoverageReport {
  isSatisfied?: boolean;
  isSufficient?: boolean;
  coverageScore?: number;
  scorePercent?: number;
  totalEligible?: number;
  floorRanges?: TowerFloorRangeCoverage[];
  tiers?: TowerFloorRangeCoverage[];
  warnings?: string[];
}

export interface TowerCollectionJobLog {
  id: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | string;
  startedAt: string;
  completedAt?: string | null;
  totalCollected?: number;
  totalEligible?: number;
  totalDuplicates?: number;
  errorMessage?: string | null;
}

export interface TowerAdminPoolStatsResponse {
  kpis: TowerPoolKpis;
  breakdown: {
    bySubject: TowerBreakdownBySubject[];
    byDifficulty: TowerBreakdownByDifficulty[];
    byCourse: TowerBreakdownByCourse[];
    byTopic: TowerBreakdownByTopic[];
  };
  antiRepeatStats?: TowerAntiRepeatStats;
  usage?: TowerAntiRepeatStats;
  coverage: TowerDistributionCoverageReport;
  lastJob?: TowerCollectionJobLog | null;
  lastJobLog?: TowerCollectionJobLog | null;
}

export interface TowerFloorDistributionRuleDto {
  minFloor: number;
  maxFloor: number;
  subjectWeights: Record<string, number>;
  difficultyWeights: Record<string, number>;
}

export interface TowerDistributionConfigResponse {
  id: string;
  version: number;
  name: string;
  isActive: boolean;
  rules: TowerFloorDistributionRuleDto[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TowerPoolSyncResponse {
  logId?: string;
  status: string;
  totalCollected: number;
  totalEligible: number;
  totalDuplicates: number;
  errorMessage?: string | null;
}

export interface TowerAntiCheatClimber {
  userId: string;
  fullName: string | null;
  email: string | null;
  currentFloor: number;
  highestCompletedFloor: number;
  completedFloors: number;
  failedFloors: number;
  avgSecPerQ: number | null;
  fastestSecPerQ: number | null;
  suspicionScore: number;
  isBlocked: boolean;
  blockedReason: string | null;
  blockedAt: string | null;
  flagged: boolean;
}

export interface TowerAntiCheatEventItem {
  id: string;
  userId: string;
  fullName: string;
  floor: number;
  ruleCode: string;
  severity: string;
  serverResponseMs: number | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface TowerAntiCheatOverview {
  summary: {
    blockedCount: number;
    flaggedCount: number;
    totalEvents: number;
    trackedClimbers: number;
  };
  climbers: TowerAntiCheatClimber[];
  recentEvents: TowerAntiCheatEventItem[];
}

export const towerApi = {
  getOverview: () => request.get<TowerOverview>('/tower/overview'),
  startFloor: () => request.post<StartFloorResponse>('/tower/floor/start'),
  submitAnswer: (
    optionLabel: string,
    quizId?: string,
    signals?: { isTrusted?: boolean; webdriver?: boolean },
  ) =>
    request.post<AnswerResponse>('/tower/floor/answer', {
      optionLabel,
      ...(quizId ? { quizId } : {}),
      ...(signals?.isTrusted !== undefined
        ? { isTrusted: signals.isTrusted }
        : {}),
      ...(signals?.webdriver !== undefined
        ? { webdriver: signals.webdriver }
        : {}),
    }),
  getTransactions: (limit = 50) =>
    request.get<TowerRewardTransactionItem[]>(`/tower/transactions?limit=${limit}`),
  getAdminPoolStats: (seasonKey?: string) =>
    request.get<TowerAdminPoolStatsResponse>(
      `/tower/admin/pool/stats${seasonKey ? `?seasonKey=${encodeURIComponent(seasonKey)}` : ''}`,
    ),
  syncAdminPool: () => request.post<TowerPoolSyncResponse>('/tower/admin/pool/sync'),
  getAdminDistribution: () =>
    request.get<TowerDistributionConfigResponse>('/tower/admin/distribution'),
  updateAdminDistribution: (dto: { name?: string; rules: TowerFloorDistributionRuleDto[] }) =>
    request.put<TowerDistributionConfigResponse>('/tower/admin/distribution', dto),
  getAdminAntiCheatOverview: () =>
    request.get<TowerAntiCheatOverview>('/tower/admin/anticheat/overview'),
  blockAdminTowerUser: (userId: string, reason?: string) =>
    request.post<{ userId: string; isBlocked: boolean }>(
      `/tower/admin/anticheat/${encodeURIComponent(userId)}/block`,
      { reason },
    ),
  unblockAdminTowerUser: (userId: string) =>
    request.post<{ userId: string; isBlocked: boolean }>(
      `/tower/admin/anticheat/${encodeURIComponent(userId)}/unblock`,
      {},
    ),
  resetAdminTowerUserFloor: (userId: string, targetFloor = 1) =>
    request.post<{ userId: string; currentFloor: number }>(
      `/tower/admin/anticheat/${encodeURIComponent(userId)}/reset-floor`,
      { targetFloor },
    ),
};
