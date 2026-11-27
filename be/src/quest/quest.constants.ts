import { QuestPeriod } from '@prisma/client';

export type QuestMetric =
  | 'QUIZ_SUBMIT'
  | 'TOWER_FLOOR'
  | 'BOSS_OR_BOUNTY'
  | 'DAILY_ALL_3'
  | 'WEEKLY_QUIZ_5'
  | 'WEEKLY_BOSS_3'
  | 'WEEKLY_TOWER_10';

export interface QuestDefinition {
  code: string;
  period: QuestPeriod;
  title: string;
  description: string;
  metric: QuestMetric;
  target: number;
  rewardXp: number;
  rewardCoins: number;
}

export const QUEST_DEFINITIONS: readonly QuestDefinition[] = [
  {
    code: 'daily_quiz_1',
    period: QuestPeriod.DAILY,
    title: 'Khởi động tri thức',
    description: 'Hoàn thành ít nhất 1 bài kiểm tra chủ đề trong hôm nay.',
    metric: 'QUIZ_SUBMIT',
    target: 1,
    rewardXp: 25,
    rewardCoins: 0,
  },
  {
    code: 'daily_tower_2',
    period: QuestPeriod.DAILY,
    title: 'Chinh phục Tháp Học Thuật',
    description: 'Vượt qua 2 tầng Tháp trong ngày hôm nay.',
    metric: 'TOWER_FLOOR',
    target: 2,
    rewardXp: 25,
    rewardCoins: 0,
  },
  {
    code: 'daily_boss_or_bounty',
    period: QuestPeriod.DAILY,
    title: 'Chiến binh đấu trường',
    description:
      'Tham gia 1 trận Săn Boss hoặc nộp 1 Nhiệm vụ Freelancer hôm nay.',
    metric: 'BOSS_OR_BOUNTY',
    target: 1,
    rewardXp: 30,
    rewardCoins: 0,
  },
  {
    code: 'daily_milestone_chest',
    period: QuestPeriod.DAILY,
    title: 'Rương Thưởng Ngày (3/3)',
    description: 'Hoàn thành cả 3 nhiệm vụ ngày để mở Rương thưởng Coin.',
    metric: 'DAILY_ALL_3',
    target: 3,
    rewardXp: 20,
    rewardCoins: 15,
  },
  {
    code: 'weekly_quiz_5',
    period: QuestPeriod.WEEKLY,
    title: 'Học giả chăm chỉ',
    description: 'Hoàn thành 5 lượt làm bài kiểm tra trong tuần này.',
    metric: 'WEEKLY_QUIZ_5',
    target: 5,
    rewardXp: 100,
    rewardCoins: 20,
  },
  {
    code: 'weekly_boss_3',
    period: QuestPeriod.WEEKLY,
    title: 'Thợ săn Boss tuần',
    description: 'Hoàn thành 3 trận đánh Boss trong tuần này.',
    metric: 'WEEKLY_BOSS_3',
    target: 3,
    rewardXp: 100,
    rewardCoins: 25,
  },
  {
    code: 'weekly_tower_10',
    period: QuestPeriod.WEEKLY,
    title: 'Vua Leo Tháp tuần',
    description: 'Vượt qua tổng cộng 10 tầng Tháp trong tuần này.',
    metric: 'WEEKLY_TOWER_10',
    target: 10,
    rewardXp: 150,
    rewardCoins: 35,
  },
];
