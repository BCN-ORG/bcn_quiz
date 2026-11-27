'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle,
  Coins,
  Crown,
  Lock,
  Sparkle,
} from '@phosphor-icons/react';
import { request } from '@/lib/api';
import { Loading } from '@/components/ui';
import { playChestSfx, triggerCelebrationBurst } from '@/lib/sound-effects';

interface SeasonReward {
  type: 'COIN' | 'CONSUMABLE' | 'COSMETIC';
  amount?: number;
  label: string;
}

interface SeasonTier {
  tier: number;
  requiredXp: number;
  free: SeasonReward;
  premium: SeasonReward;
}

interface SeasonProgress {
  season: {
    id: string;
    code: string;
    title: string;
    startsAt: string;
    endsAt: string;
    premiumPriceCoins: number;
  };
  seasonXp: number;
  tierXpStep: number;
  currentTier: number;
  maxTiers: number;
  isPremium: boolean;
  claimedFreeTiers: number[];
  claimedPremiumTiers: number[];
  tiers: SeasonTier[];
}

export default function SeasonPassPage() {
  const [data, setData] = useState<SeasonProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await request.get<SeasonProgress>('/season-pass/current');
      setData(res);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUpgrade = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (busy) return;
    setBusy('upgrade');
    setError(null);
    setMessage(null);
    try {
      await request.post('/season-pass/upgrade-premium', {});
      playChestSfx();
      triggerCelebrationBurst(e.clientX, e.clientY);
      setMessage('Đã mở khóa Season Pass Premium thành công!');
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Không thể nâng cấp Premium.',
      );
    } finally {
      setBusy(null);
    }
  };

  const handleClaim = async (
    tier: number,
    track: 'free' | 'premium',
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    const key = `${tier}:${track}`;
    if (busy) return;
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await request.post(`/season-pass/claim/${tier}`, { track });
      playChestSfx();
      triggerCelebrationBurst(e.clientX, e.clientY);
      setMessage(`Đã nhận thưởng Bậc ${tier} (${track === 'premium' ? 'Premium' : 'Miễn phí'})!`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chưa thể nhận thưởng.');
    } finally {
      setBusy(null);
    }
  };

  if (loading || !data) return <Loading label="Đang tải Season Pass..." />;

  const nextTierXp = Math.min(data.maxTiers, data.currentTier + 1) * data.tierXpStep;

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 1080, margin: '0 auto' }}>
      <section
        className="panel"
        style={{
          padding: '22px 24px',
          background:
            'linear-gradient(135deg, rgba(30, 27, 75, 0.96), rgba(15, 23, 42, 0.96))',
          color: '#f8fafc',
          border: '1px solid rgba(250, 204, 21, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#fde047' }}>
            SEASON PASS · {data.season.code}
          </span>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>
            {data.season.title}
          </h1>
          <div style={{ fontSize: 13.5, color: '#cbd5e1' }}>
            Bậc hiện tại: <strong>{data.currentTier}/{data.maxTiers}</strong> ·{' '}
            <strong>{data.seasonXp.toLocaleString('vi-VN')} XP</strong> mùa (mục tiêu kế tiếp:{' '}
            {nextTierXp.toLocaleString('vi-VN')} XP)
          </div>
        </div>

        {data.isPremium ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              borderRadius: 12,
              background: 'rgba(250, 204, 21, 0.18)',
              border: '1px solid rgba(250, 204, 21, 0.6)',
              color: '#fde047',
              fontWeight: 800,
              fontSize: 13.5,
            }}
          >
            <Crown size={18} weight="fill" /> Đã kích hoạt Premium
          </span>
        ) : (
          <button
            type="button"
            className="rpg-evo-buy-btn"
            disabled={busy === 'upgrade'}
            onClick={(e) => void handleUpgrade(e)}
          >
            <Crown size={16} weight="fill" />
            {busy === 'upgrade'
              ? 'Đang mở khóa…'
              : `Mở khóa Premium · ${data.season.premiumPriceCoins} Coin`}
          </button>
        )}
      </section>

      {error ? <div className="notice form-error">{error}</div> : null}
      {message ? (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: 'rgba(16, 185, 129, 0.14)',
            color: '#059669',
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {message}
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
          gap: 12,
        }}
      >
        {data.tiers.map((t) => {
          const unlocked = data.currentTier >= t.tier;
          const freeClaimed = data.claimedFreeTiers.includes(t.tier);
          const premClaimed = data.claimedPremiumTiers.includes(t.tier);

          return (
            <div
              key={t.tier}
              className="panel"
              style={{
                padding: 14,
                display: 'grid',
                gap: 10,
                border: unlocked
                  ? '1px solid rgba(56, 189, 248, 0.55)'
                  : '1px solid var(--line)',
                opacity: unlocked ? 1 : 0.78,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 14 }}>Bậc {t.tier}</strong>
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  {t.requiredXp.toLocaleString('vi-VN')} XP
                </span>
              </div>

              {/* Free Track */}
              <div
                style={{
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: 'var(--surface-2)',
                  display: 'grid',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>
                  MIỄN PHÍ
                </span>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                  <Coins size={13} weight="fill" color="#d97706" /> {t.free.label}
                </div>
                {freeClaimed ? (
                  <span style={{ fontSize: 11.5, color: '#10b981', fontWeight: 700 }}>
                    <CheckCircle size={13} weight="fill" /> Đã nhận
                  </span>
                ) : unlocked ? (
                  <button
                    type="button"
                    className="button secondary"
                    style={{ minHeight: 28, fontSize: 12, padding: '0 10px' }}
                    disabled={busy !== null}
                    onClick={(e) => void handleClaim(t.tier, 'free', e)}
                  >
                    Nhận thưởng
                  </button>
                ) : (
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                    <Lock size={12} /> Chưa mở
                  </span>
                )}
              </div>

              {/* Premium Track */}
              <div
                style={{
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: 'rgba(250, 204, 21, 0.08)',
                  border: '1px solid rgba(250, 204, 21, 0.3)',
                  display: 'grid',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 800, color: '#d97706' }}>
                  PREMIUM
                </span>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                  <Sparkle size={13} weight="fill" color="#eab308" /> {t.premium.label}
                </div>
                {premClaimed ? (
                  <span style={{ fontSize: 11.5, color: '#10b981', fontWeight: 700 }}>
                    <CheckCircle size={13} weight="fill" /> Đã nhận
                  </span>
                ) : unlocked && data.isPremium ? (
                  <button
                    type="button"
                    className="button"
                    style={{ minHeight: 28, fontSize: 12, padding: '0 10px' }}
                    disabled={busy !== null}
                    onClick={(e) => void handleClaim(t.tier, 'premium', e)}
                  >
                    Nhận Premium
                  </button>
                ) : (
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                    <Lock size={12} /> {data.isPremium ? 'Chưa đạt bậc' : 'Cần Premium'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
