import type { Page } from '@playwright/test';

const API = 'http://localhost:3001/api';
export const LIMIT = 20;

type Row = {
  rank: number;
  user: { id: string; fullName: string; avatarUrl: string | null };
  score?: number; correctCount?: number; totalQuestions?: number; durationMs?: number;
  weeklyScore?: number; completedDays?: number; totalDurationMs?: number;
};

/** Id of the signed-in e2e user, so the stubbed board can contain "me". */
let cachedMe = '';
export async function myUserId(page: Page): Promise<string> {
  if (cachedMe) return cachedMe;
  const res = await page.request.get(`${API}/auth/me`);
  let current = (await res.json()) as Record<string, unknown>;
  // Same flattening as the app's normalizeUser: the user may be nested under `data` more than once.
  for (let depth = 0; depth < 4; depth += 1) {
    const nested = current.data as Record<string, unknown> | undefined;
    if (nested && typeof nested === 'object' && ('id' in nested || 'email' in nested)) { current = nested; continue; }
    break;
  }
  cachedMe = current.id as string;
  return cachedMe;
}

/**
 * Builds a payload with the same shape as GET /leaderboards/topics/:id/{daily|weekly}. Ranks are unique and
 * strictly ordered, exactly like the server (full tie-break chain), so the UI is tested against values it must not recompute.
 */
export function board(opts: { total: number; myRank: number | null; me: string; page?: number; mode?: 'daily' | 'weekly'; names?: Record<number, string>; profilesAvailable?: boolean; admin?: boolean }) {
  const { total, myRank, me, mode = 'daily' } = opts;
  const page = opts.page ?? 1;
  const row = (rank: number): Row => {
    const base = { rank, user: { id: rank === myRank ? me : `u${rank}`, fullName: opts.names?.[rank] ?? `Người chơi ${rank}`, avatarUrl: null }, ...(opts.admin ? { email: `nguoi${rank}@example.com`, submittedAt: '2026-11-04T03:15:00.000Z', lastSubmittedAt: '2026-11-04T03:15:00.000Z' } : {}) };
    const score = Math.max(0, 1000 - (rank - 1) * Math.max(1, Math.floor(1000 / Math.max(total, 1))));
    return mode === 'daily'
      ? { ...base, score, correctCount: Math.round(score / 100), totalQuestions: 10, durationMs: 60_000 + rank * 1000 }
      : { ...base, weeklyScore: score * 3, completedDays: 3, totalDurationMs: 180_000 + rank * 3000 };
  };
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const first = (page - 1) * LIMIT + 1;
  const items = Array.from({ length: Math.max(0, Math.min(LIMIT, total - first + 1)) }, (_, i) => row(first + i));
  const around = myRank ? Array.from({ length: 5 }, (_, i) => myRank - 2 + i).filter((r) => r >= 1 && r <= total).map(row) : [];
  const points = (r: Row) => r.weeklyScore ?? r.score ?? 0;
  return {
    topic: { id: 't', name: 'Topic', slug: 'topic' },
    mode,
    ...(mode === 'daily' ? { date: '2026-11-04' } : { weekStart: '2026-11-02', weekEnd: '2026-11-08' }),
    closesAt: '2026-11-04T16:59:59.999Z',
    profilesAvailable: opts.profilesAvailable ?? true,
    items,
    top3: [1, 2, 3].filter((r) => r <= total).map(row),
    top10Cutoff: total >= 10 ? points(row(10)) : null,
    currentUserRank: myRank,
    currentUserResult: myRank ? row(myRank) : null,
    aroundMe: around,
    pagination: { page, limit: LIMIT, total, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 },
  };
}

/** Serves `board(...)` for every leaderboard request; the handler sees the parsed query so tests can vary the response. */
export async function stubBoard(page: Page, make: (query: URLSearchParams, mode: 'daily' | 'weekly') => unknown | Promise<unknown>, onRequest?: (url: URL) => void) {
  await page.route(/\/api\/leaderboards\/topics\/[^/]+\/(daily|weekly)\?/, async (route) => {
    const url = new URL(route.request().url());
    onRequest?.(url);
    const mode = url.pathname.endsWith('/weekly') ? 'weekly' : 'daily';
    const data = await make(url.searchParams, mode);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ statusCode: 200, message: 'Success', data }) });
  });
}

export const TOPIC = 'e2e-topic';

/** The page also loads the topic title; stubbing it keeps these UI tests off the throttled API. */
export async function stubTopic(page: Page) {
  await page.route(new RegExp(`/api/topic/${TOPIC}$`), (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ statusCode: 200, message: 'Success', data: { id: TOPIC, name: 'Topic mẫu', slug: 'topic-mau' } }) }));
}

/** Makes the app believe the signed-in user may manage content (UI gate only: the server still decides). */
export async function asMentorInUi(page: Page) {
  await page.route('**/api/auth/me', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    let user = body;
    for (let depth = 0; depth < 4; depth += 1) {
      const nested = user.data as Record<string, unknown> | undefined;
      if (nested && typeof nested === 'object' && ('id' in nested || 'email' in nested)) { user = nested; continue; }
      break;
    }
    user.roles = ['mentor'];
    user.permissions = ['quiz.question.read', 'quiz.question.create', 'quiz.question.update', 'quiz.result.read'];
    await route.fulfill({ response, json: body });
  });
}
