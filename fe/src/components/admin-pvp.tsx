'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowCounterClockwise,
  CheckCircle,
  Prohibit,
  Sword,
  Trophy,
  UsersThree,
  WarningCircle,
} from '@phosphor-icons/react';
import { request } from '@/lib/api';
import { ConfirmDialog, Loading } from '@/components/ui';

interface PvpOverview {
  total: number;
  waiting: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  ratedPlayers: number;
}

interface AdminMatchRow {
  id: string;
  inviteCode: string;
  status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  player1Id: string;
  player1Name: string;
  player1Score: number;
  player2Id: string | null;
  player2Name: string | null;
  player2Score: number;
  winnerId: string | null;
  createdAt: string;
}

interface PvpLeaderRow {
  rank: number;
  userId: string;
  fullName: string | null;
  elo: number;
  wins: number;
  losses: number;
}

export function AdminPvp({ canDelete }: { canDelete: boolean }) {
  const [overview, setOverview] = useState<PvpOverview | null>(null);
  const [matches, setMatches] = useState<AdminMatchRow[]>([]);
  const [leaders, setLeaders] = useState<PvpLeaderRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmResetAll, setConfirmResetAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const qs = statusFilter ? `&status=${encodeURIComponent(statusFilter)}` : '';
      const [ov, mt, lb] = await Promise.all([
        request.get<PvpOverview>('/pvp/admin/overview'),
        request.get<{ items: AdminMatchRow[] }>(`/pvp/admin/matches?page=1&limit=20${qs}`),
        request.get<PvpLeaderRow[]>('/pvp/leaderboard'),
      ]);
      setOverview(ov);
      setMatches(mt.items ?? []);
      setLeaders(lb ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được dữ liệu PvP.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCancelMatch = async (matchId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await request.post(`/pvp/admin/matches/${matchId}/cancel`, {});
      setNotice('Đã hủy phòng PvP bị treo.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể hủy trận đấu.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetUser = async (userId: string, name: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await request.post(`/pvp/admin/ratings/${userId}/reset`, {});
      setNotice(`Đã reset ELO của ${name} về 1000.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể reset ELO.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetSeason = async () => {
    setConfirmResetAll(false);
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await request.post<{ resetCount: number }>(
        '/pvp/admin/ratings/reset-season',
        {},
      );
      setNotice(`Đã reset ELO mùa mới cho ${res.resetCount} đấu sĩ về 1000 ELO.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể reset ELO mùa.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading label="Đang tải quản trị PvP 1v1..." />;

  return (
    <div className="arena-stack">
      {error ? (
        <div role="alert" className="arena-notice arena-notice--error">
          <WarningCircle size={18} weight="fill" />
          <span>{error}</span>
        </div>
      ) : null}
      {notice ? (
        <div className="arena-notice arena-notice--success">
          <CheckCircle size={18} weight="fill" />
          <span>{notice}</span>
        </div>
      ) : null}

      <div className="arena-kpi-grid">
        <div className="arena-kpi-card">
          <div className="arena-kpi-icon arena-kpi-icon--crimson">
            <Sword size={22} weight="fill" />
          </div>
          <div className="arena-kpi-meta">
            <span className="arena-kpi-label">Tổng trận PvP</span>
            <span className="arena-kpi-value">{overview?.total ?? 0}</span>
          </div>
        </div>
        <div className="arena-kpi-card">
          <div className="arena-kpi-icon arena-kpi-icon--amber">
            <Prohibit size={22} weight="fill" />
          </div>
          <div className="arena-kpi-meta">
            <span className="arena-kpi-label">Đang chờ / Đang đấu</span>
            <span className="arena-kpi-value">
              {(overview?.waiting ?? 0) + (overview?.inProgress ?? 0)}
            </span>
          </div>
        </div>
        <div className="arena-kpi-card">
          <div className="arena-kpi-icon arena-kpi-icon--emerald">
            <CheckCircle size={22} weight="fill" />
          </div>
          <div className="arena-kpi-meta">
            <span className="arena-kpi-label">Đã hoàn thành</span>
            <span className="arena-kpi-value">{overview?.completed ?? 0}</span>
          </div>
        </div>
        <div className="arena-kpi-card">
          <div className="arena-kpi-icon">
            <UsersThree size={22} weight="fill" />
          </div>
          <div className="arena-kpi-meta">
            <span className="arena-kpi-label">Đấu sĩ có ELO</span>
            <span className="arena-kpi-value">{overview?.ratedPlayers ?? 0}</span>
          </div>
        </div>
      </div>

      <div className="arena-two-col">
        <section className="arena-card">
          <div className="arena-section-head">
            <h3 className="arena-section-title">
              <Sword size={19} weight="fill" color="#f43f5e" />
              Danh sách trận đấu gần đây
            </h3>
            <div className="arena-pill-tabs">
              {[
                { key: '', label: 'Tất cả' },
                { key: 'WAITING', label: 'Đang chờ' },
                { key: 'IN_PROGRESS', label: 'Đang đấu' },
                { key: 'COMPLETED', label: 'Xong' },
                { key: 'CANCELLED', label: 'Đã hủy' },
              ].map((t) => (
                <button
                  key={t.key || 'all'}
                  type="button"
                  className={`arena-pill-tab ${statusFilter === t.key ? 'is-active' : ''}`}
                  onClick={() => setStatusFilter(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {matches.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13.5 }}>
              Không có trận đấu nào khớp bộ lọc.
            </p>
          ) : (
            <div className="arena-lb-list">
              {matches.map((m) => (
                <div key={m.id} className="arena-lb-row" style={{ flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="arena-lb-name">
                      <code>{m.inviteCode}</code> · {m.player1Name} ({m.player1Score}) vs{' '}
                      {m.player2Name ? `${m.player2Name} (${m.player2Score})` : 'Chưa có đối thủ'}
                    </div>
                    <div className="arena-lb-sub">
                      Trạng thái: <strong>{m.status}</strong> ·{' '}
                      {new Date(m.createdAt).toLocaleString('vi-VN')}
                    </div>
                  </div>
                  {m.status === 'WAITING' || m.status === 'IN_PROGRESS' ? (
                    <button
                      type="button"
                      className="button secondary"
                      style={{ minHeight: 30, padding: '0 10px', fontSize: 12 }}
                      disabled={busy}
                      onClick={() => void handleCancelMatch(m.id)}
                    >
                      <Prohibit size={13} /> Hủy phòng
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="arena-card">
          <div className="arena-section-head">
            <h3 className="arena-section-title">
              <Trophy size={19} weight="fill" color="#f59e0b" />
              Bảng ELO ({leaders.length})
            </h3>
            {canDelete ? (
              <button
                type="button"
                className="button secondary"
                style={{ minHeight: 32, padding: '0 11px', fontSize: 12 }}
                disabled={busy}
                onClick={() => setConfirmResetAll(true)}
              >
                <ArrowCounterClockwise size={14} /> Reset ELO mùa
              </button>
            ) : null}
          </div>

          <div className="arena-lb-list">
            {leaders.map((row) => (
              <div
                key={row.userId}
                className={`arena-lb-row ${row.rank <= 3 ? `is-top-${row.rank}` : ''}`}
              >
                <div className="arena-lb-left">
                  <span className="arena-rank-pill">#{row.rank}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="arena-lb-name">{row.fullName || row.userId}</div>
                    <div className="arena-lb-sub">
                      {row.elo} ELO · {row.wins}W / {row.losses}L
                    </div>
                  </div>
                </div>
                {canDelete ? (
                  <button
                    type="button"
                    className="button secondary"
                    style={{ minHeight: 28, padding: '0 9px', fontSize: 11.5 }}
                    disabled={busy}
                    onClick={() =>
                      void handleResetUser(row.userId, row.fullName || row.userId)
                    }
                  >
                    Reset
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </div>

      {confirmResetAll ? (
        <ConfirmDialog
          open
          title="Reset ELO toàn mùa PvP?"
          message="Toàn bộ đấu sĩ sẽ trở về 1000 ELO và chuỗi thắng về 0 để khởi động mùa giải PvP mới."
          confirmLabel="Xác nhận Reset ELO"
          danger
          onCancel={() => setConfirmResetAll(false)}
          onConfirm={() => void handleResetSeason()}
        />
      ) : null}
    </div>
  );
}
