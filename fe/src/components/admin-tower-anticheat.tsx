'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowCounterClockwise,
  CheckCircle,
  Lock,
  LockOpen,
  ShieldWarning,
  WarningCircle,
  WarningOctagon,
} from '@phosphor-icons/react';
import {
  towerApi,
  type TowerAntiCheatClimber,
  type TowerAntiCheatOverview,
} from '@/lib/tower';
import { ConfirmDialog, ErrorState, Loading } from '@/components/ui';

export function AdminTowerAntiCheat({
  canManage,
  canDelete,
}: {
  canManage: boolean;
  canDelete: boolean;
}) {
  const [data, setData] = useState<TowerAntiCheatOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'flagged'>('all');
  const [confirmReset, setConfirmReset] = useState<TowerAntiCheatClimber | null>(
    null,
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await towerApi.getAdminAntiCheatOverview();
      setData(res);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Không tải được dữ liệu giám sát Anti-Cheat Leo Tháp.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggleBlock = async (climber: TowerAntiCheatClimber) => {
    if (busy || !canManage) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (climber.isBlocked) {
        await towerApi.unblockAdminTowerUser(climber.userId);
        setNotice(
          `Đã mở khóa Leo Tháp cho ${climber.fullName || climber.userId}.`,
        );
      } else {
        await towerApi.blockAdminTowerUser(
          climber.userId,
          'Bị khóa bởi quản trị viên do phát hiện tốc độ/hành vi Leo Tháp bất thường.',
        );
        setNotice(
          `Đã khóa tính năng Leo Tháp của ${climber.fullName || climber.userId}.`,
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật trạng thái.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetFloor = async () => {
    if (!confirmReset || busy) return;
    const target = confirmReset;
    setConfirmReset(null);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await towerApi.resetAdminTowerUserFloor(target.userId, 1);
      setNotice(
        `Đã đưa ${target.fullName || target.userId} về Tầng 1 và đặt lại điểm nghi vấn.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể reset tầng.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading label="Đang tải dữ liệu Chống Bot & Giám sát..." />;
  if (!data) {
    return (
      <ErrorState
        title="Không tải được dữ liệu Chống Bot & Giám sát"
        message={error || 'Đã có lỗi xảy ra khi kết nối máy chủ.'}
        retry={() => {
          setLoading(true);
          void load();
        }}
      />
    );
  }

  const climbers =
    filter === 'flagged'
      ? data.climbers.filter((c) => c.flagged || c.isBlocked)
      : data.climbers;

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
            <Lock size={22} weight="fill" />
          </div>
          <div className="arena-kpi-meta">
            <span className="arena-kpi-label">Đang bị khóa Leo Tháp</span>
            <span className="arena-kpi-value">{data.summary.blockedCount}</span>
          </div>
        </div>
        <div className="arena-kpi-card">
          <div className="arena-kpi-icon arena-kpi-icon--amber">
            <ShieldWarning size={22} weight="fill" />
          </div>
          <div className="arena-kpi-meta">
            <span className="arena-kpi-label">Tài khoản nghi vấn</span>
            <span className="arena-kpi-value">{data.summary.flaggedCount}</span>
          </div>
        </div>
        <div className="arena-kpi-card">
          <div className="arena-kpi-icon arena-kpi-icon--crimson">
            <WarningOctagon size={22} weight="fill" />
          </div>
          <div className="arena-kpi-meta">
            <span className="arena-kpi-label">Cảnh báo Anti-Cheat ghi nhận</span>
            <span className="arena-kpi-value">{data.summary.totalEvents}</span>
          </div>
        </div>
      </div>

      <section className="arena-card">
        <div className="arena-section-head">
          <h3 className="arena-section-title">
            <ShieldWarning size={19} weight="fill" color="#f59e0b" />
            Giám sát tốc độ Leo Tháp ({climbers.length})
          </h3>
          <div className="arena-pill-tabs">
            <button
              type="button"
              className={`arena-pill-tab ${filter === 'all' ? 'is-active' : ''}`}
              onClick={() => setFilter('all')}
            >
              Tất cả ({data.climbers.length})
            </button>
            <button
              type="button"
              className={`arena-pill-tab ${filter === 'flagged' ? 'is-active' : ''}`}
              onClick={() => setFilter('flagged')}
            >
              Nghi vấn / Đã khóa ({data.summary.blockedCount + data.summary.flaggedCount})
            </button>
          </div>
        </div>

        {climbers.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13.5 }}>
            Không có tài khoản nào trong danh sách này.
          </p>
        ) : (
          <div className="arena-lb-list">
            {climbers.map((c) => (
              <div
                key={c.userId}
                className="arena-lb-row"
                style={{
                  flexWrap: 'wrap',
                  borderColor: c.isBlocked
                    ? 'rgba(244, 63, 94, 0.5)'
                    : c.flagged
                      ? 'rgba(245, 158, 11, 0.45)'
                      : undefined,
                }}
              >
                <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                  <div className="arena-lb-name" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span>{c.fullName || c.userId}</span>
                    <span className="mk-topic-pill">Tầng {c.highestCompletedFloor}</span>
                    {c.isBlocked ? (
                      <span style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 800 }}>
                        ĐÃ KHÓA
                      </span>
                    ) : c.flagged ? (
                      <span style={{ color: 'var(--warning)', fontSize: 12, fontWeight: 800 }}>
                        NGHI VẤN
                      </span>
                    ) : null}
                  </div>
                  <div className="arena-lb-sub">
                    {c.email || c.userId} · Qua {c.completedFloors} / Thua {c.failedFloors} tầng ·{' '}
                    TB: <strong>{c.avgSecPerQ !== null ? `${c.avgSecPerQ}s/câu` : '—'}</strong> ·{' '}
                    Nhanh nhất: <strong>{c.fastestSecPerQ !== null ? `${c.fastestSecPerQ}s/câu` : '—'}</strong> ·{' '}
                    Điểm nghi vấn: <strong>{c.suspicionScore}</strong>
                  </div>
                  {c.isBlocked && c.blockedReason ? (
                    <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 3 }}>
                      Lý do khóa: {c.blockedReason}
                    </div>
                  ) : null}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {canManage ? (
                    <button
                      type="button"
                      className="button secondary"
                      style={{ minHeight: 32, padding: '0 10px', fontSize: 12 }}
                      disabled={busy}
                      onClick={() => void handleToggleBlock(c)}
                    >
                      {c.isBlocked ? <LockOpen size={14} /> : <Lock size={14} />}
                      {c.isBlocked ? 'Mở khóa' : 'Khóa Tháp'}
                    </button>
                  ) : null}
                  {canDelete ? (
                    <button
                      type="button"
                      className="button secondary"
                      style={{ minHeight: 32, padding: '0 10px', fontSize: 12, color: 'var(--danger)' }}
                      disabled={busy}
                      onClick={() => setConfirmReset(c)}
                    >
                      <ArrowCounterClockwise size={14} /> Reset tầng 1
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="arena-card">
        <h3 className="arena-section-title">
          <WarningOctagon size={19} weight="fill" color="#f43f5e" />
          Nhật ký cảnh báo Anti-Cheat & Chặn Bot ({data.recentEvents.length})
        </h3>
        {data.recentEvents.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13.5 }}>
            Chưa ghi nhận sự kiện chặn bot hoặc tốc độ bất thường nào.
          </p>
        ) : (
          <div className="arena-lb-list">
            {data.recentEvents.map((ev) => (
              <div key={ev.id} className="arena-lb-row" style={{ flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="arena-lb-name">
                    <code>{ev.ruleCode}</code> · {ev.fullName}
                    {ev.floor > 0 ? ` (Tầng ${ev.floor})` : ''}
                  </div>
                  <div className="arena-lb-sub">
                    {new Date(ev.createdAt).toLocaleString('vi-VN')}
                    {ev.serverResponseMs !== null ? ` · ${ev.serverResponseMs}ms` : ''}
                    {ev.ip ? ` · IP: ${ev.ip}` : ''}
                    {ev.userAgent ? ` · UA: ${ev.userAgent.slice(0, 70)}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {confirmReset ? (
        <ConfirmDialog
          open
          title={`Reset tầng của ${confirmReset.fullName || confirmReset.userId} về Tầng 1?`}
          message="Tiến độ Leo Tháp mùa này của tài khoản sẽ trở về Tầng 1 (cao nhất = 0) và hủy lượt đang chơi."
          confirmLabel="Reset về Tầng 1"
          danger
          onCancel={() => setConfirmReset(null)}
          onConfirm={() => void handleResetFloor()}
        />
      ) : null}
    </div>
  );
}
