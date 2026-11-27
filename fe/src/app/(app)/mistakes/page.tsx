'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowCounterClockwise,
  CheckCircle,
  Coins,
  Sparkle,
  WarningCircle,
} from '@phosphor-icons/react';
import { request } from '@/lib/api';
import { Empty, Loading } from '@/components/ui';
import { playChestSfx, triggerCelebrationBurst } from '@/lib/sound-effects';

interface MistakeSummary {
  activeCount: number;
  dueCount: number;
  masteredCount: number;
}

interface PracticeItem {
  mistakeId: string;
  quizId: string;
  topicId: string;
  topicName: string;
  wrongCount: number;
  consecutiveCorrect: number;
  question: string;
  options: Array<{ id: string; label: string; text: string }>;
}

interface ReviewResult {
  total: number;
  correct: number;
  masteredNow: number;
  rewardXp: number;
  rewardCoins: number;
  results: Array<{
    quizId: string;
    isCorrect: boolean;
    correctAnswer: string;
    explanation: string | null;
    status: 'ACTIVE' | 'MASTERED';
  }>;
}

export default function MistakesPage() {
  const [summary, setSummary] = useState<MistakeSummary | null>(null);
  const [items, setItems] = useState<PracticeItem[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sum, queue] = await Promise.all([
        request.get<MistakeSummary>('/mistakes/summary'),
        request.get<{ items: PracticeItem[] }>('/mistakes/practice?limit=10'),
      ]);
      setSummary(sum);
      setItems(queue.items ?? []);
      setAnswers({});
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (submitting || items.length === 0) return;
    setSubmitting(true);
    try {
      const payload = items
        .filter((it) => answers[it.quizId])
        .map((it) => ({
          quizId: it.quizId,
          selectedAnswer: answers[it.quizId],
        }));
      if (payload.length === 0) return;
      const res = await request.post<ReviewResult>('/mistakes/submit', {
        answers: payload,
      });
      setResult(res);
      if (res.correct > 0) {
        playChestSfx();
        triggerCelebrationBurst(e.clientX, e.clientY);
      }
      const sum = await request.get<MistakeSummary>('/mistakes/summary');
      setSummary(sum);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading label="Đang tải kho ôn tập câu sai..." />;

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 960, margin: '0 auto' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>
            Kho Câu Sai & Ôn Tập Thông Minh
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13.5 }}>
            Trả lời đúng 2 lần liên tiếp để chuyển câu hỏi sang trạng thái Thành thạo (+15 XP & +5 Coin mỗi ngày).
          </p>
        </div>
        <button type="button" className="button secondary" onClick={() => void load()}>
          <ArrowCounterClockwise size={16} /> Làm mới danh sách
        </button>
      </header>

      {/* Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        <div className="panel" style={{ padding: 16 }}>
          <small style={{ color: 'var(--muted)' }}>Cần ôn hôm nay</small>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#f59e0b' }}>
            {summary?.dueCount ?? 0}
          </div>
        </div>
        <div className="panel" style={{ padding: 16 }}>
          <small style={{ color: 'var(--muted)' }}>Đang luyện tập</small>
          <div style={{ fontSize: 26, fontWeight: 800 }}>
            {summary?.activeCount ?? 0}
          </div>
        </div>
        <div className="panel" style={{ padding: 16 }}>
          <small style={{ color: 'var(--muted)' }}>Đã thành thạo</small>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#10b981' }}>
            {summary?.masteredCount ?? 0}
          </div>
        </div>
      </div>

      {result ? (
        <div
          className="panel"
          style={{
            padding: 18,
            border: '1px solid rgba(16, 185, 129, 0.5)',
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <CheckCircle size={22} weight="fill" color="#10b981" />
            <strong style={{ fontSize: 16 }}>
              Hoàn thành ôn tập: {result.correct}/{result.total} câu đúng · Thành thạo mới: {result.masteredNow}
            </strong>
            {result.rewardXp > 0 ? (
              <span style={{ color: '#0284c7', fontWeight: 700, fontSize: 13 }}>
                <Sparkle size={14} weight="fill" /> +{result.rewardXp} XP
              </span>
            ) : null}
            {result.rewardCoins > 0 ? (
              <span style={{ color: '#d97706', fontWeight: 700, fontSize: 13 }}>
                <Coins size={14} weight="fill" /> +{result.rewardCoins} Coin
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="button"
            style={{ justifySelf: 'start' }}
            onClick={() => void load()}
          >
            Luyện đợt tiếp theo
          </button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <Empty
          title="Tuyệt vời! Bạn không còn câu sai nào cần ôn"
          description="Mọi câu trả lời sai trong các bài kiểm tra sẽ tự động xuất hiện tại đây để bạn ôn tập."
        />
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {items.map((item, idx) => {
            const resItem = result?.results.find((r) => r.quizId === item.quizId);
            return (
              <article
                key={item.quizId}
                className="panel"
                style={{ padding: 18, display: 'grid', gap: 12 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-strong)' }}>
                    Câu {idx + 1} · {item.topicName}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Sai {item.wrongCount} lần · Đúng liên tiếp: {item.consecutiveCorrect}/2
                  </span>
                </div>
                <strong style={{ fontSize: 15 }}>{item.question}</strong>
                <div style={{ display: 'grid', gap: 8 }}>
                  {item.options.map((opt) => {
                    const selected = answers[item.quizId] === opt.label;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={Boolean(result)}
                        onClick={() =>
                          setAnswers((prev) => ({
                            ...prev,
                            [item.quizId]: opt.label,
                          }))
                        }
                        style={{
                          textAlign: 'left',
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: selected
                            ? '2px solid var(--accent)'
                            : '1px solid var(--line)',
                          background: selected
                            ? 'var(--accent-soft)'
                            : 'var(--surface-2)',
                          color: 'var(--text)',
                          cursor: result ? 'default' : 'pointer',
                        }}
                      >
                        <strong>{opt.label}.</strong> {opt.text}
                      </button>
                    );
                  })}
                </div>
                {resItem ? (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: resItem.isCorrect
                        ? 'rgba(16, 185, 129, 0.12)'
                        : 'rgba(244, 63, 94, 0.12)',
                      fontSize: 13,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                      {resItem.isCorrect ? (
                        <CheckCircle size={16} weight="fill" color="#10b981" />
                      ) : (
                        <WarningCircle size={16} weight="fill" color="#f43f5e" />
                      )}
                      <span>
                        {resItem.isCorrect
                          ? resItem.status === 'MASTERED'
                            ? 'Chính xác! Đã thành thạo câu hỏi này.'
                            : 'Chính xác! Đúng thêm 1 lần nữa để thành thạo.'
                          : `Chưa đúng. Đáp án đúng: ${resItem.correctAnswer}`}
                      </span>
                    </div>
                    {resItem.explanation ? (
                      <p style={{ margin: '6px 0 0', color: 'var(--muted)' }}>
                        {resItem.explanation}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}

          {!result ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="button"
                disabled={submitting || Object.keys(answers).length === 0}
                onClick={(e) => void handleSubmit(e)}
              >
                {submitting ? 'Đang chấm bài…' : 'Nộp bài ôn tập'}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
