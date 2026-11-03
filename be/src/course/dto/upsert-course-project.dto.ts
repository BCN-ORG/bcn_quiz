import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { OBJECT_STORAGE_URL_OPTIONS } from '../../common/validation/object-storage-url';

/** Full timestamp with a timezone and a plausible year; date-only or zoneless values are ambiguous. */
const DUE_AT_PATTERN =
  /^(19|20)\d{2}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

export class UpsertCourseProjectDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  /**
   * Optional MinIO secure URL for the requirement brief/spec file.
   * Send together with attachmentPublicId. Send both `null` to remove.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl(OBJECT_STORAGE_URL_OPTIONS)
  attachmentUrl?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsNotEmpty()
  attachmentPublicId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(255)
  attachmentOriginalName?: string | null;

  /**
   * Optional deadline (ISO 8601). Late submissions are labelled, never blocked.
   * Omit to keep the stored value, send `null` to clear it.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString({ strict: true })
  @Matches(DUE_AT_PATTERN, {
    message: 'dueAt must be a full ISO 8601 timestamp with a timezone',
  })
  dueAt?: string | null;
}
