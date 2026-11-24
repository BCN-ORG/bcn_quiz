import { request } from './api';

export type XpSourceType =
  | 'TOPIC_FIRST_SUBMIT'
  | 'TOWER_FLOOR'
  | 'COURSE_COMPLETED'
  | 'CERTIFICATE_ISSUED';

export interface XpMe {
  totalXp: number;
  level: number;
  xpInLevel: number;
  xpRequired: number;
  xpPercent: number;
  rankTitle: string;
  nextRankTitle: string | null;
  equippedTierId?: string | null;
  equippedCharacterId?: string | null;
  equippedBannerId?: string | null;
  equippedFrameId?: string | null;
  equippedNameplateId?: string | null;
  pinnedBadges?: string[];
  unlockedCosmetics?: string[];
  earnedBadges?: string[];
  dailyChestClaimed?: boolean;
  breakdown: Record<XpSourceType, { count: number; xp: number }>;
  recent: Array<{
    id: string;
    sourceType: XpSourceType;
    sourceKey: string;
    amount: number;
    createdAt: string;
  }>;
}

export interface PlayerProfile {
  userId: string;
  totalXp: number;
  level: number;
  rankTitle: string;
  equippedTierId: string | null;
  equippedCharacterId?: string | null;
  equippedBannerId?: string | null;
  equippedFrameId?: string | null;
  equippedNameplateId?: string | null;
  pinnedBadges: string[];
  earnedBadges: string[];
  stats: {
    highestTowerFloor: number;
    bestBossDamage: number;
    totalQuizAttempts: number;
    certificatesCount: number;
  };
}

export const xpApi = {
  getMe: () => request.get<XpMe>('/xp/me'),
  updateCosmetics: (
    payload:
      | string
      | null
      | {
          equippedTierId?: string | null;
          equippedCharacterId?: string | null;
          equippedBannerId?: string | null;
          equippedFrameId?: string | null;
          equippedNameplateId?: string | null;
          pinnedBadges?: string[];
        },
  ) =>
    request.put<{
      equippedTierId: string | null;
      equippedCharacterId: string | null;
      equippedBannerId: string | null;
      equippedFrameId: string | null;
      equippedNameplateId: string | null;
      pinnedBadges: string[];
      unlockedCosmetics: string[];
    }>(
      '/xp/me/cosmetics',
      typeof payload === 'string' || payload === null
        ? { equippedTierId: payload }
        : payload,
    ),
  purchaseCosmetic: (cosmeticId: string) =>
    request.post<{
      purchased: boolean;
      alreadyOwned: boolean;
      cosmeticId: string;
      equippedTierId: string | null;
      equippedCharacterId: string | null;
      equippedBannerId: string | null;
      equippedFrameId: string | null;
      equippedNameplateId: string | null;
      unlockedCosmetics: string[];
      newBalance?: number;
    }>('/xp/cosmetics/purchase', { cosmeticId }),
  getPlayerProfile: (userId: string) =>
    request.get<PlayerProfile>(`/xp/players/${encodeURIComponent(userId)}/profile`),
  claimDailyChest: () =>
    request.post<{
      claimed: boolean;
      alreadyClaimed: boolean;
      rewardCoins: number;
    }>('/xp/daily-chest/claim'),
};
