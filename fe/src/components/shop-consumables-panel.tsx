'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Coins,
  Gift,
  Lightning,
  ShieldCheck,
  Sparkle,
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

  return (
    <div style={{ display: 'grid', gap: 16, padding: '4px 4px 10px' }}>
      {error ? (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: 'rgba(244, 63, 94, 0.16)',
            color: '#fda4af',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {error}
        </div>
      ) : null}

      {toast ? (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: 'rgba(16, 185, 129, 0.16)',
            color: '#6ee7b7',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {toast}
        </div>
      ) : null}

      {/* Mystery Chest Hero Box */}
      <div
        style={{
          padding: '18px 20px',
          borderRadius: 16,
          background:
            'linear-gradient(135deg, rgba(124, 58, 237, 0.25), rgba(234, 179, 8, 0.18))',
          border: '1px solid rgba(250, 204, 21, 0.45)',
          display: 'grid',
          gap: 12,
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
            <Gift size={26} weight="fill" color="#facc15" />
            <div>
              <strong style={{ fontSize: 16, color: '#fff' }}>
                Rương Bí Ẩn BCN Arena
              </strong>
              <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#cbd5e1' }}>
                Mở ngẫu nhiên Khung/Mảnh trang bị hiếm, Thẻ 2x XP hoặc Khiên giữ chuỗi. Trùng đồ hoàn ngay{' '}
                <strong>{inventory.mysteryChest.duplicateRefundCoins} Coin</strong>!
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
          <span style={{ color: '#fde047', fontWeight: 700 }}>
            Bảo hiểm Pity: {inventory.mysteryChest.pityCount}/
            {inventory.mysteryChest.pityThreshold}
          </span>
          <span style={{ color: '#94a3b8' }}>
            (Chắc chắn nhận trang bị hiếm chưa sở hữu ở lượt thứ{' '}
            {inventory.mysteryChest.pityThreshold})
          </span>
        </div>

        {lastRoll ? (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              background: 'rgba(15, 23, 42, 0.72)',
              border: '1px solid rgba(56, 189, 248, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 13.5, fontWeight: 800, color: '#fde047' }}>
              🎉 Bạn nhận được: {lastRoll.rewardLabel}
            </span>
            {lastRoll.isDuplicate ? (
              <span style={{ fontSize: 12, color: '#86efac', fontWeight: 700 }}>
                Đã sở hữu → Hoàn +{lastRoll.refundCoins} Coin
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Consumables Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 12,
        }}
      >
        {inventory.catalog.map((item) => {
          const isFreeze = item.itemType === 'STREAK_FREEZE';
          const maxed =
            isFreeze &&
            inventory.streakFreezeCount >= inventory.maxStreakFreeze;
          return (
            <div
              key={item.itemType}
              style={{
                padding: '16px',
                borderRadius: 14,
                background: 'rgba(15, 23, 42, 0.65)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                display: 'grid',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {isFreeze ? (
                  <ShieldCheck size={24} weight="fill" color="#38bdf8" />
                ) : (
                  <Lightning size={24} weight="fill" color="#c084fc" />
                )}
                <div>
                  <strong style={{ fontSize: 14.5, color: '#fff' }}>
                    {item.name}
                  </strong>
                  <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
                    {isFreeze
                      ? `Đang có: ${inventory.streakFreezeCount}/${inventory.maxStreakFreeze}`
                      : inventory.xpBoostActive
                        ? `Đang bật đến ${new Date(inventory.xpBoostActiveUntil!).toLocaleString('vi-VN')}`
                        : 'Chưa kích hoạt'}
                  </div>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 12.5, color: '#cbd5e1' }}>
                {item.description}
              </p>
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
