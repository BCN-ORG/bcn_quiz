'use client';

import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { LeaderboardRow } from '@/components/leaderboard-table';
import { request } from '@/lib/api';
import { bossApi, type BossOverview } from '@/lib/boss';
import { topicOpen } from '@/lib/format';
import { canReadQuestions, canReadResults } from '@/lib/permissions';
import {
  towerApi,
  type TowerOverview,
  type TowerRewardTransactionItem,
} from '@/lib/tower';
import type {
  Certificate as CourseCertificate,
  Course,
  CourseProgress,
  Pagination,
  User,
} from '@/lib/types';
import { walletApi, type WalletBalance } from '@/lib/wallet';
import { xpApi, type XpMe } from '@/lib/xp';

type CourseTopic = NonNullable<Course['topics']>[number];

export type SessionItem = {
  id: string;
  topicId: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';
  answeredCount: number;
  quizTotal?: number | null;
  score?: number | null;
  correctCount?: number | null;
  startedAt?: string | null;
  submittedAt?: string | null;
  lastSeenAt?: string | null;
  topic?: { name: string } | null;
};

export type TodoTopic = {
  topicId: string;
  topicName: string;
  courseId: string;
  courseName: string;
  quizCount: number;
  inProgress: { answeredCount: number; quizTotal: number | null } | null;
};

export type WeeklyLeaderboardSummary = {
  weekStart?: string;
  weekEnd?: string;
  closesAt?: string;
  profilesAvailable?: boolean;
  items: LeaderboardRow[];
  top3: LeaderboardRow[];
  currentUserRank: number | null;
  currentUserResult: LeaderboardRow | null;
  progress?: { topicsDone: number; topicsTotal: number };
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export type DashboardSummaryData = {
  courses: CourseProgress[];
  certificates: CourseCertificate[];
  sessions: SessionItem[];
  todos: TodoTopic[];
  transactions: TowerRewardTransactionItem[];
  weeklyBoard: WeeklyLeaderboardSummary | null;
  xp: XpMe | null;
  bossOverview: BossOverview | null;
};

export const dashboardQueryKeys = {
  all: ['dashboard'] as const,
  summary: (userId: string) => ['dashboard', 'summary', userId] as const,
  tower: (userId: string) => ['dashboard', 'tower', userId] as const,
  wallet: (userId: string) => ['dashboard', 'wallet', userId] as const,
};

export function invalidateDashboardQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.all });
}

async function fetchAll<T>(path: string): Promise<T[]> {
  const limit = 50;
  const first = await request.get<Pagination<T>>(`${path}?page=1&limit=${limit}`);
  const items = [...first.items];
  const pages = Math.min(first.pagination.totalPages, 10);
  for (let p = 2; p <= pages; p += 1) {
    const next = await request.get<Pagination<T>>(`${path}?page=${p}&limit=${limit}`);
    items.push(...next.items);
  }
  return items;
}

async function fetchDashboardSummary(user: User): Promise<DashboardSummaryData> {
  const allowQuestions = canReadQuestions(user);
  const allowResults = canReadResults(user);

  const [progress, certs, sessionList, txList, weeklyData, xpData, bossData] =
    await Promise.all([
      allowQuestions
        ? request.get<Pagination<CourseProgress>>('/course/progress/me?limit=12')
        : Promise.resolve({
            items: [] as CourseProgress[],
            pagination: { page: 1, limit: 12, total: 0, totalPages: 1 },
          }),
      allowResults
        ? request.get<Pagination<CourseCertificate>>('/certificate/me?limit=10').catch(() => ({
            items: [] as CourseCertificate[],
            pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
          }))
        : Promise.resolve({
            items: [] as CourseCertificate[],
            pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
          }),
      allowResults
        ? fetchAll<SessionItem>('/attempt/sessions/me').catch(() => [] as SessionItem[])
        : Promise.resolve([] as SessionItem[]),
      towerApi.getTransactions().catch(() => [] as TowerRewardTransactionItem[]),
      request.get<WeeklyLeaderboardSummary>('/leaderboards/weekly?page=1&limit=5').catch(() => null),
      xpApi.getMe().catch(() => null),
      bossApi.getOverview().catch(() => null),
    ]);

  const submitted = new Set(
    sessionList.filter((s) => s.status === 'SUBMITTED').map((s) => s.topicId),
  );
  const inProgress = new Map<string, SessionItem>();
  sessionList
    .filter((s) => s.status === 'IN_PROGRESS')
    .forEach((s) => {
      if (!inProgress.has(s.topicId)) inProgress.set(s.topicId, s);
    });

  const openCourses = progress.items.filter((item) => item.status !== 'COMPLETED');
  const topicLists = await Promise.all(
    openCourses.map((item) =>
      fetchAll<CourseTopic>(`/course/${item.course.id}/topics`).catch(() => [] as CourseTopic[]),
    ),
  );

  const todos: TodoTopic[] = [];
  const seenTopics = new Set<string>();
  openCourses.forEach((item, index) => {
    topicLists[index].forEach(({ topic }) => {
      if (!topicOpen(topic.availability)) return;
      if (submitted.has(topic.id)) return;
      if (seenTopics.has(topic.id)) return;
      seenTopics.add(topic.id);
      const session = inProgress.get(topic.id) || null;
      todos.push({
        topicId: topic.id,
        topicName: topic.name,
        courseId: item.course.id,
        courseName: item.course.name,
        quizCount: topic._count?.quizzes ?? 0,
        inProgress: session
          ? { answeredCount: session.answeredCount, quizTotal: session.quizTotal ?? null }
          : null,
      });
    });
  });

  return {
    courses: progress.items,
    certificates: certs.items,
    sessions: sessionList,
    todos,
    transactions: txList,
    weeklyBoard: weeklyData,
    xp: xpData,
    bossOverview: bossData,
  };
}

export function useDashboardSummary(user: User | null, authLoading: boolean) {
  const userId = user?.id ?? '';
  return useQuery({
    queryKey: dashboardQueryKeys.summary(userId),
    queryFn: () => fetchDashboardSummary(user!),
    enabled: !authLoading && Boolean(user?.id),
    staleTime: 60_000,
  });
}

export function useDashboardTower(user: User | null, authLoading: boolean) {
  const userId = user?.id ?? '';
  return useQuery<TowerOverview | null>({
    queryKey: dashboardQueryKeys.tower(userId),
    queryFn: () => towerApi.getOverview().catch(() => null),
    enabled: !authLoading && Boolean(user?.id),
    staleTime: 60_000,
  });
}

export function useDashboardWallet(user: User | null, authLoading: boolean) {
  const userId = user?.id ?? '';
  return useQuery<WalletBalance | null>({
    queryKey: dashboardQueryKeys.wallet(userId),
    queryFn: () => walletApi.getBalance().catch(() => null),
    enabled: !authLoading && Boolean(user?.id),
    staleTime: 60_000,
  });
}
