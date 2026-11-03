export function toDatetimeLocal(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function optionContent(quiz: { options: Array<{ label: string; content: string }> | { data: Record<string, string> } } | null, label: string) {
  if (!quiz) return '';
  if (Array.isArray(quiz.options)) return quiz.options.find((option) => option.label === label)?.content || '';
  return quiz.options.data?.[label] || '';
}

export function topicOpen(availability?: string) {
  return !availability || availability === 'OPEN';
}

/** "2 giờ 10 phút", "1 ngày 3 giờ", "dưới 1 phút": khoảng thời gian dễ đọc, làm tròn xuống theo phút. */
export function formatSpan(ms: number) {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return 'dưới 1 phút';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} ngày`);
  if (hours) parts.push(`${hours} giờ`);
  if (rest && !days) parts.push(`${rest} phút`);
  return parts.join(' ');
}

/** Bài nộp sau hạn chỉ bị gắn nhãn; hệ thống không chặn nộp muộn. */
export function isLateSubmission(submittedAt: string, dueAt?: string | null) {
  return Boolean(dueAt) && new Date(submittedAt).getTime() > new Date(dueAt as string).getTime();
}
