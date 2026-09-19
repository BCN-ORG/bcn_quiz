import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { OBJECT_STORAGE_URL_OPTIONS } from '../../common/validation/object-storage-url';

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
}
