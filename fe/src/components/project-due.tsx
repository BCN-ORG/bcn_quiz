'use client';

import { useEffect, useState } from 'react';
import { serverNow } from '@/lib/api';
import { formatSpan } from '@/lib/format';

/** Deadline of the project and how long is left, on the server clock. Display only: late submissions are still accepted. */
export function ProjectDue({ dueAt }: { dueAt: string }) {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(serverNow()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const due = new Date(dueAt).getTime();
  if (Number.isNaN(due)) return null;
  const overdue = now > due;
  const state = overdue ? 'is-overdue' : due - now <= 24 * 3600_000 ? 'is-soon' : '';
  return (
    <p className={`project-due ${state}`}>
      <strong>Hạn nộp:</strong> {new Date(due).toLocaleString('vi-VN')} ·{' '}
      {overdue
        ? `Đã quá hạn ${formatSpan(now - due)}. Bài nộp vẫn được nhận nhưng sẽ gắn nhãn "Nộp muộn".`
        : `còn ${formatSpan(due - now)}`}
    </p>
  );
}
