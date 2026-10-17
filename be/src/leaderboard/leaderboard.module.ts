import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import {
  LeaderboardController,
  AdminLeaderboardController,
} from './leaderboard.controller';
import { LeaderboardService } from './leaderboard.service';

@Module({
  imports: [ProfilesModule],
  controllers: [LeaderboardController, AdminLeaderboardController],
  providers: [LeaderboardService],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}
