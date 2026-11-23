import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';
import { BountyCategory, BountyStatus } from '@prisma/client';

export class QueryBountiesDto {
  @IsOptional()
  @IsEnum(BountyCategory)
  category?: BountyCategory;

  @IsOptional()
  @IsEnum(BountyStatus)
  status?: BountyStatus;
}

export class SubmitBountyDto {
  @IsNotEmpty({ message: 'Project URL is required' })
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'Project URL must be a valid http or https link' },
  )
  projectUrl: string;

  @IsOptional()
  @IsString()
  submissionNotes?: string;

  @IsOptional()
  @IsBoolean()
  autoReview?: boolean;
}

export class CreateBountyDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsEnum(BountyCategory)
  category: BountyCategory;

  @IsInt()
  @Min(1)
  @Max(5)
  difficulty: number;

  @IsInt()
  @Min(1)
  @Max(9, { message: 'Thưởng Bounty tối đa 9 coin để tránh lạm phát' })
  rewardCoins: number;

  @IsInt()
  @Min(10)
  rewardXp: number;

  @IsInt()
  @Min(10)
  durationMinutes: number;

  @IsNotEmpty()
  @IsString()
  clientName: string;

  @IsNotEmpty()
  @IsString()
  clientRole: string;

  @IsOptional()
  @IsString()
  clientCompany?: string;

  @IsOptional()
  @IsString()
  clientAvatarUrl?: string;

  @IsOptional()
  @IsString()
  clientNotes?: string;

  @IsOptional()
  @IsString()
  deliverableType?: string;

  @IsOptional()
  tasks?: Array<{ id: number; text: string; done?: boolean }>;

  @IsOptional()
  skills?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  maxParticipants?: number;
}

export class ReviewBountyDto {
  @IsNotEmpty()
  @IsIn(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  feedback?: string;
}
