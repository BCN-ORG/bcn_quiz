import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsUrl,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
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
    bossImageUrl: string | null;
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
  /** True when this read ended the player's session for 5 unanswered questions in a row. */
  idleEnded?: boolean;
}

export interface BossLiveParticipantDto {
  /** Session id: stable key for the client, carries no user identity. */
  sessionId: string;
  name: string;
  avatarUrl: string | null;
  score: number;
  isYou: boolean;
}

export interface BossLiveFighterDto extends BossLiveParticipantDto {
  combo: number;
}

export interface BossLiveHitDto extends BossLiveParticipantDto {
  maxCombo: number;
  endedAt: string;
}

/** Read-only, side-effect free snapshot for the "fighting together" strip. No user ids, no emails. */
export interface BossLiveDto {
  serverTime: string;
  community: BossOverviewDto['community'];
  milestones: BossMilestoneStatusDto[];
  fightingNow: number;
  fighters: BossLiveFighterDto[];
  recentHits: BossLiveHitDto[];
}

export class BossMilestoneInputDto {
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  at!: number;

  @IsInt()
  @Min(0)
  @Max(1000)
  coin!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name!: string;
}

/** Admin config for a season that has not started yet. */
export class UpsertBossSeasonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  bossName!: string;

  /** Uploaded boss art (https URL from the image upload signature); null/omitted = built-in image. */
  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(500)
  bossImageUrl?: string | null;

  @IsInt()
  @Min(100)
  @Max(100_000)
  bossMaxHp!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => BossMilestoneInputDto)
  milestones!: BossMilestoneInputDto[];
}
