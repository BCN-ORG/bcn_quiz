import { IsInt, IsString, IsUrl, Max, Min } from 'class-validator';
import { OBJECT_STORAGE_URL_OPTIONS } from '../../common/validation/object-storage-url';

export class ProjectSubmissionFileMetadataDto {
  @IsString()
  @IsUrl(OBJECT_STORAGE_URL_OPTIONS)
  secureUrl!: string;

  @IsString()
  publicId!: string;

  @IsString()
  originalName!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(20 * 1024 * 1024)
  fileSize!: number;
}
