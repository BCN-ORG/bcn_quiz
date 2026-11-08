'use client';

import { Suspense } from 'react';
import { TopicLeaderboard } from '@/components/topic-leaderboard';
import { Loading } from '@/components/ui';

export default function WeeklyLeaderboardPage() {
  return <>
    <header className="page-heading"><div><h1>Bảng xếp hạng tuần</h1><p>Tổng điểm lần làm đầu tiên của các topic bạn hoàn thành trong tuần.</p></div></header>
    <Suspense fallback={<Loading label="Đang tải bảng xếp hạng" />}><TopicLeaderboard /></Suspense>
  </>;
}
