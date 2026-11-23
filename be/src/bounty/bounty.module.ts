import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { PrismaModule } from '../prisma/prisma.module';
import { XpModule } from '../xp/xp.module';
import { CoinRewardSource } from '@prisma/client';
import { CoinModule } from '../coin/coin.module';
import { getCoinProviderMode } from '../coin/coin-api.client';
import { LiveCoinRewardAdapter } from '../coin/live-coin-reward.adapter';
import { BountyController } from './bounty.controller';
import { BountyAdminController } from './bounty-admin.controller';
import { BountyService } from './bounty.service';
import { BountyRewardService } from './bounty-reward.service';
import {
  BOUNTY_COIN_SERVICE_PROVIDER,
  BountyCoinServiceProvider,
  BountyCreditRewardRequest,
} from './coin/coin-provider.interface';
import { MockBountyCoinProvider } from './coin/mock-bounty-coin.provider';

@Module({
  imports: [PrismaModule, XpModule, NotificationModule, CoinModule],
  controllers: [BountyController, BountyAdminController],
  providers: [
    BountyService,
    BountyRewardService,
    MockBountyCoinProvider,
    {
      provide: BOUNTY_COIN_SERVICE_PROVIDER,
      useFactory: (
        mockProvider: MockBountyCoinProvider,
        liveAdapter: LiveCoinRewardAdapter,
      ): BountyCoinServiceProvider => {
        if (getCoinProviderMode() !== 'live') return mockProvider;
        return {
          async creditReward(req: BountyCreditRewardRequest) {
            const prep = await liveAdapter.preparePayload({
              userId: req.userId,
              amount: req.amount,
              idempotencyKey: req.idempotencyKey,
              source: CoinRewardSource.BOUNTY,
              description: `Thưởng Bounty: ${req.metadata.bountyTitle}`,
              metadata: req.metadata as Record<string, unknown>,
            });
            if (!prep.ok || !prep.payload) {
              return {
                success: false,
                status: 'FAILED',
                errorMessage: prep.errorMessage,
              };
            }
            const res = await liveAdapter.dispatchPayload(prep.payload);
            return {
              success: res.success,
              externalTxId: res.externalTxId,
              status: res.status === 'UNKNOWN' ? 'FAILED' : res.status,
              errorMessage: res.errorMessage,
            };
          },
          async checkStatus(idempotencyKey: string) {
            const res = await liveAdapter.checkStatus(idempotencyKey);
            return {
              status: res.status === 'UNKNOWN' ? 'PENDING' : res.status,
              externalTxId: res.externalTxId,
              errorMessage: res.errorMessage,
            };
          },
        };
      },
      inject: [MockBountyCoinProvider, LiveCoinRewardAdapter],
    },
  ],
  exports: [BountyService, BountyRewardService, BOUNTY_COIN_SERVICE_PROVIDER],
})
export class BountyModule {}
