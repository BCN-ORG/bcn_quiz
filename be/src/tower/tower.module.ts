import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { XpModule } from '../xp/xp.module';
import { CoinRewardSource } from '@prisma/client';
import { CoinModule } from '../coin/coin.module';
import { DiscordWebhookModule } from '../discord-webhook/discord-webhook.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { getCoinProviderMode } from '../coin/coin-api.client';
import { LiveCoinRewardAdapter } from '../coin/live-coin-reward.adapter';
import { TowerController } from './tower.controller';
import { TowerService } from './tower.service';
import { TowerAntiCheatService } from './tower-anticheat.service';
import { TowerBotGuard } from './tower-bot.guard';
import { TowerCoinService } from './coin/tower-coin.service';
import { TowerReconciliationService } from './coin/tower-reconciliation.service';
import { TowerDistributionService } from './tower-distribution.service';
import { TowerPoolService } from './tower-pool.service';
import { TowerQuestionSelector } from './tower-question-selector.service';
import {
  COIN_SERVICE_PROVIDER,
  CoinServiceProvider,
  CreditRewardRequest,
} from './coin/coin-provider.interface';
import { MockCoinProvider } from './coin/mock-coin.provider';

@Module({
  imports: [
    PrismaModule,
    XpModule,
    CoinModule,
    ProfilesModule,
    DiscordWebhookModule,
  ],
  controllers: [TowerController],
  providers: [
    TowerService,
    TowerAntiCheatService,
    TowerBotGuard,
    TowerCoinService,
    TowerReconciliationService,
    TowerDistributionService,
    TowerPoolService,
    TowerQuestionSelector,
    MockCoinProvider,
    {
      provide: COIN_SERVICE_PROVIDER,
      useFactory: (
        mockProvider: MockCoinProvider,
        liveAdapter: LiveCoinRewardAdapter,
      ): CoinServiceProvider => {
        if (getCoinProviderMode() !== 'live') return mockProvider;
        return {
          async creditReward(req: CreditRewardRequest) {
            const prep = await liveAdapter.preparePayload({
              userId: req.userId,
              amount: 1,
              idempotencyKey: req.idempotencyKey,
              source: CoinRewardSource.TOWER,
              description: `Thưởng vượt tầng ${req.metadata.floor} Leo Tháp`,
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
      inject: [MockCoinProvider, LiveCoinRewardAdapter],
    },
  ],
  exports: [
    TowerService,
    TowerCoinService,
    TowerReconciliationService,
    TowerDistributionService,
    TowerPoolService,
    TowerQuestionSelector,
    COIN_SERVICE_PROVIDER,
  ],
})
export class TowerModule {}
