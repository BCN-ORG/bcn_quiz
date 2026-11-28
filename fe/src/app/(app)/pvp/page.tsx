'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCircle,
  Copy,
  Fire,
  KeyReturn,
  Lightning,
  PlusCircle,
  SignOut,
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

function getEloTierLabel(elo: number): string {
  if (elo >= 1600) return 'Huyền Thoại';
  if (elo >= 1400) return 'Kim Cương';
  if (elo >= 1200) return 'Bạch Kim';
  if (elo >= 1050) return 'Vàng';
  if (elo >= 950) return 'Bạc';
  return 'Đồng';
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được dữ liệu PvP.');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshMatch = useCallback(
    async (matchId: string) => {
      try {
        const detail = await request.get<PvpMatchDetail>(`/pvp/matches/${matchId}`);
        setMatch(detail);
        if (detail.status === 'COMPLETED') {
          void loadLobby();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Không thể đồng bộ trạng thái trận đấu.');
      }
    },
    [loadLobby],
  );

  useEffect(() => {
    void loadLobby();
  }, [loadLobby]);

  useEffect(() => {
    if (!match?.id || match.status === 'COMPLETED' || match.status === 'CANCELLED') {
      return;
    }
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

  const handleJoin = async (e?: React.FormEvent) => {
    e?.preventDefault();
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể gửi đáp án.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading label="Đang tải Đấu trường PvP..." />;

  const nextQIdx = match ? match.myAnswers.length : 0;
  const activeQuestion =
    match && match.status === 'IN_PROGRESS' ? match.questions[nextQIdx] : null;
  const totalMatches = rating ? rating.wins + rating.losses + rating.draws : 0;
  const winRate =
    rating && totalMatches > 0
      ? Math.round((rating.wins / totalMatches) * 100)
      : 0;

  return (
    <div className="arena-page">
      <section className="arena-hero arena-hero--pvp">
        <div className="arena-hero__main">
          <span className="arena-hero__eyebrow">
            <Sword size={13} weight="fill" /> Đấu trường tốc độ 1v1
          </span>
          <h1 className="arena-hero__title">Đấu Trường PvP 1v1</h1>
          <p className="arena-hero__sub">
            Thách đấu 5 câu hỏi tốc độ theo thời gian thực · Thưởng +30 XP & +10 Coin khi thắng (tối đa 5 trận thưởng Coin/ngày).
          </p>
        </div>

        {rating ? (
          <div className="arena-hero__aside">
            <div className="pvp-rating-strip">
              <div className="pvp-rating-stat">
                <small>Hạng · ELO</small>
                <strong>
                  {rating.elo}{' '}
                  <span style={{ fontSize: 12, color: '#fde047', fontWeight: 700 }}>
                    ({getEloTierLabel(rating.elo)})
                  </span>
                </strong>
              </div>
              <div className="pvp-rating-divider" />
              <div className="pvp-rating-stat">
                <small>Thắng / Thua</small>
                <strong>
                  {rating.wins}/{rating.losses}{' '}
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>({winRate}%)</span>
                </strong>
              </div>
              <div className="pvp-rating-divider" />
              <div className="pvp-rating-stat">
                <small>Chuỗi thắng</small>
                <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Fire size={16} weight="fill" color="#fb923c" />
                  {rating.winStreak}
                </strong>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {error ? (
        <div role="alert" className="arena-notice arena-notice--error">
          <WarningCircle size={18} weight="fill" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="arena-two-col">
        <div className="arena-stack">
      {match ? (
        <section className="arena-card">
          <div className="arena-section-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="pvp-code-chip">
                <Sword size={16} weight="fill" />
                {match.inviteCode}
              </span>
              <button
                type="button"
                className="button secondary"
                style={{ minHeight: 34, padding: '0 12px', fontSize: 12.5 }}
                onClick={() => {
                  void navigator.clipboard.writeText(match.inviteCode);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }}
              >
                {copied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
                {copied ? 'Đã sao chép' : 'Copy mã phòng'}
              </button>
            </div>

            <button
              type="button"
              className="button secondary"
              style={{ minHeight: 34, padding: '0 12px', fontSize: 12.5 }}
              onClick={() => setMatch(null)}
            >
              <SignOut size={14} /> Rời màn hình trận
            </button>
          </div>

          <div className="pvp-versus-board">
            <div className="pvp-player-box pvp-player-box--p1">
              <strong style={{ fontSize: 15 }}>{match.player1.fullName}</strong>
              <div className="pvp-score" style={{ color: '#0ea5e9' }}>
                {match.player1.score}{' '}
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>
                  điểm
                </span>
              </div>
              <div className="pvp-pips" aria-label="Tiến độ trả lời người chơi 1">
                {match.questions.map((q) => (
                  <span
                    key={q.index}
                    className={`pvp-pip ${q.index < match.player1.answeredCount ? 'is-done' : ''}`}
                  />
                ))}
              </div>
              <small style={{ color: 'var(--muted)', fontSize: 12 }}>
                Đã trả lời: {match.player1.answeredCount}/{match.questions.length}
              </small>
            </div>

            <div className="pvp-vs-badge" aria-hidden="true">
              VS
            </div>

            <div className="pvp-player-box pvp-player-box--p2">
              <strong style={{ fontSize: 15 }}>
                {match.player2 ? match.player2.fullName : 'Đang chờ đối thủ…'}
              </strong>
              <div className="pvp-score" style={{ color: '#f43f5e' }}>
                {match.player2 ? (
                  <>
                    {match.player2.score}{' '}
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>
                      điểm
                    </span>
                  </>
                ) : (
                  '—'
                )}
              </div>
              <div className="pvp-pips" aria-label="Tiến độ trả lời người chơi 2">
                {match.questions.map((q) => (
                  <span
                    key={q.index}
                    className={`pvp-pip ${
                      match.player2 && q.index < match.player2.answeredCount
                        ? 'is-done'
                        : ''
                    }`}
                  />
                ))}
              </div>
              <small style={{ color: 'var(--muted)', fontSize: 12 }}>
                {match.player2
                  ? `Đã trả lời: ${match.player2.answeredCount}/${match.questions.length}`
                  : 'Gửi mã phòng cho bạn bè để bắt đầu'}
              </small>
            </div>
          </div>

          {match.status === 'WAITING' ? (
            <div className="pvp-waiting-box">
              <Lightning size={32} weight="fill" color="#f59e0b" />
              <strong style={{ fontSize: 16 }}>Phòng đã sẵn sàng!</strong>
              <p style={{ margin: 0, fontSize: 13.5, color: 'var(--muted)' }}>
                Gửi mã{' '}
                <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                  {match.inviteCode}
                </strong>{' '}
                cho bạn bè. Trận đấu sẽ tự động bắt đầu ngay khi đối thủ vào phòng.
              </p>
            </div>
          ) : match.status === 'CANCELLED' ? (
            <div className="pvp-waiting-box">
              <WarningCircle size={32} weight="fill" color="#f43f5e" />
              <strong style={{ fontSize: 16 }}>Trận đấu đã bị hủy</strong>
              <p style={{ margin: 0, fontSize: 13.5, color: 'var(--muted)' }}>
                Phòng này đã bị đóng hoặc hủy bởi quản trị viên. Bạn có thể tạo hoặc vào phòng mới.
              </p>
              <button
                type="button"
                className="button secondary"
                style={{ marginTop: 6 }}
                onClick={() => setMatch(null)}
              >
                Quay lại sảnh PvP
              </button>
            </div>
          ) : match.status === 'COMPLETED' ? (
            <div className="pvp-result-banner">
              <Trophy size={36} weight="fill" color="#f59e0b" />
              <h3 style={{ margin: 0, fontSize: 20, fontFamily: 'var(--font-display)' }}>
                {match.winnerId === null
                  ? 'Trận đấu hòa đầy kịch tính!'
                  : match.winnerId === match.player1.userId
                    ? `${match.player1.fullName} giành chiến thắng!`
                    : `${match.player2?.fullName ?? 'Người chơi 2'} giành chiến thắng!`}
              </h3>
              <button
                type="button"
                className="button"
                style={{ marginTop: 6 }}
                onClick={() => setMatch(null)}
              >
                Quay lại sảnh PvP
              </button>
            </div>
          ) : activeQuestion ? (
            <div style={{ display: 'grid', gap: 14 }}>
              <div className="arena-section-head">
                <span className="mk-topic-pill">
                  Câu {activeQuestion.index + 1} / {match.questions.length}
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>
                  Trả lời nhanh và chính xác để tối đa điểm tốc độ
                </span>
              </div>
              <h3 style={{ margin: 0, fontSize: 17, lineHeight: 1.45 }}>
                {activeQuestion.question}
              </h3>
              <div className="arena-options-grid">
                {activeQuestion.options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className="arena-option-btn"
                    disabled={busy}
                    onClick={(e) =>
                      void handleAnswer(activeQuestion.index, opt.label, e)
                    }
                  >
                    <span className="arena-option-key">{opt.label}</span>
                    <span>{opt.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="pvp-waiting-box">
              <CheckCircle size={32} weight="fill" color="#10b981" />
              <strong style={{ fontSize: 16 }}>Bạn đã hoàn thành toàn bộ câu hỏi!</strong>
              <p style={{ margin: 0, fontSize: 13.5, color: 'var(--muted)' }}>
                Đang chờ đối thủ trả lời nốt để tổng kết điểm và cập nhật ELO…
              </p>
            </div>
          )}
        </section>
      ) : (
        <div className="pvp-lobby-grid">
          <article className="pvp-lobby-card">
            <div className="pvp-lobby-card__head">
              <div className="arena-kpi-icon arena-kpi-icon--crimson">
                <PlusCircle size={24} weight="fill" />
              </div>
              <div>
                <h2 className="arena-section-title" style={{ fontSize: 16 }}>
                  Tạo phòng thách đấu
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--muted)' }}>
                  Khởi tạo phòng 1v1 mới và nhận mã mời 6 ký tự gửi cho bạn bè cùng đấu tốc độ.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => void handleCreate()}
            >
              <Sword size={17} weight="fill" />
              {busy ? 'Đang tạo phòng…' : 'Tạo phòng ngay'}
            </button>
          </article>

          <form className="pvp-lobby-card" onSubmit={(e) => void handleJoin(e)}>
            <div className="pvp-lobby-card__head">
              <div className="arena-kpi-icon arena-kpi-icon--emerald">
                <KeyReturn size={24} weight="fill" />
              </div>
              <div>
                <h2 className="arena-section-title" style={{ fontSize: 16 }}>
                  Tham gia bằng mã phòng
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--muted)' }}>
                  Nhập mã 6 ký tự từ bạn bè để vào trận đấu trực tiếp ngay lập tức.
                </p>
              </div>
            </div>

            <div className="arena-field">
              <label htmlFor="pvp-join-code">Mã phòng thách đấu</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="pvp-join-code"
                  type="text"
                  maxLength={10}
                  className="arena-input arena-input--code"
                  placeholder="VD: A1B2C3"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                />
                <button
                  type="submit"
                  className="button"
                  style={{ whiteSpace: 'nowrap' }}
                  disabled={busy || !joinCode.trim()}
                >
                  Vào phòng
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
        </div>

      {/* Leaderboard */}
      <section className="arena-card">
        <div className="arena-section-head">
          <h2 className="arena-section-title">
            <Trophy size={20} weight="fill" color="#f59e0b" />
            Bảng Xếp Hạng ELO PvP
          </h2>
          <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>
            Top {leaders.length} đấu sĩ
          </span>
        </div>

        {leaders.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13.5 }}>
            Chưa có trận đấu PvP nào được hoàn thành. Hãy tạo phòng và mở màn bảng xếp hạng!
          </p>
        ) : (
          <div className="arena-lb-list">
            {leaders.map((row) => (
              <div
                key={row.userId}
                className={`arena-lb-row ${row.rank <= 3 ? `is-top-${row.rank}` : ''}`}
              >
                <div className="arena-lb-left">
                  <span className="arena-rank-pill">#{row.rank}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="arena-lb-name">
                      {row.fullName || row.userId}
                    </div>
                    <div className="arena-lb-sub">
                      {getEloTierLabel(row.elo)} · {row.wins} thắng / {row.losses} thua
                    </div>
                  </div>
                </div>
                <span className="arena-lb-score">{row.elo} ELO</span>
              </div>
            ))}
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
