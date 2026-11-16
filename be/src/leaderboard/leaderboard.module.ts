import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { TowerModule } from '../tower/tower.module';
import { BossModule } from '../boss/boss.module';
import {
  LeaderboardController,
  AdminLeaderboardController,
} from './leaderboard.controller';
import { LeaderboardService } from './leaderboard.service';

@Module({
  imports: [ProfilesModule, TowerModule, BossModule],
  controllers: [LeaderboardController, AdminLeaderboardController],
  providers: [LeaderboardService],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}
