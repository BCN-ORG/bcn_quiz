import {
  IsDefined,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Accepts the same two payload shapes as create/bulk:
 * flat { question, options[] } or nested { content, options.data }.
 * Field-level quiz rules are enforced in QuizService.normalizeQuizInput.
 */
export class UpdateQuizDto {
  @IsOptional()
  @IsString()
  quizCode?: string;

  @IsOptional()
  @IsString()
  question?: string;

  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  code?: string;

  @IsString()
  @IsNotEmpty()
  answer!: string;

  @IsOptional()
  @IsString()
  explanation?: string;

  @IsString()
  @IsNotEmpty()
  topicId!: string;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  imagePublicId?: string | null;

  @IsDefined()
  options!: Record<string, unknown> | unknown[];
}
