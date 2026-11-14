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
  breakdown: Record<XpSourceType, { count: number; xp: number }>;
  recent: XpEventDto[];
}
