import { ConsumableType } from '@prisma/client';

export interface ConsumableCatalogItem {
  itemType: ConsumableType;
  name: string;
  description: string;
  priceCoins: number;
  durationHours?: number;
}

export const CONSUMABLE_CATALOG: Record<ConsumableType, ConsumableCatalogItem> =
  {
    [ConsumableType.STREAK_FREEZE]: {
      itemType: ConsumableType.STREAK_FREEZE,
      name: 'Khiên Giữ Chuỗi',
      description:
        'Tự động bảo vệ chuỗi ngày học nếu bạn lỡ quên học 1 ngày (tối đa tích trữ 5 khiên).',
      priceCoins: 40,
    },
    [ConsumableType.XP_BOOST_2X]: {
      itemType: ConsumableType.XP_BOOST_2X,
      name: 'Thẻ Nhân Đôi XP (24h)',
      description:
        'Nhân đôi toàn bộ XP nhận được từ Quiz, Tháp, Boss, Nhiệm vụ trong 24 giờ (cộng dồn thời gian).',
      priceCoins: 80,
      durationHours: 24,
    },
  };

export const MAX_STREAK_FREEZE_QTY = 5;
export const MYSTERY_CHEST_COST_COINS = 100;
export const MYSTERY_CHEST_DUPLICATE_REFUND_COINS = 50;
export const MYSTERY_CHEST_PITY_THRESHOLD = 5;

export interface MysteryChestPoolItem {
  rewardType: 'COSMETIC' | 'CONSUMABLE' | 'COIN';
  rewardId: string;
  rewardLabel: string;
  weight: number;
  rare?: boolean;
}

export const MYSTERY_CHEST_POOL: readonly MysteryChestPoolItem[] = [
  {
    rewardType: 'COSMETIC',
    rewardId: 'frame:neon-pulse',
    rewardLabel: 'Khung Xung Nhịp Neon',
    weight: 14,
    rare: true,
  },
  {
    rewardType: 'COSMETIC',
    rewardId: 'frame:sakura-petal',
    rewardLabel: 'Khung Cánh Hoa Anh Đào',
    weight: 12,
    rare: true,
  },
  {
    rewardType: 'COSMETIC',
    rewardId: 'frame:emerald-circuit',
    rewardLabel: 'Khung Mạch Ngọc Lục Bảo',
    weight: 10,
    rare: true,
  },
  {
    rewardType: 'COSMETIC',
    rewardId: 'frame:eclipse-ring',
    rewardLabel: 'Khung Nhật Thực Tối Thượng',
    weight: 8,
    rare: true,
  },
  {
    rewardType: 'COSMETIC',
    rewardId: 'char:shop-obsidian-reaper',
    rewardLabel: 'Nhân vật · Tử Thần Hắc Diện',
    weight: 8,
    rare: true,
  },
  {
    rewardType: 'COSMETIC',
    rewardId: 'banner:shop-sakura-ronin',
    rewardLabel: 'Banner · Lãng Khách Hoa Anh Đào',
    weight: 8,
    rare: true,
  },
  {
    rewardType: 'COSMETIC',
    rewardId: 'nameplate:shop-storm-valkyrie',
    rewardLabel: 'Bảng tên · Nữ Thần Sấm Sét',
    weight: 8,
    rare: true,
  },
  {
    rewardType: 'CONSUMABLE',
    rewardId: ConsumableType.XP_BOOST_2X,
    rewardLabel: 'Thẻ Nhân Đôi XP (24h)',
    weight: 16,
  },
  {
    rewardType: 'CONSUMABLE',
    rewardId: ConsumableType.STREAK_FREEZE,
    rewardLabel: 'Khiên Giữ Chuỗi x1',
    weight: 16,
  },
];
