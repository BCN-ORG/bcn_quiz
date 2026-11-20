'use client';

import { useEffect, useState } from 'react';
import {
  Certificate,
  CheckCircle,
  Fire,
  Sword,
  Trophy,
  X,
} from '@phosphor-icons/react';
import { xpApi, type PlayerProfile } from '@/lib/xp';
import {
  getCharacterProgression,
  getCharacterTierById,
  getPinBadgeById,
} from '@/lib/character-progression';
import { AvatarFrame } from '@/components/avatar-frame';
import { Nameplate } from '@/components/nameplate';

export interface PlayerProfileModalProps {
  open: boolean;
  onClose: () => void;
  player: {
    userId: string;
    name: string;
    avatarUrl?: string | null;
    level?: number;
    equippedTierId?: string | null;
    pinnedBadges?: string[];
    rank?: number;
  } | null;
}

export function PlayerProfileModal({
  open,
  onClose,
  player,
}: PlayerProfileModalProps) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !player?.userId) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    xpApi
      .getPlayerProfile(player.userId)
      .then((res) => {
        if (!cancelled) setProfile(res);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, player?.userId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !player) return null;

  const level = profile?.level ?? player.level ?? 1;
  const activeTierId =
    profile?.equippedTierId !== undefined
      ? profile.equippedTierId
      : (player.equippedTierId ?? null);
  const tier =
    getCharacterTierById(activeTierId) ?? getCharacterProgression(level);
  const pinned = profile?.pinnedBadges ?? player.pinnedBadges ?? [];

  return (
    <div
      className="rpg-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Hồ sơ ${player.name}`}
      onClick={onClose}
    >
      <div
        className="rpg-player-popout"
        data-tier={tier.tierId}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="rpg-player-popout-banner"
          style={{ backgroundImage: `url('${tier.bannerBgUrl}')` }}
        >
          <span className="rpg-player-popout-scrim" aria-hidden="true" />
          <div className="rpg-player-popout-top">
            <span className="profile-card-banner-tier">
              {tier.tierBadge} · {tier.tierTitle}
            </span>
            <button
              type="button"
              className="rpg-player-popout-close"
              onClick={onClose}
              aria-label="Đóng hồ sơ người chơi"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={tier.assetUrl}
            alt={tier.tierTitle}
            className="rpg-player-popout-char"
          />
        </div>

        <div className="rpg-player-popout-body">
          <div className="rpg-player-popout-avatar-row">
            <div className="profile-card-avatar-cutout">
              <AvatarFrame
                name={player.name}
                avatarUrl={player.avatarUrl}
                level={level}
                tierIdOverride={activeTierId}
                size="lg"
                showLevelBadge
              />
            </div>
            {player.rank ? (
              <span className="rpg-player-popout-rank">
                <Trophy size={13} weight="fill" /> Hạng #{player.rank}
              </span>
            ) : null}
          </div>

          <div className="rpg-player-popout-identity">
            <Nameplate
              name={player.name}
              level={level}
              tierIdOverride={activeTierId}
              pinnedBadges={pinned}
              showTitleBadge={false}
              compact
            />
            <span className="rpg-player-popout-sub">
              Cấp {level} · {(profile?.totalXp ?? 0).toLocaleString('vi-VN')} XP ·{' '}
              {profile?.rankTitle ?? tier.tierTitle}
            </span>
          </div>

          {pinned.length > 0 ? (
            <div className="rpg-player-popout-badges">
              {pinned.map((badgeId) => {
                const b = getPinBadgeById(badgeId);
                if (!b) return null;
                return (
                  <span
                    key={b.id}
                    className="rpg-popout-badge-pill"
                    style={{ borderColor: `${b.color}66`, color: b.color }}
                    title={b.desc}
                  >
                    <span aria-hidden="true">{b.icon}</span>
                    {b.label}
                  </span>
                );
              })}
            </div>
          ) : null}

          <div className="rpg-player-popout-stats">
            <div className="rpg-popout-stat">
              <Sword size={16} weight="fill" />
              <div>
                <strong>
                  {loading
                    ? '…'
                    : `Tầng ${profile?.stats.highestTowerFloor ?? 0}`}
                </strong>
                <span>Tháp cao nhất</span>
              </div>
            </div>
            <div className="rpg-popout-stat">
              <Fire size={16} weight="fill" />
              <div>
                <strong>
                  {loading
                    ? '…'
                    : (profile?.stats.bestBossDamage ?? 0).toLocaleString('vi-VN')}
                </strong>
                <span>Kỷ lục Boss</span>
              </div>
            </div>
            <div className="rpg-popout-stat">
              <CheckCircle size={16} weight="fill" />
              <div>
                <strong>
                  {loading ? '…' : (profile?.stats.totalQuizAttempts ?? 0)}
                </strong>
                <span>Lượt làm Quiz</span>
              </div>
            </div>
            <div className="rpg-popout-stat">
              <Certificate size={16} weight="fill" />
              <div>
                <strong>
                  {loading ? '…' : (profile?.stats.certificatesCount ?? 0)}
                </strong>
                <span>Chứng nhận</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
