'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle,
  Copy,
  Lightning,
  Sword,
  Trophy,
  WarningCircle,
} from '@phosphor-icons/react';
import { apiUrl, request } from '@/lib/api';
import { Loading } from '@/components/ui';
import { playChestSfx, triggerCelebrationBurst } from '@/lib/sound-effects';

interface PvpRating {
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  winStreak: number;
  bestWinStreak: number;
}

interface PvpLeaderRow {
  rank: number;
  userId: string;
  fullName: string | null;
  elo: number;
  wins: number;
  losses: number;
}

interface PvpMatchDetail {
  id: string;
  inviteCode: string;
  status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  player1: { userId: string; fullName: string; score: number; answeredCount: number };
  player2: { userId: string; fullName: string; score: number; answeredCount: number } | null;
  winnerId: string | null;
  myAnswers: Array<{ questionIndex: number; selectedAnswer: string; isCorrect: boolean; points: number }>;
  questions: Array<{
    index: number;
    quizId: string;
    question: string;
    options: Array<{ id: string; label: string; text: string }>;
  }>;
}

export default function PvpPage() {
  const [rating, setRating] = useState<PvpRating | null>(null);
  const [leaders, setLeaders] = useState<PvpLeaderRow[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [match, setMatch] = useState<PvpMatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const questionStartRef = useRef<number>(Date.now());

  const loadLobby = useCallback(async () => {
    try {
      const [r, lb] = await Promise.all([
        request.get<PvpRating>('/pvp/rating/me'),
        request.get<PvpLeaderRow[]>('/pvp/leaderboard'),
      ]);
      setRating(r);
      setLeaders(lb ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshMatch = useCallback(async (matchId: string) => {
    const detail = await request.get<PvpMatchDetail>(`/pvp/matches/${matchId}`);
    setMatch(detail);
  }, []);

  useEffect(() => {
    void loadLobby();
  }, [loadLobby]);

  useEffect(() => {
    if (!match?.id || match.status === 'COMPLETED') return;
    const stream = new EventSource(apiUrl(`/pvp/matches/${match.id}/stream`), {
      withCredentials: true,
    });
    stream.onmessage = () => {
      void refreshMatch(match.id);
    };
    return () => stream.close();
  }, [match?.id, match?.status, refreshMatch]);

  const handleCreate = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await request.post<{ id: string }>('/pvp/matches/create', {});
      await refreshMatch(created.id);
      questionStartRef.current = Date.now();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo phòng PvP.');
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    if (busy || !joinCode.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const joined = await request.post<{ id: string }>(
        `/pvp/matches/join/${encodeURIComponent(joinCode.trim())}`,
        {},
      );
      await refreshMatch(joined.id);
      questionStartRef.current = Date.now();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể vào phòng.');
    } finally {
      setBusy(false);
    }
  };

  const handleAnswer = async (
    qIndex: number,
    label: string,
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    if (!match || busy) return;
    setBusy(true);
    try {
      const responseMs = Date.now() - questionStartRef.current;
      const res = await request.post<{ matchCompleted: boolean; isCorrect: boolean }>(
        `/pvp/matches/${match.id}/answer`,
        { questionIndex: qIndex, selectedAnswer: label, responseMs },
      );
      if (res.isCorrect) {
        playChestSfx();
      }
      if (res.matchCompleted) {
        triggerCelebrationBurst(e.clientX, e.clientY);
        void loadLobby();
      }
      await refreshMatch(match.id);
      questionStartRef.current = Date.now();
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading label="Đang tải Đấu trường PvP..." />;

  const nextQIdx = match ? match.myAnswers.length : 0;
  const activeQuestion =
    match && match.status === 'IN_PROGRESS' ? match.questions[nextQIdx] : null;

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 980, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>
            Đấu Trường PvP 1v1
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13.5 }}>
            Thách đấu 5 câu hỏi tốc độ theo thời gian thực · Thưởng +30 XP & +10 Coin khi thắng (tối đa 5 trận thưởng Coin/ngày).
          </p>
        </div>
        {rating ? (
          <div className="panel" style={{ padding: '10px 16px', display: 'flex', gap: 16, fontSize: 13 }}>
            <span>ELO: <strong>{rating.elo}</strong></span>
            <span>Thắng/Thua: <strong>{rating.wins}/{rating.losses}</strong></span>
            <span>Chuỗi thắng: <strong>{rating.winStreak}</strong></span>
          </div>
        ) : null}
      </header>

      {error ? <div className="notice form-error">{error}</div> : null}

      {match ? (
        <section className="panel" style={{ padding: 20, display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Sword size={20} weight="fill" color="#f43f5e" />
              <strong>Mã phòng: <code>{match.inviteCode}</code></strong>
              <button
                type="button"
                className="button secondary"
                style={{ minHeight: 28, padding: '0 8px', fontSize: 12 }}
                onClick={() => {
                  void navigator.clipboard.writeText(match.inviteCode);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }}
              >
                <Copy size={13} /> {copied ? 'Đã copy' : 'Copy mã'}
              </button>
            </div>
            <button type="button" className="button secondary" onClick={() => setMatch(null)}>
              Rời màn hình trận
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ padding: 12, borderRadius: 12, background: 'var(--surface-2)' }}>
              <strong>{match.player1.fullName}</strong>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#0284c7' }}>
                {match.player1.score} điểm
              </div>
              <small style={{ color: 'var(--muted)' }}>
                Đã trả lời: {match.player1.answeredCount}/{match.questions.length}
              </small>
            </div>
            <div style={{ padding: 12, borderRadius: 12, background: 'var(--surface-2)' }}>
              <strong>{match.player2 ? match.player2.fullName : 'Đang chờ đối thủ...'}</strong>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#f43f5e' }}>
                {match.player2 ? `${match.player2.score} điểm` : '—'}
              </div>
              <small style={{ color: 'var(--muted)' }}>
                {match.player2
                  ? `Đã trả lời: ${match.player2.answeredCount}/${match.questions.length}`
                  : 'Gửi mã phòng cho bạn bè để bắt đầu'}
              </small>
            </div>
          </div>

          {match.status === 'WAITING' ? (
            <div style={{ textAlign: 'center', padding: '18px 0', color: 'var(--muted)' }}>
              <Lightning size={28} weight="fill" color="#f59e0b" />
              <p>Đang chờ đối thủ nhập mã <strong>{match.inviteCode}</strong> để bắt đầu trận đấu...</p>
            </div>
          ) : match.status === 'COMPLETED' ? (
            <div style={{ padding: 16, borderRadius: 12, background: 'rgba(16, 185, 129, 0.14)', textAlign: 'center' }}>
              <Trophy size={30} weight="fill" color="#f59e0b" />
              <h3 style={{ margin: '6px 0' }}>
                {match.winnerId === null
                  ? 'Trận đấu hòa!'
                  : match.winnerId === match.player1.userId
                    ? `🏆 ${match.player1.fullName} chiến thắng!`
                    : `🏆 ${match.player2?.fullName ?? 'Người chơi 2'} chiến thắng!`}
              </h3>
            </div>
          ) : activeQuestion ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <strong style={{ fontSize: 16 }}>
                Câu {activeQuestion.index + 1}/{match.questions.length}: {activeQuestion.question}
              </strong>
              <div style={{ display: 'grid', gap: 8 }}>
                {activeQuestion.options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '12px 14px' }}
                    onClick={(e) => void handleAnswer(activeQuestion.index, opt.label, e)}
                  >
                    <strong>{opt.label}.</strong>&nbsp;{opt.text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 14, color: 'var(--muted)' }}>
              <CheckCircle size={24} weight="fill" color="#10b981" />
              <p>Bạn đã hoàn thành toàn bộ câu hỏi! Đang chờ đối thủ hoàn tất...</p>
            </div>
          )}
        </section>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          <div className="panel" style={{ padding: 20, display: 'grid', gap: 12 }}>
            <h3 style={{ margin: 0 }}>Tạo phòng thách đấu</h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
              Tạo phòng 1v1 mới và gửi mã 6 ký tự cho bạn bè cùng đấu tốc độ.
            </p>
            <button type="button" className="button" disabled={busy} onClick={() => void handleCreate()}>
              <Sword size={16} weight="fill" /> Tạo phòng ngay
            </button>
          </div>

          <div className="panel" style={{ padding: 20, display: 'grid', gap: 12 }}>
            <h3 style={{ margin: 0 }}>Tham gia bằng mã phòng</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Nhập mã 6 ký tự (VD: A1B2C3)"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--line)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                }}
              />
              <button
                type="button"
                className="button"
                disabled={busy || !joinCode.trim()}
                onClick={() => void handleJoin()}
              >
                Vào phòng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <section className="panel" style={{ padding: 18, display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Trophy size={18} weight="fill" color="#f59e0b" /> Bảng Xếp Hạng ELO PvP
        </h3>
        {leaders.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
            <WarningCircle size={14} /> Chưa có trận đấu PvP nào được hoàn thành.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {leaders.map((row) => (
              <div
                key={row.userId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: 'var(--surface-2)',
                  fontSize: 13,
                }}
              >
                <span>
                  <strong>#{row.rank}</strong> · {row.fullName || row.userId}
                </span>
                <span>
                  <strong>{row.elo} ELO</strong> ({row.wins}W / {row.losses}L)
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
