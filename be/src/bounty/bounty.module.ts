import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { PrismaModule } from '../prisma/prisma.module';
import { XpModule } from '../xp/xp.module';
import { CoinModule } from '../coin/coin.module';
import { BountyController } from './bounty.controller';
import { BountyAdminController } from './bounty-admin.controller';
import { BountyService } from './bounty.service';
import { BountyRewardService } from './bounty-reward.service';
import { BOUNTY_COIN_SERVICE_PROVIDER } from './coin/coin-provider.interface';
import { MockBountyCoinProvider } from './coin/mock-bounty-coin.provider';

@Module({
  imports: [PrismaModule, XpModule, NotificationModule, CoinModule],
  controllers: [BountyController, BountyAdminController],
  providers: [
    BountyService,
    BountyRewardService,
    {
      provide: BOUNTY_COIN_SERVICE_PROVIDER,
      useClass: MockBountyCoinProvider,
    },
  ],
  exports: [BountyService, BountyRewardService, BOUNTY_COIN_SERVICE_PROVIDER],
})
export class BountyModule {}
