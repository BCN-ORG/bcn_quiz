'use client';

import { Clock } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { serverNow } from '@/lib/api';

const pad = (value: number) => String(value).padStart(2, '0');

/** Countdown to a topic's closing time on the server clock. Display only: it never submits or locks anything. */
export function TopicClock({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(serverNow()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const end = new Date(endsAt).getTime();
  if (Number.isNaN(end)) return null;
  const remaining = Math.max(0, end - now);
  const seconds = Math.floor(remaining / 1000);
  const label = remaining === 0
    ? 'Hết giờ'
    : remaining > 24 * 3600_000
      ? `Chủ đề đóng lúc ${new Date(end).toLocaleString('vi-VN')}`
      : `Còn ${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
  // The live region text changes only at these thresholds, so it is announced once each, not every second.
  const announce = remaining === 0 ? 'Đã hết giờ làm bài' : remaining <= 60_000 ? 'Còn dưới 1 phút' : remaining <= 300_000 ? 'Còn dưới 5 phút' : '';

  return (
    <>
      <p className={`topic-clock ${remaining <= 300_000 ? 'is-warning' : ''}`}><Clock aria-hidden="true" /> {label}</p>
      <span className="sr-only topic-clock-announce" role="status" aria-live="polite">{announce}</span>
    </>
  );
}
