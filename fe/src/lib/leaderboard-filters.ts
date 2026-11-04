export const LEADERBOARD_LIMIT = 20;

export type LeaderboardMode = 'daily' | 'weekly';
export type LeaderboardFilters = { mode: LeaderboardMode; date: string; page: number };

const MAX_PAGE = 1_000_000;

/** Reads mode/date/page from the URL; anything invalid falls back to the default and is never sent to the API. */
export function parseFilters(params: URLSearchParams): LeaderboardFilters {
  const rawDate = params.get('date') ?? '';
  const parsed = new Date(`${rawDate}T00:00:00Z`);
  // toISOString() throws on an invalid Date, so test the time value first.
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === rawDate;
  const rawPage = params.get('page') ?? '';
  const page = /^\d{1,7}$/.test(rawPage) && Number(rawPage) >= 1 && Number(rawPage) <= MAX_PAGE ? Number(rawPage) : 1;
  return { mode: params.get('mode') === 'weekly' ? 'weekly' : 'daily', date: isDate ? rawDate : '', page };
}

/** New query string with the filters applied; defaults are omitted and unrelated params (courseId...) are kept. */
export function withFilters(current: URLSearchParams, next: LeaderboardFilters): string {
  const params = new URLSearchParams(current.toString());
  for (const key of ['mode', 'date', 'page']) params.delete(key);
  if (next.mode !== 'daily') params.set('mode', next.mode);
  if (next.date) params.set('date', next.date);
  if (next.page > 1) params.set('page', String(next.page));
  return params.toString();
}

export const isFiltered = (filters: LeaderboardFilters) => filters.mode !== 'daily' || filters.date !== '' || filters.page > 1;

/** Page that holds a rank. The server ranks are unique and contiguous (1..total), so this is exact. */
export const pageOfRank = (rank: number, limit = LEADERBOARD_LIMIT) => Math.max(1, Math.ceil(rank / limit));

export const clockLabel = (date: Date) =>
  date.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false });
