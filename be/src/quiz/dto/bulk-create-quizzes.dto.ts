import { ArrayMaxSize, ArrayMinSize, IsArray, IsObject } from 'class-validator';

/**
 * Body linh hoạt: mỗi item có thể là flat CreateQuizDto
 * hoặc format content/options.data (giống response GET quiz).
 * Validate chi tiết nằm trong QuizService.createQuizzes.
 */
export class BulkCreateQuizzesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsObject({ each: true })
  quizzes!: Record<string, unknown>[];
}
