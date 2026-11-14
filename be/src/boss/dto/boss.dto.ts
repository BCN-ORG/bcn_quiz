import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class SubmitBossAnswerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  @Matches(/^(A|B|C|D|TIMEOUT)$/i, {
    message: 'Đáp án lựa chọn không hợp lệ',
  })
  optionLabel!: string;
}

export class SettleWeekDto {
  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-W\d{2}$/, {
    message: 'weekKey phải có định dạng YYYY-Www',
  })
  weekKey?: string;
}

export interface BossQuestionOptionDto {
  label: string;
  content: string;
  isCode: boolean;
}

export interface BossQuestionDto {
  id: string;
  question: string;
  code: string | null;
  imageUrl: string | null;
  options: BossQuestionOptionDto[];
  currentQuestionNumber: number;
  questionExpiresAt: string;
  sessionExpiresAt: string;
}

export interface BossMilestoneConfigItem {
  at: number;
  coin: number;
  name: string;
}

export interface BossMilestoneStatusDto {
  index: number;
  at: number;
  coin: number;
  name: string;
  unlocked: boolean;
}

export interface BossOverviewDto {
  season: {
    id: string;
    weekKey: string;
    name: string;
    bossName: string;
    bossMaxHp: number;
    startsAt: string;
    endsAt: string;
    isActive: boolean;
    isSettled: boolean;
  };
  community: {
    communityScore: number;
    bossCurrentHp: number;
    bossHpPercent: number;
    totalParticipants: number;
  };
  milestones: BossMilestoneStatusDto[];
  personal: {
    personalBest: number;
    totalAttempts: number;
    bestCombo: number;
    hasParticipated: boolean;
  };
  activeSession: {
    id: string;
    score: number;
    combo: number;
    maxCombo: number;
    currentQuestionNumber: number;
    sessionExpiresAt: string;
    sessionRemainingSeconds: number;
    currentQuestion: BossQuestionDto | null;
  } | null;
}
