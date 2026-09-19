import { Module } from '@nestjs/common';
import { AttemptController } from './attempt.controller';
import { AttemptService } from './attempt.service';
import { AttemptSessionCleanupService } from './attempt-session-cleanup.service';
import { CourseModule } from '../course/course.module';
import { ProfilesModule } from '../profiles/profiles.module';

@Module({
  imports: [CourseModule, ProfilesModule],
  controllers: [AttemptController],
  providers: [AttemptService, AttemptSessionCleanupService],
})
export class AttemptModule {}
