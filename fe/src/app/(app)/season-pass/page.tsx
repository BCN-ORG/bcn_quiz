'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle,
  Coins,
  Crown,
  Gift,
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
  const [filter, setFilter] = useState<'all' | 'claimable'>('all');
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
      setMessage(
        `Đã nhận thưởng Bậc ${tier} (${track === 'premium' ? 'Premium' : 'Miễn phí'})!`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chưa thể nhận thưởng.');
    } finally {
      setBusy(null);
    }
  };

  if (loading || !data) return <Loading label="Đang tải Season Pass..." />;

  const nextTier = Math.min(data.maxTiers, data.currentTier + 1);
  const nextTierXp = nextTier * data.tierXpStep;
  const currentTierBaseXp = data.currentTier * data.tierXpStep;
  const stepProgressPct =
    data.currentTier >= data.maxTiers
      ? 100
      : Math.min(
          100,
          Math.max(
            0,
            Math.round(
              ((data.seasonXp - currentTierBaseXp) /
                Math.max(1, data.tierXpStep)) *
                100,
            ),
          ),
        );

  const claimableTiers = data.tiers.filter((t) => {
    const unlocked = data.currentTier >= t.tier;
    if (!unlocked) return false;
    const canClaimFree = !data.claimedFreeTiers.includes(t.tier);
    const canClaimPrem =
      data.isPremium && !data.claimedPremiumTiers.includes(t.tier);
    return canClaimFree || canClaimPrem;
  });

  const visibleTiers = filter === 'claimable' ? claimableTiers : data.tiers;

  return (
    <div className="arena-page">
      <section className="arena-hero arena-hero--season">
        <div className="arena-hero__main">
          <span className="arena-hero__eyebrow">
            <Crown size={13} weight="fill" /> Season Pass · {data.season.code}
          </span>
          <h1 className="arena-hero__title">{data.season.title}</h1>
          <p className="arena-hero__sub">
            Tích lũy XP trong mùa để mở khóa Coin, vật phẩm hỗ trợ và phần thưởng
            độc quyền qua {data.maxTiers} bậc thưởng.
          </p>

          <div className="sp-hero-progress">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12.5,
                color: '#e2e8f0',
                fontWeight: 700,
              }}
            >
              <span>
                Bậc {data.currentTier}/{data.maxTiers}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>
                {data.seasonXp.toLocaleString('vi-VN')} /{' '}
                {nextTierXp.toLocaleString('vi-VN')} XP
              </span>
            </div>
            <div className="sp-hero-progress__bar">
              <div
                className="sp-hero-progress__fill"
                style={{ width: `${stepProgressPct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="arena-hero__aside">
          {data.isPremium ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '11px 18px',
                borderRadius: 12,
                background: 'rgba(250, 204, 21, 0.16)',
                border: '1px solid rgba(250, 204, 21, 0.55)',
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
              <Crown size={17} weight="fill" />
              {busy === 'upgrade'
                ? 'Đang mở khóa…'
                : `Mở khóa Premium · ${data.season.premiumPriceCoins} Coin`}
            </button>
          )}
        </div>
      </section>

      {error ? (
        <div role="alert" className="arena-notice arena-notice--error">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="arena-notice arena-notice--success">
          <CheckCircle size={18} weight="fill" />
          <span>{message}</span>
        </div>
      ) : null}

      <div className="arena-section-head">
        <h2 className="arena-section-title">
          <Gift size={20} weight="fill" color="var(--accent)" />
          Lộ trình phần thưởng ({data.maxTiers} bậc)
        </h2>

        <div className="arena-pill-tabs" role="tablist" aria-label="Bộ lọc bậc thưởng">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            className={`arena-pill-tab ${filter === 'all' ? 'is-active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Tất cả ({data.tiers.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'claimable'}
            className={`arena-pill-tab ${filter === 'claimable' ? 'is-active' : ''}`}
            onClick={() => setFilter('claimable')}
          >
            Sẵn sàng nhận ({claimableTiers.length})
          </button>
        </div>
      </div>

      {visibleTiers.length === 0 ? (
        <div className="arena-card" style={{ textAlign: 'center', padding: 32 }}>
          <strong style={{ fontSize: 15 }}>Chưa có phần thưởng nào đang chờ nhận</strong>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--muted)' }}>
            Hãy hoàn thành thêm bài quiz, nhiệm vụ hoặc PvP để tăng XP mùa và mở khóa bậc mới.
          </p>
        </div>
      ) : (
        <div className="sp-tiers-grid">
          {visibleTiers.map((t) => {
            const unlocked = data.currentTier >= t.tier;
            const freeClaimed = data.claimedFreeTiers.includes(t.tier);
            const premClaimed = data.claimedPremiumTiers.includes(t.tier);
            const canClaimAny =
              unlocked &&
              (!freeClaimed || (data.isPremium && !premClaimed));

            return (
              <article
                key={t.tier}
                className={`sp-tier-card ${
                  canClaimAny
                    ? 'is-claimable'
                    : unlocked
                      ? 'is-unlocked'
                      : 'is-locked'
                }`}
              >
                <div className="sp-tier-head">
                  <span className="sp-tier-num">
                    Bậc {t.tier}
                    {canClaimAny ? (
                      <Sparkle size={14} weight="fill" color="#f59e0b" />
                    ) : null}
                  </span>
                  <span className="sp-tier-xp">
                    {t.requiredXp.toLocaleString('vi-VN')} XP
                  </span>
                </div>

                {/* Free Track */}
                <div className="sp-track-box">
                  <span className="sp-track-label">Miễn phí</span>
                  <div className="sp-track-reward">
                    <Coins size={15} weight="fill" color="#d97706" />
                    <span>{t.free.label}</span>
                  </div>
                  {freeClaimed ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 12,
                        color: '#10b981',
                        fontWeight: 700,
                      }}
                    >
                      <CheckCircle size={14} weight="fill" /> Đã nhận
                    </span>
                  ) : unlocked ? (
                    <button
                      type="button"
                      className="button secondary"
                      style={{ minHeight: 32, fontSize: 12.5, padding: '0 12px' }}
                      disabled={busy !== null}
                      onClick={(e) => void handleClaim(t.tier, 'free', e)}
                    >
                      {busy === `${t.tier}:free` ? 'Đang nhận…' : 'Nhận thưởng'}
                    </button>
                  ) : (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 12,
                        color: 'var(--muted)',
                      }}
                    >
                      <Lock size={13} /> Chưa mở khóa
                    </span>
                  )}
                </div>

                {/* Premium Track */}
                <div className="sp-track-box sp-track-box--premium">
                  <span className="sp-track-label">Premium</span>
                  <div className="sp-track-reward">
                    <Sparkle size={15} weight="fill" color="#eab308" />
                    <span>{t.premium.label}</span>
                  </div>
                  {premClaimed ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 12,
                        color: '#10b981',
                        fontWeight: 700,
                      }}
                    >
                      <CheckCircle size={14} weight="fill" /> Đã nhận
                    </span>
                  ) : unlocked && data.isPremium ? (
                    <button
                      type="button"
                      className="button"
                      style={{ minHeight: 32, fontSize: 12.5, padding: '0 12px' }}
                      disabled={busy !== null}
                      onClick={(e) => void handleClaim(t.tier, 'premium', e)}
                    >
                      {busy === `${t.tier}:premium`
                        ? 'Đang nhận…'
                        : 'Nhận Premium'}
                    </button>
                  ) : (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 12,
                        color: 'var(--muted)',
                      }}
                    >
                      <Lock size={13} />{' '}
                      {data.isPremium ? 'Chưa đạt bậc' : 'Cần gói Premium'}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
