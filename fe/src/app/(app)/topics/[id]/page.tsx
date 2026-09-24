'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle, PaperPlaneTilt } from '@phosphor-icons/react';
import Image from 'next/image';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Empty, ErrorState, Loading, Status, ConfirmDialog } from '@/components/ui';
import { request } from '@/lib/api';
import { topicOpen } from '@/lib/format';
import type { Pagination, Quiz, QuizSession, SessionResult, Topic } from '@/lib/types';

/** Session TTL only for cleanup — not an exam timer. Topic startsAt/endsAt still gate access. */
const SESSION_TTL_MINUTES = 365 * 24 * 60;

function optionsOf(quiz: Quiz): Array<[string, string, string]> {
  if (Array.isArray(quiz.options)) return quiz.options.map((option) => [option.id ?? option.label, option.label, option.content]);
  return Object.entries(quiz.options.data || {}).map(([label, content]) => [label, label, content]);
}

function TopicQuizPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId');
  const [topic, setTopic] = useState<Topic | null>(null);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [session, setSession] = useState<QuizSession | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState(0);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [error, setError] = useState('');

  const startFresh = useCallback(async () => {
    const active = await request.post<QuizSession>(`/topic/${id}/session/start`, {
      expiresInMinutes: SESSION_TTL_MINUTES,
    });
    const quizData = await request.get<Pagination<Quiz>>(`/topic/${id}/quizzes?limit=100&sessionId=${encodeURIComponent(active.id)}`);
    setSession(active);
    setQuizzes(quizData.items);
    setAnswers(active.answers || {});
    setCurrent(0);
    setResult(null);
    setError('');
  }, [id]);

  const restartFresh = async () => {
    if (!session) return;
    setConfirmRestart(false);
    setSaving(true); setError('');
    try {
      await request.post(`/attempt/session/${session.id}/abandon`);
      await startFresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể làm lại');
    } finally {
      setSaving(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [topicData, quizData] = await Promise.all([
        request.get<Topic>(`/topic/${id}`),
        request.get<Pagination<Quiz>>(`/topic/${id}/quizzes?limit=100`),
      ]);
      setTopic(topicData); setQuizzes(quizData.items);
      if (!topicOpen(topicData.availability)) return;
      // Resume only — do not auto-start (avoids ghost IN_PROGRESS rows in history).
      const active = await request.get<QuizSession | null>(`/topic/${id}/session/resume`);
      if (active && active.status === 'IN_PROGRESS') {
        const sessionQuizData = await request.get<Pagination<Quiz>>(`/topic/${id}/quizzes?limit=100&sessionId=${encodeURIComponent(active.id)}`);
        setSession(active);
        setQuizzes(sessionQuizData.items);
        const restored = active.answers || {};
        setAnswers(restored);
        const resumeIndex = active.currentQuizId
          ? sessionQuizData.items.findIndex((item) => item.id === active.currentQuizId)
          : -1;
        setCurrent(resumeIndex >= 0 ? resumeIndex : 0);
      } else {
        setSession(null);
        setAnswers({});
        setCurrent(0);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể tải bài quiz'); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const begin = async () => {
    setSaving(true); setError('');
    try { await startFresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể bắt đầu bài quiz'); }
    finally { setSaving(false); }
  };

  const quiz = quizzes[current];
  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const choose = async (optionId: string, label: string) => {
    if (!quiz || !session || result) return;
    const next = { ...answers, [quiz.id]: label };
    setAnswers(next); setSaving(true);
    try { await request.post(`/attempt/session/${session.id}/save`, { currentQuizId: quiz.id, selectedAnswer: optionId }); }
    catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Không lưu được đáp án';
      setError(message);
      if (/not in progress|expired/i.test(message)) {
        try { await startFresh(); } catch { /* keep original error */ }
      }
    }
    finally { setSaving(false); }
  };
  const submit = async () => {
    if (!session) return;
    setConfirmSubmit(false);
    setSaving(true); setError('');
    try { setResult(await request.post<SessionResult>(`/attempt/session/${session.id}/submit`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể nộp bài'); }
    finally { setSaving(false); }
  };

  if (loading) return <Loading label="Đang chuẩn bị bài quiz" />;
  if (error && !session && !topic) return <ErrorState message={error} retry={() => void load()} />;
  if (topic && !topicOpen(topic.availability)) {
    return (
      <>
        <header className="page-heading"><div><p className="eyebrow">{topic.name}</p><h1>Chưa đến lúc làm bài</h1><p>Chủ đề này {topic.availability === 'SCHEDULED' ? 'chưa mở' : 'đã đóng'}.</p></div><Status value={topic.availability || 'CLOSED'} /></header>
        <Empty title={topic.availability === 'SCHEDULED' ? 'Bài thi chưa mở' : 'Bài thi đã đóng'} description={topic.startsAt || topic.endsAt ? `Lịch: ${topic.startsAt ? new Date(topic.startsAt).toLocaleString('vi-VN') : 'không giới hạn'} đến ${topic.endsAt ? new Date(topic.endsAt).toLocaleString('vi-VN') : 'không giới hạn'}.` : 'Quay lại khóa học để xem các chủ đề khác.'} />
      </>
    );
  }
  if (!topic || !quizzes.length) return <Empty title="Topic chưa có câu hỏi" description="Quay lại sau khi nội dung được cập nhật." />;
  if (result) return (
    <>
      <header className="page-heading"><div><p className="eyebrow">Kết quả</p><h1>{topic.name}</h1><p>Đúng {result.correctCount}/{result.attemptedQuizCount} câu, đạt {Math.round(result.score * 100)}%.</p></div><CheckCircle size={54} color="var(--accent)" /></header>
      <div className="list-actions" style={{ marginBottom: 20, gap: 12 }}>
        {courseId ? <Link className="button" href={`/courses/${courseId}`}>Về khóa học</Link> : <Link className="button" href="/courses">Xem khóa học</Link>}
        <Link className="button secondary" href="/history">Lịch sử làm bài</Link>
        <button type="button" className="button secondary" disabled={saving} onClick={() => void startFresh()}>Làm lại</button>
      </div>
      <div className="list">{result.quizResults.map((item, index) => <article key={item.quizId} className={`panel ${item.isCorrect ? 'result-correct' : 'result-wrong'}`}><strong>Câu {index + 1}: {item.content.text}</strong><p>Đáp án của bạn: {item.selectedAnswer || 'Chưa trả lời (tính sai)'} | Đáp án đúng: {item.correctAnswer}</p>{item.explanation ? <small>{item.explanation}</small> : null}</article>)}</div>
    </>
  );
  if (!session) {
    return (
      <>
        <header className="page-heading">
          <div>
            <p className="eyebrow">{topic.name}</p>
            <h1>{quizzes.length} câu hỏi</h1>
            <p>Bắt đầu khi sẵn sàng — tiến độ sẽ được lưu nếu bạn thoát giữa chừng.</p>
          </div>
        </header>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="list-actions">
          <button type="button" className="button" disabled={saving} onClick={() => void begin()}>
            Bắt đầu làm bài <ArrowRight />
          </button>
          {courseId ? <Link className="button secondary" href={`/courses/${courseId}`}>Về khóa học</Link> : null}
        </div>
      </>
    );
  }

  const content = quiz.content || { text: quiz.question || '' };
  return (
    <>
      <header className="page-heading">
        <div><p className="eyebrow">{topic.name}</p><h1>Câu {current + 1} / {quizzes.length}</h1><p>{answeredCount} câu đã trả lời{saving ? ', đang lưu' : ''}</p></div>
        <button type="button" className="button secondary" disabled={saving} onClick={() => setConfirmRestart(true)}>Bỏ bài dở & làm lại</button>
      </header>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="quiz-layout">
        <section className="panel quiz-question">
          <h1>{content.text}</h1>
          {content.code ? <pre className="code-block"><code>{content.code}</code></pre> : null}
          {content.image ? <Image src={content.image} alt="Minh họa cho câu hỏi" width={960} height={540} style={{ width: '100%', height: 'auto', borderRadius: 12 }} /> : null}
          <div className="answer-list">{optionsOf(quiz).map(([optionId, label, text]) => <button key={optionId} className={`answer ${answers[quiz.id] === label ? 'selected' : ''}`} disabled={saving} onClick={() => void choose(optionId, label)}><span>{label}</span><span>{text}</span></button>)}</div>
          <div className="list-actions" style={{ justifyContent: 'space-between', marginTop: 24 }}>
            <button className="button secondary" disabled={current === 0} onClick={() => setCurrent((value) => value - 1)}><ArrowLeft /> Câu trước</button>
            {current < quizzes.length - 1 ? <button className="button" onClick={() => setCurrent((value) => value + 1)}>Câu tiếp <ArrowRight /></button> : <button className="button" disabled={saving} onClick={() => setConfirmSubmit(true)}><PaperPlaneTilt /> Nộp bài</button>}
          </div>
        </section>
        <aside className="panel quiz-nav"><h3>Danh sách câu</h3><div className="question-map">{quizzes.map((item, index) => <button key={item.id} className={`${index === current ? 'current' : ''} ${answers[item.id] ? 'answered' : ''}`} onClick={() => setCurrent(index)} aria-label={`Câu ${index + 1}`}>{index + 1}</button>)}</div><button className="button" style={{ width: '100%', marginTop: 20 }} disabled={saving} onClick={() => setConfirmSubmit(true)}><PaperPlaneTilt /> Nộp bài</button></aside>
      </div>
      <ConfirmDialog
        open={confirmSubmit}
        title="Nộp bài?"
        message="Sau khi nộp bạn sẽ xem kết quả và không sửa được đáp án lần này. Câu bỏ trống được tính sai."
        confirmLabel="Nộp bài"
        busy={saving}
        onCancel={() => setConfirmSubmit(false)}
        onConfirm={() => void submit()}
      />
      <ConfirmDialog
        open={confirmRestart}
        title="Bỏ bài dở và làm lại?"
        message="Tiến độ hiện tại sẽ bị hủy. Bạn bắt đầu phiên mới từ đầu."
        confirmLabel="Làm lại từ đầu"
        danger
        busy={saving}
        onCancel={() => setConfirmRestart(false)}
        onConfirm={() => void restartFresh()}
      />
    </>
  );
}

export default function TopicQuizPageSuspense() {
  return (
    <Suspense fallback={<Loading label="Đang chuẩn bị bài quiz" />}>
      <TopicQuizPage />
    </Suspense>
  );
}
