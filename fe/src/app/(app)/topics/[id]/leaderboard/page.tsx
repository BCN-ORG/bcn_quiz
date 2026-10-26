'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { TopicLeaderboard } from '@/components/topic-leaderboard';
import { ErrorState, Loading } from '@/components/ui';
import { request } from '@/lib/api';
import type { Topic } from '@/lib/types';

function LeaderboardPage() {
  const { id } = useParams<{ id: string }>();
  const courseId = useSearchParams().get('courseId');
  const [topic, setTopic] = useState<Topic | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void request.get<Topic>(`/topic/${id}`).then((value) => { if (active) setTopic(value); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Không tải được chủ đề'); });
    return () => { active = false; };
  }, [id]);

  return <>
    <Link className="leaderboard-back" href={`/topics/${id}${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ''}`}>← Quay lại chủ đề</Link>
    <header className="page-heading"><div><p className="eyebrow">Chủ đề</p><h1>{topic?.name ?? 'Bảng xếp hạng'}</h1><p>Kết quả chính thức theo ngày và theo tuần.</p></div></header>
    {error ? <ErrorState message={error} /> : null}
    {!topic && !error ? <Loading label="Đang tải chủ đề" /> : null}
    <TopicLeaderboard topicId={id} />
  </>;
}

export default function TopicLeaderboardPage() {
  return <Suspense fallback={<Loading label="Đang tải bảng xếp hạng" />}><LeaderboardPage /></Suspense>;
}
