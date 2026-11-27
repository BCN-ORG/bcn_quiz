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
    <section
      className="rpg-card"
      aria-label="Nhiệm vụ Ngày & Tuần"
      style={{
        padding: '18px 20px',
        borderRadius: 18,
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        display: 'grid',
        gap: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Gift size={20} weight="fill" color="#f59e0b" aria-hidden="true" />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
            Nhiệm Vụ Ngày & Tuần
          </h3>
          {readyCount > 0 ? (
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 999,
                background: 'rgba(16, 185, 129, 0.16)',
                color: '#10b981',
                fontSize: 11.5,
                fontWeight: 800,
              }}
            >
              {readyCount} sẵn sàng nhận
            </span>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {inventory?.xpBoostActive ? (
            <span
              title={`Hết hạn: ${new Date(inventory.xpBoostActiveUntil!).toLocaleString('vi-VN')}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 9px',
                borderRadius: 999,
                background: 'rgba(168, 85, 247, 0.16)',
                color: '#a855f7',
                fontSize: 11.5,
                fontWeight: 800,
              }}
            >
              <Lightning size={13} weight="fill" /> 2x XP Đang bật
            </span>
          ) : null}
          {(inventory?.streakFreezeCount ?? 0) > 0 ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 9px',
                borderRadius: 999,
                background: 'rgba(56, 189, 248, 0.14)',
                color: '#0284c7',
                fontSize: 11.5,
                fontWeight: 800,
              }}
            >
              <ShieldCheck size={13} weight="fill" /> {inventory?.streakFreezeCount} Khiên chuỗi
            </span>
          ) : null}

          <div style={{ display: 'inline-flex', gap: 6 }}>
            <button
              type="button"
              className={`button secondary ${tab === 'daily' ? 'active' : ''}`}
              style={{ minHeight: 30, padding: '0 10px', fontSize: 12 }}
              onClick={() => setTab('daily')}
            >
              Hằng ngày
            </button>
            <button
              type="button"
              className={`button secondary ${tab === 'weekly' ? 'active' : ''}`}
              style={{ minHeight: 30, padding: '0 10px', fontSize: 12 }}
              onClick={() => setTab('weekly')}
            >
              Hằng tuần
            </button>
          </div>
        </div>
      </div>

      {notice ? (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            background: 'rgba(16, 185, 129, 0.12)',
            color: '#059669',
            fontSize: 12.5,
            fontWeight: 700,
          }}
        >
          {notice}
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 10,
        }}
      >
        {list.map((q) => {
          const pct = Math.min(100, Math.round((q.progress / Math.max(1, q.target)) * 100));
          return (
            <div
              key={q.code}
              style={{
                padding: '12px 14px',
                borderRadius: 12,
                background: 'var(--surface-2)',
                border: q.completed && !q.claimed
                  ? '1px solid rgba(16, 185, 129, 0.55)'
                  : '1px solid var(--line)',
                display: 'grid',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ fontSize: 13.5 }}>{q.title}</strong>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)' }}>
                  {q.progress}/{q.target}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
                {q.description}
              </p>
              <div
                style={{
                  height: 6,
                  borderRadius: 999,
                  background: 'var(--line)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: q.completed ? '#10b981' : 'var(--accent)',
                    transition: 'width 0.25s ease',
                  }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {q.rewardXp > 0 ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#0284c7' }}>
                      <Sparkle size={12} weight="fill" /> +{q.rewardXp} XP
                    </span>
                  ) : null}
                  {q.rewardCoins > 0 ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#d97706' }}>
                      <Coins size={12} weight="fill" /> +{q.rewardCoins} Coin
                    </span>
                  ) : null}
                </span>

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
                    <CheckCircle size={14} weight="fill" /> Đã nhận
                  </span>
                ) : q.completed ? (
                  <button
                    type="button"
                    className="button"
                    disabled={claimingCode === q.code}
                    style={{ minHeight: 28, padding: '0 10px', fontSize: 12 }}
                    onClick={(e) => void handleClaim(q, e)}
                  >
                    {claimingCode === q.code ? 'Đang nhận…' : 'Nhận thưởng'}
                  </button>
                ) : (
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                    Đang thực hiện
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
