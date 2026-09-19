import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

/** Optional course scope for disambiguating topic slugs across courses. */
export class TopicSlugScopeDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  courseId?: string;
}

export class TopicSlugQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  courseId?: string;
}
