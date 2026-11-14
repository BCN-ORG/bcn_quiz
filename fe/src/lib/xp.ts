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
  breakdown: Record<XpSourceType, { count: number; xp: number }>;
  recent: Array<{
    id: string;
    sourceType: XpSourceType;
    sourceKey: string;
    amount: number;
    createdAt: string;
  }>;
}

export const xpApi = {
  getMe: () => request.get<XpMe>('/xp/me'),
};
