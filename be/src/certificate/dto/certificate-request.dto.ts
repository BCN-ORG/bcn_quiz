import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CertificateRequestStatus } from '@prisma/client';

export class ListCertificateRequestsQueryDto {
  @IsOptional()
  @IsEnum(CertificateRequestStatus)
  status?: CertificateRequestStatus;
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{1,64}$/) courseId?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class ReviewCertificateRequestDto {
  @IsIn(['APPROVE', 'REJECT']) decision!: 'APPROVE' | 'REJECT';

  /** Required when rejecting (the learner sees it); optional internal note when approving. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class RevokeCertificateDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(1000)
  reason!: string;
}
