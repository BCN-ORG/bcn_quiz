export const BUSINESS_TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const MAX_LEADERBOARD_SCORE = 1000;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export function calculateTopicLeaderboardScore(
  correctCount: number,
  totalQuestions: number,
): number {
  return totalQuestions > 0
    ? Math.round((correctCount / totalQuestions) * MAX_LEADERBOARD_SCORE)
    : 0;
}

export function businessDate(value: Date): string {
  return new Date(value.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

export function parseBusinessDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error('Invalid business date');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error('Invalid business date');
  }
  return value;
}

export function startOfBusinessDay(date: string): Date {
  parseBusinessDate(date);
  return new Date(Date.parse(`${date}T00:00:00.000Z`) - VN_OFFSET_MS);
}

export function endOfBusinessDay(date: string): Date {
  return new Date(startOfBusinessDay(date).getTime() + 86_400_000 - 1);
}

export function businessWeekStart(date: string): string {
  const day = startOfBusinessDay(date);
  const dayOfWeek = new Date(day.getTime() + VN_OFFSET_MS).getUTCDay();
  return businessDate(
    new Date(day.getTime() - ((dayOfWeek + 6) % 7) * 86_400_000),
  );
}

export function businessWeekEnd(date: string): string {
  return businessDate(
    new Date(
      startOfBusinessDay(businessWeekStart(date)).getTime() + 6 * 86_400_000,
    ),
  );
}
