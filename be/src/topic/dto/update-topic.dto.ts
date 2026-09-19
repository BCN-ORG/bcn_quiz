import { Type } from 'class-transformer';
import {
  IsDate,
  IsOptional,
  IsString,
  IsUrl,
  ValidateIf,
} from 'class-validator';
import { OBJECT_STORAGE_URL_OPTIONS } from '../../common/validation/object-storage-url';

export class UpdateTopicDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsOptional()
  @IsUrl(OBJECT_STORAGE_URL_OPTIONS)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  imagePublicId?: string;

  /** Pass null to clear the schedule bound. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Date)
  @IsDate()
  startsAt?: Date | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Date)
  @IsDate()
  endsAt?: Date | null;
}
