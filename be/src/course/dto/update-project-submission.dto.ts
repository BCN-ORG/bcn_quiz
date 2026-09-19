import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ProjectSubmissionFileMetadataDto } from './project-submission-file-metadata.dto';

export class UpdateProjectSubmissionDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => ProjectSubmissionFileMetadataDto)
  files?: ProjectSubmissionFileMetadataDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  removeFiles?: string[];

  @IsOptional()
  @IsString()
  note?: string;
}
