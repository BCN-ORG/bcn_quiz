'use client';

import { useEffect, useState } from 'react';
import {
  Check,
  Coins,
  Lock,
  PushPin,
  ShoppingBag,
  Sparkle,
  Sword,
  X,
} from '@phosphor-icons/react';
import {
  CHARACTER_TIERS,
  PIN_BADGES,
  SHOP_COSMETICS,
  getCharacterProgression,
  getCharacterTierById,
  type CharacterTier,
} from '@/lib/character-progression';
import { AvatarFrame } from '@/components/avatar-frame';
import { Nameplate } from '@/components/nameplate';
import {
  playEquipSfx,
  triggerCelebrationBurst,
} from '@/lib/sound-effects';

export interface EvolutionModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: 'tiers' | 'shop' | 'badges';
  userLevel: number;
  userName: string;
  userAvatarUrl?: string | null;
  equippedTierId: string | null;
  coinBalance?: number;
  unlockedCosmetics?: string[];
  pinnedBadges?: string[];
  earnedBadges?: string[];
  onSelectTransmog: (tierId: string | null) => void;
  onPurchaseCosmetic?: (cosmeticId: string) => Promise<void>;
  onUpdatePinnedBadges?: (badges: string[]) => Promise<void>;
}

export function EvolutionModal({
  open,
  onClose,
  initialTab,
  userLevel,
  userName,
  userAvatarUrl,
  equippedTierId,
  coinBalance = 0,
  unlockedCosmetics = [],
  pinnedBadges = [],
  earnedBadges = [],
  onSelectTransmog,
  onPurchaseCosmetic,
  onUpdatePinnedBadges,
}: EvolutionModalProps) {
  const naturalTier = getCharacterProgression(userLevel);
  const [activeTab, setActiveTab] = useState<'tiers' | 'shop' | 'badges'>('tiers');
  const [selectedTier, setSelectedTier] = useState<CharacterTier>(naturalTier);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [shopError, setShopError] = useState<string | null>(null);
  const [localPins, setLocalPins] = useState<string[]>(pinnedBadges);
  const [savingPins, setSavingPins] = useState(false);

  useEffect(() => {
    if (open) {
      const active =
        getCharacterTierById(equippedTierId) ?? naturalTier;
      const targetTab = initialTab ?? (active.isShop ? 'shop' : 'tiers');
      setActiveTab(targetTab);
      setSelectedTier(
        targetTab === 'shop'
          ? (active.isShop ? active : SHOP_COSMETICS[0])
          : active,
      );
      setShopError(null);
      setLocalPins(pinnedBadges);
    }
  }, [open, initialTab, equippedTierId, naturalTier, pinnedBadges]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isShopItem = Boolean(selectedTier.isShop);
  const isUnlocked = isShopItem
    ? unlockedCosmetics.includes(selectedTier.tierId)
    : userLevel >= selectedTier.minLevel;
  const activeDisplayTierId = equippedTierId ?? naturalTier.tierId;
  const isEquipped = activeDisplayTierId === selectedTier.tierId;

  const handleEquipClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    playEquipSfx();
    triggerCelebrationBurst(e.clientX, e.clientY);
    onSelectTransmog(
      selectedTier.tierId === naturalTier.tierId ? null : selectedTier.tierId,
    );
  };

  const handleBuyClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!onPurchaseCosmetic || buyingId) return;
    setShopError(null);
    setBuyingId(selectedTier.tierId);
    try {
      await onPurchaseCosmetic(selectedTier.tierId);
      playEquipSfx();
      triggerCelebrationBurst(e.clientX, e.clientY);
    } catch (err) {
      setShopError(
        err instanceof Error ? err.message : 'Không thể mua trang bị lúc này.',
      );
    } finally {
      setBuyingId(null);
    }
  };

  const togglePin = async (badgeId: string) => {
    if (!onUpdatePinnedBadges || savingPins) return;
    const exists = localPins.includes(badgeId);
    const next = exists
      ? localPins.filter((id) => id !== badgeId)
      : localPins.length >= 3
        ? [...localPins.slice(1), badgeId]
        : [...localPins, badgeId];
    setLocalPins(next);
    setSavingPins(true);
    try {
      await onUpdatePinnedBadges(next);
      playEquipSfx();
    } finally {
      setSavingPins(false);
    }
  };

  return (
    <div
      className="rpg-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Sổ tay tiến hóa và Cửa hàng trang bị BCN Arena"
      onClick={onClose}
    >
      <div
        className="rpg-evo-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rpg-evo-modal-head">
          <div className="rpg-evo-modal-title-wrap">
            <span className="rpg-evo-pill">
              <Sparkle size={14} weight="fill" /> Tủ Đồ & Tiến Hóa BCN Arena
            </span>
            <h2>Hành Trình Anh Hùng & Cửa Hàng</h2>
          </div>
          <div className="rpg-evo-head-right">
            <span className="rpg-evo-wallet-pill" title="Số dư Coin hiện có">
              <Coins size={15} weight="fill" />
              <strong>{coinBalance.toLocaleString('vi-VN')}</strong> Coin
            </span>
            <button
              type="button"
              className="rpg-modal-close-btn"
              onClick={onClose}
              aria-label="Đóng sổ tay tiến hóa"
            >
              <X size={20} weight="bold" />
            </button>
          </div>
        </div>

        {/* Mode Tabs */}
        <div className="rpg-evo-mode-tabs" role="tablist" aria-label="Chế độ tủ đồ">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'tiers'}
            className={`rpg-evo-mode-tab ${activeTab === 'tiers' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('tiers');
              setSelectedTier(naturalTier);
              setShopError(null);
            }}
          >
            <Sword size={15} weight="fill" />
            <span>Tiến Hóa (7 Giai Đoạn)</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'shop'}
            className={`rpg-evo-mode-tab ${activeTab === 'shop' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('shop');
              setSelectedTier(SHOP_COSMETICS[0]);
              setShopError(null);
            }}
          >
            <ShoppingBag size={15} weight="fill" />
            <span>Cửa Hàng Coin ({SHOP_COSMETICS.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'badges'}
            className={`rpg-evo-mode-tab ${activeTab === 'badges' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('badges');
              setShopError(null);
            }}
          >
            <PushPin size={15} weight="fill" />
            <span>Huy Hiệu Ghim ({localPins.length}/3)</span>
          </button>
        </div>

        {activeTab === 'badges' ? (
          <div className="rpg-badge-picker-panel">
            <div className="rpg-badge-preview-bar">
              <span className="rpg-evo-perk-label">Xem trước trên bảng tên của bạn:</span>
              <Nameplate
                name={userName}
                level={userLevel}
                tierIdOverride={equippedTierId}
                pinnedBadges={localPins}
                showTitleBadge={false}
                compact
              />
            </div>
            <p className="rpg-badge-helper">
              Chọn tối đa <strong>3 huy hiệu</strong> đã mở khóa để ghim phát sáng cạnh tên của bạn trên Bảng Xếp Hạng và Profile Card.
            </p>
            <div className="rpg-badge-grid">
              {PIN_BADGES.map((badge) => {
                const unlocked =
                  earnedBadges.length === 0
                    ? badge.id === 'arena-veteran' && userLevel >= 3
                    : earnedBadges.includes(badge.id);
                const pinned = localPins.includes(badge.id);
                return (
                  <button
                    key={badge.id}
                    type="button"
                    disabled={!unlocked || savingPins}
                    className={`rpg-badge-card ${pinned ? 'is-pinned' : ''} ${unlocked ? '' : 'is-locked'}`}
                    onClick={() => void togglePin(badge.id)}
                  >
                    <span className="rpg-badge-card-icon" aria-hidden="true">
                      {badge.icon}
                    </span>
                    <div className="rpg-badge-card-info">
                      <strong>{badge.label}</strong>
                      <small>{badge.desc}</small>
                    </div>
                    <span className="rpg-badge-card-state">
                      {!unlocked ? (
                        <Lock size={14} weight="fill" />
                      ) : pinned ? (
                        <Check size={15} weight="bold" />
                      ) : (
                        'Ghim'
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <>
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
                  alt={isUnlocked || isShopItem ? selectedTier.tierTitle : 'Nhân vật chưa mở khóa'}
                  className={`rpg-evo-character-img ${isUnlocked || isShopItem ? '' : 'silhouette'}`}
                />
                {!isUnlocked && !isShopItem ? (
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
                    {isShopItem
                      ? `${(selectedTier.priceCoins ?? 0).toLocaleString('vi-VN')} Coin`
                      : selectedTier.maxLevel >= 999
                        ? `Cấp ${selectedTier.minLevel}+`
                        : `Cấp ${selectedTier.minLevel} – ${selectedTier.maxLevel}`}
                  </span>
                </div>

                <h3 className="rpg-evo-tier-name">
                  {isUnlocked || isShopItem
                    ? selectedTier.tierTitle
                    : '??? (Chưa khai mở)'}
                </h3>
                <p className="rpg-evo-lore">
                  {isUnlocked || isShopItem
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
                      tierIdOverride={selectedTier.tierId}
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
                        tierIdOverride={selectedTier.tierId}
                        pinnedBadges={localPins}
                        compact
                      />
                    </div>
                  </div>

                  <div className="rpg-evo-perk-card">
                    <span className="rpg-evo-coin-icon" aria-hidden="true">
                      <Coins size={24} weight="fill" />
                    </span>
                    <div className="rpg-evo-perk-text">
                      <span className="rpg-evo-perk-label">
                        {isShopItem ? 'Giá mở khóa' : 'Thưởng cột mốc'}
                      </span>
                      <strong>
                        {isShopItem
                          ? `${(selectedTier.priceCoins ?? 0).toLocaleString('vi-VN')} Coin`
                          : selectedTier.milestoneCoins > 0
                            ? `+${selectedTier.milestoneCoins} Coin`
                            : 'Khởi đầu'}
                      </strong>
                    </div>
                  </div>
                </div>

                {shopError ? (
                  <p className="rpg-evo-shop-error" role="alert">
                    {shopError}
                  </p>
                ) : null}

                <div className="rpg-evo-actions">
                  {isUnlocked ? (
                    <button
                      type="button"
                      className={`rpg-evo-equip-btn ${isEquipped ? 'is-equipped' : ''}`}
                      disabled={isEquipped}
                      onClick={handleEquipClick}
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
                  ) : isShopItem ? (
                    <button
                      type="button"
                      className="rpg-evo-buy-btn"
                      disabled={
                        buyingId === selectedTier.tierId ||
                        coinBalance < (selectedTier.priceCoins ?? 0)
                      }
                      onClick={(e) => void handleBuyClick(e)}
                    >
                      <ShoppingBag size={16} weight="fill" />
                      {buyingId === selectedTier.tierId
                        ? 'Đang mở khóa…'
                        : coinBalance < (selectedTier.priceCoins ?? 0)
                          ? `Thiếu ${((selectedTier.priceCoins ?? 0) - coinBalance).toLocaleString('vi-VN')} Coin`
                          : `Mua & Trang bị · ${(selectedTier.priceCoins ?? 0).toLocaleString('vi-VN')} Coin`}
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

            {/* Bottom Strip (Tiers or Shop Items) */}
            <div
              className="rpg-evo-strip"
              role="tablist"
              aria-label={
                activeTab === 'shop'
                  ? 'Danh sách 4 trang bị cửa hàng'
                  : 'Danh sách 7 giai đoạn'
              }
            >
              {(activeTab === 'shop' ? SHOP_COSMETICS : CHARACTER_TIERS).map((tier) => {
                const unlocked = tier.isShop
                  ? unlockedCosmetics.includes(tier.tierId)
                  : userLevel >= tier.minLevel;
                const selected = selectedTier.tierId === tier.tierId;
                const equipped = activeDisplayTierId === tier.tierId;
                return (
                  <button
                    key={tier.tierId}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className={`rpg-evo-thumb ${selected ? 'is-selected' : ''} ${unlocked ? '' : 'is-locked'}`}
                    onClick={() => {
                      setSelectedTier(tier);
                      setShopError(null);
                    }}
                  >
                    <div className="rpg-evo-thumb-img-wrap">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={tier.assetUrl}
                        alt={tier.tierTitle}
                        className={unlocked || tier.isShop ? '' : 'silhouette'}
                      />
                      {!unlocked ? (
                        <span className="rpg-evo-thumb-lock">
                          <Lock size={12} weight="fill" />
                        </span>
                      ) : null}
                      {equipped ? <span className="rpg-evo-thumb-equipped">Đang dùng</span> : null}
                    </div>
                    <span className="rpg-evo-thumb-lv">
                      {tier.isShop
                        ? unlocked
                          ? 'Đã sở hữu'
                          : `${tier.priceCoins} Coin`
                        : `Lv.${tier.minLevel}+`}
                    </span>
                    <span className="rpg-evo-thumb-title">
                      {unlocked || tier.isShop ? tier.tierTitle : 'Bí ẩn'}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
