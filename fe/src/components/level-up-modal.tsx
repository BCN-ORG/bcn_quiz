'use client';

import { useEffect } from 'react';
import { Coins, Crown, Sparkle, X } from '@phosphor-icons/react';
import { getCharacterProgression } from '@/lib/character-progression';
import { AvatarFrame } from '@/components/avatar-frame';
import { Nameplate } from '@/components/nameplate';

export interface LevelUpModalProps {
  open: boolean;
  onClose: () => void;
  level: number;
  userName: string;
  userAvatarUrl?: string | null;
}

export function LevelUpModal({
  open,
  onClose,
  level,
  userName,
  userAvatarUrl,
}: LevelUpModalProps) {
  const tier = getCharacterProgression(level);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="rpg-modal-backdrop rpg-levelup-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Chúc mừng thăng cấp"
      onClick={onClose}
    >
      <div className="rpg-levelup-modal" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="rpg-modal-close-btn"
          onClick={onClose}
          aria-label="Đóng thông báo thăng cấp"
        >
          <X size={20} weight="bold" />
        </button>

        <div
          className="rpg-levelup-banner"
          style={{ backgroundImage: `url('${tier.bannerBgUrl}')` }}
        >
          <div className="rpg-levelup-rays" aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={tier.assetUrl}
            alt={tier.tierTitle}
            className="rpg-levelup-char"
          />
        </div>

        <div className="rpg-levelup-body">
          <span className="rpg-levelup-kicker">
            <Crown size={15} weight="fill" /> CHÚC MỪNG THĂNG CẤP!
          </span>
          <h2 className="rpg-levelup-title">
            Lv.{level} · {tier.tierTitle}
          </h2>
          <p className="rpg-levelup-desc">{tier.lore}</p>

          <div className="rpg-levelup-unlocks">
            <div className="rpg-levelup-unlock-item">
              <AvatarFrame
                name={userName}
                avatarUrl={userAvatarUrl}
                level={level}
                size="md"
              />
              <div>
                <small>Khung Avatar mới</small>
                <strong>{tier.frameName}</strong>
              </div>
            </div>

            <div className="rpg-levelup-unlock-item">
              <div>
                <small>Bảng tên mới</small>
                <Nameplate name={userName} level={level} compact />
              </div>
            </div>

            {tier.milestoneCoins > 0 ? (
              <div className="rpg-levelup-unlock-item">
                <span className="rpg-evo-coin-icon">
                  <Coins size={22} weight="fill" />
                </span>
                <div>
                  <small>Thưởng cột mốc</small>
                  <strong>+{tier.milestoneCoins} Coin vào Ví</strong>
                </div>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="rpg-levelup-cta"
            onClick={onClose}
          >
            <Sparkle size={18} weight="fill" /> Tuyệt vời, tiếp tục chinh phục!
          </button>
        </div>
      </div>
    </div>
  );
}
