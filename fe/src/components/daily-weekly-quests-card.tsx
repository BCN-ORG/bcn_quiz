'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle,
  Coins,
  Gift,
  Lightning,
  ShieldCheck,
  Sparkle,
} from '@phosphor-icons/react';
import {
  questsShopApi,
  type QuestProgressItem,
  type QuestsSummary,
  type ShopInventory,
} from '@/lib/quests-shop';
import { playChestSfx, triggerCelebrationBurst } from '@/lib/sound-effects';

export function DailyWeeklyQuestsCard({
  onRewardClaimed,
}: {
  onRewardClaimed?: () => void;
}) {
  const [tab, setTab] = useState<'daily' | 'weekly'>('daily');
  const [quests, setQuests] = useState<QuestsSummary | null>(null);
  const [inventory, setInventory] = useState<ShopInventory | null>(null);
  const [claimingCode, setClaimingCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [q, inv] = await Promise.all([
        questsShopApi.getQuests(),
        questsShopApi.getInventory(),
      ]);
      setQuests(q);
      setInventory(inv);
    } catch {
      // non-blocking dashboard widget
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleClaim = async (
    item: QuestProgressItem,
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    if (claimingCode) return;
    setClaimingCode(item.code);
    setNotice(null);
    try {
      const res = await questsShopApi.claimQuest(item.code);
      if (res.claimed) {
        playChestSfx();
        triggerCelebrationBurst(e.clientX, e.clientY);
        const parts = [];
        if (res.rewardXp > 0) parts.push(`+${res.rewardXp} XP`);
        if (res.rewardCoins > 0) parts.push(`+${res.rewardCoins} Coin`);
        setNotice(`Đã nhận thưởng ${item.title}: ${parts.join(' · ')}`);
        onRewardClaimed?.();
      }
      await load();
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : 'Chưa thể nhận thưởng lúc này.',
      );
    } finally {
      setClaimingCode(null);
    }
  };

  if (!quests) return null;

  const list = tab === 'daily' ? quests.daily : quests.weekly;
  const readyCount = [...quests.daily, ...quests.weekly].filter(
    (q) => q.completed && !q.claimed,
  ).length;

  return (
    <section className="dq-widget" aria-label="Nhiệm vụ Ngày & Tuần">
      <div className="arena-section-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div
            className="arena-kpi-icon arena-kpi-icon--amber"
            style={{ width: 38, height: 38, borderRadius: 11 }}
          >
            <Gift size={20} weight="fill" aria-hidden="true" />
          </div>
          <div>
            <h3 className="arena-section-title" style={{ fontSize: 16 }}>
              Nhiệm Vụ Ngày & Tuần
            </h3>
          </div>
          {readyCount > 0 ? (
            <span className="mk-topic-pill">
              <Sparkle size={12} weight="fill" /> {readyCount} sẵn sàng nhận
            </span>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {inventory?.xpBoostActive ? (
            <span
              title={`Hết hạn: ${new Date(inventory.xpBoostActiveUntil!).toLocaleString('vi-VN')}`}
              className="arena-badge-xp"
            >
              <Lightning size={13} weight="fill" /> 2x XP Đang bật
            </span>
          ) : null}
          {(inventory?.streakFreezeCount ?? 0) > 0 ? (
            <span className="arena-badge-coin">
              <ShieldCheck size={13} weight="fill" /> {inventory?.streakFreezeCount} Khiên chuỗi
            </span>
          ) : null}

          <div className="arena-pill-tabs" role="tablist" aria-label="Loại nhiệm vụ">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'daily'}
              className={`arena-pill-tab ${tab === 'daily' ? 'is-active' : ''}`}
              onClick={() => setTab('daily')}
            >
              Hằng ngày
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'weekly'}
              className={`arena-pill-tab ${tab === 'weekly' ? 'is-active' : ''}`}
              onClick={() => setTab('weekly')}
            >
              Hằng tuần
            </button>
          </div>
        </div>
      </div>

      {notice ? (
        <div className="arena-notice arena-notice--success">
          <CheckCircle size={17} weight="fill" />
          <span>{notice}</span>
        </div>
      ) : null}

      <div className="dq-grid">
        {list.map((q) => {
          const pct = Math.min(
            100,
            Math.round((q.progress / Math.max(1, q.target)) * 100),
          );
          const ready = q.completed && !q.claimed;
          return (
            <article key={q.code} className={`dq-item ${ready ? 'is-ready' : ''}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ fontSize: 14 }}>{q.title}</strong>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    fontWeight: 700,
                    color: q.completed ? '#10b981' : 'var(--muted)',
                  }}
                >
                  {q.progress}/{q.target}
                </span>
              </div>

              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.45 }}>
                {q.description}
              </p>

              <div className="arena-progress" style={{ height: 6 }}>
                <div
                  className="arena-progress__fill"
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginTop: 2,
                }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {q.rewardXp > 0 ? (
                    <span className="arena-badge-xp">
                      <Sparkle size={12} weight="fill" /> +{q.rewardXp} XP
                    </span>
                  ) : null}
                  {q.rewardCoins > 0 ? (
                    <span className="arena-badge-coin">
                      <Coins size={12} weight="fill" /> +{q.rewardCoins} Coin
                    </span>
                  ) : null}
                </div>

                {q.claimed ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#10b981',
                    }}
                  >
                    <CheckCircle size={15} weight="fill" /> Đã nhận
                  </span>
                ) : ready ? (
                  <button
                    type="button"
                    className="button"
                    disabled={claimingCode === q.code}
                    style={{ minHeight: 30, padding: '0 12px', fontSize: 12 }}
                    onClick={(e) => void handleClaim(q, e)}
                  >
                    {claimingCode === q.code ? 'Đang nhận…' : 'Nhận thưởng'}
                  </button>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                    Đang tiến hành
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
