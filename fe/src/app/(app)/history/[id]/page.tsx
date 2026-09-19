'use client';

import Link from 'next/link';
import { ArrowLeft, Check, Clock, X } from '@phosphor-icons/react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
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
    content: { text: string; code?: string | null };
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
      <div className="card-meta" style={{ marginBottom: 20, gap: 16 }}>
        <span><Check size={16} /> {detail.correctCount} đúng</span>
        <span><X size={16} /> {(detail.quizTotal ?? detail.answeredCount) - detail.correctCount} sai / bỏ trống</span>
        <span><Clock size={16} /> {Math.round((detail.durationMs || 0) / 1000)}s</span>
        <strong>{Math.round(detail.score * 100)}%</strong>
      </div>
      <div className="list">
        {detail.quizResults.map((item, index) => (
          <article key={item.quizId} className={`panel ${item.isCorrect ? 'result-correct' : 'result-wrong'}`}>
            <strong>Câu {index + 1}: {item.content.text}</strong>
            {item.content.code ? <pre className="code-block"><code>{item.content.code}</code></pre> : null}
            <p>Đáp án của bạn: {item.selectedAnswer || 'Chưa trả lời (tính sai)'} | Đáp án đúng: {item.correctAnswer}</p>
            {item.explanation ? <small>{item.explanation}</small> : null}
          </article>
        ))}
      </div>
    </>
  );
}
