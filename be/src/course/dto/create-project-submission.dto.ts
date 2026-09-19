import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ProjectSubmissionFileMetadataDto } from './project-submission-file-metadata.dto';

export class CreateProjectSubmissionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => ProjectSubmissionFileMetadataDto)
  files!: ProjectSubmissionFileMetadataDto[];

  @IsOptional()
  @IsString()
  note?: string;
}
