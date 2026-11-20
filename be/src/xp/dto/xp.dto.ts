import { XpSourceType } from '@prisma/client';

export interface XpEventDto {
  id: string;
  sourceType: XpSourceType;
  sourceKey: string;
  amount: number;
  createdAt: Date;
}

export interface XpSummaryDto {
  totalXp: number;
  level: number;
  xpInLevel: number;
  xpRequired: number;
  xpPercent: number;
  rankTitle: string;
  nextRankTitle: string | null;
  equippedTierId?: string | null;
  pinnedBadges?: string[];
  unlockedCosmetics?: string[];
  earnedBadges?: string[];
  dailyChestClaimed?: boolean;
  breakdown: Record<XpSourceType, { count: number; xp: number }>;
  recent: XpEventDto[];
}

export interface PlayerProfileDto {
  userId: string;
  totalXp: number;
  level: number;
  rankTitle: string;
  equippedTierId: string | null;
  pinnedBadges: string[];
  earnedBadges: string[];
  stats: {
    highestTowerFloor: number;
    bestBossDamage: number;
    totalQuizAttempts: number;
    certificatesCount: number;
  };
}
