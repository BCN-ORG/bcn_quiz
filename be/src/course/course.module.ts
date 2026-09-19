import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { MinioService } from '../common/storage/minio.service';
import { CourseController } from './course.controller';
import { CourseProgressService } from './course-progress.service';
import { CourseService } from './course.service';

@Module({
  imports: [ProfilesModule],
  controllers: [CourseController],
  providers: [CourseService, CourseProgressService, MinioService],
  exports: [CourseProgressService],
})
export class CourseModule {}
