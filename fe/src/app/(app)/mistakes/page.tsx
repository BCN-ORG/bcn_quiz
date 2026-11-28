'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowCounterClockwise,
  BookOpenText,
  CheckCircle,
  ClockCountdown,
  Coins,
  Sparkle,
  Target,
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
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sum, queue] = await Promise.all([
        request.get<MistakeSummary>('/mistakes/summary'),
        request.get<{ items: PracticeItem[] }>('/mistakes/practice?limit=10'),
      ]);
      setSummary(sum);
      setItems(queue.items ?? []);
      setAnswers({});
      setResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được danh sách câu sai.');
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể nộp bài ôn tập.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading label="Đang tải kho ôn tập câu sai..." />;

  const answeredCount = Object.keys(answers).length;

  return (
    <div className="arena-page">
      <section className="arena-hero arena-hero--mistakes">
        <div className="arena-hero__main">
          <span className="arena-hero__eyebrow">
            <BookOpenText size={13} weight="fill" /> Ôn tập lặp lại ngắt quãng
          </span>
          <h1 className="arena-hero__title">Kho Câu Sai & Ôn Tập Thông Minh</h1>
          <p className="arena-hero__sub">
            Trả lời đúng 2 lần liên tiếp để chuyển câu hỏi sang trạng thái Thành thạo (+15 XP & +5 Coin mỗi ngày).
          </p>
        </div>

        <div className="arena-hero__aside">
          <button
            type="button"
            className="button secondary"
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              color: '#ffffff',
              borderColor: 'rgba(255, 255, 255, 0.22)',
            }}
            onClick={() => void load()}
          >
            <ArrowCounterClockwise size={16} /> Làm mới danh sách
          </button>
        </div>
      </section>

      {/* KPI Stats */}
      {error ? (
        <div role="alert" className="arena-notice arena-notice--error">
          <WarningCircle size={18} weight="fill" />
          <span>{error}</span>
        </div>
      ) : null}
      <div className="arena-kpi-grid">
        <div className="arena-kpi-card">
          <div className="arena-kpi-icon arena-kpi-icon--amber">
            <ClockCountdown size={22} weight="fill" />
          </div>
          <div className="arena-kpi-meta">
            <span className="arena-kpi-label">Cần ôn hôm nay</span>
            <span className="arena-kpi-value">{summary?.dueCount ?? 0}</span>
          </div>
        </div>

        <div className="arena-kpi-card">
          <div className="arena-kpi-icon">
            <Target size={22} weight="fill" />
          </div>
          <div className="arena-kpi-meta">
            <span className="arena-kpi-label">Đang luyện tập</span>
            <span className="arena-kpi-value">{summary?.activeCount ?? 0}</span>
          </div>
        </div>

        <div className="arena-kpi-card">
          <div className="arena-kpi-icon arena-kpi-icon--emerald">
            <CheckCircle size={22} weight="fill" />
          </div>
          <div className="arena-kpi-meta">
            <span className="arena-kpi-label">Đã thành thạo</span>
            <span className="arena-kpi-value">{summary?.masteredCount ?? 0}</span>
          </div>
        </div>
      </div>

      {result ? (
        <section
          className="arena-card"
          style={{
            borderColor: 'rgba(16, 185, 129, 0.5)',
            background:
              'linear-gradient(135deg, rgba(16, 185, 129, 0.09), var(--surface) 60%)',
          }}
        >
          <div className="arena-section-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <CheckCircle size={24} weight="fill" color="#10b981" />
              <strong style={{ fontSize: 16 }}>
                Hoàn thành ôn tập: {result.correct}/{result.total} câu đúng · Thành thạo mới:{' '}
                {result.masteredNow}
              </strong>
              {result.rewardXp > 0 ? (
                <span className="arena-badge-xp">
                  <Sparkle size={13} weight="fill" /> +{result.rewardXp} XP
                </span>
              ) : null}
              {result.rewardCoins > 0 ? (
                <span className="arena-badge-coin">
                  <Coins size={13} weight="fill" /> +{result.rewardCoins} Coin
                </span>
              ) : null}
            </div>
            <button type="button" className="button" onClick={() => void load()}>
              Luyện đợt tiếp theo
            </button>
          </div>
        </section>
      ) : null}

      {items.length === 0 ? (
        <Empty
          title="Tuyệt vời! Bạn không còn câu sai nào cần ôn"
          description="Mọi câu trả lời sai trong các bài kiểm tra sẽ tự động xuất hiện tại đây để bạn ôn tập."
        />
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {items.map((item, idx) => {
            const resItem = result?.results.find((r) => r.quizId === item.quizId);
            return (
              <article key={item.quizId} className="mk-question-card">
                <div className="mk-meta-row">
                  <span className="mk-topic-pill">
                    Câu {idx + 1} · {item.topicName}
                  </span>

                  <div className="mk-mastery-pips">
                    <span>Sai {item.wrongCount} lần</span>
                    <span>·</span>
                    <span>Thành thạo:</span>
                    <span
                      className={`mk-pip ${item.consecutiveCorrect >= 1 ? 'is-filled' : ''}`}
                      title="Đúng lần 1"
                    />
                    <span
                      className={`mk-pip ${item.consecutiveCorrect >= 2 ? 'is-filled' : ''}`}
                      title="Đúng lần 2"
                    />
                  </div>
                </div>

                <h3 style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>
                  {item.question}
                </h3>

                <div className="arena-options-grid">
                  {item.options.map((opt) => {
                    const selected = answers[item.quizId] === opt.label;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={Boolean(result)}
                        className={`arena-option-btn ${selected ? 'is-selected' : ''}`}
                        onClick={() =>
                          setAnswers((prev) => ({
                            ...prev,
                            [item.quizId]: opt.label,
                          }))
                        }
                      >
                        <span className="arena-option-key">{opt.label}</span>
                        <span>{opt.text}</span>
                      </button>
                    );
                  })}
                </div>

                {resItem ? (
                  <div
                    className={`arena-notice ${
                      resItem.isCorrect
                        ? 'arena-notice--success'
                        : 'arena-notice--error'
                    }`}
                    style={{ display: 'grid', gap: 6 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700 }}>
                      {resItem.isCorrect ? (
                        <CheckCircle size={17} weight="fill" />
                      ) : (
                        <WarningCircle size={17} weight="fill" />
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
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, opacity: 0.92 }}>
                        {resItem.explanation}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}

          {!result ? (
            <div className="mk-sticky-submit">
              <div style={{ display: 'grid', gap: 2 }}>
                <strong style={{ fontSize: 14 }}>
                  Đã chọn {answeredCount}/{items.length} câu hỏi
                </strong>
                <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                  Bạn có thể nộp ngay khi hoàn tất các câu muốn ôn tập.
                </span>
              </div>
              <button
                type="button"
                className="button"
                disabled={submitting || answeredCount === 0}
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
