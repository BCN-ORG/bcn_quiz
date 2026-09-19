import { Module } from '@nestjs/common';
import { TopicController } from './topic.controller';
import { TopicService } from './topic.service';
import { MinioService } from '../common/storage/minio.service';
import { CourseModule } from '../course/course.module';

@Module({
  imports: [CourseModule],
  controllers: [TopicController],
  providers: [TopicService, MinioService],
})
export class TopicModule {}
