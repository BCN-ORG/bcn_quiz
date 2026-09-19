import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class StartSessionDto {
  /** Soft TTL for abandoned-session cleanup only — not an exam clock. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(525_600) // up to 1 year
  expiresInMinutes?: number = 525_600;
}
