import { request } from './api';

export type QuestPeriod = 'DAILY' | 'WEEKLY';

export interface QuestProgressItem {
  code: string;
  period: QuestPeriod;
  periodKey: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  completed: boolean;
  claimed: boolean;
  rewardXp: number;
  rewardCoins: number;
}

export interface QuestsSummary {
  dailyKey: string;
  weeklyKey: string;
  daily: QuestProgressItem[];
  weekly: QuestProgressItem[];
}

export type ConsumableType = 'STREAK_FREEZE' | 'XP_BOOST_2X';

export interface ConsumableCatalogItem {
  itemType: ConsumableType;
  name: string;
  description: string;
  priceCoins: number;
  durationHours?: number;
}

export interface ShopInventory {
  streakFreezeCount: number;
  maxStreakFreeze: number;
  xpBoostActiveUntil: string | null;
  xpBoostActive: boolean;
  mysteryChest: {
    costCoins: number;
    duplicateRefundCoins: number;
    pityCount: number;
    pityThreshold: number;
  };
  catalog: ConsumableCatalogItem[];
}

export interface MysteryChestRollResult {
  alreadyProcessed: boolean;
  roll: {
    id: string;
    costCoins: number;
    rewardType: string;
    rewardId: string;
    rewardLabel: string;
    isDuplicate: boolean;
    refundCoins: number;
    pityCountAfter: number;
  };
  newBalance?: number;
}

export const questsShopApi = {
  getQuests: () => request.get<QuestsSummary>('/quests/me'),
  claimQuest: (questCode: string) =>
    request.post<{
      claimed: boolean;
      alreadyClaimed: boolean;
      questCode: string;
      rewardXp: number;
      rewardCoins: number;
    }>(`/quests/${encodeURIComponent(questCode)}/claim`, {}),
  getInventory: () => request.get<ShopInventory>('/shop/inventory'),
  purchaseConsumable: (itemType: ConsumableType, idempotencyKey: string) =>
    request.post<{
      purchased: boolean;
      itemType: ConsumableType;
      quantity: number;
      activeUntil: string | null;
      newBalance?: number;
    }>('/shop/consumables/purchase', { itemType, idempotencyKey }),
  openMysteryChest: (idempotencyKey: string) =>
    request.post<MysteryChestRollResult>('/shop/mystery-chest/open', {
      idempotencyKey,
    }),
};
