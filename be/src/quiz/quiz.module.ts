import { Module } from '@nestjs/common';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
import { MinioService } from '../common/storage/minio.service';
import { CourseModule } from '../course/course.module';

@Module({
  imports: [CourseModule],
  controllers: [QuizController],
  providers: [QuizService, MinioService],
})
export class QuizModule {}
