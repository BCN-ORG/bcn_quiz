'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle,
  Coins,
  Crown,
  Gift,
  PlusCircle,
  UsersThree,
  WarningCircle,
} from '@phosphor-icons/react';
import { request } from '@/lib/api';
import { Loading } from '@/components/ui';

interface AdminSeason {
  id: string;
  code: string;
  title: string;
  startsAt: string;
  endsAt: string;
  premiumPriceCoins: number;
  isActive: boolean;
  participantCount: number;
  premiumCount: number;
}

interface AdminParticipant {
  userId: string;
  fullName: string | null;
  email: string | null;
  isPremium: boolean;
  bonusXp: number;
  totalXp: number;
  currentTier: number;
  claimedFreeCount: number;
  claimedPremiumCount: number;
  updatedAt: string;
}

function toVnDate(iso: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

export function AdminSeasonPass() {
  const [seasons, setSeasons] = useState<AdminSeason[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<AdminParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Create form
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [price, setPrice] = useState('300');
  const [isActive, setIsActive] = useState(true);

  // Grant form
  const [grantUserId, setGrantUserId] = useState('');
  const [grantPremiumAction, setGrantPremiumAction] = useState<
    'unchanged' | 'grant' | 'revoke'
  >('unchanged');
  const [grantXp, setGrantXp] = useState('200');

  const loadSeasons = useCallback(async () => {
    try {
      const list = await request.get<AdminSeason[]>('/season-pass/admin/seasons');
      setSeasons(list ?? []);
      setSelectedId((prev) => prev ?? list?.[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được Season Pass.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadParticipants = useCallback(async (seasonId: string) => {
    try {
      const res = await request.get<{ items: AdminParticipant[] }>(
        `/season-pass/admin/seasons/${seasonId}/participants?page=1&limit=30`,
      );
      setParticipants(res.items ?? []);
    } catch {
      setParticipants([]);
    }
  }, []);

  useEffect(() => {
    void loadSeasons();
  }, [loadSeasons]);

  useEffect(() => {
    if (selectedId) void loadParticipants(selectedId);
  }, [selectedId, loadParticipants]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const parsedPrice =
        price.trim() === '' || Number.isNaN(Number(price))
          ? 300
          : Number(price);
      await request.post('/season-pass/admin/seasons', {
        code,
        title,
        startsAt: new Date(`${startsAt}T00:00:00+07:00`).toISOString(),
        endsAt: new Date(`${endsAt}T00:00:00+07:00`).toISOString(),
        premiumPriceCoins: parsedPrice,
        isActive,
      });
      setCode('');
      setTitle('');
      setNotice('Đã tạo mùa Season Pass mới thành công.');
      await loadSeasons();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo mùa mới.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async (season: AdminSeason) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await request.patch(`/season-pass/admin/seasons/${season.id}`, {
        isActive: !season.isActive,
      });
      setNotice(
        season.isActive
          ? `Đã tạm tắt mùa ${season.code}.`
          : `Đã kích hoạt mùa ${season.code} làm mùa hiện tại.`,
      );
      await loadSeasons();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật mùa.');
    } finally {
      setBusy(false);
    }
  };

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !selectedId || !grantUserId.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payload: {
        userId: string;
        isPremium?: boolean;
        bonusXpDelta?: number;
      } = {
        userId: grantUserId.trim(),
        bonusXpDelta: Number(grantXp) || 0,
      };
      if (grantPremiumAction === 'grant') payload.isPremium = true;
      if (grantPremiumAction === 'revoke') payload.isPremium = false;
      await request.post(
        `/season-pass/admin/seasons/${selectedId}/grant`,
        payload,
      );
      setGrantUserId('');
      setNotice('Đã cập nhật quyền lợi Season Pass cho học viên.');
      await Promise.all([loadSeasons(), loadParticipants(selectedId)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cấp quyền lợi.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading label="Đang tải quản trị Season Pass..." />;

  const activeSeason = seasons.find((s) => s.isActive) ?? seasons[0];
  const totalParticipants = seasons.reduce((sum, s) => sum + s.participantCount, 0);
  const totalPremium = seasons.reduce((sum, s) => sum + s.premiumCount, 0);

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
          <div className="arena-kpi-icon arena-kpi-icon--amber">
            <Crown size={22} weight="fill" />
          </div>
          <div className="arena-kpi-meta">
            <span className="arena-kpi-label">Mùa đang chạy</span>
            <span className="arena-kpi-value" style={{ fontSize: 20 }}>
              {activeSeason ? activeSeason.code : 'Chưa có'}
            </span>
          </div>
        </div>
        <div className="arena-kpi-card">
          <div className="arena-kpi-icon">
            <UsersThree size={22} weight="fill" />
          </div>
          <div className="arena-kpi-meta">
            <span className="arena-kpi-label">Học viên tham gia</span>
            <span className="arena-kpi-value">{totalParticipants}</span>
          </div>
        </div>
        <div className="arena-kpi-card">
          <div className="arena-kpi-icon arena-kpi-icon--emerald">
            <Gift size={22} weight="fill" />
          </div>
          <div className="arena-kpi-meta">
            <span className="arena-kpi-label">Đã nâng cấp Premium</span>
            <span className="arena-kpi-value">{totalPremium}</span>
          </div>
        </div>
        <div className="arena-kpi-card">
          <div className="arena-kpi-icon arena-kpi-icon--amber">
            <Coins size={22} weight="fill" />
          </div>
          <div className="arena-kpi-meta">
            <span className="arena-kpi-label">Giá Premium hiện tại</span>
            <span className="arena-kpi-value">
              {activeSeason?.premiumPriceCoins ?? 300}
            </span>
          </div>
        </div>
      </div>

      <div className="arena-two-col">
        <div className="arena-stack">
          <section className="arena-card">
            <h3 className="arena-section-title">
              <Crown size={19} weight="fill" color="#f59e0b" />
              Danh sách các mùa Season Pass ({seasons.length})
            </h3>
            <div className="arena-lb-list">
              {seasons.map((s) => (
                <div
                  key={s.id}
                  className={`arena-lb-row ${s.isActive ? 'is-top-1' : ''}`}
                  style={{ flexWrap: 'wrap' }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="arena-lb-name">
                      [{s.code}] {s.title}{' '}
                      {s.isActive ? (
                        <span className="mk-topic-pill" style={{ marginLeft: 6 }}>
                          Đang mở
                        </span>
                      ) : null}
                    </div>
                    <div className="arena-lb-sub">
                      {toVnDate(s.startsAt)} → {toVnDate(s.endsAt)} ·{' '}
                      {s.premiumPriceCoins} Coin · {s.participantCount} học viên ({s.premiumCount} Premium)
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="button secondary"
                      style={{ minHeight: 32, padding: '0 10px', fontSize: 12 }}
                      onClick={() => setSelectedId(s.id)}
                    >
                      Xem học viên
                    </button>
                    <button
                      type="button"
                      className={`button ${s.isActive ? 'secondary' : ''}`}
                      style={{ minHeight: 32, padding: '0 10px', fontSize: 12 }}
                      disabled={busy}
                      onClick={() => void handleToggleActive(s)}
                    >
                      {s.isActive ? 'Tạm tắt' : 'Kích hoạt'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="arena-card">
            <h3 className="arena-section-title">
              <UsersThree size={19} weight="fill" color="var(--accent)" />
              Tiến độ học viên ({participants.length})
            </h3>
            {participants.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13.5 }}>
                Chưa có học viên nào ghi nhận tiến độ trong mùa này.
              </p>
            ) : (
              <div className="arena-lb-list">
                {participants.map((p) => (
                  <div key={p.userId} className="arena-lb-row">
                    <div style={{ minWidth: 0 }}>
                      <div className="arena-lb-name">
                        {p.fullName || p.userId}{' '}
                        {p.isPremium ? (
                          <span className="arena-badge-coin" style={{ marginLeft: 6 }}>
                            Premium
                          </span>
                        ) : null}
                      </div>
                      <div className="arena-lb-sub">
                        {p.email || p.userId} · Đã nhận: {p.claimedFreeCount} Free /{' '}
                        {p.claimedPremiumCount} Premium
                      </div>
                    </div>
                    <span className="arena-lb-score">
                      Bậc {p.currentTier} ({p.totalXp.toLocaleString('vi-VN')} XP)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="arena-stack">
          <form className="arena-card" onSubmit={(e) => void handleCreate(e)}>
            <h3 className="arena-section-title">
              <PlusCircle size={19} weight="fill" color="var(--accent)" />
              Tạo mùa Season Pass mới
            </h3>
            <div className="arena-field">
              <label htmlFor="sp-code">Mã mùa (VD: 2026-12)</label>
              <input
                id="sp-code"
                required
                className="arena-input arena-input--code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="2026-12"
              />
            </div>
            <div className="arena-field">
              <label htmlFor="sp-title">Tên mùa giải</label>
              <input
                id="sp-title"
                required
                className="arena-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Mùa Giải Tháng 12/2026"
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="arena-field">
                <label htmlFor="sp-start">Ngày bắt đầu</label>
                <input
                  id="sp-start"
                  type="date"
                  required
                  className="arena-input"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </div>
              <div className="arena-field">
                <label htmlFor="sp-end">Ngày kết thúc</label>
                <input
                  id="sp-end"
                  type="date"
                  required
                  className="arena-input"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
              </div>
            </div>
            <div className="arena-field">
              <label htmlFor="sp-price">Giá gói Premium (Coin)</label>
              <input
                id="sp-price"
                type="number"
                min={0}
                className="arena-input"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Kích hoạt ngay làm mùa hiện tại
            </label>
            <button type="submit" className="button" disabled={busy}>
              <PlusCircle size={16} weight="fill" /> Tạo mùa mới
            </button>
          </form>

          <form className="arena-card" onSubmit={(e) => void handleGrant(e)}>
            <h3 className="arena-section-title">
              <Gift size={19} weight="fill" color="#f59e0b" />
              Hỗ trợ / Cấp quyền lợi học viên
            </h3>
            <div className="arena-field">
              <label htmlFor="sp-grant-uid">User ID học viên</label>
              <input
                id="sp-grant-uid"
                required
                className="arena-input"
                value={grantUserId}
                onChange={(e) => setGrantUserId(e.target.value)}
                placeholder="Nhập userId cần cấp..."
              />
            </div>
            <div className="arena-field">
              <label htmlFor="sp-grant-xp">Cộng thêm Season XP</label>
              <input
                id="sp-grant-xp"
                type="number"
                className="arena-input"
                value={grantXp}
                onChange={(e) => setGrantXp(e.target.value)}
              />
            </div>
            <div className="arena-field">
              <label htmlFor="sp-grant-prem">Trạng thái gói Premium</label>
              <select
                id="sp-grant-prem"
                className="arena-input"
                value={grantPremiumAction}
                onChange={(e) =>
                  setGrantPremiumAction(
                    e.target.value as 'unchanged' | 'grant' | 'revoke',
                  )
                }
              >
                <option value="unchanged">Giữ nguyên trạng thái hiện tại</option>
                <option value="grant">Kích hoạt Premium</option>
                <option value="revoke">Thu hồi Premium</option>
              </select>
            </div>
            <button type="submit" className="button secondary" disabled={busy || !selectedId}>
              Cấp quyền lợi
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
