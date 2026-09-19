import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';
import { OBJECT_STORAGE_URL_OPTIONS } from '../../common/validation/object-storage-url';

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl(OBJECT_STORAGE_URL_OPTIONS)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  imagePublicId?: string;

  @IsOptional()
  @IsBoolean()
  hasProject?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  topicWeight?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  projectWeight?: number;
}
