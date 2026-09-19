import { CourseProgressStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export enum MyCourseProgressScope {
  ACTIVE = 'active',
  COMPLETED = 'completed',
}

export class MyCourseProgressQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  /** Exact status filter. Takes precedence over `scope` when both are set. */
  @IsOptional()
  @IsEnum(CourseProgressStatus)
  status?: CourseProgressStatus;

  /**
   * Convenience filter for FE tabs:
   * - `active` = IN_PROGRESS | TOPICS_COMPLETED | PROJECT_PENDING_APPROVAL
   * - `completed` = COMPLETED
   */
  @IsOptional()
  @IsEnum(MyCourseProgressScope)
  scope?: MyCourseProgressScope;

  /**
   * When true, heal/recompute the current page against curriculum before listing.
   * Default false — admin curriculum writes already fan-out reevaluation.
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  revalidate?: boolean = false;
}
