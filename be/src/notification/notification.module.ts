import { Module } from '@nestjs/common';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { NotificationController } from './notification.controller';
import { NotificationRealtimeService } from './notification-realtime.service';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { NotificationService } from './notification.service';

@Module({
  imports: [LeaderboardModule, ProfilesModule],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationRealtimeService,
    NotificationSchedulerService,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
