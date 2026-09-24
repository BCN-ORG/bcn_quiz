'use client';

import Link from 'next/link';
import { ArrowLeft } from '@phosphor-icons/react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { QuizReview } from '@/components/quiz-review';
import { Empty, ErrorState, Loading } from '@/components/ui';
import { request } from '@/lib/api';

type SessionDetail = {
  id: string;
  topic: { id: string; name: string; slug: string };
  status: string;
  startedAt: string;
  submittedAt: string | null;
  durationMs: number | null;
  answeredCount: number;
  correctCount: number;
  score: number;
  quizTotal?: number;
  quizResults: Array<{
    quizId: string;
    quizCode: string;
    content: { text: string; code?: string | null; image?: string | null };
    options?: { data?: Record<string, string> };
    selectedAnswer: string | null;
    correctAnswer: string;
    isCorrect: boolean | null;
    explanation?: string;
  }>;
};

export default function HistoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setDetail(await request.get<SessionDetail>(`/attempt/sessions/me/${id}`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không tải được chi tiết'); setDetail(null); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} retry={() => void load()} />;
  if (!detail) return <Empty title="Không tìm thấy phiên" description="Phiên có thể chưa nộp hoặc không thuộc tài khoản này." />;

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Chi tiết lần làm</p>
          <h1>{detail.topic.name}</h1>
          <p>
            Nộp {detail.submittedAt ? new Date(detail.submittedAt).toLocaleString('vi-VN') : '—'}
            {' · '}Đúng {detail.correctCount}/{detail.quizTotal ?? detail.answeredCount}
            {' · '}{Math.round(detail.score * 100)}%
            {detail.durationMs != null ? ` · ${Math.round(detail.durationMs / 1000)}s` : ''}
          </p>
        </div>
        <Link className="button secondary" href="/history"><ArrowLeft /> Lịch sử</Link>
      </header>
      <QuizReview items={detail.quizResults} />
    </>
  );
}
