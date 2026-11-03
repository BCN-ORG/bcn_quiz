'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, CheckCircle, Flag, PaperPlaneTilt } from '@phosphor-icons/react';
import Image from 'next/image';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QuizReview } from '@/components/quiz-review';
import { Empty, ErrorState, Loading, Status, ConfirmDialog } from '@/components/ui';
import { ApiError, request } from '@/lib/api';
import { topicOpen } from '@/lib/format';
import type { Pagination, Quiz, QuizSession, SessionResult, Topic } from '@/lib/types';

/** Session TTL only for cleanup — not an exam timer. Topic startsAt/endsAt still gate access. */
const SESSION_TTL_MINUTES = 365 * 24 * 60;

async function loadTopicQuizzes(topicId: string, sessionId?: string): Promise<Quiz[]> {
  const suffix = sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : '';
  const first = await request.get<Pagination<Quiz>>(`/topic/${topicId}/quizzes?page=1&limit=100${suffix}`);
  const pages = await Promise.all(Array.from({ length: first.pagination.totalPages - 1 }, (_, index) =>
    request.get<Pagination<Quiz>>(`/topic/${topicId}/quizzes?page=${index + 2}&limit=100${suffix}`)));
  return [first, ...pages].flatMap((page) => page.items);
}

function weightLabel(value: number) { return Number(value.toFixed(2)).toLocaleString('vi-VN', { maximumFractionDigits: 2 }); }

function optionsOf(quiz: Quiz): Array<[string, string, string]> {
  if (Array.isArray(quiz.options)) return quiz.options.map((option) => [option.id ?? option.label, option.label, option.content]);
  return Object.entries(quiz.options.data || {}).map(([label, content]) => [label, label, content]);
}

function TopicQuizPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId');
  const leaderboardHref = `/topics/${id}/leaderboard${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ''}`;
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
  const [savingCount, setSavingCount] = useState(0);
  const [failedSave, setFailedSave] = useState<{ quizId: string } | null>(null);
  const latestChoice = useRef<Record<string, string>>({});
  const inFlight = useRef(new Set<string>());
  const [sessionLost, setSessionLost] = useState(false);
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});

  const startFresh = useCallback(async () => {
    const active = await request.post<QuizSession>(`/topic/${id}/session/start`, {
      expiresInMinutes: SESSION_TTL_MINUTES,
    });
    const quizData = await loadTopicQuizzes(id, active.id);
    setSession(active);
    setQuizzes(quizData);
    setAnswers(active.answers || {});
    setCurrent(0);
    setResult(null);
    setError('');
    setSessionLost(false);
    setFailedSave(null);
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
        loadTopicQuizzes(id),
      ]);
      setTopic(topicData); setQuizzes(quizData);
      if (!topicOpen(topicData.availability)) return;
      // Resume only — do not auto-start (avoids ghost IN_PROGRESS rows in history).
      const active = await request.get<QuizSession | null>(`/topic/${id}/session/resume`);
      if (active && active.status === 'IN_PROGRESS') {
        const sessionQuizData = await loadTopicQuizzes(id, active.id);
        setSession(active);
        setQuizzes(sessionQuizData);
        const restored = active.answers || {};
        setAnswers(restored);
        const resumeIndex = active.currentQuizId
          ? sessionQuizData.findIndex((item) => item.id === active.currentQuizId)
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
  const unansweredCount = Math.max(0, quizzes.length - answeredCount);
  const flaggedCount = quizzes.filter((item) => flagged[item.id]).length;
  const sessionId = session?.id;
  const flagKey = sessionId ? `bcn-quiz-flags:${sessionId}` : '';
  useEffect(() => {
    if (!flagKey) return;
    try { setFlagged(JSON.parse(sessionStorage.getItem(flagKey) || '{}')); } catch { setFlagged({}); }
  }, [flagKey]);
  const toggleFlag = () => {
    if (!quiz) return;
    const next = { ...flagged, [quiz.id]: !flagged[quiz.id] };
    if (!next[quiz.id]) delete next[quiz.id];
    setFlagged(next);
    try { sessionStorage.setItem(flagKey, JSON.stringify(next)); } catch { /* đánh dấu chỉ là tiện ích, bỏ qua nếu không lưu được */ }
  };

  // Mỗi câu chỉ có một request lưu bay cùng lúc và đáp án mới nhất luôn thắng, để đáp án cũ không ghi đè đáp án mới trên server.
  useEffect(() => { latestChoice.current = {}; inFlight.current = new Set(); }, [sessionId]);
  const save = useCallback(async (quizId: string) => {
    // Gắn vòng lưu với phiên đã khởi tạo nó: nếu người học làm lại giữa chừng, kết quả của phiên cũ bị bỏ qua.
    const choices = latestChoice.current;
    const flight = inFlight.current;
    if (!sessionId || flight.has(quizId)) return;
    flight.add(quizId);
    setSavingCount((count) => count + 1);
    try {
      let sent: string | undefined;
      while (choices[quizId] !== sent && latestChoice.current === choices) {
        sent = choices[quizId];
        try {
          await request.post(`/attempt/session/${sessionId}/save`, { currentQuizId: quizId, selectedAnswer: sent });
        } catch (reason) {
          if (latestChoice.current !== choices) return;
          if (reason instanceof ApiError && /not in progress|expired/i.test(reason.message)) setSessionLost(true);
          else setFailedSave({ quizId });
          return;
        }
      }
      if (latestChoice.current === choices) setFailedSave((value) => (value?.quizId === quizId ? null : value));
    } finally {
      flight.delete(quizId);
      setSavingCount((count) => count - 1);
    }
  }, [sessionId]);

  // Mất mạng hoặc server lỗi tạm thời: tự thử lại sau 5 giây hoặc ngay khi mạng quay lại.
  useEffect(() => {
    if (!failedSave || sessionLost) return;
    const retry = () => void save(failedSave.quizId);
    const timer = window.setTimeout(retry, 5000);
    window.addEventListener('online', retry);
    return () => { window.clearTimeout(timer); window.removeEventListener('online', retry); };
  }, [failedSave, sessionLost, save]);

  const choose = useCallback((optionId: string, label: string) => {
    if (!quiz || !session || result || sessionLost) return;
    setAnswers((value) => ({ ...value, [quiz.id]: label }));
    latestChoice.current[quiz.id] = optionId;
    void save(quiz.id);
  }, [quiz, session, result, sessionLost, save]);

  useEffect(() => {
    if (!session || result || confirmSubmit || confirmRestart || !quiz) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(target.tagName) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'ArrowRight' && current < quizzes.length - 1) { setCurrent(current + 1); return; }
      if (event.key === 'ArrowLeft' && current > 0) { setCurrent(current - 1); return; }
      const options = optionsOf(quiz);
      const index = /^[1-9]$/.test(event.key) ? Number(event.key) - 1 : options.findIndex(([, label]) => label.toLowerCase() === event.key.toLowerCase());
      if (event.key.length === 1 && index >= 0 && index < options.length) { event.preventDefault(); choose(options[index][0], options[index][1]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session, result, confirmSubmit, confirmRestart, quiz, quizzes.length, current, choose]);

  useEffect(() => {
    document.querySelector('.question-map button.current')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [current, session]);

  const saveLabel = failedSave ? 'Chưa lưu được đáp án' : savingCount > 0 ? 'Đang lưu…' : answeredCount > 0 ? 'Đã lưu' : '';
  const submitting = useRef(false);
  const submit = async () => {
    if (!session || submitting.current) return;
    submitting.current = true;
    setConfirmSubmit(false);
    setSaving(true); setError('');
    try { setResult(await request.post<SessionResult>(`/attempt/session/${session.id}/submit`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể nộp bài'); }
    finally { setSaving(false); submitting.current = false; }
  };

  if (loading) return <Loading label="Đang chuẩn bị bài quiz" />;
  if (error && !session && !topic) return <ErrorState message={error} retry={() => void load()} />;
  if (topic && !topicOpen(topic.availability)) {
    return (
      <>
        <header className="page-heading"><div><p className="eyebrow">{topic.name}</p><h1>Chưa đến lúc làm bài</h1><p>Chủ đề này {topic.availability === 'SCHEDULED' ? 'chưa mở' : 'đã đóng'}.</p></div><Status value={topic.availability || 'CLOSED'} /></header>
        <Empty title={topic.availability === 'SCHEDULED' ? 'Bài thi chưa mở' : 'Bài thi đã đóng'} description={topic.startsAt || topic.endsAt ? `Lịch: ${topic.startsAt ? new Date(topic.startsAt).toLocaleString('vi-VN') : 'không giới hạn'} đến ${topic.endsAt ? new Date(topic.endsAt).toLocaleString('vi-VN') : 'không giới hạn'}.` : 'Quay lại khóa học để xem các chủ đề khác.'} />
        <Link className="button secondary" href={leaderboardHref}>Xem bảng xếp hạng</Link>
      </>
    );
  }
  if (!topic || !quizzes.length) return <><Empty title="Topic chưa có câu hỏi" description="Quay lại sau khi nội dung được cập nhật." /><Link className="button secondary" href={leaderboardHref}>Xem bảng xếp hạng</Link></>;
  if (result) return (
    <>
      <header className="page-heading"><div><p className="eyebrow">Kết quả</p><h1>{topic.name}</h1><p>Đúng {result.correctCount}/{result.attemptedQuizCount} câu · sai {result.attemptedQuizCount - result.correctCount} câu · chính xác {Math.round(result.score * 100)}%.</p><p><strong>{result.leaderboard.attemptScore}/{result.leaderboard.maxScore} điểm</strong> · hạng ngày #{result.leaderboard.rank ?? '—'}</p><p>{result.leaderboard.isOfficial ? 'Kết quả này được tính vào bảng xếp hạng hôm nay.' : `Lượt luyện tập. Điểm chính thức hôm nay: ${result.leaderboard.score}.`}</p></div><CheckCircle size={54} color="var(--accent)" /></header>
      <QuizReview
        items={result.quizResults}
        actions={(
          <>
            {courseId ? <Link className="button" href={`/courses/${courseId}`}>Về khóa học</Link> : <Link className="button" href="/courses">Xem khóa học</Link>}
            <Link className="button secondary" href="/history">Lịch sử làm bài</Link>
            <button type="button" className="button secondary" disabled={saving} onClick={() => void startFresh()}>Làm lại</button>
            <Link className="button secondary" href={leaderboardHref} target="_blank" rel="noopener noreferrer">Xem bảng xếp hạng</Link>
          </>
        )}
      />
    </>
  );
  if (!session) {
    return (
      <>
        <header className="page-heading">
          <div>
            <p className="eyebrow">{topic.name}</p>
            <h1>{topic.leaderboard?.totalQuestions ?? quizzes.length} câu hỏi · {topic.leaderboard?.maxScore ?? 0} điểm tối đa</h1>
            <p>Mỗi câu có trọng số bằng nhau. Mỗi câu đúng {topic.leaderboard?.questionWeight && !Number.isInteger(topic.leaderboard.questionWeight) ? '≈ ' : '= '}{weightLabel(topic.leaderboard?.questionWeight ?? 0)} điểm; sai = 0.</p>
            <p>Điểm cuối cùng dựa trên tổng số câu đúng và làm tròn về số nguyên. Lần nộp đầu tiên hôm nay được tính vào bảng xếp hạng.</p>
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
        <Link className="button secondary" href={leaderboardHref}>Xem bảng xếp hạng</Link>
      </>
    );
  }

  const content = quiz.content || { text: quiz.question || '' };
  return (
    <>
      <header className="page-heading">
        <div><p className="eyebrow">{topic.name}</p><h1>Câu {current + 1} / {quizzes.length}</h1><p>≈ {weightLabel(topic.leaderboard?.questionWeight ?? 0)} điểm/câu · {answeredCount}/{quizzes.length} câu đã trả lời</p><p className={`save-status ${failedSave ? 'is-error' : ''}`} role="status" aria-live="polite">{saveLabel}</p></div>
        <div className="list-actions"><Link className="button secondary" href={leaderboardHref} target="_blank" rel="noopener noreferrer">Xem bảng xếp hạng</Link><button type="button" className="button secondary" disabled={saving} onClick={() => setConfirmRestart(true)}>Bỏ bài dở & làm lại</button></div>
      </header>
      {error ? <p className="form-error">{error}</p> : null}
      {failedSave ? (
        <div className="notice notice-danger" role="alert">
          <strong>Chưa lưu được đáp án câu {quizzes.findIndex((item) => item.id === failedSave.quizId) + 1}.</strong>
          <p>Kiểm tra kết nối mạng. Hệ thống tự thử lại sau vài giây; bạn cũng có thể thử ngay. Đừng đóng trang cho tới khi báo &quot;Đã lưu&quot;.</p>
          <button type="button" className="button secondary" onClick={() => void save(failedSave.quizId)}>Thử lại ngay</button>
        </div>
      ) : null}
      {sessionLost ? (
        <div className="notice notice-danger" role="alert">
          <strong>Phiên làm bài này không còn hiệu lực.</strong>
          <p>Không thể lưu thêm đáp án vào phiên này. Bạn có thể bắt đầu một phiên mới.</p>
          <button type="button" className="button secondary" disabled={saving} onClick={() => { setSaving(true); void startFresh().catch((reason) => setError(reason instanceof Error ? reason.message : 'Không thể bắt đầu phiên mới')).finally(() => setSaving(false)); }}>Bắt đầu phiên mới</button>
        </div>
      ) : null}
      <div className="quiz-layout">
        <section className="panel quiz-question">
          <h2 id="question-text">{content.text}</h2>
          {content.code ? <pre className="code-block"><code>{content.code}</code></pre> : null}
          {content.image ? <Image src={content.image} alt="Minh họa cho câu hỏi" width={960} height={540} style={{ width: '100%', height: 'auto', borderRadius: 12 }} /> : null}
          <div className="answer-list" role="radiogroup" aria-labelledby="question-text">{optionsOf(quiz).map(([optionId, label, text]) => {
            const selected = answers[quiz.id] === label;
            return <button key={optionId} type="button" role="radio" aria-checked={selected} className={`answer ${selected ? 'selected' : ''}`} disabled={saving || sessionLost} onClick={() => choose(optionId, label)}><span>{label}</span><span>{text}</span>{selected ? <Check weight="bold" aria-hidden="true" /> : null}</button>;
          })}</div>
          <p className="answer-hint">Chọn một đáp án. Phím tắt: bấm A–D hoặc 1–4 để chọn, phím ← → để đổi câu.</p>
          <button type="button" className={`button secondary quiz-flag ${flagged[quiz.id] ? 'is-flagged' : ''}`} aria-pressed={Boolean(flagged[quiz.id])} onClick={toggleFlag}><Flag weight={flagged[quiz.id] ? 'fill' : 'regular'} /> {flagged[quiz.id] ? 'Bỏ đánh dấu xem lại' : 'Đánh dấu xem lại'}</button>
          <div className="list-actions" style={{ justifyContent: 'space-between', marginTop: 24 }}>
            <button className="button secondary" disabled={current === 0} onClick={() => setCurrent((value) => value - 1)}><ArrowLeft /> Câu trước</button>
            {current < quizzes.length - 1 ? <button className="button" onClick={() => setCurrent((value) => value + 1)}>Câu tiếp <ArrowRight /></button> : <button className="button" disabled={saving} onClick={() => setConfirmSubmit(true)}><PaperPlaneTilt /> Nộp bài</button>}
          </div>
          {current < quizzes.length - 1 ? <button type="button" className="button secondary quiz-submit-inline" disabled={saving} onClick={() => setConfirmSubmit(true)}><PaperPlaneTilt /> Nộp bài</button> : null}
        </section>
        <aside className="panel quiz-nav"><h3>Danh sách câu</h3><div className="question-map">{quizzes.map((item, index) => {
          const done = Boolean(answers[item.id]);
          const flag = Boolean(flagged[item.id]);
          return <button key={item.id} type="button" className={`${index === current ? 'current' : ''} ${done ? 'answered' : ''} ${flag ? 'flagged' : ''}`} aria-current={index === current ? 'step' : undefined} aria-label={`Câu ${index + 1}: ${done ? 'đã làm' : 'chưa làm'}${flag ? ', đánh dấu xem lại' : ''}${index === current ? ', đang xem' : ''}`} onClick={() => setCurrent(index)}>{index + 1}</button>;
        })}</div><p className="map-legend">✓ đã làm · ⚑ đánh dấu xem lại · khung đậm: câu đang xem</p><button className="button quiz-nav-submit" disabled={saving} onClick={() => setConfirmSubmit(true)}><PaperPlaneTilt /> Nộp bài</button></aside>
      </div>
      <ConfirmDialog
        open={confirmSubmit}
        title="Nộp bài?"
        message={`${unansweredCount ? `Còn ${unansweredCount} câu chưa làm` : 'Bạn đã trả lời tất cả các câu'}${flaggedCount ? `, ${flaggedCount} câu đang đánh dấu xem lại` : ''}. Sau khi nộp bạn sẽ xem kết quả và không sửa được đáp án lần này. Câu bỏ trống được tính sai.`}
        confirmLabel="Nộp bài"
        cancelLabel="Quay lại làm tiếp"
        cancelPrimary
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
