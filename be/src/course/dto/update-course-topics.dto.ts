import { IsArray, IsString } from 'class-validator';

export class UpdateCourseTopicsDto {
  /** Empty array unlinks all topics from the course. */
  @IsArray()
  @IsString({ each: true })
  topicIds!: string[];
}
