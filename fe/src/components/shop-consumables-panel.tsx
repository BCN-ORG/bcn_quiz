'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle,
  Coins,
  Gift,
  Lightning,
  ShieldCheck,
  Sparkle,
  WarningCircle,
} from '@phosphor-icons/react';
import {
  questsShopApi,
  type ConsumableType,
  type MysteryChestRollResult,
  type ShopInventory,
} from '@/lib/quests-shop';
import { playChestSfx, triggerCelebrationBurst } from '@/lib/sound-effects';

export function ShopConsumablesPanel({
  coinBalance,
  onBalanceOrUnlockChanged,
}: {
  coinBalance: number;
  onBalanceOrUnlockChanged?: () => void;
}) {
  const [inventory, setInventory] = useState<ShopInventory | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRoll, setLastRoll] = useState<MysteryChestRollResult['roll'] | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const inv = await questsShopApi.getInventory();
      setInventory(inv);
    } catch {
      // handled gracefully
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleBuyConsumable = async (
    itemType: ConsumableType,
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    if (busyKey) return;
    setBusyKey(itemType);
    setError(null);
    setToast(null);
    try {
      const idem = `consumable:${itemType}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      const res = await questsShopApi.purchaseConsumable(itemType, idem);
      playChestSfx();
      triggerCelebrationBurst(e.clientX, e.clientY);
      setToast(
        itemType === 'STREAK_FREEZE'
          ? `Đã mua Khiên Giữ Chuỗi (hiện có ${res.quantity} khiên).`
          : 'Đã kích hoạt Thẻ Nhân Đôi XP (+24 giờ)!',
      );
      await load();
      onBalanceOrUnlockChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể mua vật phẩm.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleOpenChest = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (busyKey) return;
    setBusyKey('MYSTERY_CHEST');
    setError(null);
    setToast(null);
    try {
      const idem = `mystery:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      const res = await questsShopApi.openMysteryChest(idem);
      setLastRoll(res.roll);
      playChestSfx();
      triggerCelebrationBurst(e.clientX, e.clientY);
      await load();
      onBalanceOrUnlockChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể mở Rương Bí Ẩn.');
    } finally {
      setBusyKey(null);
    }
  };

  if (!inventory) {
    return (
      <div style={{ padding: '20px', color: '#94a3b8', fontSize: 13 }}>
        Đang tải kho vật phẩm...
      </div>
    );
  }

  const chestCost = inventory.mysteryChest.costCoins;
  const pityPct = Math.min(
    100,
    Math.round(
      (inventory.mysteryChest.pityCount /
        Math.max(1, inventory.mysteryChest.pityThreshold)) *
        100,
    ),
  );

  return (
    <div className="sc-wrap">
      {error ? (
        <div role="alert" className="arena-notice arena-notice--error">
          <WarningCircle size={18} weight="fill" />
          <span>{error}</span>
        </div>
      ) : null}

      {toast ? (
        <div className="arena-notice arena-notice--success">
          <CheckCircle size={18} weight="fill" />
          <span>{toast}</span>
        </div>
      ) : null}

      {/* Mystery Chest Hero Box */}
      <section className="sc-chest-hero">
        <div className="sc-chest-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, maxWidth: 520 }}>
            <div className="sc-chest-icon">
              <Gift size={26} weight="fill" />
            </div>
            <div>
              <strong style={{ fontSize: 17, color: '#ffffff', fontFamily: 'var(--font-display)' }}>
                Rương Bí Ẩn BCN Arena
              </strong>
              <p style={{ margin: '3px 0 0', fontSize: 13, color: '#cbd5e1', lineHeight: 1.45 }}>
                Mở ngẫu nhiên Khung/Mảnh trang bị hiếm, Thẻ 2x XP hoặc Khiên giữ chuỗi. Trùng đồ hoàn ngay{' '}
                <strong style={{ color: '#fde047' }}>
                  {inventory.mysteryChest.duplicateRefundCoins} Coin
                </strong>
                .
              </p>
            </div>
          </div>

          <button
            type="button"
            className="rpg-evo-buy-btn"
            disabled={busyKey !== null || coinBalance < chestCost}
            onClick={(e) => void handleOpenChest(e)}
          >
            <Sparkle size={16} weight="fill" />
            {busyKey === 'MYSTERY_CHEST'
              ? 'Đang mở rương…'
              : coinBalance < chestCost
                ? `Thiếu ${chestCost - coinBalance} Coin`
                : `Mở Rương · ${chestCost} Coin`}
          </button>
        </div>

        <div className="sc-pity-wrap">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              fontSize: 12,
            }}
          >
            <span style={{ color: '#fde047', fontWeight: 700 }}>
              Bảo hiểm Pity: {inventory.mysteryChest.pityCount}/
              {inventory.mysteryChest.pityThreshold}
            </span>
            <span style={{ color: '#94a3b8' }}>
              Chắc chắn nhận trang bị hiếm chưa sở hữu ở lượt thứ{' '}
              {inventory.mysteryChest.pityThreshold}
            </span>
          </div>
          <div className="sp-hero-progress__bar" style={{ height: 7 }}>
            <div
              className="arena-progress__fill arena-progress__fill--gold"
              style={{ width: `${pityPct}%` }}
            />
          </div>
        </div>

        {lastRoll ? (
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              padding: '12px 15px',
              borderRadius: 12,
              background: 'rgba(15, 23, 42, 0.78)',
              border: '1px solid rgba(56, 189, 248, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 14,
                fontWeight: 800,
                color: '#fde047',
              }}
            >
              <Sparkle size={17} weight="fill" />
              Bạn nhận được: {lastRoll.rewardLabel}
            </span>
            {lastRoll.isDuplicate ? (
              <span style={{ fontSize: 12.5, color: '#86efac', fontWeight: 700 }}>
                Đã sở hữu → Hoàn +{lastRoll.refundCoins} Coin
              </span>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Consumables Grid */}
      <div className="sc-consumables-grid">
        {inventory.catalog.map((item) => {
          const isFreeze = item.itemType === 'STREAK_FREEZE';
          const maxed =
            isFreeze &&
            inventory.streakFreezeCount >= inventory.maxStreakFreeze;
          return (
            <article key={item.itemType} className="sc-item-card">
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    className={`arena-kpi-icon ${
                      isFreeze ? 'arena-kpi-icon--emerald' : 'arena-kpi-icon--amber'
                    }`}
                  >
                    {isFreeze ? (
                      <ShieldCheck size={24} weight="fill" />
                    ) : (
                      <Lightning size={24} weight="fill" />
                    )}
                  </div>
                  <div>
                    <strong style={{ fontSize: 15, color: '#ffffff' }}>
                      {item.name}
                    </strong>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                      {isFreeze
                        ? `Đang có: ${inventory.streakFreezeCount}/${inventory.maxStreakFreeze}`
                        : inventory.xpBoostActive
                          ? `Đang bật đến ${new Date(inventory.xpBoostActiveUntil!).toLocaleString('vi-VN')}`
                          : 'Chưa kích hoạt'}
                    </div>
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
                  {item.description}
                </p>
              </div>

              <button
                type="button"
                className="rpg-evo-buy-btn"
                disabled={
                  busyKey !== null || maxed || coinBalance < item.priceCoins
                }
                onClick={(e) => void handleBuyConsumable(item.itemType, e)}
              >
                <Coins size={15} weight="fill" />
                {busyKey === item.itemType
                  ? 'Đang mua…'
                  : maxed
                    ? 'Đã đạt tối đa'
                    : coinBalance < item.priceCoins
                      ? `Thiếu ${item.priceCoins - coinBalance} Coin`
                      : `Mua · ${item.priceCoins} Coin`}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
