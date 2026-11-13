import { IsNotEmpty, IsString } from 'class-validator';

export class AnswerQuestionDto {
  @IsString()
  @IsNotEmpty()
  optionLabel: string;
}

export interface TowerQuestionOptionDto {
  label: string;
  content: string;
  isCode: boolean;
}

export interface TowerQuestionDto {
  id: string;
  question: string;
  code: string | null;
  imageUrl: string | null;
  options: TowerQuestionOptionDto[];
  currentQuestionNumber: number;
  requiredStreak: number;
  timeLimitSeconds: number;
  expiresAt: string;
}

export interface TowerOverviewDto {
  season: {
    id: string;
    seasonKey: string;
    name: string;
    startsAt: string;
    endsAt: string;
  };
  progress: {
    currentFloor: number;
    highestCompletedFloor: number;
    cooldownUntil: string | null;
    isCooldownActive: boolean;
    cooldownRemainingSeconds: number;
  };
  activeAttempt: {
    id: string;
    floor: number;
    currentStreak: number;
    requiredStreak: number;
    currentQuestionNumber: number;
    currentQuestion?: TowerQuestionDto | null;
  } | null;
}

export interface AnswerResponseDto {
  result: 'CORRECT' | 'FLOOR_COMPLETED' | 'FAILED';
  reason?: 'WRONG_ANSWER' | 'TIMEOUT';
  correctAnswer?: string;
  explanation?: string | null;
  currentStreak?: number;
  requiredStreak?: number;
  cooldownUntil?: string | null;
  cooldownRemainingSeconds?: number;
  completedFloor?: number;
  nextFloor?: number;
  rewardCoins?: number;
  rewardStatus?: string;
  nextQuestion?: TowerQuestionDto;
}
