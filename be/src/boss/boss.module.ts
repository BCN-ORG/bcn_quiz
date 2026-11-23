import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { XpModule } from '../xp/xp.module';
import { CoinRewardSource } from '@prisma/client';
import { CoinModule } from '../coin/coin.module';
import { getCoinProviderMode } from '../coin/coin-api.client';
import { LiveCoinRewardAdapter } from '../coin/live-coin-reward.adapter';
import { BossController } from './boss.controller';
import { BossAdminService } from './boss-admin.service';
import { BossLiveService } from './boss-live.service';
import { BossService } from './boss.service';
import { BossCoinService } from './coin/boss-coin.service';
import { BossReconciliationService } from './coin/boss-reconciliation.service';
import {
  BOSS_COIN_SERVICE_PROVIDER,
  BossCoinServiceProvider,
  BossCreditRewardRequest,
} from './coin/coin-provider.interface';
import { MockBossCoinProvider } from './coin/mock-boss-coin.provider';

@Module({
  imports: [PrismaModule, ProfilesModule, XpModule, CoinModule],
  controllers: [BossController],
  providers: [
    BossService,
    BossLiveService,
    BossAdminService,
    BossCoinService,
    BossReconciliationService,
    MockBossCoinProvider,
    {
      provide: BOSS_COIN_SERVICE_PROVIDER,
      useFactory: (
        mockProvider: MockBossCoinProvider,
        liveAdapter: LiveCoinRewardAdapter,
      ): BossCoinServiceProvider => {
        if (getCoinProviderMode() !== 'live') return mockProvider;
        return {
          async creditReward(req: BossCreditRewardRequest) {
            const prep = await liveAdapter.preparePayload({
              userId: req.userId,
              amount: req.amount,
              idempotencyKey: req.idempotencyKey,
              source: CoinRewardSource.BOSS,
              description: `Thưởng Boss Tuần (${req.metadata.milestoneName ?? `Mốc ${req.metadata.milestoneIndex + 1}`})`,
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
      inject: [MockBossCoinProvider, LiveCoinRewardAdapter],
    },
  ],
  exports: [
    BossService,
    BossCoinService,
    BossReconciliationService,
    BOSS_COIN_SERVICE_PROVIDER,
  ],
})
export class BossModule {}
