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
