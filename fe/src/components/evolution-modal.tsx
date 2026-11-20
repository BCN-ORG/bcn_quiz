'use client';

import { useEffect, useState } from 'react';
import { Check, Coins, Lock, Sparkle, Sword, X } from '@phosphor-icons/react';
import {
  CHARACTER_TIERS,
  getCharacterProgression,
  type CharacterTier,
} from '@/lib/character-progression';
import { AvatarFrame } from '@/components/avatar-frame';
import { Nameplate } from '@/components/nameplate';

export interface EvolutionModalProps {
  open: boolean;
  onClose: () => void;
  userLevel: number;
  userName: string;
  userAvatarUrl?: string | null;
  equippedTierId: string | null;
  onSelectTransmog: (tierId: string | null) => void;
}

export function EvolutionModal({
  open,
  onClose,
  userLevel,
  userName,
  userAvatarUrl,
  equippedTierId,
  onSelectTransmog,
}: EvolutionModalProps) {
  const naturalTier = getCharacterProgression(userLevel);
  const [selectedTier, setSelectedTier] = useState<CharacterTier>(naturalTier);

  useEffect(() => {
    if (open) {
      const active =
        CHARACTER_TIERS.find((t) => t.tierId === equippedTierId) ?? naturalTier;
      setSelectedTier(active);
    }
  }, [open, equippedTierId, naturalTier]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isUnlocked = userLevel >= selectedTier.minLevel;
  const activeDisplayTierId = equippedTierId ?? naturalTier.tierId;
  const isEquipped = activeDisplayTierId === selectedTier.tierId;

  return (
    <div
      className="rpg-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Sổ tay tiến hóa nhân vật BCN Arena"
      onClick={onClose}
    >
      <div
        className="rpg-evo-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rpg-evo-modal-head">
          <div className="rpg-evo-modal-title-wrap">
            <span className="rpg-evo-pill">
              <Sparkle size={14} weight="fill" /> Sổ Tay Tiến Hóa · 7 Giai Đoạn
            </span>
            <h2>Hành Trình Anh Hùng BCN Arena</h2>
          </div>
          <button
            type="button"
            className="rpg-modal-close-btn"
            onClick={onClose}
            aria-label="Đóng sổ tay tiến hóa"
          >
            <X size={20} weight="bold" />
          </button>
        </div>

        {/* Showcase Preview Area */}
        <div
          className={`rpg-evo-showcase ${isUnlocked ? '' : 'is-locked'}`}
          data-tier={selectedTier.tierId}
          style={{ backgroundImage: `url('${selectedTier.bannerBgUrl}')` }}
        >
          <div className="rpg-evo-showcase-overlay" />
          <div className="rpg-evo-character-stage">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedTier.assetUrl}
              alt={isUnlocked ? selectedTier.tierTitle : 'Nhân vật chưa mở khóa'}
              className={`rpg-evo-character-img ${isUnlocked ? '' : 'silhouette'}`}
            />
            {!isUnlocked ? (
              <div className="rpg-evo-lock-overlay">
                <Lock size={28} weight="fill" />
                <span>Mở khóa tại Lv.{selectedTier.minLevel}</span>
              </div>
            ) : null}
          </div>

          <div className="rpg-evo-info-pane">
            <div className="rpg-evo-info-top">
              <span className="rpg-evo-stage-badge">{selectedTier.tierBadge}</span>
              <span className="rpg-evo-level-req">
                {selectedTier.maxLevel >= 999
                  ? `Cấp ${selectedTier.minLevel}+`
                  : `Cấp ${selectedTier.minLevel} – ${selectedTier.maxLevel}`}
              </span>
            </div>

            <h3 className="rpg-evo-tier-name">
              {isUnlocked ? selectedTier.tierTitle : '??? (Chưa khai mở)'}
            </h3>
            <p className="rpg-evo-lore">
              {isUnlocked
                ? selectedTier.lore
                : `Đạt cấp ${selectedTier.minLevel} để giải phóng sức mạnh và mở khóa bối cảnh thế giới mới.`}
            </p>

            {/* Rewards & Avatar Frame Preview */}
            <div className="rpg-evo-perks-row">
              <div className="rpg-evo-perk-card">
                <AvatarFrame
                  name={userName}
                  avatarUrl={userAvatarUrl}
                  level={selectedTier.minLevel}
                  size="md"
                />
                <div className="rpg-evo-perk-text">
                  <span className="rpg-evo-perk-label">Khung Avatar</span>
                  <strong>{selectedTier.frameName}</strong>
                </div>
              </div>

              <div className="rpg-evo-perk-card">
                <div className="rpg-evo-perk-text">
                  <span className="rpg-evo-perk-label">Bảng tên hiệu ứng</span>
                  <Nameplate
                    name={userName}
                    level={selectedTier.minLevel}
                    compact
                  />
                </div>
              </div>

              <div className="rpg-evo-perk-card">
                <span className="rpg-evo-coin-icon" aria-hidden="true">
                  <Coins size={24} weight="fill" />
                </span>
                <div className="rpg-evo-perk-text">
                  <span className="rpg-evo-perk-label">Thưởng cột mốc</span>
                  <strong>
                    {selectedTier.milestoneCoins > 0
                      ? `+${selectedTier.milestoneCoins} Coin`
                      : 'Khởi đầu'}
                  </strong>
                </div>
              </div>
            </div>

            <div className="rpg-evo-actions">
              {isUnlocked ? (
                <button
                  type="button"
                  className={`rpg-evo-equip-btn ${isEquipped ? 'is-equipped' : ''}`}
                  disabled={isEquipped}
                  onClick={() => {
                    onSelectTransmog(
                      selectedTier.tierId === naturalTier.tierId
                        ? null
                        : selectedTier.tierId,
                    );
                  }}
                >
                  {isEquipped ? (
                    <>
                      <Check size={16} weight="bold" /> Đang trang bị ngoại hình & bảng tên
                    </>
                  ) : (
                    <>
                      <Sword size={16} weight="fill" /> Trang bị ngoại hình & Bảng tên
                    </>
                  )}
                </button>
              ) : (
                <div className="rpg-evo-locked-btn">
                  <Lock size={16} weight="fill" />
                  <span>Còn {selectedTier.minLevel - userLevel} cấp nữa để mở khóa</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 7-Tier Selector Strip */}
        <div className="rpg-evo-strip" role="tablist" aria-label="Danh sách 7 giai đoạn">
          {CHARACTER_TIERS.map((tier) => {
            const unlocked = userLevel >= tier.minLevel;
            const selected = selectedTier.tierId === tier.tierId;
            const equipped = activeDisplayTierId === tier.tierId;
            return (
              <button
                key={tier.tierId}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`rpg-evo-thumb ${selected ? 'is-selected' : ''} ${unlocked ? '' : 'is-locked'}`}
                onClick={() => setSelectedTier(tier)}
              >
                <div className="rpg-evo-thumb-img-wrap">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={tier.assetUrl}
                    alt={tier.tierTitle}
                    className={unlocked ? '' : 'silhouette'}
                  />
                  {!unlocked ? (
                    <span className="rpg-evo-thumb-lock">
                      <Lock size={12} weight="fill" />
                    </span>
                  ) : null}
                  {equipped ? <span className="rpg-evo-thumb-equipped">Đang dùng</span> : null}
                </div>
                <span className="rpg-evo-thumb-lv">Lv.{tier.minLevel}+</span>
                <span className="rpg-evo-thumb-title">
                  {unlocked ? tier.tierTitle : 'Bí ẩn'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
