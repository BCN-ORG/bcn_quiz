import { Module } from '@nestjs/common';
import { AttemptController } from './attempt.controller';
import { AttemptService } from './attempt.service';
import { AttemptSessionCleanupService } from './attempt-session-cleanup.service';
import { CourseModule } from '../course/course.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { NotificationModule } from '../notification/notification.module';
import { XpModule } from '../xp/xp.module';

@Module({
  imports: [
    CourseModule,
    ProfilesModule,
    LeaderboardModule,
    NotificationModule,
    XpModule,
  ],
  controllers: [AttemptController],
  providers: [AttemptService, AttemptSessionCleanupService],
})
export class AttemptModule {}
