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
  SHOP_INDIVIDUAL_ITEMS,
  getCharacterProgression,
  getCharacterTierById,
  isShopItemUnlocked,
  type CharacterTier,
  type CosmeticSlot,
  type ShopCosmeticItem,
} from '@/lib/character-progression';
import { AvatarFrame } from '@/components/avatar-frame';
import { Nameplate } from '@/components/nameplate';
import { ShopConsumablesPanel } from '@/components/shop-consumables-panel';
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
  equippedCharacterId?: string | null;
  equippedBannerId?: string | null;
  equippedFrameId?: string | null;
  equippedNameplateId?: string | null;
  coinBalance?: number;
  unlockedCosmetics?: string[];
  pinnedBadges?: string[];
  earnedBadges?: string[];
  onSelectTransmog: (tierId: string | null) => void;
  onSelectSlot?: (
    slot: 'character' | 'banner' | 'frame' | 'nameplate',
    id: string | null,
  ) => void;
  onPurchaseCosmetic?: (cosmeticId: string) => Promise<void>;
  onUpdatePinnedBadges?: (badges: string[]) => Promise<void>;
  onShopInventoryChanged?: () => void;
}

const SHOP_SLOT_PILLS: Array<{ slot: CosmeticSlot; label: string }> = [
  { slot: 'bundle', label: 'Trọn bộ' },
  { slot: 'character', label: 'Nhân vật' },
  { slot: 'banner', label: 'Banner' },
  { slot: 'frame', label: 'Khung Avatar' },
  { slot: 'nameplate', label: 'Bảng tên' },
];

export function EvolutionModal({
  open,
  onClose,
  initialTab,
  userLevel,
  userName,
  userAvatarUrl,
  equippedTierId,
  equippedCharacterId,
  equippedBannerId,
  equippedFrameId,
  equippedNameplateId,
  coinBalance = 0,
  unlockedCosmetics = [],
  pinnedBadges = [],
  earnedBadges = [],
  onSelectTransmog,
  onSelectSlot,
  onPurchaseCosmetic,
  onUpdatePinnedBadges,
  onShopInventoryChanged,
}: EvolutionModalProps) {
  const naturalTier = getCharacterProgression(userLevel);
  const [activeTab, setActiveTab] = useState<'tiers' | 'shop' | 'items' | 'badges'>('tiers');
  const [shopSlot, setShopSlot] = useState<CosmeticSlot>('bundle');
  const [selectedTier, setSelectedTier] = useState<CharacterTier>(naturalTier);
  const [selectedShopItem, setSelectedShopItem] = useState<ShopCosmeticItem | null>(null);
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
      setShopSlot('bundle');
      setSelectedTier(
        targetTab === 'shop'
          ? (active.isShop ? active : SHOP_COSMETICS[0])
          : active,
      );
      setSelectedShopItem(null);
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

  const isIndividualShopMode =
    activeTab === 'shop' && shopSlot !== 'bundle' && selectedShopItem !== null;
  const displayTier = isIndividualShopMode
    ? (getCharacterTierById(selectedShopItem.baseTierId) ?? selectedTier)
    : selectedTier;
  const activeItemId = isIndividualShopMode
    ? selectedShopItem.id
    : selectedTier.tierId;
  const isShopItem = isIndividualShopMode || Boolean(selectedTier.isShop);
  const activePrice = isIndividualShopMode
    ? selectedShopItem.priceCoins
    : (selectedTier.priceCoins ?? 0);
  const isUnlocked = isIndividualShopMode
    ? isShopItemUnlocked(unlockedCosmetics, selectedShopItem.id)
    : selectedTier.isShop
      ? isShopItemUnlocked(unlockedCosmetics, selectedTier.tierId)
      : userLevel >= selectedTier.minLevel;

  const activeCharId = equippedCharacterId ?? equippedTierId ?? naturalTier.tierId;
  const activeBannerId = equippedBannerId ?? equippedTierId ?? naturalTier.tierId;
  const activeFrameId = equippedFrameId ?? equippedTierId ?? naturalTier.tierId;
  const activeNameplateId = equippedNameplateId ?? equippedTierId ?? naturalTier.tierId;

  const isSlotEquipped = (slot: 'character' | 'banner' | 'frame' | 'nameplate', id: string) => {
    const baseId = id.replace(/^(char|banner|frame|nameplate):/, '');
    const current =
      slot === 'character'
        ? activeCharId
        : slot === 'banner'
          ? activeBannerId
          : slot === 'frame'
            ? activeFrameId
            : activeNameplateId;
    return current === id || current === baseId;
  };

  const activeDisplayTierId = equippedTierId ?? naturalTier.tierId;
  const isEquipped = isIndividualShopMode
    ? isSlotEquipped(
        selectedShopItem.slot as 'character' | 'banner' | 'frame' | 'nameplate',
        selectedShopItem.id,
      )
    : activeDisplayTierId === selectedTier.tierId &&
      isSlotEquipped('character', selectedTier.tierId) &&
      isSlotEquipped('banner', selectedTier.tierId) &&
      isSlotEquipped('frame', selectedTier.tierId) &&
      isSlotEquipped('nameplate', selectedTier.tierId);

  const handleEquipClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    playEquipSfx();
    triggerCelebrationBurst(e.clientX, e.clientY);
    if (isIndividualShopMode && onSelectSlot) {
      onSelectSlot(
        selectedShopItem.slot as 'character' | 'banner' | 'frame' | 'nameplate',
        selectedShopItem.id,
      );
      return;
    }
    onSelectTransmog(
      selectedTier.tierId === naturalTier.tierId ? null : selectedTier.tierId,
    );
  };

  const handleEquipSingleSlot = (
    e: React.MouseEvent<HTMLButtonElement>,
    slot: 'character' | 'banner' | 'frame' | 'nameplate',
  ) => {
    if (!onSelectSlot) return;
    playEquipSfx();
    triggerCelebrationBurst(e.clientX, e.clientY);
    const id =
      selectedTier.tierId === naturalTier.tierId ? null : selectedTier.tierId;
    onSelectSlot(slot, id);
  };

  const handleBuyClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!onPurchaseCosmetic || buyingId) return;
    setShopError(null);
    setBuyingId(activeItemId);
    try {
      await onPurchaseCosmetic(activeItemId);
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
              setShopSlot('bundle');
              setSelectedShopItem(null);
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
              setShopSlot('bundle');
              setSelectedShopItem(null);
              setSelectedTier(SHOP_COSMETICS[0]);
              setShopError(null);
            }}
          >
            <ShoppingBag size={15} weight="fill" />
            <span>Cửa Hàng Coin ({SHOP_COSMETICS.length} Bộ · {SHOP_INDIVIDUAL_ITEMS.length} Lẻ)</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'items'}
            className={`rpg-evo-mode-tab ${activeTab === 'items' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('items');
              setShopError(null);
            }}
          >
            <Sparkle size={15} weight="fill" />
            <span>Vật Phẩm & Rương Bí Ẩn</span>
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

        {activeTab === 'items' ? (
          <ShopConsumablesPanel
            coinBalance={coinBalance}
            onBalanceOrUnlockChanged={onShopInventoryChanged}
          />
        ) : activeTab === 'badges' ? (
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
              data-tier={displayTier.tierId}
              style={{
                backgroundImage: `url('${isIndividualShopMode ? selectedShopItem.bannerBgUrl : displayTier.bannerBgUrl}')`,
              }}
            >
              <div className="rpg-evo-showcase-overlay" />
              <div className="rpg-evo-character-stage">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={isIndividualShopMode ? selectedShopItem.assetUrl : displayTier.assetUrl}
                  alt={
                    isIndividualShopMode
                      ? selectedShopItem.name
                      : isUnlocked || isShopItem
                        ? displayTier.tierTitle
                        : 'Nhân vật chưa mở khóa'
                  }
                  className={`rpg-evo-character-img ${isUnlocked || isShopItem ? '' : 'silhouette'}`}
                />
                {!isUnlocked && !isShopItem ? (
                  <div className="rpg-evo-lock-overlay">
                    <Lock size={28} weight="fill" />
                    <span>Mở khóa tại Lv.{displayTier.minLevel}</span>
                  </div>
                ) : null}
              </div>

              <div className="rpg-evo-info-pane">
                <div className="rpg-evo-info-top">
                  <span className="rpg-evo-stage-badge">{displayTier.tierBadge}</span>
                  <span className="rpg-evo-level-req">
                    {isShopItem
                      ? `${activePrice.toLocaleString('vi-VN')} Coin`
                      : displayTier.maxLevel >= 999
                        ? `Cấp ${displayTier.minLevel}+`
                        : `Cấp ${displayTier.minLevel} – ${displayTier.maxLevel}`}
                  </span>
                </div>

                <h3 className="rpg-evo-tier-name">
                  {isIndividualShopMode
                    ? selectedShopItem.name
                    : isUnlocked || isShopItem
                      ? displayTier.tierTitle
                      : '??? (Chưa khai mở)'}
                </h3>
                <p className="rpg-evo-lore">
                  {isIndividualShopMode
                    ? selectedShopItem.description
                    : isUnlocked || isShopItem
                      ? displayTier.lore
                      : `Đạt cấp ${displayTier.minLevel} để giải phóng sức mạnh và mở khóa bối cảnh thế giới mới.`}
                </p>

                {/* Rewards & Avatar Frame Preview */}
                <div className="rpg-evo-perks-row">
                  <div className="rpg-evo-perk-card">
                    <AvatarFrame
                      name={userName}
                      avatarUrl={userAvatarUrl}
                      level={displayTier.minLevel}
                      tierIdOverride={
                        isIndividualShopMode && selectedShopItem.slot === 'frame'
                          ? selectedShopItem.id
                          : displayTier.tierId
                      }
                      size="md"
                    />
                    <div className="rpg-evo-perk-text">
                      <span className="rpg-evo-perk-label">Khung Avatar</span>
                      <strong>
                        {isIndividualShopMode && selectedShopItem.slot === 'frame'
                          ? selectedShopItem.name
                          : displayTier.frameName}
                      </strong>
                    </div>
                  </div>

                  <div className="rpg-evo-perk-card">
                    <div className="rpg-evo-perk-text">
                      <span className="rpg-evo-perk-label">Bảng tên hiệu ứng</span>
                      <Nameplate
                        name={userName}
                        level={displayTier.minLevel}
                        tierIdOverride={
                          isIndividualShopMode && selectedShopItem.slot === 'nameplate'
                            ? selectedShopItem.id
                            : displayTier.tierId
                        }
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
                          ? `${activePrice.toLocaleString('vi-VN')} Coin`
                          : displayTier.milestoneCoins > 0
                            ? `+${displayTier.milestoneCoins} Coin`
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
                    <>
                      <button
                        type="button"
                        className={`rpg-evo-equip-btn ${isEquipped ? 'is-equipped' : ''}`}
                        disabled={isEquipped}
                        onClick={handleEquipClick}
                      >
                        {isEquipped ? (
                          <>
                            <Check size={16} weight="bold" />{' '}
                            {isIndividualShopMode ? 'Đang trang bị món này' : 'Đang trang bị cả bộ'}
                          </>
                        ) : (
                          <>
                            <Sword size={16} weight="fill" />{' '}
                            {isIndividualShopMode ? 'Trang bị món này' : 'Trang bị cả bộ'}
                          </>
                        )}
                      </button>
                      {!isIndividualShopMode && onSelectSlot ? (
                        <div className="rpg-evo-mix-row" role="group" aria-label="Phối đồ từng món">
                          {(
                            [
                              { slot: 'character', label: 'Nhân vật' },
                              { slot: 'banner', label: 'Banner' },
                              { slot: 'frame', label: 'Khung' },
                              { slot: 'nameplate', label: 'Bảng tên' },
                            ] as const
                          ).map((item) => {
                            const used = isSlotEquipped(item.slot, selectedTier.tierId);
                            return (
                              <button
                                key={item.slot}
                                type="button"
                                className={`rpg-evo-mix-btn ${used ? 'is-equipped' : ''}`}
                                disabled={used}
                                onClick={(e) => handleEquipSingleSlot(e, item.slot)}
                              >
                                {used ? `✓ ${item.label}` : `+ Dùng ${item.label}`}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </>
                  ) : isShopItem ? (
                    <button
                      type="button"
                      className="rpg-evo-buy-btn"
                      disabled={buyingId === activeItemId || coinBalance < activePrice}
                      onClick={(e) => void handleBuyClick(e)}
                    >
                      <ShoppingBag size={16} weight="fill" />
                      {buyingId === activeItemId
                        ? 'Đang mở khóa…'
                        : coinBalance < activePrice
                          ? `Thiếu ${(activePrice - coinBalance).toLocaleString('vi-VN')} Coin`
                          : `Mua & Trang bị · ${activePrice.toLocaleString('vi-VN')} Coin`}
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

            {activeTab === 'shop' ? (
              <div className="rpg-evo-slot-pills" role="tablist" aria-label="Lọc theo loại trang bị">
                {SHOP_SLOT_PILLS.map((pill) => (
                  <button
                    key={pill.slot}
                    type="button"
                    role="tab"
                    aria-selected={shopSlot === pill.slot}
                    className={`rpg-evo-slot-pill ${shopSlot === pill.slot ? 'is-active' : ''}`}
                    onClick={() => {
                      setShopSlot(pill.slot);
                      setShopError(null);
                      if (pill.slot === 'bundle') {
                        setSelectedShopItem(null);
                        if (!selectedTier.isShop) setSelectedTier(SHOP_COSMETICS[0]);
                      } else {
                        const first = SHOP_INDIVIDUAL_ITEMS.find((i) => i.slot === pill.slot) ?? null;
                        setSelectedShopItem(first);
                        if (first) {
                          const base = getCharacterTierById(first.baseTierId);
                          if (base) setSelectedTier(base);
                        }
                      }
                    }}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            ) : null}

            {/* Bottom Strip (Tiers or Shop Items) */}
            <div
              className="rpg-evo-strip"
              role="tablist"
              aria-label={
                activeTab === 'shop'
                  ? 'Danh sách trang bị cửa hàng'
                  : 'Danh sách 7 giai đoạn'
              }
            >
              {activeTab === 'shop' && shopSlot !== 'bundle'
                ? SHOP_INDIVIDUAL_ITEMS.filter((i) => i.slot === shopSlot).map((item) => {
                    const unlocked = isShopItemUnlocked(unlockedCosmetics, item.id);
                    const selected = selectedShopItem?.id === item.id;
                    const equipped = isSlotEquipped(
                      item.slot as 'character' | 'banner' | 'frame' | 'nameplate',
                      item.id,
                    );
                    const thumbImg = item.slot === 'banner' ? item.bannerBgUrl : item.assetUrl;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        className={`rpg-evo-thumb ${selected ? 'is-selected' : ''} ${unlocked ? '' : 'is-locked'}`}
                        onClick={() => {
                          setSelectedShopItem(item);
                          const base = getCharacterTierById(item.baseTierId);
                          if (base) setSelectedTier(base);
                          setShopError(null);
                        }}
                      >
                        <div className="rpg-evo-thumb-img-wrap">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={thumbImg} alt={item.name} />
                          {!unlocked ? (
                            <span className="rpg-evo-thumb-lock">
                              <Lock size={12} weight="fill" />
                            </span>
                          ) : null}
                          {equipped ? <span className="rpg-evo-thumb-equipped">Đang dùng</span> : null}
                        </div>
                        <span className="rpg-evo-thumb-lv">
                          {unlocked ? 'Đã sở hữu' : `${item.priceCoins} Coin`}
                        </span>
                        <span className="rpg-evo-thumb-title">{item.name}</span>
                      </button>
                    );
                  })
                : (activeTab === 'shop' ? SHOP_COSMETICS : CHARACTER_TIERS).map((tier) => {
                    const unlocked = tier.isShop
                      ? isShopItemUnlocked(unlockedCosmetics, tier.tierId)
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
                          setSelectedShopItem(null);
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
