import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { WalletModule } from '../wallet/wallet.module';
import { CoinAdminController } from './coin-admin.controller';
import { CoinAdminService } from './coin-admin.service';
import { CoinTrackingService } from './coin-tracking.service';
import { LiveCoinRewardAdapter } from './live-coin-reward.adapter';

@Module({
  imports: [PrismaModule, ProfilesModule, WalletModule, HttpModule],
  controllers: [CoinAdminController],
  providers: [CoinTrackingService, CoinAdminService, LiveCoinRewardAdapter],
  exports: [
    CoinTrackingService,
    CoinAdminService,
    LiveCoinRewardAdapter,
    WalletModule,
  ],
})
export class CoinModule {}
