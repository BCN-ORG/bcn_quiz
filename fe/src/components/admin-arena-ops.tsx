'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BookOpenText,
  CheckCircle,
  Coins,
  Gift,
  Lightning,
  ShieldCheck,
  Sparkle,
  WarningCircle,
} from '@phosphor-icons/react';
import { request } from '@/lib/api';
import { Loading } from '@/components/ui';

interface QuestAdminStats {
  todayKey: string;
  weekKey: string;
  totals: {
    totalClaims: number;
    totalXpGranted: number;
    totalCoinsGranted: number;
  };
  quests: Array<{
    code: string;
    period: 'DAILY' | 'WEEKLY';
    title: string;
    description: string;
    target: number;
    rewardXp: number;
    rewardCoins: number;
    currentPeriodClaims: number;
  }>;
}

interface ShopAdminOverview {
  stats: {
    totalRolls: number;
    duplicateRolls: number;
    totalCoinsSpent: number;
    totalCoinsRefunded: number;
    activeXpBoostUsers: number;
  };
  mysteryChest: {
    costCoins: number;
    duplicateRefundCoins: number;
    pityThreshold: number;
    pool: Array<{
      rewardId: string;
      rewardLabel: string;
      rewardType: string;
      chancePercent: number;
      rare?: boolean;
    }>;
  };
  recentRolls: Array<{
    id: string;
    userId: string;
    fullName: string;
    rewardLabel: string;
    isDuplicate: boolean;
    refundCoins: number;
    pityCountAfter: number;
    createdAt: string;
  }>;
}

interface MistakeAdminAnalytics {
  totals: {
    activeTotal: number;
    masteredTotal: number;
    masteryRatePercent: number;
  };
  topMissedQuestions: Array<{
    quizId: string;
    topicId: string;
    topicName: string;
    question: string;
    affectedUsers: number;
    totalWrongCount: number;
  }>;
}

export function AdminArenaOps() {
  const [subTab, setSubTab] = useState<'quests' | 'shop' | 'mistakes'>('quests');
  const [questStats, setQuestStats] = useState<QuestAdminStats | null>(null);
  const [shopOverview, setShopOverview] = useState<ShopAdminOverview | null>(null);
  const [mistakeStats, setMistakeStats] = useState<MistakeAdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Grant consumable form
  const [grantUserId, setGrantUserId] = useState('');
  const [grantItemType, setGrantItemType] = useState<'STREAK_FREEZE' | 'XP_BOOST_2X'>('STREAK_FREEZE');
  const [grantAmount, setGrantAmount] = useState('1');

  const load = useCallback(async () => {
    try {
      const [q, s, m] = await Promise.all([
        request.get<QuestAdminStats>('/quests/admin/stats'),
        request.get<ShopAdminOverview>('/shop/admin/overview'),
        request.get<MistakeAdminAnalytics>('/mistakes/admin/analytics'),
      ]);
      setQuestStats(q);
      setShopOverview(s);
      setMistakeStats(m);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được dữ liệu vận hành Arena.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleGrantConsumable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !grantUserId.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await request.post('/shop/admin/grant-consumable', {
        userId: grantUserId.trim(),
        itemType: grantItemType,
        amount: Number(grantAmount) || 1,
      });
      setGrantUserId('');
      setNotice(
        grantItemType === 'STREAK_FREEZE'
          ? 'Đã cấp Khiên Giữ Chuỗi cho học viên.'
          : 'Đã kích hoạt/cộng giờ Thẻ Nhân Đôi XP cho học viên.',
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cấp vật phẩm.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading label="Đang tải dữ liệu vận hành Arena..." />;

  return (
    <div className="arena-stack">
      <div className="arena-section-head">
        <div className="arena-pill-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'quests'}
            className={`arena-pill-tab ${subTab === 'quests' ? 'is-active' : ''}`}
            onClick={() => setSubTab('quests')}
          >
            Nhiệm vụ Ngày/Tuần
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'shop'}
            className={`arena-pill-tab ${subTab === 'shop' ? 'is-active' : ''}`}
            onClick={() => setSubTab('shop')}
          >
            Vật phẩm & Rương Bí Ẩn
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'mistakes'}
            className={`arena-pill-tab ${subTab === 'mistakes' ? 'is-active' : ''}`}
            onClick={() => setSubTab('mistakes')}
          >
            Phân tích Câu Sai (SRS)
          </button>
        </div>
      </div>

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

      {subTab === 'quests' && questStats ? (
        <div className="arena-stack">
          <div className="arena-kpi-grid">
            <div className="arena-kpi-card">
              <div className="arena-kpi-icon arena-kpi-icon--emerald">
                <CheckCircle size={22} weight="fill" />
              </div>
              <div className="arena-kpi-meta">
                <span className="arena-kpi-label">Tổng lượt nhận thưởng</span>
                <span className="arena-kpi-value">{questStats.totals.totalClaims}</span>
              </div>
            </div>
            <div className="arena-kpi-card">
              <div className="arena-kpi-icon">
                <Sparkle size={22} weight="fill" />
              </div>
              <div className="arena-kpi-meta">
                <span className="arena-kpi-label">Tổng XP đã phát</span>
                <span className="arena-kpi-value">
                  {questStats.totals.totalXpGranted.toLocaleString('vi-VN')}
                </span>
              </div>
            </div>
            <div className="arena-kpi-card">
              <div className="arena-kpi-icon arena-kpi-icon--amber">
                <Coins size={22} weight="fill" />
              </div>
              <div className="arena-kpi-meta">
                <span className="arena-kpi-label">Tổng Coin đã phát</span>
                <span className="arena-kpi-value">
                  {questStats.totals.totalCoinsGranted.toLocaleString('vi-VN')}
                </span>
              </div>
            </div>
          </div>

          <section className="arena-card">
            <h3 className="arena-section-title">
              <Gift size={19} weight="fill" color="#f59e0b" />
              Cấu hình & Lượt nhận kỳ hiện tại ({questStats.todayKey} / {questStats.weekKey})
            </h3>
            <div className="arena-lb-list">
              {questStats.quests.map((q) => (
                <div key={q.code} className="arena-lb-row" style={{ flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="arena-lb-name">
                      <span className="mk-topic-pill" style={{ marginRight: 8 }}>
                        {q.period === 'DAILY' ? 'Hằng ngày' : 'Hằng tuần'}
                      </span>
                      {q.title}
                    </div>
                    <div className="arena-lb-sub">
                      {q.description} · Mục tiêu: {q.target} · Thưởng: +{q.rewardXp} XP
                      {q.rewardCoins > 0 ? ` / +${q.rewardCoins} Coin` : ''}
                    </div>
                  </div>
                  <span className="arena-lb-score">{q.currentPeriodClaims} lượt nhận</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {subTab === 'shop' && shopOverview ? (
        <div className="arena-stack">
          <div className="arena-kpi-grid">
            <div className="arena-kpi-card">
              <div className="arena-kpi-icon arena-kpi-icon--amber">
                <Gift size={22} weight="fill" />
              </div>
              <div className="arena-kpi-meta">
                <span className="arena-kpi-label">Tổng lượt mở Rương</span>
                <span className="arena-kpi-value">{shopOverview.stats.totalRolls}</span>
              </div>
            </div>
            <div className="arena-kpi-card">
              <div className="arena-kpi-icon arena-kpi-icon--emerald">
                <Coins size={22} weight="fill" />
              </div>
              <div className="arena-kpi-meta">
                <span className="arena-kpi-label">Coin thu / Hoàn trùng</span>
                <span className="arena-kpi-value" style={{ fontSize: 22 }}>
                  {shopOverview.stats.totalCoinsSpent} / {shopOverview.stats.totalCoinsRefunded}
                </span>
              </div>
            </div>
            <div className="arena-kpi-card">
              <div className="arena-kpi-icon">
                <Lightning size={22} weight="fill" />
              </div>
              <div className="arena-kpi-meta">
                <span className="arena-kpi-label">Đang bật 2x XP</span>
                <span className="arena-kpi-value">{shopOverview.stats.activeXpBoostUsers}</span>
              </div>
            </div>
          </div>

          <div className="arena-two-col">
            <section className="arena-card">
              <h3 className="arena-section-title">
                <Gift size={19} weight="fill" color="#f59e0b" />
                Lịch sử mở Rương Bí Ẩn gần đây
              </h3>
              {shopOverview.recentRolls.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13.5 }}>
                  Chưa có lượt mở Rương Bí Ẩn nào.
                </p>
              ) : (
                <div className="arena-lb-list">
                  {shopOverview.recentRolls.map((r) => (
                    <div key={r.id} className="arena-lb-row" style={{ flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="arena-lb-name">
                          {r.fullName} → {r.rewardLabel}
                        </div>
                        <div className="arena-lb-sub">
                          {new Date(r.createdAt).toLocaleString('vi-VN')} · Pity sau lượt: {r.pityCountAfter}
                          {r.isDuplicate ? ` · Trùng (+${r.refundCoins} Coin)` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <form className="arena-card" onSubmit={(e) => void handleGrantConsumable(e)}>
              <h3 className="arena-section-title">
                <ShieldCheck size={19} weight="fill" color="var(--accent)" />
                Cấp bù vật phẩm hỗ trợ
              </h3>
              <div className="arena-field">
                <label htmlFor="shop-grant-uid">User ID học viên</label>
                <input
                  id="shop-grant-uid"
                  required
                  className="arena-input"
                  value={grantUserId}
                  onChange={(e) => setGrantUserId(e.target.value)}
                  placeholder="Nhập userId..."
                />
              </div>
              <div className="arena-field">
                <label htmlFor="shop-grant-type">Loại vật phẩm</label>
                <select
                  id="shop-grant-type"
                  className="arena-input"
                  value={grantItemType}
                  onChange={(e) =>
                    setGrantItemType(e.target.value as 'STREAK_FREEZE' | 'XP_BOOST_2X')
                  }
                >
                  <option value="STREAK_FREEZE">Khiên Giữ Chuỗi (số lượng khiên)</option>
                  <option value="XP_BOOST_2X">Thẻ Nhân Đôi XP (số giờ hiệu lực)</option>
                </select>
              </div>
              <div className="arena-field">
                <label htmlFor="shop-grant-amt">
                  {grantItemType === 'STREAK_FREEZE' ? 'Số khiên (tối đa 5)' : 'Số giờ kích hoạt (1–72h)'}
                </label>
                <input
                  id="shop-grant-amt"
                  type="number"
                  min={1}
                  max={grantItemType === 'STREAK_FREEZE' ? 5 : 72}
                  className="arena-input"
                  value={grantAmount}
                  onChange={(e) => setGrantAmount(e.target.value)}
                />
              </div>
              <button type="submit" className="button" disabled={busy}>
                Cấp vật phẩm ngay
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {subTab === 'mistakes' && mistakeStats ? (
        <div className="arena-stack">
          <div className="arena-kpi-grid">
            <div className="arena-kpi-card">
              <div className="arena-kpi-icon arena-kpi-icon--amber">
                <BookOpenText size={22} weight="fill" />
              </div>
              <div className="arena-kpi-meta">
                <span className="arena-kpi-label">Câu sai đang ôn tập</span>
                <span className="arena-kpi-value">{mistakeStats.totals.activeTotal}</span>
              </div>
            </div>
            <div className="arena-kpi-card">
              <div className="arena-kpi-icon arena-kpi-icon--emerald">
                <CheckCircle size={22} weight="fill" />
              </div>
              <div className="arena-kpi-meta">
                <span className="arena-kpi-label">Đã chuyển Thành thạo</span>
                <span className="arena-kpi-value">{mistakeStats.totals.masteredTotal}</span>
              </div>
            </div>
            <div className="arena-kpi-card">
              <div className="arena-kpi-icon">
                <Sparkle size={22} weight="fill" />
              </div>
              <div className="arena-kpi-meta">
                <span className="arena-kpi-label">Tỉ lệ khắc phục thành công</span>
                <span className="arena-kpi-value">{mistakeStats.totals.masteryRatePercent}%</span>
              </div>
            </div>
          </div>

          <section className="arena-card">
            <h3 className="arena-section-title">
              <WarningCircle size={19} weight="fill" color="#f43f5e" />
              Top 20 câu hỏi học viên sai nhiều nhất (rà soát đề khó / đề lỗi)
            </h3>
            {mistakeStats.topMissedQuestions.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13.5 }}>
                Chưa có dữ liệu câu sai nào trong hệ thống.
              </p>
            ) : (
              <div className="arena-lb-list">
                {mistakeStats.topMissedQuestions.map((item, idx) => (
                  <div key={item.quizId} className="arena-lb-row" style={{ flexWrap: 'wrap' }}>
                    <div className="arena-lb-left" style={{ flex: 1 }}>
                      <span className="arena-rank-pill">#{idx + 1}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className="arena-lb-name" style={{ whiteSpace: 'normal' }}>
                          {item.question}
                        </div>
                        <div className="arena-lb-sub">
                          Chủ đề: {item.topicName} · {item.affectedUsers} học viên từng làm sai
                        </div>
                      </div>
                    </div>
                    <span className="arena-lb-score" style={{ color: 'var(--danger)' }}>
                      {item.totalWrongCount} lượt sai
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
