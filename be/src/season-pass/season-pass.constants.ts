import { ConsumableType } from '@prisma/client';

export const SEASON_PASS_TIER_XP = 200;
export const SEASON_PASS_MAX_TIERS = 20;
export const SEASON_PASS_PREMIUM_PRICE_COINS = 300;

export interface SeasonTierReward {
  type: 'COIN' | 'CONSUMABLE' | 'COSMETIC';
  amount?: number;
  itemType?: ConsumableType;
  cosmeticId?: string;
  label: string;
}

export interface SeasonTierConfig {
  tier: number;
  requiredXp: number;
  free: SeasonTierReward;
  premium: SeasonTierReward;
}

export const SEASON_PASS_TIERS: readonly SeasonTierConfig[] = Array.from(
  { length: SEASON_PASS_MAX_TIERS },
  (_, idx): SeasonTierConfig => {
    const tier = idx + 1;
    const requiredXp = tier * SEASON_PASS_TIER_XP;

    const free: SeasonTierReward =
      tier % 5 === 0
        ? {
            type: 'CONSUMABLE',
            itemType: ConsumableType.STREAK_FREEZE,
            label: 'Khiên Giữ Chuỗi x1',
          }
        : {
            type: 'COIN',
            amount: 5 + Math.floor(tier / 2),
            label: `+${5 + Math.floor(tier / 2)} Coin`,
          };

    let premium: SeasonTierReward;
    if (tier === 20) {
      premium = {
        type: 'COSMETIC',
        cosmeticId: 'shop-celestial-archon',
        label: 'Bộ Độc Quyền · Chấp Chính Thiên Tinh',
      };
    } else if (tier === 10) {
      premium = {
        type: 'COSMETIC',
        cosmeticId: 'frame:eclipse-ring',
        label: 'Khung Nhật Thực Tối Thượng',
      };
    } else if (tier % 4 === 0) {
      premium = {
        type: 'CONSUMABLE',
        itemType: ConsumableType.XP_BOOST_2X,
        label: 'Thẻ Nhân Đôi XP (24h)',
      };
    } else {
      const coins = 15 + tier * 2;
      premium = {
        type: 'COIN',
        amount: coins,
        label: `+${coins} Coin`,
      };
    }

    return { tier, requiredXp, free, premium };
  },
);
